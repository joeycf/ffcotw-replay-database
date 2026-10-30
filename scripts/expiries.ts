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
 *   .github/workflows/pending-work.yml          → runs after every completed
 *                                                 data run and exits 1
 *
 * A hard exit in parse.ts would fail `npm run data:build` and stop the daily
 * refresh entirely, which is strictly worse than the misfiling it warns about:
 * a day of stale data costs more than a day of a fighter filed under the wrong
 * accent. So the daily path stays soft, the data gets pushed, and the "Pending
 * work" run (workflow_run on the data run's completion) goes red afterwards so
 * the pending work is impossible to miss — and a held data run can no longer
 * hide a due expiry behind it, which it did on 2026-10-12.
 *
 * THE RED PENDING-WORK RUN AND THE exit 1 ARE THE DESIGN, NOT A BUG. Clear them by
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
 * release in October and December". Rick, Duck, Kaphwan, Mikey and Draken have
 * shipped and are on the roster; the rows below are what is left.
 *
 * Kaphwan shipped on 2026-09-18 (Ver.3.2.2), twelve days before his
 * window-close row would have fired. The manual data:patch-check and
 * data:roster-check found him on 2026-09-24; by then no upload had named him,
 * so the residue gate had nothing to see. For a month-granularity row, the date
 * is the backstop and the manual checkers are the early warning.
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
    id: 'laocorn',
    releases: '2026-11-30',
    accent: '#D4AF37',
    note:
      'Season 3, announced for NOVEMBER 2026; fires at window close. Playable debut, from the ' +
      '1994 Fatal Fury film — so uploaders may spell it "Laocorn Gaudeamus".',
  },
  // The October slot (Mikey and Draken, the Tokyo Revengers pair) shipped with
  // Ver.3.3.2 on 2026-10-19 and was promoted on 2026-10-30; their rows are gone.
  // Their `detect` needles live on in SELFTEST_ROWS below, which is where the
  // nickname-not-id rule is proved.
  {
    id: 's3-december-mystery',
    releases: '2026-12-31',
    note:
      'Season 3, December slot. Announced, unnamed; fires at window close, and moves to an ' +
      'exact day if SNK names one, as the October pair did.',
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
              : 'derive it by the handoff\'s method from the vendor\'s official art — anchor ' +
                'hue sampled from the character\'s key art, never guessed; the roster\'s tone ' +
                'band (S .6–1, L .55–.78); Δhue ≥ 8–12° against every roster neighbour, else ' +
                'split by ΔL ≥ .12 or chroma, documented; AA ≥ 4.5:1 on --color-surface — ' +
                'present 3–4 candidates with the anchor evidence, the user picks, record the ' +
                'derivation in tokens.css marked DERIVED (a design session may replace it)'
          }), add the same hex to accents in app/app.config.ts, add the fighter to ` +
          `ROSTER in scripts/characters.ts with the aliases its uploaders actually use (mined ` +
          `from titles, never guessed), drop this entry from UNRELEASED, map SNK's page slug in ` +
          `SLUG_TO_ID (scripts/roster-check.ts) and PAGE_SLUG (scripts/art.ts), then run ` +
          `\`npm run data:characters\`, \`npm run data:art\` (eyeball the bust crop; a novel ` +
          `pose needs a BUST_HEAD row) and \`npm run data:og\`, and fix the prose that counts ` +
          `the roster (README, characters.ts, app.config.ts). Also add a comboforge null for it ` +
          `in app/app.config.ts until \`npm run verify:comboforge\` says they carry it. If it ` +
          `has NOT shipped, re-date this row to the new window — do not delete it.`,
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
          `confirmed: true, and re-run \`npm run data:parse\` (not emit alone: parse stamps each ` +
          `record's season and patch, and emit only copies them). The era opens on the patch whose ` +
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
//
// THE FIXTURES CARRY THEIR OWN ROWS. Run against the live UNRELEASED, every
// promotion deleted the very fixture that proved the nickname rule (Kaphwan's
// went that way); frozen here, the control outlives the fighters it was
// written for. Mikey and Draken shipped on 2026-10-19 and still prove it.
const SELFTEST_ROWS: { id: string; detect?: string[] }[] = [
  { id: 'manjiro-sano', detect: ['mikey'] },
  { id: 'ken-ryuguji', detect: ['draken'] },
  { id: 'laocorn' },
];
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
    const got = unreleasedResidueHits(c.residue, SELFTEST_ROWS);
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
// The "Pending work" workflow's step. It runs after the data run has completed
// (pushed, or held), so a red run never costs a refresh — it only makes the
// pending work impossible to ignore.
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
