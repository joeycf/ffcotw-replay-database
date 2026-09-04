/**
 * End-to-end checks against the BUILT static output.
 *
 * Everything here reads `.vercel/output/static/<slug>` — what Vercel actually
 * serves — rather than source files or a dev server. Source can be perfect
 * while the build ships the umbrella theme, an unprerendered route, or a
 * provenance leak; those are the failures this catches.
 *
 * ── EMPTY-CORPUS MODE, AND IT SKIPS VISIBLY ──────────────────────────────
 * A build with zero replays is a legitimate state — it is what Stage 1 of a new
 * game produces and what a fresh clone has before the first fetch. The
 * corpus-shaped checks then have nothing to assert on, so they are SKIPPED AND
 * COUNTED, never quietly passed. A suite that reports green on an empty corpus
 * is a suite that will report green on a broken one.
 *
 * Run: npm run test:e2e   (after `npm run build`)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'ffcotw';
const OUT = join(ROOT, '.vercel', 'output', 'static', SLUG);

let pass = 0;
let fail = 0;
let skipped = 0;
const failures: string[] = [];

const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};
const skip = (name: string, why: string): void => {
  skipped++;
  console.log(`  ⊘ ${name} — SKIPPED: ${why}`);
};

if (!existsSync(OUT)) {
  console.error(`✖ ${OUT} does not exist. Run \`npm run build\` first.`);
  process.exit(1);
}

const read = (p: string): string => readFileSync(join(OUT, p), 'utf8');
const has = (p: string): boolean => existsSync(join(OUT, p));

console.log('▶ build output\n');
check('index.html prerendered', has('index.html'));
check('stats page prerendered', has('stats/index.html'));
check('characters index prerendered', has('characters/index.html'));
check('players index prerendered', has('players/index.html'));
check('404.html emitted', has('404.html'));
check('sitemap.xml emitted', has('sitemap.xml'));
check('robots.txt emitted', has('robots.txt'));
check('manifest emitted', has('manifest.webmanifest'));
check('OG card shipped', has('og-default.png'));
check('replays.json shipped under the base', has('data/replays.json'));
check('summary.json shipped (the apex selector reads this)', has('data/summary.json'));

// ── the apex card payload's CONTRACT ──────────────────────────────────────
// Both of these shipped wrong once and neither showed on the page, because the
// selector only reads `replays` for its card count.
//
//  · the identity key is `game`, not `id`. Every sibling emits {"game": …} and
//    the shell's cutover battery asserts payload.game === the game's id. Ours
//    said `id`, so the battery read game=undefined against a page that looked
//    perfectly correct.
//  · `updated` is the NEWEST REPLAY's date, never the build time. The cron only
//    commits files that actually changed, so a build-time stamp makes this file
//    differ on every run and puts a deploy on the calendar daily whether or not
//    a single match arrived.
const summary = JSON.parse(read('data/summary.json')) as {
  game?: string;
  id?: string;
  replays?: number;
  updated?: string;
};
check(
  'summary.json identity key is `game` (the platform contract), not `id`',
  summary.game === 'ffcotw' && summary.id === undefined,
  JSON.stringify(summary),
);

// ── the theme override contract (STACK §5.13) ─────────────────────────────
// The failure this catches is the one the engine README calls out: an app
// stylesheet written as @theme ships raw, the browser drops it as an unknown
// at-rule, and PRODUCTION SILENTLY WEARS THE UMBRELLA DEFAULTS while `nuxt dev`
// looks perfect. So: assert this game's primary is in the built CSS, and assert
// the umbrella's is not.
console.log('\n▶ theme override (the @theme trap)\n');
const cssFiles = readdirSync(join(OUT, '_nuxt')).filter((f) => f.endsWith('.css'));
const css = cssFiles
  .map((f) => read(join('_nuxt', f)))
  .join('\n')
  .toLowerCase();
check('the built CSS carries CotW primary #ffd21f', css.includes('#ffd21f'));
check('the built CSS carries CotW page bg #0f0d0b', css.includes('#0f0d0b'));

// PRESENCE OF THE UMBRELLA DEFAULT IS NOT A FAILURE, and an earlier version of
// this check said it was. The engine ships its neutral palette as a FALLBACK
// (`@layer theme` in tailwind/theme-default.css) and the game's unlayered
// `:root` wins the cascade over it — that is the documented contract, not a
// leak, and the engine's own verify-override.mjs proves it by reading COMPUTED
// STYLES in a browser rather than by grepping for a hex string.
//
// What can be checked without a browser is the thing the cascade depends on:
// our declaration must come LAST. If the app CSS were emitted before the
// engine's layer, the override would lose and production would wear the
// umbrella skin while `nuxt dev` — which compiles each file on its own —
// looked perfect.
const oursAt = css.lastIndexOf('#ffd21f');
const umbrellaAt = css.lastIndexOf('#17cfc8');
check(
  'the CotW primary is declared AFTER the umbrella default (the override wins)',
  oursAt > umbrellaAt,
  umbrellaAt === -1
    ? 'the umbrella default is absent, which is unexpected but not fatal'
    : `ours at ${oursAt}, umbrella at ${umbrellaAt} — the engine layer would win`,
);
check(
  'no raw @theme block shipped',
  !css.includes('@theme'),
  'an @theme at-rule reached the bundle',
);

// ── the public data contract ──────────────────────────────────────────────
console.log('\n▶ data contract\n');
const replays = JSON.parse(read('data/replays.json')) as {
  id: string;
  sides: { player: string; characters: string[] }[];
  date: string;
  patch?: string;
  source: string;
}[];
const EMPTY = replays.length === 0;

const characters = JSON.parse(readFileSync(join(ROOT, 'data/characters.json'), 'utf8')) as {
  id: string;
  accent: string;
}[];
check('roster is non-empty', characters.length > 0, `${characters.length} fighters`);

if (EMPTY) {
  skip('every record-shaped assertion', 'empty corpus — 0 replays in the build');
} else {
  const raw = read('data/replays.json');
  check(
    'no pipeline provenance in the public payload',
    !/"(provenance|fromTitle|fromIndex|slotOrder|intake|handle)"/.test(raw),
  );
  check(
    'every side has at least one character',
    replays.every((r) => r.sides.every((s) => s.characters.length >= 1)),
  );
  const charIds = new Set(characters.map((c) => c.id));
  const unknown = replays
    .flatMap((r) => r.sides.flatMap((s) => s.characters))
    .filter((c) => !charIds.has(c));
  check(
    'every character id resolves against the roster',
    unknown.length === 0,
    unknown.slice(0, 3).join(', '),
  );
  check(
    'every record carries a patch token',
    replays.every((r) => !!r.patch),
  );
  const ids = new Set(replays.map((r) => r.id));
  check('record ids are unique', ids.size === replays.length);

  // The index intake's two record shapes, which is the finding this game
  // exists to record: a SEGMENT carries videoId+startSeconds, a whole-video
  // record carries neither and its id IS the YouTube id.
  const segments = replays.filter((r) => 'startSeconds' in r);
  check(
    'segment records carry both videoId and startSeconds',
    segments.every((r) => 'videoId' in r),
    'a startSeconds with no videoId would build a URL against the record id',
  );
  const composite = replays.filter((r) => r.id.includes('@'));
  check(
    'every composite id is a segment and vice versa',
    composite.length === segments.length,
    `${composite.length} composite ids vs ${segments.length} segments`,
  );

  // sourceGroups membership: every emitted source must belong to a group, or
  // its records are unreachable from the filter bar.
  const groups: Record<string, string[]> = {
    online: [
      'fatalFuryReplays',
      'wolfFgc',
      'svcHighlights',
      'ffCotwReplays',
      'bestOfSnk',
      'cotwReplays',
      'nomiiAegis',
      'bestOfFgc',
      'dildilFatalFury',
    ],
    tournament: ['evoEvents', 'replayTheater'],
  };
  const grouped = new Set(Object.values(groups).flat());
  const ungrouped = [...new Set(replays.map((r) => r.source))].filter((s) => !grouped.has(s));
  check(
    'every emitted source belongs to a sourceGroup',
    ungrouped.length === 0,
    ungrouped.join(', ') + ' — those records cannot be reached from the filter bar',
  );

  // A prerendered entity page must contain REAL content, not an empty shell —
  // that is the whole reason the registries are provided rather than fetched.
  const sample = characters[0]!.id;
  if (has(`characters/${sample}/index.html`)) {
    const html = read(`characters/${sample}/index.html`);
    check(
      `/characters/${sample} prerenders with a data-derived <title>`,
      /<title>[^<]*\w[^<]*<\/title>/.test(html),
    );
    check(
      `/characters/${sample} carries its accent`,
      html.toLowerCase().includes(characters[0]!.accent.toLowerCase()),
    );
  } else {
    check(`/characters/${sample} prerendered`, false, 'missing from the build');
  }

  const players = JSON.parse(readFileSync(join(ROOT, 'data/players.json'), 'utf8')) as {
    id: string;
  }[];
  const p = players[0]?.id;
  check(
    'player pages prerendered (they must not 404 on static hosting)',
    !!p && has(`players/${p}/index.html`),
  );

  check(
    'summary.json replay count matches the emitted archive',
    summary.replays === replays.length,
    `summary says ${summary.replays}, archive holds ${replays.length}`,
  );
  const newestDay = replays.reduce((n, r) => (r.date > n ? r.date : n), '').slice(0, 10);
  check(
    'summary.json `updated` is the newest replay date, not the build date',
    summary.updated === newestDay,
    `summary says ${summary.updated}, newest replay is ${newestDay}`,
  );
}

// ── ComboForge cross-link (engine v0.11.0/v0.12.0) ────────────────────────
console.log('\n▶ partner cross-link\n');
if (!EMPTY && characters.length) {
  const sample = characters.find((c) => c.id === 'terry-bogard') ?? characters[0]!;
  if (has(`characters/${sample.id}/index.html`)) {
    const html = read(`characters/${sample.id}/index.html`);
    check('character page links to ComboForge', html.includes('comboforge.gg'));
    check(
      'the deep link uses THEIR id, not a bare game+our-id guess',
      html.includes(`comboforge.gg`) && html.includes(`ffcotw-`),
    );
  }
  const index = read('index.html');
  check(
    'the Combos nav item is a real <a href> (crawlable, copyable)',
    /href="[^"]*comboforge\.gg[^"]*"/.test(index),
  );
} else {
  skip('ComboForge band assertions', 'empty corpus');
}

console.log(
  `\n${fail === 0 ? '✓' : '✖'} ${pass} passed · ${fail} failed · ${skipped} skipped` +
    (EMPTY ? '  (EMPTY-CORPUS MODE)' : ''),
);
if (failures.length) {
  console.error('\nFailures:\n');
  for (const f of failures) console.error(`  ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
