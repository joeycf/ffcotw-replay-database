/**
 * The balance-era and patch table — checklist step 4, done from the vendor's
 * own version grammar.
 *
 * ── THE GRAMMAR ────────────────────────────────────────────────────────────
 * SNK publishes `Ver.X.Y.Z`. Unlike Tōkon (whose vendor publishes no version
 * string at all, hence checklist amendment 4b) this game gets step 4 proper.
 *
 * ── THE SOURCE, AND WHY IT IS NOT STEAM ────────────────────────────────────
 * SNK's own news CMS: `snk-corp.co.jp/fetch_news_en.php?type=news_os`, rows
 * tagged `PATCH`. Measured 2026-09-03: that feed carries all 25 patch posts and
 * was current to Ver.3.1.3 the same day. The Steam news feed — the endpoint the
 * Tōkon checker polls — carries FOUR update-titled posts and stops at Ver 1.1.7
 * (2025-06-03). A checker pointed at Steam would print a tick forever while the
 * table rotted, which is the exact failure amendment 4b's "unparseable title is
 * a hard failure" rule exists to prevent, arriving by a different door.
 * (Reported upstream: step 4 should say VERIFY THE VENDOR FEED IS COMPLETE
 * before adopting it.)
 *
 * ── THE DATE AUTHORITY, AND WHY IT IS NOT THE CMS EITHER ───────────────────
 * Each patch has a canonical vendor page at
 *   https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v<version>/
 * which states "Patch Note Release Date: <Month D, YYYY>". THAT is the
 * authority, because the CMS list endpoint is wrong on at least one row:
 *
 *   Ver.2.2.0 — CMS `publishedate` 2026-05-25, identical to Ver.2.1.2's.
 *               Its own patch page says June 22, 2026, its CMS `publishedAt`
 *               says 2026-06-22, and its headline feature is Kenshiro, who
 *               released in late June. The CMS date is a copy-paste from the
 *               row above it.
 *
 * Taking the CMS date would have filed 950 measured records (747 channel
 * uploads + 203 catalogue entries published 2026-05-25 … 2026-06-22) under
 * 2.2.0 instead of 2.1.2. They would have rendered, filtered and passed every
 * count assertion. This is checklist 10d's "two thresholds for one decision
 * will eventually disagree", in its two-ORDERINGS form: date order and version
 * order disagreed, and only the vendor's own per-patch page resolves it.
 * `assertNoSharedStart` below makes a repeat a hard failure rather than a
 * coincidence someone has to notice.
 *
 * Rows 1.1.3 … 1.2.1 predate SNK's patchnotes/ URL scheme (their pages 404) and
 * carry no `url`. Their dates come from the CMS, which is the best source that
 * exists for them; `announcedOn` records that so the weaker provenance is
 * visible rather than assumed.
 *
 * ── THE FOLD RULE: NOTHING FOLDS ───────────────────────────────────────────
 * Tekken folds Bandai's `X.YY.ZZ` hotfixes into `X.YY`; SF6 folds nothing.
 * CotW folds nothing either, and the reason is the vendor's own cadence rather
 * than a preference: 1.1.3 / 1.1.4 / 1.1.5 / 1.1.6 / 1.1.7 are five separately
 * announced balance updates inside six weeks, each with its own patch note.
 * Folding on Z would erase five vendor-declared updates and answer "which
 * patch" with a window that never existed. SNK announces at Z granularity, so Z
 * is the granularity that is real.
 *
 * ── ERAS OPEN ON BALANCE OVERHAULS, NEVER ON MAJOR VERSION ─────────────────
 * The vendor's own patch notes declare the openers, in their own words:
 *   Ver.1.7.2 (2026-01-21) "Season 2 of City of the Wolves kicks off in style!
 *                           … a major balance update, and Ranked Match Phase 2!"
 *   Ver.3.0.0 (2026-07-17) "Season 3 and Ranked Match Phase 4 are here … along-
 *                           side myriad balance changes"
 * And the trap the checklist warns about is live here:
 *   Ver.2.0.1 (2026-04-23) "A major update for a major milestone: CotW's first
 *                           anniversary! … Krauser strides into SEASON 2"
 * A major-version bump that is explicitly NOT an era boundary. Inferring eras
 * from the major would have opened Season 3 four months early, on the
 * anniversary patch, and every per-era usage number would have been wrong with
 * nothing to show for it.
 *
 * Marketing dates are deliberately NOT used: SNK's press release says Season 3
 * runs "from July 23" and Steam posted "Season 3 starts today" on 2026-07-24,
 * but the balance changed when Ver.3.0.0 shipped on 2026-07-17. The era is a
 * BALANCE era; it opens when the balance moved.
 *
 * Run: npm run data:patches   (validator; also runs inside `npm run typecheck`)
 */

import type { PatchBoundary, PatchWindow, SeasonBoundary } from '../types/index';

/** OBT1 — the first public build anyone recorded. The catalogue's oldest CotW
 *  row is 2025-02-22, three days in. Records before this date are trailers and
 *  reveals, not matches, and the shape gate drops them anyway. */
export const PRE_RELEASE = '2025-02-20';
/** The retail build's first availability (Early Access). Season 1 opens HERE,
 *  not on the 24th: 80 measured uploads sit in the 21st–24th window and they
 *  are on the launch build, not a beta one. The era is a balance era. */
export const LAUNCH = '2025-04-21';

/**
 * Balance eras. Hardcoded, argued above, never inferred.
 *
 * `label` carries the marketing name where players actually use it — "Legends
 * Unleashed" and "Destined for Revenge" are what the community says, and the
 * facet parent should say it too. The pre-release era is labelled "Beta"
 * because "Season 0" names a balance era the vendor never shipped.
 */
export const SEASONS: SeasonBoundary[] = [
  {
    season: 0,
    start: PRE_RELEASE,
    end: LAUNCH,
    confirmed: true,
    label: 'Beta',
    note: 'Open beta tests 1 and 2. Admitted per channel via preReleaseFrom, never globally.',
  },
  {
    season: 1,
    start: LAUNCH,
    end: '2026-01-21',
    confirmed: true,
    label: 'Season 1',
  },
  {
    season: 2,
    start: '2026-01-21',
    end: '2026-07-17',
    confirmed: true,
    label: 'Season 2 · Legends Unleashed',
    note: 'Opened by Ver.1.7.2, whose notes say so in the vendor’s own words.',
  },
  {
    season: 3,
    start: '2026-07-17',
    end: null,
    confirmed: true,
    label: 'Season 3 · Destined for Revenge',
    note: 'Opened by Ver.3.0.0. Runs to December 2026 on the announced schedule.',
  },
];

/**
 * Every patch the vendor announced, oldest first.
 *
 * NEVER INVENT A VERSION TO FILL A SEQUENCE GAP. SNK announced no 1.1.0–1.1.2,
 * 1.3.0, 1.7.0, 1.7.1, 2.0.0, 2.1.0, 2.1.1, 3.1.0 or 3.1.1. Those numbers are
 * absent here on purpose; a reader noticing the gap is the intended outcome.
 *
 * The two version-LESS rows are the beta builds and the launch build, for which
 * the vendor published no number at all. Checklist 4b's rule applies exactly
 * where the grammar runs out: the token is the ISO publication date. Every such
 * row says so in `announcedOn`, so the mixed grammar is declared rather than
 * surprising.
 */
export const PATCHES: PatchBoundary[] = [
  // ── Beta ────────────────────────────────────────────────────────────────
  {
    version: '2025-02-20',
    start: '2025-02-20',
    announcedOn: 'obt',
    note: 'Open Beta Test 1',
  },
  {
    version: '2025-03-26',
    start: '2025-03-26',
    announcedOn: 'obt',
    note: 'Open Beta Test 2 — the vendor’s one version-less patch note',
  },
  // ── Season 1 ────────────────────────────────────────────────────────────
  { version: '2025-04-21', start: '2025-04-21', announcedOn: 'launch', note: 'Launch build' },
  { version: '1.1.3', start: '2025-04-25', announcedOn: 'snk-news' },
  { version: '1.1.4', start: '2025-04-30', announcedOn: 'snk-news' },
  { version: '1.1.5', start: '2025-05-01', announcedOn: 'snk-news' },
  { version: '1.1.6', start: '2025-05-03', announcedOn: 'snk-news' },
  { version: '1.1.7', start: '2025-06-03', announcedOn: 'snk-news' },
  {
    version: '1.2.0',
    start: '2025-06-23',
    announcedOn: 'snk-news',
    note: 'Andy Bogard',
  },
  { version: '1.2.1', start: '2025-07-14', announcedOn: 'snk-news' },
  {
    version: '1.3.1',
    start: '2025-08-04',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.3.1/',
    announcedOn: 'snk-news',
    note: 'Ken',
  },
  {
    version: '1.4.0',
    start: '2025-10-11',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.4.0/',
    announcedOn: 'snk-news',
    note: 'Joe Higashi · Ranked Phase 1',
  },
  {
    version: '1.5.0',
    start: '2025-11-04',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.5.0/',
    announcedOn: 'snk-news',
    note: 'Chun-Li',
  },
  {
    version: '1.6.0',
    start: '2025-12-08',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.6.0/',
    announcedOn: 'snk-news',
    note: 'Mr. Big',
  },
  // ── Season 2 · Legends Unleashed ────────────────────────────────────────
  {
    version: '1.7.2',
    start: '2026-01-21',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.7.2/',
    announcedOn: 'snk-news',
    note: 'Kim Jae Hoon · Season 2 opener',
  },
  {
    version: '1.7.3',
    start: '2026-02-02',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.7.3/',
    announcedOn: 'snk-news',
  },
  {
    version: '1.8.0',
    start: '2026-02-25',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.8.0/',
    announcedOn: 'snk-news',
    note: 'Nightmare Geese',
  },
  {
    version: '1.9.0',
    start: '2026-03-23',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v1.9.0/',
    announcedOn: 'snk-news',
    note: 'Blue Mary',
  },
  {
    version: '2.0.1',
    start: '2026-04-23',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v2.0.1/',
    announcedOn: 'snk-news',
    note: 'Wolfgang Krauser · 1st anniversary — a MAJOR bump inside Season 2',
  },
  {
    version: '2.0.2',
    start: '2026-05-11',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v2.0.2/',
    announcedOn: 'snk-news',
  },
  {
    version: '2.0.3',
    start: '2026-05-20',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v2.0.3/',
    announcedOn: 'snk-news',
  },
  {
    version: '2.1.2',
    start: '2026-05-25',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v2.1.2/',
    announcedOn: 'snk-news',
    note: 'Mr. Karate',
  },
  {
    version: '2.2.0',
    start: '2026-06-22',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v2.2.0/',
    announcedOn: 'snk-news',
    // The row the CMS mis-dated to 2026-05-25. Its own page says June 22, 2026.
    note: 'Kenshiro',
  },
  // ── Season 3 · Destined for Revenge ─────────────────────────────────────
  {
    version: '3.0.0',
    start: '2026-07-17',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v3.0.0/',
    announcedOn: 'snk-news',
    note: 'Rick Strowd · Season 3 opener · Ranked Phase 4',
  },
  {
    version: '3.0.1',
    start: '2026-08-03',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v3.0.1/',
    announcedOn: 'snk-news',
  },
  {
    version: '3.1.2',
    start: '2026-08-24',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v3.1.2/',
    announcedOn: 'snk-news',
    note: 'Duck King',
  },
  {
    version: '3.1.3',
    start: '2026-09-03',
    url: 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v3.1.3/',
    announcedOn: 'snk-news',
  },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The era a date falls in. Half-open [start, end). */
export function seasonForDate(day: string): number {
  for (const s of SEASONS) {
    if (day >= s.start && (s.end === null || day < s.end)) return s.season;
  }
  throw new Error(`No season covers ${day} — a record was admitted with no era to file under.`);
}

/** Every patch with its computed window and resolved era. Windows are DERIVED,
 *  never authored: a hand-written end date is a second source of truth that
 *  drifts the moment a patch is inserted. */
export function patchWindows(): PatchWindow[] {
  const sorted = [...PATCHES].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map((p, i) => {
    const season = seasonForDate(p.start);
    const era = SEASONS.find((s) => s.season === season)!;
    const next = sorted[i + 1];
    // The window closes at the next patch IN THE SAME ERA, else at the era's
    // own end, else stays open.
    const end = next && seasonForDate(next.start) === season ? next.start : (era.end ?? null);
    return { ...p, end, season };
  });
}

/** The patch token in force on `day`. */
export function patchForDate(day: string): string {
  const windows = patchWindows();
  for (let i = windows.length - 1; i >= 0; i--) {
    if (day >= windows[i]!.start) return windows[i]!.version;
  }
  throw new Error(`No patch covers ${day} — earlier than the first known build.`);
}

/** The era token as emitted on `Replay.patch` for a childless parent, and as
 *  the `patchGroups` parent id. Numeric seasons render as `S1`; the
 *  pre-release era renders as `Beta`, because "S0" names a balance era the
 *  vendor never shipped. */
export function seasonToken(season: number): string {
  return season === 0 ? 'Beta' : `S${season}`;
}

/**
 * The engine's `GameConfig.patchGroups` — eras as parents, patches as children,
 * both in timeline order.
 *
 * PIPELINE-EMITTED, never hand-written: the same table that derives every
 * replay's `patch` also builds the facet, so the UI hierarchy and the data
 * cannot disagree. Ids must be unique across all parents AND children, which
 * `validate()` covers via the duplicate-version check plus the era-token shape
 * (`S1` can never collide with a version or an ISO date).
 */
export function buildPatchGroups(): {
  id: string;
  label?: string;
  note?: string;
  children?: { id: string; label?: string; note?: string }[];
}[] {
  const windows = patchWindows();
  return SEASONS.map((s) => {
    const children = windows
      .filter((w) => w.season === s.season)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((w) => ({
        id: w.version,
        // A date token reads as a date; a version token reads as "Ver.X.Y.Z"
        // so the dropdown says what the vendor says.
        label: /^\d{4}-\d{2}-\d{2}$/.test(w.version) ? w.version : `Ver.${w.version}`,
        ...(w.note ? { note: w.note } : {}),
      }));
    return {
      id: seasonToken(s.season),
      ...(s.label ? { label: s.label } : {}),
      ...(s.note ? { note: s.note } : {}),
      ...(children.length ? { children } : {}),
    };
  });
}

// ── validators ──────────────────────────────────────────────────────────────
//
// Run by `npm run data:patches` AND by `npm run typecheck`, so a bad row cannot
// reach a build. Each one names the silent failure it prevents.

function fail(msgs: string[]): never {
  console.error(`✖ patches.ts is invalid:\n${msgs.map((m) => `    ${m}`).join('\n')}`);
  process.exit(1);
}

export function validate(today = new Date().toISOString().slice(0, 10)): string[] {
  const errs: string[] = [];

  // 1. Shapes. A malformed date silently sorts wrong and files records nowhere.
  for (const p of PATCHES) {
    if (!ISO.test(p.start)) errs.push(`${p.version}: start ${p.start} is not ISO yyyy-mm-dd`);
  }
  for (const s of SEASONS) {
    if (!ISO.test(s.start)) errs.push(`S${s.season}: start ${s.start} is not ISO`);
    if (s.end !== null && !ISO.test(s.end)) errs.push(`S${s.season}: end ${s.end} is not ISO`);
  }

  // 2. Unique versions. Duplicate tokens make one window unreachable.
  const seen = new Set<string>();
  for (const p of PATCHES) {
    if (seen.has(p.version)) errs.push(`duplicate version ${p.version}`);
    seen.add(p.version);
  }

  // 3. NO TWO PATCHES SHARE A START DATE. This is the 2.2.0 guard: SNK's CMS
  //    dated 2.2.0 and 2.1.2 to the same day, and taking that at face value
  //    would have mis-filed 950 measured records. Two patches on one day is
  //    not impossible in principle — it IS impossible to file records between
  //    them, so it has to be a human decision rather than a silent sort.
  const byStart = new Map<string, string[]>();
  for (const p of PATCHES) byStart.set(p.start, [...(byStart.get(p.start) ?? []), p.version]);
  for (const [day, vs] of byStart) {
    if (vs.length > 1) {
      errs.push(
        `${vs.join(' and ')} both start ${day} — read each patch page's own ` +
          `"Patch Note Release Date"; the CMS list endpoint has been wrong here before`,
      );
    }
  }

  // 4. Version order and date order must AGREE for numeric versions. The one
  //    real defect this table has ever had was these two disagreeing.
  const numeric = PATCHES.filter((p) => /^\d+\.\d+\.\d+$/.test(p.version));
  const byDate = [...numeric].sort((a, b) => a.start.localeCompare(b.start));
  const key = (v: string) => v.split('.').map(Number);
  const byVersion = [...numeric].sort((a, b) => {
    const [A, B] = [key(a.version), key(b.version)];
    return A[0]! - B[0]! || A[1]! - B[1]! || A[2]! - B[2]!;
  });
  for (let i = 0; i < byDate.length; i++) {
    if (byDate[i]!.version !== byVersion[i]!.version) {
      errs.push(
        `version order and date order disagree at position ${i}: ` +
          `by date ${byDate[i]!.version} (${byDate[i]!.start}), by version ${byVersion[i]!.version}`,
      );
      break;
    }
  }

  // 5. Floors and the future-date guard. A typo'd year mints an empty window
  //    that filters to nothing and asserts clean.
  for (const p of PATCHES) {
    if (p.start < PRE_RELEASE) errs.push(`${p.version}: starts ${p.start}, before OBT1`);
    if (p.start > today)
      errs.push(`${p.version}: starts ${p.start}, in the FUTURE (today ${today})`);
  }
  for (const s of SEASONS) {
    if (s.start > today) errs.push(`S${s.season}: starts ${s.start}, in the future`);
    if (s.end !== null && s.end <= s.start) errs.push(`S${s.season}: end ${s.end} <= start`);
  }

  // 6. Eras must tile the timeline with no gap and no overlap — a gap makes
  //    seasonForDate throw at parse time on a real record.
  const eras = [...SEASONS].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < eras.length; i++) {
    if (eras[i - 1]!.end !== eras[i]!.start) {
      errs.push(
        `era gap/overlap: S${eras[i - 1]!.season} ends ${eras[i - 1]!.end}, ` +
          `S${eras[i]!.season} starts ${eras[i]!.start}`,
      );
    }
  }
  if (eras.at(-1)!.end !== null) errs.push('the newest era must be open (end: null)');

  // 7. Every era must own at least one patch, and every era's FIRST patch must
  //    start on the era boundary — that is what "eras open on a balance
  //    overhaul" means operationally. An era whose first child starts later has
  //    a window at its head that files records under a patch from the era
  //    before it.
  // `seasonForDate` THROWS on a date no era covers, and check 5 has already
  // recorded that as an error — so this loop must not be the thing that
  // surfaces it. A validator whose own crash replaces its error list tells you
  // there is exactly one problem when there may be several, and the stack
  // trace buries the sentence a human needs.
  const eraOf = (day: string): number | null => {
    const hit = SEASONS.find((s) => day >= s.start && (s.end === null || day < s.end));
    return hit ? hit.season : null;
  };
  // And an orphan is its own error, stated plainly: a patch no era covers
  // would throw at parse time on the first real record that lands in it.
  for (const p of PATCHES) {
    if (eraOf(p.start) === null) errs.push(`${p.version}: starts ${p.start}, which no era covers`);
  }
  for (const s of SEASONS) {
    const own = PATCHES.filter((p) => eraOf(p.start) === s.season);
    if (own.length === 0) {
      errs.push(`S${s.season} (${s.label ?? s.season}) owns no patch`);
      continue;
    }
    const first = own.sort((a, b) => a.start.localeCompare(b.start))[0]!;
    if (first.start !== s.start) {
      errs.push(
        `S${s.season} starts ${s.start} but its first patch ${first.version} starts ${first.start}`,
      );
    }
  }

  // 8. Provenance. A row with no url and a source that should have one is a row
  //    nobody can check. Rows before SNK's patchnotes/ scheme are exempt by
  //    date, not by hand-waving.
  const SCHEME_FROM = '2025-08-04'; // first version whose vendor page exists
  for (const p of PATCHES) {
    if (p.announcedOn === 'snk-news' && p.start >= SCHEME_FROM && !p.url) {
      errs.push(
        `${p.version}: announcedOn snk-news and dated after ${SCHEME_FROM}, but has no url`,
      );
    }
  }

  return errs;
}

// `isMain` GUARD, not a bare argv check. This module is imported by
// expiries.ts, parse.ts and emit.ts; a bare `process.argv.includes('--check')`
// fires this block whenever ANY of them is run with --check, so
// `npm run data:expiries` printed the patch validator's banner above its own
// output. Harmless there, actively confusing in a cron log, and it would have
// let a patches.ts `process.exit(1)` kill an unrelated script.
const isMain = !!process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain && process.argv.includes('--check')) {
  const errs = validate();
  if (errs.length) fail(errs);
  const w = patchWindows();
  const perEra = SEASONS.map(
    (s) => `${s.label ?? `S${s.season}`}: ${w.filter((p) => p.season === s.season).length}`,
  ).join(' · ');
  console.log(
    `✓ patches.ts — ${SEASONS.length} eras, ${PATCHES.length} patches (${perEra}); ` +
      `newest ${w.at(-1)!.version} (${w.at(-1)!.start})`,
  );
}
