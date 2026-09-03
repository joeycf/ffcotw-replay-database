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

interface Provenance {
  id: string;
  page: string;
  portrait: { source: string; bytes: number; sha256: string };
  splash: { source: string; bytes: number; sha256: string };
}

async function save(
  url: string,
  out: string,
  width: number,
): Promise<{ bytes: number; sha256: string }> {
  const res = await get(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(buf)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  return {
    bytes: webp.length,
    sha256: createHash('sha256').update(webp).digest('hex').slice(0, 16),
  };
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
    const portrait = await save(portraitUrl, join(ROOT, 'public/img/char', `${c.id}.webp`), 512);
    const splash = await save(splashUrl, join(ROOT, 'public/img/splash', `${c.id}.webp`), 1200);
    provenance.push({
      id: c.id,
      page: pageUrl,
      portrait: { source: portraitUrl, ...portrait },
      splash: { source: splashUrl, ...splash },
    });
    const constructed = `img/character_index_${slug}.png`;
    console.log(
      `  ${c.id.padEnd(20)} ${portraitRel.replace('img/', '').padEnd(30)}` +
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
