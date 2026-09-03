/**
 * Diff the vendor's own patch announcements against scripts/patches.ts.
 *
 * ── THE SOURCE IS SNK'S OWN CMS, NOT STEAM ────────────────────────────────
 * The sibling Tōkon checker polls the Steam news feed because that vendor
 * publishes nowhere else. SNK does: their game site's news list is served by
 *
 *     https://snk-corp.co.jp/fetch_news_en.php?type=news_os
 *
 * with a `PATCH` tag on every patch post. Measured 2026-09-03, that feed
 * carries all 25 patch posts and was current to Ver.3.1.3 the same day, while
 * Steam's feed carries FOUR update-titled posts and stops at Ver 1.1.7
 * (2025-06-03). A checker pointed at Steam prints a tick forever while the
 * table rots — the same failure the Tōkon checker had when its title pattern
 * went blind, arriving by a different door.
 * (Reported upstream as a checklist gap: step 4 should say VERIFY THE VENDOR
 * FEED IS COMPLETE before adopting it, because an incomplete feed makes a
 * checker green by construction.)
 *
 * ── THE DATE COMES FROM THE PATCH PAGE, NOT THE FEED ──────────────────────
 * Each versioned post links a canonical page that states "Patch Note Release
 * Date: <Month D, YYYY>". The feed's own `publishedate` is wrong on at least
 * one row — Ver.2.2.0 carries 2026-05-25, copied from Ver.2.1.2, when its page
 * says June 22, 2026 — and taking the feed at face value would have filed 950
 * measured records under the wrong patch. So this checker fetches the page for
 * every version it is going to report on, and a page/feed disagreement is a
 * HARD FAILURE rather than a preference.
 *
 * ── AN UNREADABLE PATCH TITLE IS A HARD FAILURE ───────────────────────────
 * Inherited verbatim from the Tōkon checker, which learned it the hard way: a
 * post tagged PATCH whose version will not parse is indistinguishable from a
 * patch that did not happen, and only one of those is safe to assume. Skipping
 * it quietly is precisely how two patches stayed missing while that command
 * printed a tick. The one known version-LESS post (2025-03-26, the OBT2 note)
 * is allow-listed BY DATE, not by pattern, so a second one still fails.
 *
 * NETWORK, MANUAL, NEVER IN THE CRON. A daily job reaching out to the vendor
 * would fail on their outage rather than ours, and a patch table is a human
 * decision anyway — this names the row, a person adds it. The cadence alarm
 * that makes it discoverable lives in scripts/expiries.ts.
 *
 * Run: npm run data:patch-check
 */

import { PATCHES } from './patches';

const FEED = 'https://snk-corp.co.jp/fetch_news_en.php?type=news_os';
const PAGE = (v: string) => `https://www.snk-corp.co.jp/us/games/fatalfury-cotw/patchnotes/v${v}/`;
const UA = 'ffcotw-replay-database/patch-check';

/** Posts tagged PATCH that carry no version, and why each is allowed. Keyed by
 *  the feed's own date so a NEW unreadable post still fails. */
const VERSIONLESS_OK: Record<string, string> = {
  '2025-03-26': 'Open Beta Test 2 patch note — the vendor published no version for the betas',
};

const VER = /Ver(?:sion)?\.?\s*(\d+\.\d+\.\d+)/i;
const strip = (s: string | undefined): string =>
  (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface Item {
  title?: string;
  publishedate?: string;
  tags?: string[];
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** The date the vendor's own patch page states, or null if the page has none. */
async function pageDate(version: string): Promise<string | null> {
  const res = await fetch(PAGE(version), { headers: { 'user-agent': UA } });
  if (!res.ok) return null;
  const text = strip(await res.text());
  const m = /Patch Note Release Date:\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
}

const res = await fetch(FEED, { headers: { 'user-agent': UA, accept: 'application/json' } });
if (!res.ok) {
  console.error(`✖ SNK news feed returned HTTP ${res.status}`);
  process.exit(1);
}
const body = (await res.json()) as { contents?: Item[]; totalCount?: number };
const items = body.contents ?? [];
if (!items.length) {
  console.error('✖ feed returned no items — the endpoint or the type= parameter has moved');
  process.exit(1);
}

const tagged = items.filter((it) => (it.tags ?? []).includes('PATCH'));
if (!tagged.length) {
  console.error(
    `✖ ${items.length} posts, none tagged PATCH. The tag vocabulary has changed; ` +
      `every number below would be meaningless, so nothing is reported.`,
  );
  process.exit(1);
}

const announced = new Map<string, string>(); // version → feed date
const unreadable: { title: string; date: string }[] = [];
for (const it of tagged) {
  const title = strip(it.title);
  const day = (it.publishedate ?? '').slice(0, 10);
  const m = VER.exec(title);
  if (m) {
    announced.set(m[1]!, day);
    continue;
  }
  if (VERSIONLESS_OK[day]) continue;
  unreadable.push({ title, date: day });
}

if (unreadable.length) {
  console.error(`✖ ${unreadable.length} PATCH-tagged post(s) whose version will not parse:\n`);
  for (const u of unreadable) console.error(`    ${u.date}  ${JSON.stringify(u.title)}`);
  console.error(
    '\n  Refusing to report on the rest of the feed. A patch post this script cannot read is\n' +
      '  indistinguishable from a patch that never shipped, and skipping it quietly is how a\n' +
      '  checker ends up confirming exactly the staleness it exists to catch. Teach the version\n' +
      '  pattern the new spelling first, or allow-list the date in VERSIONLESS_OK with a reason.',
  );
  process.exit(1);
}

const known = new Map(PATCHES.map((p) => [p.version, p.start]));
const missing = [...announced.keys()].filter((v) => !known.has(v)).sort();
const extra = [...known.keys()]
  .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && !announced.has(v))
  .sort();

console.log(
  `SNK news: ${items.length} posts, ${tagged.length} tagged PATCH, ${announced.size} versioned`,
);
console.log(
  `Table:    ${PATCHES.length} rows, newest ${PATCHES.at(-1)?.version} (${PATCHES.at(-1)?.start})\n`,
);

// Cross-check the DATE of every version we already carry against its own page.
let dateErrors = 0;
for (const [version, feedDate] of announced) {
  const ours = known.get(version);
  if (!ours) continue;
  const page = await pageDate(version);
  if (page && page !== ours) {
    dateErrors++;
    console.error(
      `✖ ${version}: the table says ${ours}, the vendor's patch page says ${page}` +
        `${feedDate !== page ? ` (the feed says ${feedDate} — the feed has been wrong before)` : ''}`,
    );
  }
}

if (missing.length) {
  console.log(`⚠ ${missing.length} announced patch(es) NOT in scripts/patches.ts:\n`);
  for (const v of missing) {
    const page = await pageDate(v);
    console.log(`  {`);
    console.log(`    version: '${v}',`);
    console.log(
      `    start: '${page ?? announced.get(v)}',${page ? '' : '   // feed date — no vendor page; VERIFY'}`,
    );
    console.log(`    url: '${PAGE(v)}',`);
    console.log(`    announcedOn: 'snk-news',`);
    console.log(`  },\n`);
  }
  console.log('  Add them in date order, then re-run `npm run data:emit`.');
  console.log('  Every replay published since a missing patch is currently filed under the');
  console.log('  previous token — it renders and filters cleanly, and is wrong.\n');
}

if (extra.length) {
  console.log(`ⓘ ${extra.length} versioned table row(s) with no matching PATCH post:`);
  for (const v of extra) console.log(`    ${v}  ${known.get(v)}`);
  console.log('    Fine if the feed has aged them out; suspicious otherwise.\n');
}

if (!missing.length && !dateErrors)
  console.log(
    '✓ the patch table matches every PATCH-tagged post, and every date matches its own page',
  );
process.exit(missing.length || dateErrors ? 1 : 0);
