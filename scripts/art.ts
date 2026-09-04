/**
 * Build the character art from SNK's own site — checklist "Art", first-party
 * manifest branch.
 *
 * ── THERE IS A FIRST-PARTY MANIFEST, SO THE WIKI PATTERN IS NOT USED ───────
 * https://www.snk-corp.co.jp/us/games/fatalfury-cotw/characters/ enumerates the
 * whole roster as <a href="<slug>.php"><img src="img/character_index_<x>.<ext>">
 * pairs, and each character page carries exactly one character_main_* splash.
 * Both are ENUMERATED from the markup; nothing is constructed from a slug.
 *
 * ── WHY "ENUMERATE, NEVER CONSTRUCT" IS NOT DEFENSIVE HERE ────────────────
 * SNK's own filenames disagree with their own page slugs in THREE different
 * ways, and each one breaks a different construction rule:
 *
 *   page jenet.php     → splash character_main_jenet.png
 *                        but portrait character_index_JANET.png   (typo)
 *   page mrkarate.php  → every image is character_*_KARATE.webp   (short form)
 *   page krauser.php   → splash character_main_krauser.webp
 *                        but the third image is character_otherimg_KURAUSER.webp
 *
 * On top of that 9 of 30 files are .webp where 21 are .png, with no pattern —
 * so even a correct slug guessed the wrong extension nine times. A constructed
 * `character_index_${slug}.png` 404s on at least eleven fighters and there is
 * no error: an <img> that fails to load renders as blank space.
 *
 * The index page also has a copy-paste bug in its own alt text (kain.php is
 * labelled atl="GATO"), which is why the LINK is the key and the alt text is
 * never read.
 *
 * ── FAIL LOUD ONCE ALL RESOLVE ────────────────────────────────────────────
 * Every roster id must end with a portrait and a splash. A missing one is a
 * throw, not a placeholder: a fighter silently wearing the generated fallback
 * tile looks deliberate. `npm run data:art-tile` produces those tiles for the
 * cases where SNK genuinely has no art (an unreleased fighter promoted early),
 * and using one is a decision someone makes, not a default.
 *
 * Run: npm run data:art   (manual, never in the cron — SNK's site is not a
 *                          daily dependency and the art changes on DLC days)
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/characters/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

/**
 * Our roster id → SNK's page slug.
 *
 * HAND-WRITTEN AND THAT IS CORRECT: it maps two independent naming schemes and
 * there is no rule connecting them (their `donghwan` to our `kim-dong-hwan`,
 * their `cr7` to our `cristiano-ronaldo`). What is NOT hand-written is anything
 * downstream of it — every URL comes from the markup. A missing entry throws.
 */
const PAGE_SLUG: Record<string, string> = {
  'rock-howard': 'rock',
  'terry-bogard': 'terry',
  'hotaru-futaba': 'hotaru',
  preecha: 'preecha',
  'vox-reaper': 'vox',
  'marco-rodrigues': 'marco',
  'kevin-rian': 'kevin',
  'b-jenet': 'jenet',
  gato: 'gato',
  tizoc: 'tizoc',
  hokutomaru: 'hokutomaru',
  'kain-r-heinlein': 'kain',
  'billy-kane': 'billy',
  'mai-shiranui': 'mai',
  'kim-dong-hwan': 'donghwan',
  'cristiano-ronaldo': 'cr7',
  'salvatore-ganacci': 'ganacci',
  'andy-bogard': 'andy',
  ken: 'ken',
  'chun-li': 'chun-li',
  'joe-higashi': 'joe',
  'mr-big': 'mrbig',
  'kim-jae-hoon': 'jaehoon',
  'nightmare-geese': 'geese',
  'blue-mary': 'bluemary',
  'wolfgang-krauser': 'krauser',
  'mr-karate': 'mrkarate',
  kenshiro: 'kenshiro',
  'rick-strowd': 'rick',
  'duck-king': 'duck',
  // Announced but unreleased — present so the day they are promoted this file
  // does not also need editing. SNK has no page for them yet, which this script
  // reports rather than crashing on.
  'kim-kaphwan': 'kaphwan',
  laocorn: 'laocorn',
};

const get = async (url: string): Promise<Response> => {
  const res = await fetch(url, { headers: { 'user-agent': UA, referer: BASE } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res;
};

interface Written {
  source: string;
  sourceDimensions: string;
  dimensions: string;
  crop: string;
  /** How the composition landed — subject box, scale and placement. Both
   *  helpers COMPOSE, so the crop string alone no longer describes the result. */
  figure?: string;
  bytes: number;
  sha256: string;
}

interface Provenance {
  id: string;
  page: string;
  portrait: Written;
  splash: Written;
}

const finish = async (out: string, webp: Buffer, extra: Omit<Written, 'bytes' | 'sha256'>) => {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  return {
    ...extra,
    bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex').slice(0, 16),
  };
};

/**
 * ── THE TWO SURFACES, AND WHY BOTH ARE COMPOSED HERE ──────────────────────
 * The engine draws character art in exactly two places and neither's framing is
 * configurable:
 *
 *   GRID  `aspect-[3/4] w-full object-cover`, NO object-position
 *         (app/pages/characters/index.vue) — a 211×282 tile at desktop.
 *   HERO  a fixed 1440×340 (4.2353:1) `object-cover` letterbox
 *         (app/pages/characters/[id].vue), framed only by GameConfig.heroFocus,
 *         which chooses WHICH SLICE of a tall render shows — never how much.
 *
 * So the art has to arrive already shaped, and for the hero that means arriving
 * already the shape of the box. Both helpers below COMPOSE rather than crop.
 * No sibling does this — all four just `.resize({width})` — which is why the
 * reasoning is written out rather than assumed.
 */

/** Extra tile beyond a bare 3:4, as a multiple — AND, because of the geometry
 *  in savePortrait below, the horizontal stretch factor. 3:4 of SNK's 277-wide
 *  roster tile is its top 369 rows, which on most of the roster is a face
 *  close-up; 1.25 takes 461 rows and reaches the chest at 25% horizontal
 *  stretch. Raising it buys chest and costs face shape at exactly the same
 *  rate. Hard ceiling 1.58, set by where the artwork itself ends. */
const GRID_ZOOM = 1.25;

/** The desktop hero box, 1440×340. The splash canvas is exactly 2× it, so the
 *  ratio matches to the digit and `object-cover` crops NOTHING at desktop —
 *  which is the whole mechanism that makes a full-body hero possible without an
 *  engine change. */
const HERO_W = 2880;
const HERO_H = 680;

/** The figure's share of the hero's height. Every fighter is scaled to the SAME
 *  body height, which the raw renders never were: their frame ratios span
 *  0.505–1.209, but frame is not figure — measured body ratios span 0.42
 *  (Kenshiro, narrow stance) to 1.35 (Kim Dong Hwan, horizontal mid-kick). */
const FIGURE_H = 0.92;

/** The body's RIGHT edge, as a fraction of canvas width — the figure is placed
 *  from the right, not centred on a point, and `heroFocus` ships as `'100% …'`
 *  so the window is flush right at every breakpoint. That makes the framing one
 *  invariant instead of two: the body keeps this same 3% margin whether or not
 *  the browser is cropping.
 *
 *  Centring on 70% (the obvious reading of the engine's "keep X ~70%" advice)
 *  is WRONG here and was tried first: the hero's scrim is opaque page background
 *  to 25% of the width and only reaches transparent AT 70%, so a body centred
 *  there has its whole left half inside the fade. */
const FIGURE_RIGHT = 0.97;

/** Hard cap on body width, in canvas px. The binding constraint is the NARROWEST
 *  viewport: at 360×280 the hero shows only 874 of the canvas's 2880 columns, so
 *  a body wider than `874 − 2880 × (1 − FIGURE_RIGHT)` = 788 cannot fit however
 *  it is placed. Nobody on the current roster is scaled by this — Kim Dong Hwan,
 *  the widest, lands at 788 exactly — but a future DLC pose with wider reach
 *  would be silently clipped on a phone without it. Height gives way, not width:
 *  a capped fighter is a little shorter than the rest, which reads as a wide
 *  pose rather than as a bug. */
const FIGURE_MAX_W = 788;

const FIGURE_BASELINE = 20;

/** The last row of the tile that is still substantially opaque ARTWORK — the
 *  floor any crop has to stay above.
 *
 *  Two different things end a tile and both had to be measured, because the
 *  obvious one is the rarer one:
 *
 *   · a TRANSPARENT VOID. This is the real constraint. Content stops at 81% of
 *     the tile for B. Jenet, Kevin, Hotaru, Tizoc, Billy, Gato, Ken and Duck
 *     King. Cropping into it flattens to the page background and puts a dark
 *     void across the bottom of the tile.
 *   · an OPAQUE NEAR-WHITE BAND. Only Kain has one, at row 682 of 721. An
 *     earlier version of this check looked ONLY for that band and, by testing
 *     RGB without testing alpha, read the transparent void as white on most of
 *     the roster — it reported floors of 592–721 that were the wrong quantity
 *     entirely.
 *
 *  Roster minimum today: 582 of 721 rows, which caps GRID_ZOOM at 1.58. */
function contentBottom(data: Buffer, w: number, h: number, c: number): number {
  const rowFrac = (y: number, test: (i: number) => boolean): number => {
    let hit = 0;
    let seen = 0;
    for (let x = 0; x < w; x += 2) {
      seen++;
      if (test((y * w + x) * c)) hit++;
    }
    return hit / seen;
  };
  const opaque = (i: number): boolean => data[i + 3]! > 200;
  const white = (i: number): boolean =>
    opaque(i) && data[i]! > 235 && data[i + 1]! > 235 && data[i + 2]! > 235;

  let y = h - 1;
  while (y > 0 && rowFrac(y, opaque) < 0.5) y--;
  while (y > 0 && rowFrac(y, white) > 0.5) y--;
  return y + 1;
}

/** The figure's near-opaque bounding box, in source pixels.
 *
 *  Scanned at `alpha > 200` rather than a lower threshold on purpose: these
 *  renders carry a soft drop shadow whose alpha runs well below that, and a
 *  threshold that admits the shadow inflates the box and shrinks every figure. */
async function opaqueBox(
  buf: Buffer,
  w: number,
  h: number,
): Promise<{ left: number; top: number; width: number; height: number }> {
  const SCAN = 400;
  const { data, info } = await sharp(buf)
    .resize({ width: Math.min(SCAN, w) })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3]! > 200) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('the render has no near-opaque pixel — is it a blank image?');
  const k = w / info.width;
  const left = Math.max(0, Math.floor(x0 * k));
  const top = Math.max(0, Math.floor(y0 * k));
  return {
    left,
    top,
    width: Math.min(w - left, Math.ceil((x1 - x0 + 1) * k)),
    height: Math.min(h - top, Math.ceil((y1 - y0 + 1) * k)),
  };
}

/**
 * THE PORTRAIT SHOWS MORE THAN 3:4 OF THE SOURCE, AND ABSORBS IT BY STRETCHING.
 *
 * SNK's roster tiles are 277×721 (ratio 0.384). A bare top-anchored 3:4 crop is
 * their top 369 rows, and on most of the roster that is a face close-up —
 * correctly framed, too tight. Showing more rows means the crop is no longer
 * 3:4, and the engine's tile is a hard `aspect-[3/4] object-cover` box with no
 * object-position and no config, so the extra has to go somewhere.
 *
 * There are only two places it can go: ADD WIDTH (bands down each side) or
 * ABSORB IT (stretch horizontally). Bands were built first — mirrored from the
 * subject's own edge, blurred, faded — and rejected on sight: at any width that
 * buys real content they read as a smear, and they cost the subject the tile.
 * At GRID_ZOOM 1.45 the banded artwork occupied only 69% of the tile's width,
 * so the fighter actually rendered SMALLER than they do stretched at 1.25.
 * Plain edge replication (no mirror) was also tried and is worse — every row
 * becomes a horizontal streak. An anamorphic split, centre 1:1 with the outer
 * fifths absorbing the stretch, visibly warps the edges.
 *
 * So the subject is stretched to the full tile width, and the arithmetic is
 * unusually clean: the crop is `(w / 0.75) × GRID_ZOOM` rows tall, so the
 * subject before stretching is exactly `OUT_W / GRID_ZOOM` wide, and
 * **the horizontal stretch factor IS GRID_ZOOM**. One dial sets both how much
 * extra tile you see and how wide the faces get. 1.25 keeps the distortion
 * where a face reads as a face without a side-by-side reference; the ceiling
 * imposed by the artwork itself (see contentBottom) is 1.58.
 *
 * Output stays 512×683 — the platform's portrait size, matching SF6 and Tōkon,
 * so all five grids read as one set. The 277px source is the resolution ceiling.
 */
async function savePortrait(url: string, out: string): Promise<Written> {
  const res = await get(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const floor = contentBottom(data, info.width, info.height, info.channels);

  const rows = Math.min(h, Math.round((w / 0.75) * GRID_ZOOM));
  if (rows > floor) {
    throw new Error(
      `${url}: a ${rows}-row crop runs past the artwork, which ends at row ${floor} of ${h}. ` +
        `Lower GRID_ZOOM (currently ${GRID_ZOOM}) rather than shipping a void across the tile.`,
    );
  }

  const OUT_W = 512;
  const OUT_H = Math.round(OUT_W / 0.75);

  // `fit: 'fill'` is the stretch, and it is deliberate — not a forgotten
  // `cover`. Flattened because the tiles carry 10–16% transparent pixels and a
  // hole in a roster tile reads as damage.
  const webp = await sharp(buf)
    .extract({ left: 0, top: 0, width: w, height: rows })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .flatten({ background: '#0f0d0b' })
    .webp({ quality: 82 })
    .toBuffer();

  const out2 = await sharp(webp).metadata();
  return finish(out, webp, {
    source: url,
    sourceDimensions: `${w}×${h}`,
    dimensions: `${out2.width}×${out2.height}`,
    crop: `top ${rows} of ${h} rows; artwork ends at row ${floor}`,
    figure: `stretched ${GRID_ZOOM}× horizontally to fill 3:4`,
  });
}

/**
 * THE SPLASH IS A PRE-COMPOSED FULL-BODY BANNER AT THE HERO'S OWN RATIO.
 *
 * This DEPARTS from Tōkon, which ships its splashes tall and uncropped because
 * "pre-cropping would crop twice and lose the framing the config exists to
 * control" (tokon/scripts/art.ts:30-40). That holds while you want a crop. It
 * does not hold when you want the whole fighter, because `heroFocus` cannot
 * express that: the hero is a 4.2353:1 box with `object-cover`, so a tall render
 * is cropped to a horizontal band no matter what object-position says — the
 * config only chooses which band.
 *
 * A source that is ALREADY 4.2353:1 is cropped by nothing at desktop. So the
 * canvas here is exactly 2× the hero box and the whole figure is composited into
 * it, standing at 70% across on transparency — the engine's diagonal stripe
 * backplate paints under the img and its accent radial over it, so both still
 * show through as designed.
 *
 * WHAT THIS DELETED: a 15-entry hand-measured HERO_TOP table that existed only
 * to normalise where each render's HEAD sat, so one global heroFocus Y could
 * frame all thirty. With the whole body visible there is no slice to choose and
 * no variance to normalise, so the table and its measurements are gone.
 *
 * ONE CONSEQUENCE WORTH KNOWING: heroFocus's X was previously INERT. Our
 * splashes were ≤1200px wide against a 1440px box, so `object-cover` scaled them
 * to full width and there was no horizontal overflow for object-position to
 * move. A 4.24:1 source overflows at every breakpoint below desktop, so X now
 * does real work and is tuned in app.config.ts for the NARROWEST one.
 */
async function saveSplash(url: string, out: string): Promise<Written> {
  const res = await get(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const box = await opaqueBox(buf, w, h);
  // Height sets the scale; the width cap only ever reduces it.
  const scale = Math.min((HERO_H * FIGURE_H) / box.height, FIGURE_MAX_W / box.width);
  const figW = Math.max(1, Math.round(box.width * scale));
  const figH = Math.max(1, Math.round(box.height * scale));
  const left = Math.max(0, Math.round(HERO_W * FIGURE_RIGHT) - figW);
  const top = HERO_H - FIGURE_BASELINE - figH;

  const figure = await sharp(buf).extract(box).resize(figW, figH, { fit: 'fill' }).png().toBuffer();

  const webp = await sharp({
    create: {
      width: HERO_W,
      height: HERO_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: figure, left, top }])
    .webp({ quality: 82, alphaQuality: 100 })
    .toBuffer();

  const out2 = await sharp(webp).metadata();
  return finish(out, webp, {
    source: url,
    sourceDimensions: `${w}×${h}`,
    dimensions: `${out2.width}×${out2.height}`,
    crop:
      `full body composed onto the hero's own ${HERO_W}×${HERO_H} ratio ` +
      `(2× the 1440×340 box, so object-cover crops nothing at desktop)`,
    figure:
      `body ${box.width}×${box.height} → ${figW}×${figH} at x${left}` +
      (figW >= FIGURE_MAX_W ? ' (width-capped)' : ''),
  });
}

async function main(): Promise<void> {
  const characters = JSON.parse(
    await readFile(join(ROOT, 'data', 'characters.json'), 'utf8'),
  ) as CharacterRecord[];

  // ── 1. the index page: LINK → PORTRAIT pairs, enumerated ────────────────
  const indexHtml = await (await get(BASE)).text();
  const portraitBySlug = new Map<string, string>();
  // Each roster tile is <a href="<slug>.php" …><img … src="img/character_index_<x>.<ext>">.
  // The pairing is what the markup states; the two halves are NOT assumed equal.
  const TILE =
    /<a\s+href="([a-z0-9-]+)\.php"[^>]*>\s*<img[^>]*src="(img\/character_index_[^"]+)"/gi;
  for (const m of indexHtml.matchAll(TILE)) portraitBySlug.set(m[1]!.toLowerCase(), m[2]!);
  console.log(`▶ index page: ${portraitBySlug.size} link→portrait pair(s) enumerated`);

  const provenance: Provenance[] = [];
  const missing: string[] = [];

  for (const c of characters) {
    const slug = PAGE_SLUG[c.id];
    if (!slug) {
      missing.push(`${c.id}: no PAGE_SLUG entry — add one (see this file's header)`);
      continue;
    }
    const portraitRel = portraitBySlug.get(slug);
    if (!portraitRel) {
      missing.push(`${c.id}: ${slug}.php has no tile on the index page`);
      continue;
    }

    // ── 2. the character page: its own splash, enumerated ─────────────────
    const pageUrl = `${BASE}${slug}.php`;
    const html = await (await get(pageUrl)).text();
    // Exactly one character_main_* per page. The "…ex" variants (chun-liex,
    // kenex) are alternate costumes and are deliberately not the splash.
    const mains = [...html.matchAll(/src="(img\/character_main_([a-z0-9-]+)\.(?:png|webp))"/gi)]
      .filter((m) => !/ex$/i.test(m[2]!))
      .map((m) => m[1]!);
    if (mains.length !== 1) {
      missing.push(`${c.id}: ${slug}.php has ${mains.length} character_main_* images, expected 1`);
      continue;
    }

    const portraitUrl = new URL(portraitRel, BASE).toString();
    const splashUrl = new URL(mains[0]!, `${BASE}${slug}.php`).toString();
    const portrait = await savePortrait(portraitUrl, join(ROOT, 'public/img/char', `${c.id}.webp`));
    const splash = await saveSplash(splashUrl, join(ROOT, 'public/img/splash', `${c.id}.webp`));
    provenance.push({ id: c.id, page: pageUrl, portrait, splash });
    const constructed = `img/character_index_${slug}.png`;
    console.log(
      `  ${c.id.padEnd(20)} ${portrait.dimensions.padEnd(9)} ${splash.dimensions.padEnd(9)} ` +
        `${(splash.figure ?? '').padEnd(46)} ${portraitRel.replace('img/', '').padEnd(30)}` +
        (portraitRel !== constructed ? '  ← a constructed path would have missed this' : ''),
    );
  }

  // ── 3. FAIL LOUD ─────────────────────────────────────────────────────────
  if (missing.length) {
    console.error(
      `\n✖ ${missing.length} fighter(s) have no art:\n${missing.map((m) => `    ${m}`).join('\n')}`,
    );
    console.error(
      `\n  Nothing partial was published for them. If SNK genuinely has no art yet,\n` +
        `  run \`npm run data:art-tile -- --id=<id>\` and record that decision — a fighter\n` +
        `  silently wearing a generated tile looks deliberate.`,
    );
    process.exit(1);
  }

  await writeFile(
    join(ROOT, 'data', 'art-provenance.json'),
    `${JSON.stringify({ source: BASE, fetched: new Date().toISOString().slice(0, 10), files: provenance }, null, 2)}\n`,
  );
  const bytes = provenance.reduce((n, p) => n + p.portrait.bytes + p.splash.bytes, 0);
  console.log(
    `\n✓ ${provenance.length} fighter(s) — ${provenance.length * 2} files, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB; provenance in data/art-provenance.json`,
  );
}

main();
