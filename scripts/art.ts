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
 * THE PORTRAIT IS CROPPED 3:4 AND ANCHORED AT THE TOP.
 *
 * The engine's roster grid renders `imgPortrait` at `aspect-[3/4] w-full
 * object-cover` with NO `object-position`, so the browser crops from the dead
 * centre and the framing is not configurable from app.config.ts — there is no
 * `heroFocus` equivalent for the grid. The art has to arrive already shaped.
 *
 * SNK's roster tiles are 277×721 (ratio 0.384) with the face in the top ~30%.
 * Covering a 0.75 box with a 0.384 source trims roughly 176 source-pixels off
 * the top at desktop tile size, which is the entire head — every tile showed a
 * torso, a hand or a chin. SF6 records the same lesson in its own pipeline:
 * "shipping the uncropped render would let the browser centre-crop and behead
 * the taller characters."
 *
 * Top 369 of 721 rows is head, shoulders and upper chest, and it also excludes
 * SNK's OPAQUE WHITE strip across the bottom 19% of every tile by construction
 * — that strip is not transparent, so on this dark skin any crop that reached
 * it would show a white band.
 *
 * The 277px source is the resolution ceiling: 512 wide is an upscale, chosen so
 * the output matches SF6's and Tōkon's 512×683 and the five grids read as one
 * set. There is no higher-resolution roster tile on SNK's site, and the
 * high-resolution `character_main_*` render is a full body — a 3:4 crop of it
 * puts the head at a fraction of the frame.
 */
async function savePortrait(url: string, out: string): Promise<Written> {
  const res = await get(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const targetH = Math.round(w / 0.75);
  const img = sharp(buf);
  let crop: string;
  if (targetH <= h) {
    img.extract({ left: 0, top: 0, width: w, height: targetH });
    crop = `top-anchored 3:4, ${w}×${targetH} of ${w}×${h}`;
  } else {
    // The source is WIDER than 3:4 — centre horizontally, still anchored top.
    // Does not occur on the current roster; kept so a future tile of another
    // shape degrades to a sane crop rather than throwing.
    const targetW = Math.round(h * 0.75);
    img.extract({ left: Math.round((w - targetW) / 2), top: 0, width: targetW, height: h });
    crop = `top-anchored 3:4 (wide source), ${targetW}×${h} of ${w}×${h}`;
  }
  const webp = await img.resize({ width: 512 }).webp({ quality: 82 }).toBuffer();
  const out2 = await sharp(webp).metadata();
  return finish(out, webp, {
    source: url,
    sourceDimensions: `${w}×${h}`,
    dimensions: `${out2.width}×${out2.height}`,
    crop,
  });
}

/**
 * WHERE THE HEAD SITS IN EACH `character_main_*` RENDER, as a fraction of the
 * source's height. The splash is cropped from the top by this much so that one
 * global `heroFocus` frames all thirty.
 *
 * ── WHY THIS TABLE EXISTS, AND WHY IT DEPARTS FROM TOKON ──────────────────
 * Tōkon's pipeline ships its splashes tall and uncropped, on the reasoning that
 * pre-cropping "crops twice and takes away the framing heroFocus exists to
 * control". That reasoning holds for a roster of uniform renders. It does not
 * survive contact with this one.
 *
 * `heroFocus` is a SINGLE value for the whole game — the engine reads
 * `game.heroFocus` and has no per-character override
 * (replay-engine/app/pages/characters/[id].vue). SNK's renders are
 * heterogeneous action poses, so measured against the source height the head
 * sits at 0% for Kain, 12% for Duck King, 15% for Kim Dong Hwan (horizontal,
 * mid-kick), 25% for Billy Kane and 42% for Tizoc, whose feathered headdress
 * occupies everything above his mask. Sweeping Y across the roster confirmed
 * the conflict is bidirectional and genuine: Terry needs a LOW Y or the hero
 * shows the back of his jacket, Hotaru needs a HIGH one or it shows her hair.
 * No single percentage frames both, and about four fighters were wrong at every
 * value tried.
 *
 * So the sources are NORMALISED here and the framing decision still lives in
 * config: `heroFocus` ships as `'70% 0%'` and still owns X — which holds the
 * subject clear of the name/stat scrim over the left quarter — and still owns
 * the Y baseline. What the crop removes is the variance underneath it, so that
 * one Y means the same thing for every fighter instead of meaning thirty
 * different things.
 *
 * Values are read off a percentage-ruled contact sheet of all 30 splashes and
 * then verified against the ACTUAL hero window (scripts/../ hero box is 4.24:1
 * at desktop, wider slices at narrower breakpoints). Anchoring at the top of
 * the head rather than centring on the face is deliberate: the window is wider
 * at every breakpoint below desktop, so it can only ever grow DOWNWARD from
 * here, and a fighter can gain chest but never lose their face.
 *
 * Absent = 0. Re-measure on a DLC drop; `npm run data:art` prints the table.
 */
const HERO_TOP: Record<string, number> = {
  'andy-bogard': 0.05,
  'billy-kane': 0.25,
  'duck-king': 0.12,
  gato: 0.08,
  hokutomaru: 0.1,
  'hotaru-futaba': 0.09,
  'kevin-rian': 0.05,
  'kim-dong-hwan': 0.1,
  'kim-jae-hoon': 0.2,
  'marco-rodrigues': 0.03,
  preecha: 0.05,
  'rock-howard': 0.06,
  'salvatore-ganacci': 0.03,
  tizoc: 0.42,
  'vox-reaper': 0.05,
};

/**
 * THE SPLASH IS SHIPPED TALL, CROPPED ONLY AT THE TOP.
 *
 * Height below the head is never trimmed: the hero box is 4.24:1 at desktop but
 * much squarer on a phone, so the visible slice grows downward and the image
 * has to keep something under the chin to grow into. Only the dead space (or
 * headdress) ABOVE the head goes.
 */
async function saveSplash(id: string, url: string, out: string): Promise<Written> {
  const res = await get(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const top = Math.round(h * (HERO_TOP[id] ?? 0));
  const img = sharp(buf);
  if (top > 0) img.extract({ left: 0, top, width: w, height: h - top });
  const webp = await img
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const out2 = await sharp(webp).metadata();
  return finish(out, webp, {
    source: url,
    sourceDimensions: `${w}×${h}`,
    dimensions: `${out2.width}×${out2.height}`,
    crop:
      top === 0
        ? 'none — the head is already at the top'
        : `top ${Math.round((HERO_TOP[id] ?? 0) * 100)}% removed (${w}×${h - top} of ${w}×${h})`,
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
    const splash = await saveSplash(
      c.id,
      splashUrl,
      join(ROOT, 'public/img/splash', `${c.id}.webp`),
    );
    provenance.push({ id: c.id, page: pageUrl, portrait, splash });
    const constructed = `img/character_index_${slug}.png`;
    const heroTop = HERO_TOP[c.id] ?? 0;
    console.log(
      `  ${c.id.padEnd(20)} ${portrait.dimensions.padEnd(9)} hero ${`${heroTop ? `-${Math.round(heroTop * 100)}%` : '·'}`.padEnd(5)} ${portraitRel.replace('img/', '').padEnd(30)}` +
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
