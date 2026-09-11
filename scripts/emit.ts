/**
 * Emit the engine-facing artifacts from the parse substrate.
 *
 * data/videos.json (rich, pipeline-shaped) → public/data/replays.json +
 * data/stats.json + data/summary.json + data/patchGroups.json +
 * data/patchBoundaries.json + data/seasonBoundaries.json (narrow,
 * engine-shaped). This is the two-schema boundary the platform runs on, and
 * every contract assertion below is a THROW: a silent schema drift here is
 * invisible until a panel renders wrong.
 *
 * Run: npm run data:emit
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PATCHES,
  SEASONS,
  buildPatchGroups,
  patchWindows,
  seasonToken,
  validate as validatePatches,
} from './patches';
import { buildStats, CHARACTERS_PER_SIDE } from './stats';
import type { CharacterRecord, MatchVideo, PlayerRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const PUBLIC_DATA = join(ROOT, 'public', 'data');

/** Mirrors app/app.config.ts, which is the authority. The shell's
 *  verify:cutover asserts these two values against its own GAMES table, so a
 *  drift fails at the apex rather than here. */
const GAME_ID = 'ffcotw';
const GAME_NAME = 'FATAL FURY: City of the Wolves';

// ── the engine contract, restated locally ───────────────────────────────────
// The pipeline can't resolve the Nuxt `@engine` alias, so the emitted shapes
// are declared here. They must mirror replay-engine/types/replay.ts.
//
// Note what is NOT here: `provenance`. The substrate's MatchSide carries it and
// the emitted side does not, which is the whole point — the rich pipeline record
// projects DOWN to the narrow public contract. toReplay() builds sides
// field-by-field rather than spreading, so provenance cannot leak by
// construction; the assertion further down proves it anyway, because "cannot
// happen by construction" is exactly what people say before it does.
interface EmittedSide {
  player: string;
  characters: string[];
}
interface EmittedReplay {
  id: string;
  sides: [EmittedSide, EmittedSide];
  date: string;
  patch?: string;
  source: string;
  title: string;
  views?: number;
  durationSec?: number;
  videoId?: string;
  startSeconds?: number;
  /** What the badge prints instead of the source's configured name (engine
   *  v0.13.0): the event first, then the uploader, then neither. */
  event?: string;
  channelName?: string;
}

const toReplay = (v: MatchVideo): EmittedReplay => ({
  id: v.id,
  sides: [
    { player: v.sides[0].player, characters: v.sides[0].characters },
    { player: v.sides[1].player, characters: v.sides[1].characters },
  ],
  date: v.publishedAt,
  patch: v.patch,
  source: v.channel,
  title: v.title,
  ...(v.viewCount ? { views: v.viewCount } : {}),
  ...(v.durationSec ? { durationSec: v.durationSec } : {}),
  ...(v.videoId ? { videoId: v.videoId } : {}),
  ...(v.startSeconds ? { startSeconds: v.startSeconds } : {}),
  // Pass-through, not a decision. Whether a label is meaningful is a question
  // only the builder that read it can answer, and the theater builder is the
  // only one that sets either field.
  ...(v.event ? { event: v.event } : {}),
  ...(v.channelName ? { channelName: v.channelName } : {}),
});

async function main(): Promise<void> {
  await mkdir(PUBLIC_DATA, { recursive: true });

  // The patch table is validated HERE as well as in typecheck, because emit is
  // the step that turns it into a facet and a per-record token. A table that is
  // wrong produces a site that renders and filters and is wrong.
  const patchErrs = validatePatches();
  if (patchErrs.length) {
    throw new Error(`emit: patches.ts is invalid:\n${patchErrs.map((e) => `    ${e}`).join('\n')}`);
  }

  const characters = JSON.parse(
    await readFile(join(DATA, 'characters.json'), 'utf8'),
  ) as CharacterRecord[];
  const players = existsSync(join(DATA, 'players.json'))
    ? (JSON.parse(await readFile(join(DATA, 'players.json'), 'utf8')) as PlayerRecord[])
    : [];
  const records = existsSync(join(DATA, 'videos.json'))
    ? (JSON.parse(await readFile(join(DATA, 'videos.json'), 'utf8')) as MatchVideo[])
    : [];

  /**
   * EMPTY-CORPUS MODE, AND IT SKIPS VISIBLY.
   *
   * A corpus-independent stage has to be able to build the whole app with no
   * replays at all — that is the deliverable of Stage 1, and it is also what a
   * fresh clone does before the first fetch. The record-shaped assertions have
   * nothing to assert on, so they are SKIPPED and SAID, never weakened: an
   * assertion that quietly passes on an empty array is indistinguishable from
   * one that passes on real data. The registry and patch assertions still run,
   * and they are the ones that can fail without a corpus.
   */
  const empty = records.length === 0;
  if (empty) {
    console.log(
      '  ⓘ empty-corpus mode: 0 records. Registry and patch assertions still run;\n' +
        '    every record-shaped assertion below is SKIPPED, not weakened.',
    );
  }

  // ── contract assertions — every one a throw ───────────────────────────────
  const charIds = new Set(characters.map((c) => c.id));
  if (charIds.size !== characters.length) throw new Error('emit: duplicate character id');
  const playerIds = new Set(players.map((p) => p.id));
  if (playerIds.size !== players.length) throw new Error('emit: duplicate player id');
  for (const c of characters) {
    if (!/^#[0-9A-F]{6}$/.test(c.accent)) {
      throw new Error(`emit: ${c.id} accent ${c.accent} is not a 6-digit uppercase hex`);
    }
  }

  const knownPatches = new Set(PATCHES.map((p) => p.version));
  const knownEras = new Set(SEASONS.map((s) => seasonToken(s.season)));
  const ids = new Set<string>();
  for (const v of records) {
    if (ids.has(v.id)) throw new Error(`emit: duplicate record id ${v.id}`);
    ids.add(v.id);
    if (v.sides.length !== 2) throw new Error(`emit: ${v.id} has ${v.sides.length} sides`);
    for (const s of v.sides) {
      // ZERO characters is the only failure the contract does not admit. A side
      // LONGER than charactersPerSide is legal data — a set whose loser
      // counter-picked — and is counted, never rejected.
      if (s.characters.length === 0) throw new Error(`emit: ${v.id} has a side with 0 characters`);
      for (const c of s.characters) {
        if (!charIds.has(c)) throw new Error(`emit: ${v.id} references unknown character ${c}`);
      }
      if (!playerIds.has(s.player)) {
        throw new Error(`emit: ${v.id} references unknown player ${s.player}`);
      }
    }
    // Every record must file under a patch the table accounts for. Without
    // this, a record admitted by a channel's pre-release floor with no era to
    // land in ships undated and filters to nothing.
    if (!knownPatches.has(v.patch) && !knownEras.has(v.patch)) {
      throw new Error(`emit: ${v.id} carries patch "${v.patch}", which no boundary accounts for`);
    }
  }

  const replays = records.map(toReplay);

  // NO PROVENANCE MAY REACH THE PUBLIC CONTRACT. Asserted on the serialized
  // output rather than the objects, because that is what actually ships.
  const replaysJson = JSON.stringify(replays);
  for (const leak of ['provenance', 'fromTitle', 'fromIndex', 'slotOrder', 'intake', 'handle']) {
    if (replaysJson.includes(`"${leak}"`)) {
      throw new Error(`emit: "${leak}" leaked into replays.json — the substrate must project DOWN`);
    }
  }

  const patchOrder = patchWindows()
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((w) => w.version);
  const stats = buildStats(records, [...charIds], patchOrder);

  // ── THE UNIT ASSERTION (checklist step 8) ─────────────────────────────────
  // The unit is SIDE APPEARANCES, so characterUsage must sum to the total
  // number of (side, character) pairs. On a 1v1 game that is 2 per record
  // except where a set lists a counter-pick, so it is computed from the data
  // rather than assumed to be 2×records — assuming would make the assertion
  // fail on legitimate data and teach whoever hits it to delete the check.
  const expectedUsage = records.reduce(
    (n, v) => n + v.sides[0].characters.length + v.sides[1].characters.length,
    0,
  );
  const usageTotal = Object.values(stats.characterUsage ?? {}).reduce((a, b) => a + b, 0);
  if (!empty && usageTotal !== expectedUsage) {
    throw new Error(
      `emit: characterUsage sums to ${usageTotal}, expected ${expectedUsage} side appearances. ` +
        `The unit is declared in scripts/stats.ts and in the app README; all three of ` +
        `characterUsage, byPatchUsage and playerCharacters must share it.`,
    );
  }
  // The same denominator, proven rather than asserted in prose.
  const playerTotal = Object.values(stats.playerCharacters ?? {}).reduce(
    (n, m) => n + Object.values(m).reduce((a, b) => a + b, 0),
    0,
  );
  if (!empty && playerTotal !== expectedUsage) {
    throw new Error(
      `emit: playerCharacters sums to ${playerTotal} but characterUsage to ${expectedUsage} — ` +
        `two panels would disagree with no visible symptom`,
    );
  }
  const patchUsageTotal = Object.values(stats.byPatchUsage ?? {}).reduce(
    (n, m) => n + Object.values(m).reduce((a, b) => a + b, 0),
    0,
  );
  if (!empty && patchUsageTotal !== expectedUsage) {
    throw new Error(
      `emit: byPatchUsage sums to ${patchUsageTotal}, expected ${expectedUsage} — same unit rule`,
    );
  }

  // ── write ─────────────────────────────────────────────────────────────────
  // Newest publish date across the corpus, in UTC. Empty corpus falls back to
  // the newest patch, which is still content and still stable.
  const newestReplayDay =
    records
      .reduce((newest, v) => (v.publishedAt > newest ? v.publishedAt : newest), '')
      .slice(0, 10) || PATCHES.at(-1)!.start;

  const groups = buildPatchGroups();
  const seenGroupIds = new Set<string>();
  for (const g of groups) {
    if (seenGroupIds.has(g.id)) throw new Error(`emit: duplicate patchGroups id ${g.id}`);
    seenGroupIds.add(g.id);
    for (const c of g.children ?? []) {
      if (seenGroupIds.has(c.id)) throw new Error(`emit: duplicate patchGroups id ${c.id}`);
      seenGroupIds.add(c.id);
    }
  }

  await writeFile(join(PUBLIC_DATA, 'replays.json'), replaysJson, 'utf8');
  await writeFile(join(DATA, 'replays.json'), replaysJson, 'utf8');
  await writeFile(join(DATA, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
  await writeFile(join(DATA, 'patchGroups.json'), `${JSON.stringify(groups, null, 2)}\n`, 'utf8');
  await writeFile(
    join(DATA, 'patchBoundaries.json'),
    `${JSON.stringify(patchWindows(), null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(DATA, 'seasonBoundaries.json'),
    `${JSON.stringify(SEASONS, null, 2)}\n`,
    'utf8',
  );

  // summary.json is the apex selector's card payload, fetched SAME-ORIGIN
  // through the shell's /ffcotw rewrite. It goes to both data/ (committed, so
  // Vercel can copy it) and public/data/.
  //
  // `updated` IS CONTENT-DERIVED — the newest replay's own date, never the
  // build time. That is a platform requirement rather than a nicety: the cron
  // only commits when a staged file actually changed, so a build-time stamp
  // would make this file differ on EVERY run and put a deploy on the calendar
  // every day forever, whether or not a single new match arrived. Shipped as
  // `new Date()` first time round; the tell was that it read a day ahead of
  // every sibling's within minutes of a quiet run.
  // THE KEY IS `game`, NOT `id`, and the field order matches the siblings.
  // This shipped as `id` and the apex cutover battery caught it: every one of
  // the four live games emits {"game": "<id>", …} and the battery asserts
  // `payload.game === <the game's id>`. The selector still rendered the right
  // count because it reads `replays`, so nothing looked wrong on the page —
  // the identity field was simply absent, which is exactly the kind of contract
  // drift that stays invisible until something compares two games.
  const summary = {
    game: GAME_ID,
    name: GAME_NAME,
    replays: records.length,
    players: players.length,
    characters: characters.length,
    updated: newestReplayDay,
  };
  const summaryJson = `${JSON.stringify(summary, null, 2)}\n`;
  await writeFile(join(DATA, 'summary.json'), summaryJson, 'utf8');
  await writeFile(join(PUBLIC_DATA, 'summary.json'), summaryJson, 'utf8');

  const usedPatches = Object.keys(stats.totals.byPatch ?? {}).length;
  console.log(
    `✓ emit — ${replays.length} replays · ${characters.length} fighters · ${players.length} players\n` +
      `  ${usageTotal} side appearances (unit: side appearances, charactersPerSide ${CHARACTERS_PER_SIDE})\n` +
      `  ${groups.length} era(s), ${PATCHES.length} patch(es), ${usedPatches} with replays`,
  );
}

main();
