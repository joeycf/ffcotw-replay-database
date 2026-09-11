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
import sharp from 'sharp';
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
  title: string;
  /** What the badge prints instead of the source name (engine v0.13.0). */
  event?: string;
  channelName?: string;
}[];
const EMPTY = replays.length === 0;

const characters = JSON.parse(readFileSync(join(ROOT, 'data/characters.json'), 'utf8')) as {
  id: string;
  accent: string;
}[];
check('roster is non-empty', characters.length > 0, `${characters.length} fighters`);

// ── character art framing ─────────────────────────────────────────────────
// Both surfaces that show a fighter crop the image with `object-cover`, and
// both cropped past the face before this was fixed. Neither failure is visible
// to any other gate: the files exist, the build succeeds, the pages render.
//
//  · THE GRID has no framing knob. The engine draws imgPortrait at
//    `aspect-[3/4] w-full object-cover` with no object-position
//    (app/pages/characters/index.vue), so the browser centre-crops and the art
//    has to arrive already shaped. SNK's roster tiles are 277×721 — covering a
//    0.75 box with a 0.384 source cut off every head.
//  · THE HERO reads GameConfig.heroFocus, whose default '70% 25%' is
//    documented for wide landscape splashes. On a tall render 25% is the hip.
//
// Both assert the SHIPPED ARTEFACTS rather than the source that made them, and
// both are corpus-independent on purpose: art is Stage 1, so they have to hold
// in empty-corpus mode, where every record-shaped check below skips.
console.log('\n▶ character art framing\n');
const portraitDir = join(OUT, 'img', 'char');
const portraits = existsSync(portraitDir)
  ? readdirSync(portraitDir).filter((f) => f.endsWith('.webp'))
  : [];
check(
  'portraits shipped for the whole roster',
  portraits.length === characters.length,
  `${portraits.length} files for ${characters.length} fighters`,
);

const offRatio: string[] = [];
for (const f of portraits) {
  const m = await sharp(join(portraitDir, f)).metadata();
  // One pixel of tolerance: 512/0.75 is 682.67, so the integer height is 682
  // and the exact shipped ratio is 0.7507.
  if (Math.abs(m.width! / m.height! - 0.75) > 0.75 / m.height!)
    offRatio.push(`${f} ${m.width}×${m.height}`);
}
check(
  'every portrait is a 3:4 crop (the grid centre-crops anything else)',
  offRatio.length === 0,
  offRatio.slice(0, 3).join(', '),
);

// ── the hero banner contract ──────────────────────────────────────────────
// The character hero is a hard-coded 1440×340 `object-cover` letterbox with no
// config for height or fit, so the ONLY way to show a whole fighter is to hand
// it a source that is already the shape of the box. Three things have to hold
// for that to work, and each fails silently:
//
//  · the RATIO. A splash that drifts off 4.2353:1 is cropped again, and the
//    body loses its feet or its head with no error anywhere.
//  · the ALPHA. A flattened banner paints an opaque box over the engine's
//    diagonal stripe backplate — the page still renders, it just looks wrong.
//  · the FIT AT THE NARROWEST BREAKPOINT. Desktop shows the whole canvas, so
//    desktop can never catch this: at 360×280 the hero shows only 874 of the
//    2880 columns, and a pose wider than that is clipped on phones only.
const HERO_RATIO = 1440 / 340;
const NARROW = { w: 360, h: 280 };
const splashDir = join(OUT, 'img', 'splash');
const splashes = existsSync(splashDir)
  ? readdirSync(splashDir).filter((f) => f.endsWith('.webp'))
  : [];
check(
  'splashes shipped for the whole roster',
  splashes.length === characters.length,
  `${splashes.length} files for ${characters.length} fighters`,
);

const offHero: string[] = [];
const opaque: string[] = [];
const clipped: string[] = [];
for (const f of splashes) {
  const img = sharp(join(splashDir, f));
  const m = await img.metadata();
  if (Math.abs(m.width! / m.height! - HERO_RATIO) > HERO_RATIO / m.height!)
    offHero.push(`${f} ${m.width}×${m.height}`);
  if (!m.hasAlpha) opaque.push(f);

  // The visible extent, at alpha > 8 so the soft drop shadow counts too — the
  // pipeline places the body by its NEAR-opaque box, and this deliberately
  // checks the wider thing the viewer actually sees.
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let x1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  // object-cover scales to cover, then heroFocus's '100%' aligns the window
  // flush against the source's right edge.
  const scale = Math.max(NARROW.w / m.width!, NARROW.h / m.height!);
  const windowLeft = Math.round(m.width! - NARROW.w / scale);
  if (x0 < windowLeft || x1 > m.width!)
    clipped.push(`${f} [${x0},${x1}] vs window [${windowLeft},${m.width}]`);
}
check(
  'every splash is the hero box ratio 4.2353:1 (or object-cover re-crops it)',
  offHero.length === 0,
  offHero.slice(0, 3).join(', '),
);
check(
  'every splash keeps its alpha (the engine backplate shows through)',
  opaque.length === 0,
  opaque.slice(0, 3).join(', '),
);
check(
  `every body fits the narrowest hero window (${NARROW.w}×${NARROW.h})`,
  clipped.length === 0,
  clipped.slice(0, 3).join(', ') + ' — clipped on phones, invisible on desktop',
);

// heroFocus is asserted on the RENDERED page, not on app.config.ts: the config
// can be right while the value never reaches the style attribute.
const heroPage = characters.map((c) => `characters/${c.id}/index.html`).find((pth) => has(pth));
if (heroPage) {
  check(
    'the hero carries an explicit object-position (not the wide-splash default)',
    /object-position:\s*100%\s*50%/.test(read(heroPage)),
    'heroFocus is unset, or did not reach the rendered hero',
  );
} else {
  check('a character page prerendered to carry heroFocus', false, 'no character page in the build');
}

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

  // ── the badge names the EVENT, not the catalogue (engine v0.13.0) ─────────
  // This intake is one token over many uploaders, so its configured name can
  // only ever say "a catalogue filed this". Both arms now say more: the tagged
  // arm publishes the event, and the untagged arm — whole videos the catalogue
  // merely indexed — publishes the uploader, because calling those a
  // tournament would be false about every one of them.
  const theater = replays.filter((r) => r.source === 'replayTheater');
  const withEvent = theater.filter((r) => r.event);
  const withChannel = theater.filter((r) => r.channelName);
  check(
    'the tagged arm carries an event',
    withEvent.length === 126,
    `${withEvent.length} of ${theater.length} (expected 126)`,
  );
  check(
    'no channel-sourced record carries an event or a channelName',
    replays.every((r) => r.source === 'replayTheater' || (!r.event && !r.channelName)),
    'labels are emitted only by the index intake',
  );
  check(
    'no emitted label is empty or blank',
    replays.every((r) => (r.event ?? 'x').trim() !== '' && (r.channelName ?? 'x').trim() !== ''),
    'an empty label would render a bordered chip with no text',
  );
  // The tag rides in the synthesized title too — that is what makes an event
  // findable by search — so the two must agree or one of them is stale.
  const disagree = withEvent.filter((r) => !r.title.endsWith(`▰ ${r.event}`));
  check(
    "every event matches its title's trailing slot",
    disagree.length === 0,
    disagree.length ? disagree[0]!.id : `${withEvent.length} checked`,
  );
  // The card caps the chip and ellipsizes past it, so a runaway catalogue tag
  // should fail HERE rather than render as a two-word fragment.
  const longest = withEvent.reduce((n, r) => Math.max(n, r.event!.length), 0);
  check(
    'longest event label is within the card budget',
    longest <= 60,
    `${longest} chars (cap 60)`,
  );
  // The one committed record with neither label is the reason the configured
  // name had to stop saying "Replay Theater": it is the only thing that
  // renders on it.
  const bare = theater.filter((r) => !r.event && !r.channelName);
  check(
    'exactly one record falls back to the configured source name',
    bare.length === 1,
    `${bare.length} bare, ${withChannel.length} by uploader${bare.length ? ` (${bare[0]!.id})` : ''}`,
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
