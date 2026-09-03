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
 * roster; the four rows below are what is left.
 *
 * NOTE WHERE THIS WAS ALMOST GOT WRONG. The game site's own news CMS
 * (fetch_news_en.php) carries a "Character Reveal!" post for every fighter from
 * Andy Bogard onward and has NONE for Kaphwan or Laocorn — so checking only
 * that feed says these two do not exist. They are announced on SNK's corporate
 * PRESS path, which is a different feed. Two first-party sources, and the one
 * the pipeline already polls is the incomplete one.
 */
export const UNRELEASED: { id: string; releases: string; accent?: string; note?: string }[] = [
  {
    id: 'kim-kaphwan',
    releases: '2026-09-30',
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
  {
    id: 's3-october-mystery',
    releases: '2026-10-31',
    note:
      'Season 3, October slot. SNK announced that a fighter ships this month but has not named ' +
      'them, so there is no id and no accent yet. Split this row into a real one on reveal — ' +
      'the accent comes from a Claude Design session, never invented here.',
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

// ── standalone `--check` ─────────────────────────────────────────────────────
// The workflow's LAST step. It runs after the data has been committed and
// pushed, so a red run never costs a refresh — it only makes the pending work
// impossible to ignore.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
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
