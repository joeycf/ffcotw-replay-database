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
  enumeratedTile: string;
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

/** The figure's near-opaque bounding box, in source pixels.
 *
 *  Scanned at `alpha > 200` rather than a lower threshold on purpose: these
 *  renders carry a soft drop shadow whose alpha runs well below that, and a
 *  threshold that admits the shadow inflates the box and shrinks every figure. */
async function opaqueBox(
  buf: Buffer,
  w: number,
  h: number,
): Promise<{ left: number; top: number; width: number; height: number; headX: number }> {
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

  // Horizontal centre of mass of the figure's TOP QUARTER — the head estimate
  // the portrait falls back on when BUST_HEAD carries no row for this fighter.
  let sum = 0;
  let n = 0;
  const quarter = y0 + Math.round((y1 - y0) * 0.25);
  for (let y = y0; y <= quarter; y++) {
    for (let x = x0; x <= x1; x++) {
      if (data[(y * info.width + x) * info.channels + 3]! > 200) {
        sum += x;
        n++;
      }
    }
  }
  const k = w / info.width;
  const left = Math.max(0, Math.floor(x0 * k));
  const top = Math.max(0, Math.floor(y0 * k));
  return {
    left,
    top,
    width: Math.min(w - left, Math.ceil((x1 - x0 + 1) * k)),
    height: Math.min(h - top, Math.ceil((y1 - y0 + 1) * k)),
    headX: (n ? sum / n : (x0 + x1) / 2) * k,
  };
}

/** The bust window's height, as a fraction of the figure's own height, and how
 *  far down that window the head is placed. 0.52 reaches roughly hip level on a
 *  standing fighter; the 0.10 of headroom keeps the crown off the top edge. */
const BUST_HEIGHT = 0.52;
const BUST_HEAD_TOP = 0.1;

/** Where the HEAD sits inside the figure's bounding box, as fractions of that
 *  box. Absent = the estimate below, which assumes the head is at the top of the
 *  figure (y 0.05) and horizontally at the centre of mass of its top quarter.
 *
 *  That estimate is right for 26 of 30 and structurally wrong for the rest,
 *  because "the top of the figure" is only the head when the fighter is upright:
 *
 *    terry-bogard   the estimate is dragged left by his raised arm; his head is
 *                   fine vertically, just right of where the centroid lands.
 *    kim-dong-hwan  horizontal mid-kick — his raised leg shares the top quarter
 *                   with his head and pulls the centroid right.
 *    kim-jae-hoon   inverted mid-air kick; his head is a THIRD of the way down
 *                   the box, with a shoe at the top.
 *    tizoc          his feathered headdress fills the whole upper box and his
 *                   mask is past halfway down.
 *
 *  Read off a bbox-normalised grid, per character. This is the table option D
 *  costs and option E would not have; a DLC fighter in a novel pose needs a row
 *  here, and `npm run data:art` prints which characters are using the estimate
 *  so a new one is visible rather than silently mis-framed. */
const BUST_HEAD: Record<string, { x: number; y: number }> = {
  'terry-bogard': { x: 0.59, y: 0.05 },
  'kim-dong-hwan': { x: 0.35, y: 0.08 },
  'kim-jae-hoon': { x: 0.67, y: 0.34 },
  tizoc: { x: 0.9, y: 0.45 },
};

/** The engine's own missing-art ground, rebuilt in sharp:
 *  `linear-gradient(150deg, accent, color-mix(in srgb, accent 20%, transparent))`
 *  over the card surface (app/utils/format.ts accentGradient). Using it here
 *  means a fighter whose art fails to load degrades to the SAME tile, in the
 *  same colour, rather than to something that looks like a different design. */
const accentGround = (accent: string, w: number, h: number): Buffer =>
  Buffer.from(
    `<svg width="${w}" height="${h}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0.5" y2="0.866">` +
      `<stop offset="0" stop-color="${accent}" stop-opacity="1"/>` +
      `<stop offset="1" stop-color="${accent}" stop-opacity="0.2"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="#171513"/>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );

/**
 * THE PORTRAIT IS A BUST CROP OF THE FULL RENDER, ON THE FIGHTER'S ACCENT.
 *
 * ── WHY NOT SNK'S OWN ROSTER TILE, WHICH IS WHAT A PORTRAIT IS FOR ────────
 * `character_index_*` is 277×721 — ratio 0.384. The engine's grid is a hard
 * `aspect-[3/4] object-cover` box with no object-position and no config, so that
 * source can only ever contribute its top 51%, and at 277px wide a 512px output
 * is an UPSCALE. Three ways of spending the difference were built and shipped in
 * turn — a bare 3:4 crop (too tight), mirrored blur bands (read as a smear, and
 * left the artwork holding only 69% of the tile), and a horizontal stretch
 * (faces 25% wide) — and all three are compromises forced by that one number.
 *
 * `character_main_*` has none of the problem: 1077–3022px wide, and cut out on
 * transparency. It crops to 3:4 with room to spare, at native resolution, with
 * no stretch and no bands. SF6's pipeline reaches the same arrangement from the
 * other direction — Capcom publishes only the render, so both its portrait and
 * its splash derive from one image, exactly as they now do here.
 *
 * WHAT IT COSTS, stated plainly: SNK's per-character tile backgrounds go (the
 * vivid greens and oranges), replaced by the accent ground above; the grid and
 * the hero now show the same artwork; and the head has to be LOCATED, which is
 * the BUST_HEAD table and the one thing that cannot be derived. Option E — the
 * whole figure fitted to the tile — needs no table and no located head, and
 * remains the fallback if that table becomes a maintenance burden.
 */
async function savePortrait(
  id: string,
  accent: string,
  url: string,
  buf: Buffer,
  out: string,
): Promise<Written> {
  const meta = await sharp(buf).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const box = await opaqueBox(buf, w, h);

  const head = BUST_HEAD[id];
  const hx = head ? box.left + head.x * box.width : box.headX;
  const hy = head ? box.top + head.y * box.height : box.top + 0.05 * box.height;

  // Fit the window to the image before placing it, so a short render shrinks the
  // crop rather than silently sliding it off the figure.
  let winH = Math.min(box.height * BUST_HEIGHT, h, w / 0.75);
  let winW = winH * 0.75;
  if (winW > w) {
    winW = w;
    winH = winW / 0.75;
  }
  const left = Math.round(Math.min(Math.max(0, hx - winW / 2), w - winW));
  const top = Math.round(Math.min(Math.max(0, hy - winH * BUST_HEAD_TOP), h - winH));

  const OUT_W = 512;
  const OUT_H = Math.round(OUT_W / 0.75);
  const figure = await sharp(buf)
    .extract({ left, top, width: Math.round(winW), height: Math.round(winH) })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .png()
    .toBuffer();

  const webp = await sharp(accentGround(accent, OUT_W, OUT_H))
    .composite([{ input: figure }])
    .webp({ quality: 82 })
    .toBuffer();

  const out2 = await sharp(webp).metadata();
  return finish(out, webp, {
    source: url,
    sourceDimensions: `${w}×${h}`,
    dimensions: `${out2.width}×${out2.height}`,
    crop: `bust ${Math.round(winW)}×${Math.round(winH)} at ${left},${top} on ${accent}`,
    figure:
      `head ${head ? 'TABLE' : 'estimated'} at ${(((hx - box.left) / box.width) * 100).toFixed(0)}%,` +
      `${(((hy - box.top) / box.height) * 100).toFixed(0)}% of body ${box.width}×${box.height}`,
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
async function saveSplash(url: string, buf: Buffer, out: string): Promise<Written> {
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

    const splashUrl = new URL(mains[0]!, `${BASE}${slug}.php`).toString();

    // ONE fetch feeds both files. Since the portrait became a bust crop of the
    // render, portrait and splash derive from the same image — downloading it
    // twice would double the load on SNK's site for nothing.
    const render = Buffer.from(await (await get(splashUrl)).arrayBuffer());
    const portrait = await savePortrait(
      c.id,
      c.accent,
      splashUrl,
      render,
      join(ROOT, 'public/img/char', `${c.id}.webp`),
    );
    const splash = await saveSplash(
      splashUrl,
      render,
      join(ROOT, 'public/img/splash', `${c.id}.webp`),
    );
    provenance.push({
      id: c.id,
      page: pageUrl,
      // The index tile is no longer downloaded, but it is still what the index
      // page PAIRS with each link, so it stays on the record as the evidence
      // that this fighter's slug was enumerated rather than guessed.
      enumeratedTile: new URL(portraitRel, BASE).toString(),
      portrait,
      splash,
    });
    // Same lesson as before, now measured against the file we actually fetch:
    // SNK's splash filenames disagree with their own page slugs too.
    const constructed = `img/character_main_${slug}.png`;
    console.log(
      `  ${c.id.padEnd(20)} ${portrait.dimensions.padEnd(9)} ${(portrait.figure ?? '').padEnd(52)}` +
        (mains[0] !== constructed ? '  ← a constructed path would have missed this' : ''),
    );
  }

  // A BUST_HEAD key that matches no fighter does NOTHING — the estimate is used
  // instead and the tile is silently mis-framed, which is the failure this table
  // exists to prevent. Catch the typo, and catch a row left behind by a rename.
  const rosterIds = new Set(characters.map((c) => c.id));
  const orphanHeads = Object.keys(BUST_HEAD).filter((id) => !rosterIds.has(id));
  if (orphanHeads.length) {
    console.error(
      `\n✖ BUST_HEAD has ${orphanHeads.length} row(s) matching no fighter: ${orphanHeads.join(', ')}.\n` +
        `  A stale key is not inert — the fighter it was meant for falls back to the\n` +
        `  head ESTIMATE, which is exactly what the row was added to override.`,
    );
    process.exit(1);
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
