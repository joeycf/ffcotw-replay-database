/**
 * Self-expiring gates — things the DATA can tell us are due, rather than things
 * a human has to remember.
 *
 * THREE SEVERITIES, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE DESIGN:
 *
 *   scripts/characters.ts  (manual roster run)  → process.exit(1)
 *   scripts/parse.ts       (daily cron path)    → NEVER exits; prints a FAILURE
 *                                                 banner and writes an
 *                                                 "## ⚠ ACTION REQUIRED" block
 *                                                 at the top of data/report.md
 *   .github/workflows/…    (daily cron)         → a FINAL step, AFTER commit and
 *                                                 push, that exits 1
 *
 * A hard exit in parse.ts would fail `npm run data:build` and stop the daily
 * refresh entirely, which is strictly worse than the misfiling it warns about:
 * a day of stale data costs more than a day of a fighter filed under the wrong
 * accent. So the daily path stays soft, the data gets pushed, and the WORKFLOW
 * goes red afterwards so the pending work is impossible to miss.
 *
 * THE RED WORKFLOW AND THE exit 1 ARE THE DESIGN, NOT A BUG. Clear them by
 * doing the work below — never by deleting the check.
 *
 * Second-order property worth preserving: report.md's commit guard drops the
 * file when the only diff is its "_Generated_" timestamp. An ACTION REQUIRED
 * block is real content, so the day it first appears the guard lets it through
 * and the signal reaches git — and the deployed site — even on a no-change day.
 *
 * Run: npm run data:expiries   (tsx scripts/expiries.ts --check)
 */

import { PATCHES, SEASONS } from './patches';
import type { Expiry } from '../types/index';

/**
 * Fighters that are ANNOUNCED but not yet playable.
 *
 * A row here is what turns a future release into a due expiry instead of
 * something someone has to diary. `releases` is the date the row FIRES.
 *
 * FOR A MONTH-GRANULARITY ANNOUNCEMENT THAT DATE IS THE LAST DAY OF THE WINDOW,
 * NOT THE FIRST, and this is a deliberate divergence from the sibling repo.
 * Tōkon fires at window open on the argument that firing early costs one
 * dismissed warning. That holds for its windows, which are quarters. SNK
 * announces to the MONTH, so firing at window open means the workflow is red
 * every day from the 1st until the fighter ships — which is not one dismissed
 * warning, it is up to thirty, and an alarm that is red all month is an alarm
 * that gets muted. Fired on 2026-09-01 for Kim Kaphwan this run, and the answer
 * was "no, he has not shipped, and nothing says when": the September patch
 * (Ver.3.1.3, 2026-09-03) is a bugfix with no new character, there is no
 * characters/kaphwan.php, and there is no reveal post.
 *
 * WHAT COVERS THE GAP is not a date at all — it is the RESIDUE GATE. When a
 * fighter ships, uploaders put the name in titles the same day, so the name
 * appears in parse.ts's residue report as a counted line with its literal text.
 * parse.ts checks residue against these UNRELEASED ids by name and says so
 * loudly. That detector fires on the real event (footage exists) rather than on
 * a date someone guessed, and it cannot be early or late. The date row is the
 * backstop for the opposite case: the fighter shipped and nobody uploaded.
 *
 * PROVENANCE. SNK's Season 3 press release (2026-07-16,
 * snk-corp.co.jp/us/press/2026/city-of-the-wolves-is-destined-for-revenge-in-
 * season-3-…/) names the schedule: Rick Strowd July, Duck King August, Kim
 * Kaphwan September, Laocorn November, with "mystery fighters slated for
 * release in October and December". Rick and Duck have shipped and are on the
 * roster; the rows below are what is left.
 *
 * THE OCTOBER SLOT WAS REVEALED ON 2026-09-09 AND IT IS TWO FIGHTERS, NOT ONE.
 * snk-corp.co.jp/us/press/2026/loyalty-brotherhood-revenge-tokyo-revengers-ride-
 * into-city-of-the-wolves-collaboration-teaser-trailer-out-now/ : "Manjiro
 * “Mikey” Sano and Ken “Draken” Ryuguji from the popular anime series Tokyo
 * Revengers will join FATAL FURY: City of the Wolves Season 3 on October 22,
 * 2026. This marks the first time that two DLC characters will be released
 * simultaneously for the game. Mikey and Draken will each be available as fully
 * independent playable fighters".
 *
 * PASS ARITHMETIC IS UNSETTLED; THE FIGHTER COUNT IS NOT. Steam's Season Pass 3
 * page still enumerates SIX slots with October as "???", which makes seven
 * fighters across six slots. It simply has not been updated since the
 * announcement. Count fighters here, not slots — this file gates fighters.
 *
 * NOTE WHERE THIS WAS ALMOST GOT WRONG. The game site's own news CMS
 * (fetch_news_en.php) carries a "Character Reveal!" post for every fighter from
 * Andy Bogard onward and has NONE for Kaphwan or Laocorn — so checking only
 * that feed says these two do not exist. They are announced on SNK's corporate
 * PRESS path, which is a different feed. Two first-party sources, and the one
 * the pipeline already polls is the incomplete one.
 */
/** `detect` carries EXTRA residue needles for fighters whose id is not what
 *  uploaders type. The residue gate matches on the id with hyphens as spaces,
 *  which is right when the id IS the common name (laocorn) and useless when it
 *  is not: nobody writes "Manjiro Sano", they write "Mikey". Without these the
 *  detector this file calls the REAL one is blind to the very fighters whose
 *  official names carry a nickname. A needle that also matches a player handle
 *  costs one dismissed warning, which is the trade this file already makes. */
export const UNRELEASED: {
  id: string;
  releases: string;
  accent?: string;
  note?: string;
  detect?: string[];
}[] = [
  {
    id: 'kim-kaphwan',
    releases: '2026-09-30',
    detect: ['kaphwan'],
    // Already in design/handoff/tokens.css, measured at 5.83:1 on --color-surface.
    accent: '#4A90FF',
    note:
      'Season 3, announced for SEPTEMBER 2026 with no day; this row fires at window CLOSE. ' +
      'Verified 2026-09-03: not shipped — Ver.3.1.3 that day is a bugfix, there is no ' +
      'characters/kaphwan.php, and no reveal post exists. Completes the Kim family beside Dong Hwan and Jae Hoon — which ' +
      'is also why a bare "Kim" must never become a parse alias.',
  },
  {
    id: 'laocorn',
    releases: '2026-11-30',
    accent: '#D4AF37',
    note:
      'Season 3, announced for NOVEMBER 2026; fires at window close. Playable debut, from the ' +
      '1994 Fatal Fury film — so uploaders may spell it "Laocorn Gaudeamus".',
  },
  // ── THE OCTOBER SLOT, REVEALED 2026-09-09: ONE SLOT, TWO FIGHTERS ──────────
  // These two replace the old 's3-october-mystery' row, which was wrong twice over:
  // one row for two fighters, and firing 2026-10-31 for a release on the 22nd.
  // An EXACT DAY was announced, so the fire-at-window-close rule in this file's
  // header does not apply here — that rule exists for month-granularity windows,
  // and the rows that still need it (kaphwan, laocorn, december) keep it.
  {
    id: 'manjiro-sano',
    releases: '2026-10-22',
    detect: ['mikey'],
    note:
      'Season 3, Tokyo Revengers collaboration, announced 2026-09-09 for OCTOBER 22 with an ' +
      'exact day. "Manjiro \u201cMikey\u201d Sano" — full-name kebab per this repo\'s id ' +
      "convention, but CONFIRM the id and spelling against SNK's character index when the page " +
      'exists; there is none yet. Uploaders will overwhelmingly write "Mikey", the nickname ' +
      'inside the official name, so that is the alias that matters. Ships alongside ' +
      '[ken-ryuguji] — the first time this game has released two DLC characters simultaneously.',
  },
  {
    id: 'ken-ryuguji',
    releases: '2026-10-22',
    detect: ['draken'],
    note:
      'Season 3, Tokyo Revengers collaboration, announced 2026-09-09 for OCTOBER 22. ' +
      '"Ken \u201cDraken\u201d Ryuguji"; uploaders will write "Draken". ' +
      'READ THIS BEFORE WRITING HIS ALIASES: he puts a SECOND Ken on this roster, so a bare ' +
      '"Ken" stops being resolvable the day he ships — exactly the Kim problem the header ' +
      'describes, and the reason "kim" is on the banned list. Today the id `ken` (Ken Masters, ' +
      'S1) owns the bare token through its own name. Either Draken never carries a bare "Ken", ' +
      'or "ken" joins the banned list and both fighters resolve only on a qualified spelling. ' +
      'Decide it when he ships, with the corpus counts in front of you — never by pattern.',
  },
  {
    id: 's3-december-mystery',
    releases: '2026-12-31',
    note: 'Season 3, December slot. Announced, unnamed. Same treatment as the October row.',
  },
];

/**
 * The patch table goes stale silently, so it gets a cadence check.
 *
 * FORTY DAYS, AND THE NUMBER IS MEASURED RATHER THAN INHERITED. Tōkon uses 10,
 * which is right for a vendor shipping every 4–11 days. SNK does not: across
 * the 23 gaps between announced versions the median is 21 days, p75 is 28, p90
 * is 34 and the maximum is 68 (Ken in August to Joe Higashi in October 2025).
 * A 10-day threshold here would fire on more than half of all NORMAL gaps, and
 * an alarm that cries every fortnight is an alarm nobody reads.
 *
 * STATED HONESTLY: at this cadence the blunt check cannot cleanly separate "a
 * patch was missed" from "the vendor was quiet". A single miss shows up as
 * roughly 2 × 21 = 42 days, and a genuine 44-day gap happened in the last
 * twelve months — the distributions overlap. 40 sits below the miss signal and
 * above all but one real gap, so it costs about one dismissed warning a year
 * and still catches the first miss rather than the second.
 *
 * This alarm is therefore explicitly NOT the real check — `npm run
 * data:patch-check` is. It earns its place by being the thing that cannot go
 * blind: it reads only the table's own newest date and the clock, so no change
 * to the vendor's title format, feed shape or CMS can silence it.
 */
const STALE_PATCH_DAYS = 40;

/**
 * The residue side of the early-warning system, as a PURE function so it can be
 * positive-controlled without standing up the parse pipeline.
 *
 * `residueTexts` is the literal text of every span no roster alias covered.
 * A hit means an announced fighter's name is showing up in real uploads, which
 * is the REAL detector — footage exists, so they shipped, whatever the calendar
 * says. Matching is case-insensitive substring, on the id (hyphens as spaces)
 * plus any `detect` needles.
 */
export function unreleasedResidueHits(
  residueTexts: readonly string[],
  unreleased: readonly { id: string; detect?: string[] }[] = UNRELEASED,
): string[] {
  const haystack = residueTexts.map((t) => t.toLowerCase());
  return unreleased
    .filter((u) => {
      const needles = [u.id.replace(/-/g, ' '), ...(u.detect ?? [])].map((n) => n.toLowerCase());
      return haystack.some((t) => needles.some((n) => t.includes(n)));
    })
    .map((u) => u.id);
}

const today = (): string => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Everything whose date has now passed. Empty is the happy path. */
export function dueExpiries(asOf: string = today()): Expiry[] {
  const due: Expiry[] = [];

  for (const u of UNRELEASED) {
    if (asOf >= u.releases) {
      due.push({
        kind: 'unreleased-character',
        id: u.id,
        date: u.releases,
        action:
          `${u.id} should now be playable. If it is: confirm the name and spelling on ` +
          `snk-corp.co.jp/us/games/fatalfury-cotw/characters/, add --char-${u.id} to ` +
          `design/handoff/tokens.css (${
            u.accent
              ? `the handoff already derived ${u.accent}`
              : 'accent from a Claude Design session — never invent one'
          } — contrast ≥4.5:1 on --color-surface and a hue ≥8–12° off its roster ` +
          `neighbours), add the same hex to accents in app/app.config.ts, add the fighter to ` +
          `ROSTER in scripts/characters.ts with the aliases its uploaders actually use, drop ` +
          `this entry from UNRELEASED, then run \`npm run data:characters\` and ` +
          `\`npm run data:art\`. Also add a comboforge null for it in app/app.config.ts until ` +
          `\`npm run verify:comboforge\` says they carry it. If it has NOT shipped, re-date ` +
          `this row to the new window — do not delete it.`,
      });
    }
  }

  for (const s of SEASONS) {
    if (!s.confirmed && asOf >= s.start) {
      due.push({
        kind: 'unconfirmed-season',
        id: `S${s.season}`,
        date: s.start,
        action:
          `Season ${s.season} was scheduled for ${s.start} and is still unconfirmed. Verify the ` +
          `balance patch landed, add its opening patch to PATCHES in scripts/patches.ts, set ` +
          `confirmed: true, and re-run \`npm run data:emit\`. The era opens on the patch whose ` +
          `own notes page says it opens the season — NEVER on the marketing start date and ` +
          `NEVER on a major-version bump (Ver.2.0.1 is the counter-example that ships).`,
      });
    }
  }

  const newest = PATCHES.at(-1);
  if (newest && daysBetween(newest.start, asOf) > STALE_PATCH_DAYS) {
    due.push({
      kind: 'stale-patch-table',
      id: 'patch-table',
      date: newest.start,
      action:
        `The newest patch in scripts/patches.ts is ${newest.version}, ` +
        `${daysBetween(newest.start, asOf)} days old (threshold ${STALE_PATCH_DAYS}). Run ` +
        `\`npm run data:patch-check\` against SNK's own news CMS — not the Steam feed, which ` +
        `stopped carrying version posts at Ver 1.1.7. If a patch shipped and is not in the ` +
        `table, every replay since is filed under the previous token: it renders, it filters, ` +
        `and it is wrong. If genuinely nothing shipped, that is fine — this warning costs one ` +
        `command.`,
    });
  }

  return due;
}

/** Rendered into data/report.md by parse.ts when anything is due. */
export function expiryBlock(due: Expiry[]): string[] {
  if (!due.length) return [];
  return [
    '## ⚠ ACTION REQUIRED',
    '',
    `${due.length} self-expiring gate(s) are due:`,
    '',
    ...due.flatMap((d) => [`- **${d.id}** (${d.kind}, due ${d.date})`, `  ${d.action}`, '']),
  ];
}

// ── standalone `--selftest` ─────────────────────────────────────────────────
// unreleasedResidueHits() is the REAL detector — the one that fires on footage
// existing rather than on a date someone guessed — so it gets a permanent
// positive control on synthetic fixtures. It is wired into verify-gates' clean
// run, because a detector nobody ever proved can fire is not a detector.
//
// It exists because the rule WAS silently blind: matching on the id alone,
// "manjiro-sano" never appears in a title and "Mikey" always would.
const SELFTEST: { name: string; residue: string[]; want: string[] }[] = [
  { name: 'a clean corpus fires nothing', residue: ['DildilFatalFury', 'Rankeadas'], want: [] },
  {
    name: 'the nickname, not the id (Mikey)',
    residue: ['MIKEY vs Terry FT5'],
    want: ['manjiro-sano'],
  },
  {
    name: 'the nickname, not the id (Draken)',
    residue: ['Rock Howard vs Draken'],
    want: ['ken-ryuguji'],
  },
  {
    name: 'both in one title',
    residue: ['Mikey vs Draken mirror'],
    want: ['manjiro-sano', 'ken-ryuguji'],
  },
  {
    name: 'the full official name still matches',
    residue: ['Manjiro Sano combos'],
    want: ['manjiro-sano'],
  },
  { name: 'a surname alone (Kaphwan)', residue: ['KAPHWAN first look'], want: ['kim-kaphwan'] },
  {
    name: 'an id that IS the common name still matches',
    residue: ['Laocorn Gaudeamus'],
    want: ['laocorn'],
  },
  { name: 'matching is case-insensitive', residue: ['dRaKeN'], want: ['ken-ryuguji'] },
];

function selftest(): number {
  let failed = 0;
  for (const c of SELFTEST) {
    const got = unreleasedResidueHits(c.residue, UNRELEASED);
    const ok = [...got].sort().join(',') === [...c.want].sort().join(',');
    if (!ok) {
      failed++;
      console.error(`  FAIL  ${c.name}\n        got [${got}] want [${c.want}]`);
    }
  }
  if (failed) {
    console.error(
      `\n\u2716 unreleasedResidueHits: ${failed}/${SELFTEST.length} fixture(s) failed.`,
    );
    console.error('  A row in UNRELEASED probably needs a `detect` needle — see its comment.');
    return 1;
  }
  console.log(`\u2713 unreleasedResidueHits — ${SELFTEST.length} fixture(s) pass`);
  return 0;
}

// ── standalone `--check` ─────────────────────────────────────────────────────
// The workflow's LAST step. It runs after the data has been committed and
// pushed, so a red run never costs a refresh — it only makes the pending work
// impossible to ignore.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain && process.argv.includes('--selftest')) process.exit(selftest());
if (isMain && process.argv.includes('--check')) {
  const due = dueExpiries();
  if (!due.length) {
    console.log(
      `✓ no expiries due — ${UNRELEASED.length} unreleased row(s) pending, ` +
        `newest patch ${PATCHES.at(-1)?.version}`,
    );
    process.exit(0);
  }
  console.error(`\n✖ ${due.length} EXPIRY(S) DUE — this step is designed to go red.\n`);
  for (const d of due) {
    console.error(`  ${d.id}  (${d.kind}, due ${d.date})`);
    console.error(`    ${d.action}\n`);
  }
  console.error('  Clear these by doing the work above. Never by deleting the check.');
  process.exit(1);
}
