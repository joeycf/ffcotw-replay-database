/**
 * THE POSITIVE-CONTROL SUITE — checklist step 10.
 *
 * "Inject the failure each gate exists to catch and confirm it exits non-zero,
 * then confirm the clean run exits 0. A gate that cannot fail is
 * indistinguishable from a gate that passes, and you will trust it."
 *
 * Every control below injects a REAL defect into a REAL file, runs the REAL
 * command, and requires a non-zero exit. Three of them are not hypothetical:
 * the shared-start-date control reproduces the vendor CMS error that would have
 * mis-filed 950 records, the banned-alias control reproduces the "Griffon"
 * collision that would have corrupted ~90 records, and the variable-font
 * control reproduces the NaN geometry that silently truncated the OG card.
 *
 * ── 10c: THIS SUITE MUST NOT REPAIR THE CONDITION IT TESTS ────────────────
 * The sibling repos learned that a suite which snapshots data and restores it
 * in a `finally` also refreshes MTIMES, so a guard keyed on mtime can never
 * fire again after the first run — two controls failing on a stale checkout and
 * every later run passing.
 *
 * That specific trap cannot be sprung here, and it is worth saying why rather
 * than relying on luck: this repo's stale-raw guard reads ONLY DATA (the newest
 * publishedAt in the dump against the newest committed record for that intake —
 * see scripts/parse.ts). It consults no filesystem metadata at all, so `cp`,
 * `git checkout`, a fresh clone and this suite's own restore are all invisible
 * to it. The suite still restores byte-exactly, and asserts a clean run
 * afterwards, so a control that corrupted state would show up immediately.
 *
 * Run: npm run verify:gates
 *      npm run verify:gates -- --no-network   (skip the one control that opens a socket)
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const NO_NETWORK = process.argv.includes('--no-network');

interface Control {
  /** What the gate protects, phrased as the failure it refuses. */
  name: string;
  /** The command that must exit non-zero. */
  cmd: string[];
  /** Files this control edits; each is snapshotted and restored byte-exactly. */
  files: string[];
  /** Apply the defect. Return false to SKIP (with a reason printed). */
  inject: () => boolean | string;
  /** Extra environment for the run. */
  env?: NodeJS.ProcessEnv;
  /** This control opens a socket (even to a closed local port); skipped under
   *  `--no-network`. */
  network?: boolean;
  /** Replaces the default "exits non-zero" assertion, for a gate that is a
   *  MEASUREMENT rather than an exit code. Return null to pass, or the
   *  reason it failed. */
  assert?: (r: ReturnType<typeof run>) => string | null;
}

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const write = (p: string, s: string) => writeFileSync(join(ROOT, p), s);
/** Replace exactly once, asserting the anchor still exists — a control whose
 *  anchor has drifted silently becomes a no-op that reports PASS. */
const sub = (p: string, from: string, to: string): boolean => {
  const s = read(p);
  if (!s.includes(from)) return false;
  write(p, s.replace(from, to));
  return true;
};

/** The default assertion plus a name check: the command exited non-zero AND
 *  its output names the rule under test, so a failure for some other reason
 *  (a pre-existing defect in the same file) cannot pass as this control. */
const failsNaming = (r: ReturnType<typeof run>, rule: RegExp): string | null => {
  const out = `${r.stdout}${r.stderr}`;
  const head = out.split('\n').slice(0, 4).join(' | ');
  if (r.error) return `the command never ran: ${r.error.message}`;
  if (r.status === 0) return 'exited 0 with the defect present';
  if (!rule.test(out)) return `exited ${r.status} but not on ${rule}. Got: ${head}`;
  return null;
};

const CONTROLS: Control[] = [
  // ── tournament placements (scripts/tournaments.ts --check) ───────────────
  // Both offline. The file is Liquipedia's Tier 1–2 table as fetched; the
  // validator is what keeps a hand-edit (or a half-written fetch) from
  // reaching parse-finish.ts, which features whoever the file names.
  {
    name: 'tournaments: the same event page listed twice (a double-counted title)',
    cmd: ['tsx', 'scripts/tournaments.ts', '--check'],
    files: ['data/tournaments.json'],
    inject: () => {
      if (!existsSync(join(ROOT, 'data/tournaments.json'))) return 'no data/tournaments.json yet';
      const f = JSON.parse(read('data/tournaments.json')) as { events: unknown[] };
      if (!f.events.length) return 'tournaments.json carries no events';
      f.events.push(f.events[0]);
      write('data/tournaments.json', `${JSON.stringify(f, null, 2)}\n`);
      return true;
    },
    // Non-zero is not enough: the run must fail ON THIS RULE, or a stale row
    // elsewhere in the file could pass the control as a false positive.
    assert: (r) => failsNaming(r, /duplicate event page/),
  },
  {
    name: 'tournaments: an alias row pointing at a player who is not in the registry',
    cmd: ['tsx', 'scripts/tournaments.ts', '--check'],
    files: ['data/tournament-aliases.json'],
    inject: () => {
      if (!existsSync(join(ROOT, 'data/tournament-aliases.json')))
        return 'no data/tournament-aliases.json yet';
      const f = JSON.parse(read('data/tournament-aliases.json')) as {
        aliases: Record<string, string | null>;
      };
      const k = Object.keys(f.aliases)[0];
      if (!k) return 'the aliases file has no rows to corrupt';
      f.aliases[k] = 'no-such-player';
      write('data/tournament-aliases.json', `${JSON.stringify(f, null, 2)}\n`);
      return true;
    },
    assert: (r) => failsNaming(r, /unknown player id "no-such-player"/),
  },
  {
    // THE KEEP-THE-FILE GUARANTEE. An unreachable Liquipedia must be
    // UNVERIFIED (exit 0, yellow in ../sync-tournaments.sh) and must leave the
    // committed table byte-identical — a fetch failure that wrote an empty file
    // would un-feature every champion on the next parse. A measurement, not an
    // exit code, so it brings its own assert. Needs no real network: the
    // endpoint is pointed at a closed local port, but it is a `fetch`, so it
    // is filed as a network control and skipped under --no-network.
    name: 'tournaments: Liquipedia unreachable → UNVERIFIED and data/tournaments.json untouched',
    cmd: ['tsx', 'scripts/tournaments.ts'],
    files: ['data/tournaments.json'],
    env: { TOURNAMENTS_URL: 'http://127.0.0.1:9/api.php' },
    network: true,
    inject: () =>
      existsSync(join(ROOT, 'data/tournaments.json')) ? true : 'no data/tournaments.json yet',
    assert: (r) => {
      const out = `${r.stdout}${r.stderr}`;
      const head = out.split('\n').slice(0, 4).join(' | ');
      if (r.error) return `the command never ran: ${r.error.message}`;
      if (r.status !== 0)
        return `exited ${r.status}; an unreachable upstream is UNVERIFIED, never a failure. Got: ${head}`;
      if (!/tournaments: UNVERIFIED/.test(out)) return `no UNVERIFIED trailer. Got: ${head}`;
      const before = snapshots.get('data/tournaments.json');
      const after = readFileSync(join(ROOT, 'data/tournaments.json'));
      if (!before || !before.equals(after))
        return 'data/tournaments.json changed on a failed fetch';
      return null;
    },
  },

  // ── the patch table ──────────────────────────────────────────────────────
  {
    name: 'patches: two patches share a start date (the real 2.2.0 CMS error)',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "version: '2.2.0',\n    start: '2026-06-22',",
        "version: '2.2.0',\n    start: '2026-05-25',",
      ),
  },
  {
    name: 'patches: a future-dated patch',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "version: '3.1.3',\n    start: '2026-09-03',",
        "version: '3.1.3',\n    start: '2027-09-03',",
      ),
  },
  {
    name: 'patches: an era whose first patch is not its opener',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "version: '3.0.0',\n    start: '2026-07-17',",
        "version: '3.0.0',\n    start: '2026-07-18',",
      ),
  },
  {
    name: 'patches: version order and date order disagree',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "version: '2.1.2',\n    start: '2026-05-25',",
        "version: '2.1.2',\n    start: '2026-07-01',",
      ),
  },
  {
    name: 'patches: an era gap',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () => sub('scripts/patches.ts', "end: '2026-07-17',", "end: '2026-07-19',"),
  },
  {
    name: 'patches: the newest era is not left open',
    cmd: ['tsx', 'scripts/patches.ts', '--check'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "    end: null,\n    confirmed: true,\n    label: 'Season 3",
        "    end: '2026-12-31',\n    confirmed: true,\n    label: 'Season 3",
      ),
  },

  // ── the roster ───────────────────────────────────────────────────────────
  {
    name: 'roster: a BANNED alias is re-added ("Griffon" — a player, not Tizoc)',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    inject: () =>
      sub(
        'scripts/characters.ts',
        "{ id: 'tizoc', name: 'Tizoc', season: 0, released: '2025-04-21', aliases: [] },",
        "{ id: 'tizoc', name: 'Tizoc', season: 0, released: '2025-04-21', aliases: ['Griffon'] },",
      ),
  },
  {
    name: 'roster: two fighters claim the same alias',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    inject: () =>
      sub('scripts/characters.ts', "aliases: ['Vox'] },", "aliases: ['Vox', 'Terry'] },"),
  },
  {
    name: 'roster: a fighter with no --char-* design token',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    inject: () =>
      sub(
        'scripts/characters.ts',
        "{ id: 'gato', name: 'Gato', season: 0",
        "{ id: 'gato-x', name: 'Gato', season: 0",
      ),
  },
  {
    name: 'roster: an accent below the 4.5:1 AA floor',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'design/handoff/tokens.css'],
    inject: () =>
      sub('design/handoff/tokens.css', '--char-preecha: #5FD36A;', '--char-preecha: #1A3D20;'),
  },
  {
    name: 'roster: an announced-but-unreleased fighter reaches the roster',
    cmd: ['tsx', 'scripts/characters.ts'],
    files: ['data/characters.json', 'scripts/characters.ts'],
    inject: () =>
      sub(
        'scripts/characters.ts',
        '  // ── Season 3 · Destined for Revenge (2026) ─',
        "  { id: 'laocorn', name: 'Laocorn', season: 3, released: '2026-11-30', aliases: [] },\n  // ── Season 3 ─",
      ),
  },

  // ── emit: the two-schema boundary ────────────────────────────────────────
  {
    name: 'emit: a record references an unknown character',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    inject: () => {
      const v = JSON.parse(read('data/videos.json')) as { sides: { characters: string[] }[] }[];
      if (!v.length) return 'empty corpus';
      v[0]!.sides[0]!.characters = ['not-a-fighter'];
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    name: 'emit: a side with ZERO characters',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    inject: () => {
      const v = JSON.parse(read('data/videos.json')) as { sides: { characters: string[] }[] }[];
      if (!v.length) return 'empty corpus';
      v[0]!.sides[1]!.characters = [];
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    name: 'emit: a record carries a patch token no boundary accounts for',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['data/videos.json'],
    inject: () => {
      const v = JSON.parse(read('data/videos.json')) as { patch: string }[];
      if (!v.length) return 'empty corpus';
      v[0]!.patch = '9.9.9';
      write('data/videos.json', JSON.stringify(v, null, 2));
      return true;
    },
  },
  {
    name: 'emit: pipeline provenance leaks into the public contract',
    cmd: ['tsx', 'scripts/emit.ts'],
    files: ['scripts/emit.ts'],
    inject: () =>
      sub(
        'scripts/emit.ts',
        '  sides: [\n    { player: v.sides[0].player, characters: v.sides[0].characters },',
        '  sides: [\n    { player: v.sides[0].player, characters: v.sides[0].characters, provenance: v.sides[0].provenance } as never,',
      ),
  },

  // ── parse: the corpus guards ─────────────────────────────────────────────
  {
    name: 'parse: the collapse guard (an intake loses >10% AND >20 records)',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/fatalFuryReplays.json'],
    inject: () => {
      const p = 'raw/fatalFuryReplays.json';
      if (!existsSync(join(ROOT, p))) return 'no raw dump — run `npm run data:fetch`';
      const dump = JSON.parse(read(p)) as { title: string }[];
      // DROP 40% OF THE MARKED ROWS, not 50% of the dump.
      //
      // The first version of this control halved the dump and REPORTED PASS
      // while removing nothing: this channel's 6,431 uploads are 5,212 KOF XV
      // and 1,217 CotW, and because the playlist is newest-first, every one of
      // the 1,217 sits in the recent half. Halving deleted only KOF XV rows, the
      // parse produced an identical corpus, and the control was a no-op that
      // looked like a working gate — checklist step 10's own failure mode,
      // caught only because a later run disagreed with an earlier one.
      //
      // So the injection now targets exactly what the guard measures: records
      // that reach the site.
      const marked = dump.filter((v) => /\bcotw\b|city of the wolves/i.test(v.title));
      const drop = new Set(marked.slice(0, Math.ceil(marked.length * 0.4)));
      const kept = dump.filter((v) => !drop.has(v));
      // Not emptied: an EMPTY dump is refused by a different rule, and a control
      // that trips the wrong gate proves nothing.
      if (kept.length === 0 || drop.size < 25)
        return 'not enough marked rows to trip both thresholds';
      write(p, JSON.stringify(kept));
      return true;
    },
  },
  {
    name: 'parse: an empty raw dump is refused outright',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/wolfFgc.json'],
    inject: () => {
      const p = 'raw/wolfFgc.json';
      if (!existsSync(join(ROOT, p))) return 'no raw dump — run `npm run data:fetch`';
      write(p, '[]');
      return true;
    },
  },
  {
    name: 'parse: the DATA-ONLY stale-raw guard (dump predates a committed record)',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['raw/svcHighlights.json'],
    inject: () => {
      const p = 'raw/svcHighlights.json';
      if (!existsSync(join(ROOT, p))) return 'no raw dump — run `npm run data:fetch`';
      const dump = JSON.parse(read(p)) as { publishedAt: string }[];
      if (!dump.length) return 'empty dump';
      // Roll every upload back a year. The dump's newest publishedAt is then
      // older than the newest committed record for this intake, which is
      // exactly the relation the guard tests — and it is a DATA relation, so
      // no amount of touching mtimes could fake or hide it.
      for (const r of dump)
        r.publishedAt = `20${Number(r.publishedAt.slice(2, 4)) - 1}${r.publishedAt.slice(4)}`;
      write(p, JSON.stringify(dump));
      return true;
    },
  },
  {
    name: 'parse: videos.json unreadable is a hard stop, never "treat as empty"',
    cmd: ['tsx', 'scripts/parse.ts'],
    files: ['data/videos.json'],
    inject: () => {
      write('data/videos.json', '{ this is not json');
      return true;
    },
  },

  // ── the vendor patch checker ─────────────────────────────────────────────
  {
    name: 'patch-check: a shipped patch is missing from the table',
    cmd: ['tsx', 'scripts/patch-check.ts'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub('scripts/patches.ts', "    version: '3.1.3',", "    version: '3.1.3-REMOVED',"),
  },
  {
    name: 'patch-check: a table row carries a date its own vendor page contradicts',
    cmd: ['tsx', 'scripts/patch-check.ts'],
    files: ['scripts/patches.ts'],
    inject: () =>
      sub(
        'scripts/patches.ts',
        "version: '2.2.0',\n    start: '2026-06-22',",
        "version: '2.2.0',\n    start: '2026-05-25',",
      ),
  },
  {
    name: 'patch-check: an unreadable PATCH post is a hard failure, not a skip',
    cmd: ['tsx', 'scripts/patch-check.ts'],
    files: ['scripts/patch-check.ts'],
    inject: () =>
      sub(
        'scripts/patch-check.ts',
        "  '2025-03-26': 'Open Beta Test 2 patch note — the vendor published no version for the betas',",
        '',
      ),
  },

  // ── the redirect table ───────────────────────────────────────────────────
  {
    name: 'redirects: a redirect target that is not a player (a 404 wearing a 301)',
    cmd: ['tsx', 'scripts/redirects.ts', '--check'],
    files: ['data/player-redirects.json'],
    inject: () => {
      write(
        'data/player-redirects.json',
        JSON.stringify({ 'old-handle': 'nobody-at-all' }, null, 2),
      );
      return true;
    },
  },

  // ── generated brand art (checklist 5d) ───────────────────────────────────
  {
    name: 'og: a VARIABLE font emits NaN geometry and truncates the card silently',
    cmd: ['tsx', 'scripts/og.ts'],
    files: ['design/fonts/Figtree-Regular.ttf'],
    inject: () => {
      // A variable font is what produced the real defect. Rather than ship one,
      // corrupt the static instance's glyph table: opentype.js then either
      // throws or emits non-finite coordinates, and both are refusals.
      const p = join(ROOT, 'design/fonts/Figtree-Regular.ttf');
      const buf = readFileSync(p);
      buf.fill(0, Math.floor(buf.length * 0.6), Math.floor(buf.length * 0.9));
      writeFileSync(p, buf);
      return true;
    },
  },
];

// ── runner ──────────────────────────────────────────────────────────────────
const snapshots = new Map<string, Buffer>();
const snapshot = (files: string[]) => {
  for (const f of files) {
    const abs = join(ROOT, f);
    if (existsSync(abs)) snapshots.set(f, readFileSync(abs));
    else snapshots.set(f, Buffer.alloc(0));
  }
};
const restore = (files: string[]) => {
  for (const f of files) {
    const abs = join(ROOT, f);
    const snap = snapshots.get(f);
    if (snap === undefined) continue;
    if (snap.length === 0 && !existsSync(abs)) continue;
    writeFileSync(abs, snap);
  }
};

const run = (cmd: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync('npx', cmd, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });

let pass = 0;
let fail = 0;
let skip = 0;
const failures: string[] = [];

console.log(`▶ ${CONTROLS.length} positive control(s)\n`);
for (const c of CONTROLS) {
  if (only && !c.name.includes(only)) continue;
  if (c.network && NO_NETWORK) {
    skip++;
    console.log(`  SKIP  ${c.name}\n        --no-network was given; this control opens a socket`);
    continue;
  }
  snapshot(c.files);
  let injected: boolean | string = false;
  try {
    injected = c.inject();
  } finally {
    if (injected !== true) restore(c.files);
  }
  if (injected !== true) {
    skip++;
    console.log(
      `  SKIP  ${c.name}\n        ${typeof injected === 'string' ? injected : 'the control anchor no longer matches — the control is a NO-OP and must be re-pointed'}`,
    );
    if (injected === false) {
      fail++;
      failures.push(`${c.name} — anchor drift (the control could not inject its defect)`);
    }
    continue;
  }
  const r = run(c.cmd, c.env);
  // A control with its own `assert` is a measurement: it reads the snapshot
  // taken before the run, so it must judge BEFORE the restore.
  const why = c.assert ? c.assert(r) : r.status !== 0 ? null : 'exited 0 with the defect present';
  restore(c.files);
  if (why === null) {
    pass++;
    console.log(`  PASS  ${c.name}`);
  } else {
    fail++;
    failures.push(c.name);
    console.log(`  FAIL  ${c.name}  — ${why}`);
  }
}

// ── and the clean run, which is the other half of step 10 ──────────────────
console.log('\n▶ clean run');
const CLEAN: [string, string[]][] = [
  ['patches', ['tsx', 'scripts/patches.ts', '--check']],
  ['expiries', ['tsx', 'scripts/expiries.ts', '--check']],
  ['expiries selftest', ['tsx', 'scripts/expiries.ts', '--selftest']],
  ['characters', ['tsx', 'scripts/characters.ts']],
  ['redirects', ['tsx', 'scripts/redirects.ts', '--check']],
  ['tournaments', ['tsx', 'scripts/tournaments.ts', '--check']],
  ['parse', ['tsx', 'scripts/parse.ts']],
  ['emit', ['tsx', 'scripts/emit.ts']],
];
for (const [label, cmd] of CLEAN) {
  const r = run(cmd);
  if (r.status === 0) {
    console.log(`  PASS  ${label} exits 0`);
    pass++;
  } else {
    console.log(
      `  FAIL  ${label} exits ${r.status} on clean input\n${(r.stderr || r.stdout)
        .split('\n')
        .slice(0, 6)
        .map((l) => `        ${l}`)
        .join('\n')}`,
    );
    fail++;
    failures.push(`clean run: ${label}`);
  }
}

console.log(`\n${fail === 0 ? '✓' : '✖'} ${pass} passed · ${fail} failed · ${skip} skipped`);
if (failures.length) {
  console.error('\nA control that does not fire is worse than no control:\n');
  for (const f of failures) console.error(`  ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
