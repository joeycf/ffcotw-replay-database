/**
 * The back half of scripts/parse.ts: index merge, dedupe, the collapse guard,
 * the freeze carry, players, the review queue and data/report.md.
 *
 * Split from parse.ts for legibility only — there is one parse, and it is
 * these two files. Everything that WRITES to data/ writes from here, so the
 * order of the guards relative to the writes is visible in one place: every
 * guard runs, and only then does anything touch disk. A guard that aborts
 * after a partial write is not a guard.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNELS, stripTheaterSponsor } from './channels';
import { patchForDate, seasonForDate } from './patches';
import { dueExpiries, expiryBlock, unreleasedResidueHits } from './expiries';
import { normalizeText, playerId } from './roster';
import type { AliasMatcher } from './roster';
import type {
  CharacterRecord,
  ChannelKey,
  MatchSide,
  MatchVideo,
  PlayerRecord,
  ReviewQueueItem,
  SourcePins,
  TheaterRawRecord,
  VideoOverride,
} from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const DATA = join(ROOT, 'data');

const ALLOW_COLLAPSE = process.argv.includes('--allow-collapse');

const write = (name: string, value: unknown) =>
  writeFile(join(DATA, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const readJsonLocal = async <T>(name: string, fallback: T): Promise<T> => {
  const p = join(DATA, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** Dedupe precedence = the CHANNELS array order (checklist step 1/2). */
const PRECEDENCE = new Map<ChannelKey, number>(CHANNELS.map((c, i) => [c.id, i]));

export interface FinishInput {
  built: MatchVideo[];
  committed: MatchVideo[];
  overrides: Record<string, VideoOverride>;
  pins: SourcePins;
  misses: { ch: ChannelKey; kind: string }[];
  residue: Map<string, number>;
  queue: ReviewQueueItem[];
  perChannel: Map<ChannelKey, { raw: number; marked: number; parsed: number }>;
  rawSeen: Map<string, string>;
  slotOrders: string[];
  matcher: AliasMatcher;
  characters: CharacterRecord[];
}

export async function writeReportAndData(input: FinishInput): Promise<void> {
  const {
    built,
    committed,
    overrides,
    pins,
    misses,
    residue,
    queue,
    perChannel,
    rawSeen,
    matcher,
  } = input;
  const notes: string[] = [];
  let records = [...built];

  // ── 1. the INDEX intake ──────────────────────────────────────────────────
  const idx = CHANNELS.find((c) => c.index);
  let theaterStats: Record<string, number> = {};
  if (idx) {
    const dumpFile = join(RAW, 'replayTheater.json');
    const statsFile = join(RAW, '.replayTheater.stats.json');
    if (existsSync(statsFile)) {
      theaterStats = JSON.parse(await readFile(statsFile, 'utf8')) as Record<string, number>;
    }
    if (existsSync(dumpFile)) {
      const dump = JSON.parse(await readFile(dumpFile, 'utf8')) as TheaterRawRecord[];
      const {
        kept,
        skipped,
        built: fresh,
      } = buildTheaterRecords(dump, {
        records,
        committed,
        overrides,
        rawSeen,
        matcher,
      });
      // ── ADD-ONLY MERGE (Rule 1) ──────────────────────────────────────────
      // The daily path reads a BOUNDED CURSOR — two clean pages, ten at most —
      // so the dump is deliberately a recent slice of a 70-page catalogue, not
      // the whole thing. Rebuilding from it alone would therefore drop every
      // older record on every cron run: a 2,300-record archive collapsing to a
      // hundred, which the collapse guard would then refuse... on the run
      // AFTER the pin had already been overwritten.
      //
      // So: take what this run built, then carry every committed record of this
      // intake the dump did not reproduce. An entry that VANISHES upstream is
      // counted below, never removed.
      const byRecordId = new Map(fresh.map((r) => [r.id, r]));
      let carriedForward = 0;
      for (const v of committed) {
        if (v.intake !== 'replayTheater') continue;
        if (byRecordId.has(v.id)) continue;
        byRecordId.set(v.id, v);
        carriedForward++;
      }
      const theaterRecords = [...byRecordId.values()];
      records = records.concat(theaterRecords);
      notes.push(
        `Replay Theater: ${dump.length} dumped, ${skipped} already known here, ${kept} candidates, ` +
          `${fresh.length} rebuilt, ${carriedForward} carried (add-only), ${theaterRecords.length} total.`,
      );
      // The pin only ever grows: this intake is add-only.
      const before = pins.replayTheater ?? 0;
      if (theaterRecords.length < before) {
        throw new Error(
          `Replay Theater built ${theaterRecords.length} records but the pin says ${before}. ` +
            `This intake is add-only, so a falling count means records were dropped inside the ` +
            `run. Nothing written. Investigate, then edit data/source-pins.json deliberately.`,
        );
      }
      pins.replayTheater = theaterRecords.length;
      // THE CURSOR IS WRITTEN HERE, not by the fetcher, because every data/
      // write is parse's — a fetcher that wrote it would advance the cursor for
      // a pull whose records parse then refused, and the next run would skip
      // those pages forever. It only ever moves FORWARD: a bounded cursor read
      // sees a lower highest-id than a full sweep did, and letting that move the
      // committed cursor backwards would re-read pages every morning.
      const highest = Number(theaterStats.highestId ?? 0);
      if (highest > 0) {
        const prev = Number(
          (await readJsonLocal<{ highestId?: number }>('theater-cursor.json', {})).highestId ?? 0,
        );
        if (highest > prev) await write('theater-cursor.json', { highestId: highest });
      }
    } else {
      // CARRY. The cron works from a fresh checkout and raw/ is gitignored, so
      // a run whose pull failed has no dump — and the pipeline must not publish
      // that as a deletion. Carry the committed records and hard-assert the pin.
      const carried = committed.filter((v) => v.intake === 'replayTheater');
      const pin = pins.replayTheater;
      if (pin !== undefined && carried.length !== pin) {
        throw new Error(
          `Replay Theater carry expected ${pin} committed records, found ${carried.length}. ` +
            `The committed file is both the source and the target of this carry, so one bad run ` +
            `would poison every later run silently. Nothing written.`,
        );
      }
      records = records.concat(carried);
      notes.push(
        `Replay Theater: no dump this run — ${carried.length} committed record(s) carried.`,
      );
    }
  }

  // ── 2. frozen channels: carry byte-stable, assert the pin ────────────────
  for (const ch of CHANNELS) {
    if (!ch.frozen) continue;
    const carried = committed.filter((v) => v.intake === ch.id);
    if (carried.length !== ch.frozen.records) {
      throw new Error(
        `${ch.id} is frozen at ${ch.frozen.records} records but the committed file holds ` +
          `${carried.length}. Editing the pin IS the deliberate-prune mechanism; a mismatch that ` +
          `nobody edited means the archive moved on its own. Nothing written.`,
      );
    }
    records = records.concat(carried);
    notes.push(`${ch.id}: frozen since ${ch.frozen.since}, ${carried.length} record(s) carried.`);
  }

  // ── 3. hand overrides ────────────────────────────────────────────────────
  // A hand verdict beats every automatic tier. `sides` overrides are applied
  // here, AFTER the intakes have produced their candidates, so an override can
  // correct any of them.
  for (const r of records) {
    const ov = overrides[r.id];
    if (!ov) continue;
    if (ov.sides) r.sides = ov.sides as [MatchSide, MatchSide];
    if (ov.channel) r.channel = ov.channel;
    if (ov.season !== undefined) r.season = ov.season;
    if (ov.patch) r.patch = ov.patch;
  }

  // ── 4. dedupe on the INTAKE key ──────────────────────────────────────────
  // Checklist step 2: precedence is the CHANNELS array order, and ONLY a
  // hand-authored `sides` override protects a record. Testing for the mere
  // presence of `sides` would make every override-bearing record win, which
  // inverts declared precedence silently.
  const byId = new Map<string, MatchVideo>();
  let dropped = 0;
  for (const r of records) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, r);
      continue;
    }
    const protectedBy = (v: MatchVideo) => overrides[v.id]?.resolvedBy === 'human';
    const winner =
      protectedBy(r) && !protectedBy(prev)
        ? r
        : protectedBy(prev) && !protectedBy(r)
          ? prev
          : (PRECEDENCE.get(r.intake) ?? 99) < (PRECEDENCE.get(prev.intake) ?? 99)
            ? r
            : prev;
    byId.set(r.id, winner);
    dropped++;
  }
  records = [...byId.values()];
  records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));

  // ── 5. THE COLLAPSE GUARD — before any write ─────────────────────────────
  // Parsed-vs-committed, per intake. >10% AND >20 records lost.
  //
  // HONEST NOTE ON WHETHER IT CAN FIRE (checklist 7b, inverted). Tōkon had to
  // record that this guard SLEEPS under ~200 records per channel. This game is
  // the first on the platform where it is awake on day one: fatalFuryReplays
  // and wolfFgc commit over a thousand records each, so a 10% loss is 100+ and
  // clears both thresholds comfortably. It is genuinely asleep for evoEvents
  // (~96) and cotwReplays (~139), where the freeze pin and the post-deploy
  // smoke check remain the live protection.
  const beforeByIntake = new Map<ChannelKey, number>();
  for (const v of committed) {
    beforeByIntake.set(v.intake, (beforeByIntake.get(v.intake) ?? 0) + 1);
  }
  const afterByIntake = new Map<ChannelKey, number>();
  for (const v of records) afterByIntake.set(v.intake, (afterByIntake.get(v.intake) ?? 0) + 1);

  const collapses: string[] = [];
  for (const [intake, before] of beforeByIntake) {
    if (before === 0) continue;
    const after = afterByIntake.get(intake) ?? 0;
    const lost = before - after;
    if (lost > 20 && lost / before > 0.1) {
      collapses.push(
        `  ${intake}: ${before} → ${after} (lost ${lost}, ${((lost / before) * 100).toFixed(1)}%)`,
      );
    }
  }
  if (collapses.length && !ALLOW_COLLAPSE) {
    throw new Error(
      [
        `✖ COLLAPSE GUARD: ${collapses.length} intake(s) lost more than 10% AND more than 20 records.`,
        ...collapses,
        ``,
        `  Nothing has been written. A channel collapses because it was deleted, renamed, made`,
        `  private, or rebranded to another game and unlisted its back catalogue — all observed`,
        `  on this platform. If this loss is REAL and intended, re-run with --allow-collapse.`,
      ].join('\n'),
    );
  }

  // ── 6. players ───────────────────────────────────────────────────────────
  // Nicest casing wins: a handle seen as "PLSX" and "plsx" renders as the
  // mixed-case spelling if one exists, because ALL-CAPS titles are a styling
  // choice and not how the player writes their own name.
  const players = new Map<string, PlayerRecord>();
  for (const r of records) {
    for (const s of r.sides) {
      const prev = players.get(s.player);
      const better =
        !prev || (prev.handle === prev.handle.toUpperCase() && s.handle !== s.handle.toUpperCase());
      if (better) players.set(s.player, { id: s.player, handle: s.handle });
    }
  }

  // ── 7. review queue — regenerated, and pending items never ship ──────────
  const publishedIds = new Set(records.map((r) => r.id));
  const pending = queue.filter((q) => !overrides[q.id] && !publishedIds.has(q.id));

  // ── 8. residue, and the unreleased-fighter early warning ─────────────────
  // The residue gate is also how an UNRELEASED fighter announces themselves:
  // uploaders put the name in titles the day they ship, long before anyone
  // checks a calendar. See scripts/expiries.ts on why this is the real
  // detector and the date row is only the backstop.
  const residueRows = [...residue.entries()].sort((a, b) => b[1] - a[1]);
  // The rule is pure and lives in expiries.ts beside UNRELEASED, so it can be
  // positive-controlled on synthetic fixtures without the parse pipeline.
  const unreleasedHits = unreleasedResidueHits(residueRows.map(([text]) => text));

  // ── 9. WRITE (everything above passed) ───────────────────────────────────
  await write('videos.json', records);
  await write(
    'players.json',
    [...players.values()].sort((a, b) => a.id.localeCompare(b.id)),
  );
  await write('review-queue.json', pending);
  await write('source-pins.json', pins);

  const due = dueExpiries();
  const lines: string[] = [];
  if (due.length) lines.push(...expiryBlock(due), '');
  if (unreleasedHits.length) {
    lines.push(
      '## ⚠ AN UNRELEASED FIGHTER MAY HAVE SHIPPED',
      '',
      ...unreleasedHits.map(
        (id) => `- **${id}** appears in parser residue. Promote it — see scripts/expiries.ts.`,
      ),
      '',
    );
  }
  lines.push(
    '# CotW pipeline report',
    '',
    `- **${records.length}** published records · **${players.size}** players · ` +
      `**${input.characters.length}** fighters`,
    `- **${pending.length}** pending review item(s) — absent from the site, never guessed`,
    `- **${dropped}** duplicate id(s) resolved by intake precedence`,
    '',
    '## Per intake',
    '',
    '| intake | raw uploads | CotW-marked | parsed | published |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...CHANNELS.map((c) => {
      const p = perChannel.get(c.id);
      const pub = afterByIntake.get(c.id) ?? 0;
      return `| ${c.id} | ${p?.raw ?? '—'} | ${p?.marked ?? '—'} | ${p?.parsed ?? '—'} | ${pub} |`;
    }),
    '',
    '## Misses',
    '',
    ...Object.entries(
      misses.reduce<Record<string, number>>((a, m) => ((a[m.kind] = (a[m.kind] ?? 0) + 1), a), {}),
    )
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `- \`${k}\` — ${n}`),
    '',
    '## Residue — text no roster span covered',
    '',
    'A new nickname, a DLC fighter or an uploader typo surfaces here as a counted',
    'line with its literal text, instead of vanishing into a silently shorter side.',
    '',
    ...residueRows.slice(0, 40).map(([text, n]) => `- ${n}× \`${text}\``),
    residueRows.length > 40 ? `- … ${residueRows.length - 40} more` : '',
    '',
    ...notes.map((n) => `> ${n}`),
    '',
    `_Generated ${new Date().toISOString()}_`,
  );
  await writeFile(join(DATA, 'report.md'), `${lines.filter((l) => l !== undefined).join('\n')}\n`);

  console.log(
    `✓ ${records.length} records · ${players.size} players · ${pending.length} pending · ` +
      `${residueRows.length} residue line(s)`,
  );
  if (due.length) {
    console.error(
      `\n⚠ ${due.length} expiry(s) due — see the ACTION REQUIRED block in data/report.md`,
    );
  }
}

// ── the index intake ────────────────────────────────────────────────────────
function buildTheaterRecords(
  dump: TheaterRawRecord[],
  ctx: {
    records: MatchVideo[];
    committed: MatchVideo[];
    overrides: Record<string, VideoOverride>;
    rawSeen: Map<string, string>;
    matcher: AliasMatcher;
  },
): { kept: number; skipped: number; built: MatchVideo[] } {
  // IGNORE-IF-KNOWN, AND IT RUNS FIRST. If this repo has already ruled on a
  // video IN ANY CAPACITY, the catalogue entry is ignored — not merged, not
  // preferred, ignored. The predicate is known-ANYWHERE rather than merely
  // in-records, because an id excluded as wrong-game or dropped as a duplicate
  // must not re-enter through a side door.
  //
  // It keys on the VIDEO id, not the record id. That matters more here than in
  // the sibling repos: 67.7% of this catalogue is a same-day re-index of two of
  // our own channels, so this rule is doing the heavy lifting rather than
  // catching an edge case.
  const known = new Map<string, string>();
  const note = (id: string, where: string) => {
    if (!known.has(id)) known.set(id, where);
  };
  for (const [id, where] of ctx.rawSeen) note(id, where);
  for (const v of ctx.records) note(v.videoId ?? v.id, `this run (${v.intake})`);
  // THE INDEX INTAKE'S OWN COMMITTED RECORDS ARE EXCLUDED, and this is not an
  // optimisation — without it the intake poisons itself on its second run.
  //
  // The sibling repos populate this map with the committed RECORD id (`v.id`)
  // and look up by VIDEO id, which keeps their catalogue records out of it for
  // free: every one of their ids is a composite `vid@start`, which can never
  // equal a bare video id. That is not true here. 96% of this catalogue is
  // whole videos whose record id IS the video id (see types/index.ts), so those
  // committed records match themselves, every candidate is skipped as
  // "already known", and the run builds ZERO — which then trips the add-only
  // pin assertion. Caught by the clean half of `npm run verify:gates`.
  for (const v of ctx.committed) {
    if (v.intake === 'replayTheater') continue;
    note(v.videoId ?? v.id, `videos.json (${v.intake})`);
  }
  for (const [id, ov] of Object.entries(ctx.overrides)) {
    note(id, ov.exclude === true ? 'overrides.json (excluded)' : 'overrides.json');
  }

  let skipped = 0;
  const out: MatchVideo[] = [];
  const seenHere = new Set<string>();
  for (const r of dump) {
    if (known.has(r.videoId)) {
      skipped++;
      continue;
    }
    if (seenHere.has(r.id)) continue;
    seenHere.add(r.id);

    const sides = ([0, 1] as const).map<MatchSide | null>((i) => {
      const handle = normalizeText(stripTheaterSponsor(r.players[i] ?? ''));
      // Characters resolve on the alias table like every other tier — the
      // catalogue's spellings are not automatically ours ("Ken Masters" vs our
      // "Ken"), and an unresolved name goes to residue rather than being minted
      // as a fighter that does not exist.
      const ids: string[] = [];
      for (const name of r.characters[i] ?? []) {
        for (const id of ctx.matcher.ids(name)) if (!ids.includes(id)) ids.push(id);
      }
      if (!handle || ids.length === 0) return null;
      return {
        player: playerId(handle),
        handle,
        characters: ids,
        provenance: {
          tier: 'index',
          tiers: ['index'],
          fromTitle: [],
          fromIndex: ids,
          complete: true,
        },
      };
    });
    if (sides.some((s) => s === null)) continue;

    const day = r.publishedAt.slice(0, 10);
    out.push({
      id: r.id,
      channel: 'replayTheater',
      intake: 'replayTheater',
      title: r.title,
      publishedAt: r.publishedAt,
      durationSec: r.durationSec,
      season: seasonForDate(day),
      patch: patchForDate(day),
      // A record is only a SEGMENT when the catalogue gave it an offset. On the
      // untagged arm — 96% of this catalogue — the entry IS the whole video, so
      // it carries neither field and the engine treats it exactly like a
      // channel record. See types/index.ts ChannelIndex.
      ...(r.startSeconds !== undefined && r.startSeconds > 0
        ? { videoId: r.videoId, startSeconds: r.startSeconds }
        : {}),
      sides: [sides[0]!, sides[1]!] as [MatchSide, MatchSide],
    });
  }
  return { kept: dump.length - skipped, skipped, built: out };
}
