/**
 * Roster drift check — is data/characters.json still what SNK ships?
 *
 * WHY THIS EXISTS. A roster goes stale silently: a fighter who is not on it
 * fails no build and trips no assertion, they just leave every match they
 * appear in filed with one side missing. See ../check-rosters.sh.
 *
 * THE ENUMERATION IS THE PAGE LINKS, AND THE CONTROL IS STRUCTURAL, NOT NOMINAL.
 * Each fighter is one `<li><a href="duck.php">…<img …></a></li>`. The obvious
 * control — matching the thumbnail FILENAME against the slug — was tried and is
 * wrong: SNK's own assets disagree with their own slugs in two places
 * (`jenet.php` shows `character_index_janet.png`, an SNK typo, and
 * `mrkarate.php` shows `character_index_karate.webp`), and the newer fighters
 * are .webp while the older ones are .png. A filename check would have reported
 * permanent drift on a roster that is perfectly correct.
 *
 * So the control asserts SHAPE instead: every character entry must carry a
 * thumbnail. That catches the failure that matters — the markup changing under
 * us so the link regex silently matches fewer things — without inventing
 * findings out of the vendor's own inconsistent asset naming. Do not "improve"
 * this back into a filename comparison.
 *
 * (For the same reason, do not read the `atl=` alt text either: SNK ships
 * `kain.php` with alt "GATO".)
 *
 * SNK'S SLUGS ARE SHORT AND OURS ARE FULL-NAME KEBAB. `jenet` is `b-jenet`,
 * `donghwan` is `kim-dong-hwan`, `cr7` is `cristiano-ronaldo`. That translation
 * has to live somewhere, and SLUG_TO_ID below is it. See scripts/characters.ts
 * for why the ids are full-name kebab (it makes 26 of 32 ComboForge deep links
 * derive with no override, against 21 hand overrides for the short form).
 *
 * THE MAP IS SELF-POLICING, WHICH IS THE ONLY REASON A SECOND TABLE IS SAFE.
 * A hand-maintained lookup beside a roster is exactly the kind of thing that
 * rots quietly, so this script refuses to render a verdict when the map does not
 * cover the roster: an unmapped roster id is UNREADABLE, not a silent omission.
 * An unmapped UPSTREAM slug is the opposite — that is the finding, a new fighter.
 *
 * THE PAIR THIS FORMS WITH scripts/expiries.ts. This is CONTENT-AWARE and fires
 * on the real event; expiries.ts is CLOCK-ONLY and nothing upstream can blind
 * it. Keep both. Note this repo has a THIRD detector the others lack — the
 * parse residue gate, which sees a fighter's name in upload titles the day they
 * ship. Three independent ways to notice, all cheap.
 *
 * NETWORK, MANUAL, NEVER IN THE CRON.
 *
 * Run: npm run data:roster-check
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UNRELEASED } from './expiries';
import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'https://www.snk-corp.co.jp/us/games/fatalfury-cotw/characters/';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) ffcotw-replay-database roster checker (fan project; contact via GitHub joeycf/ffcotw-replay-database)';

/** SNK's page slug → our roster id. Everything not listed maps to itself. */
const SLUG_TO_ID: Record<string, string> = {
  rock: 'rock-howard',
  terry: 'terry-bogard',
  jenet: 'b-jenet',
  marco: 'marco-rodrigues',
  hotaru: 'hotaru-futaba',
  vox: 'vox-reaper',
  kevin: 'kevin-rian',
  billy: 'billy-kane',
  mai: 'mai-shiranui',
  donghwan: 'kim-dong-hwan',
  kain: 'kain-r-heinlein',
  cr7: 'cristiano-ronaldo',
  ganacci: 'salvatore-ganacci',
  andy: 'andy-bogard',
  joe: 'joe-higashi',
  mrbig: 'mr-big',
  jaehoon: 'kim-jae-hoon',
  geese: 'nightmare-geese',
  bluemary: 'blue-mary',
  krauser: 'wolfgang-krauser',
  mrkarate: 'mr-karate',
  rick: 'rick-strowd',
  duck: 'duck-king',
  // Identity: preecha, tizoc, gato, hokutomaru, ken, chun-li, kenshiro.
};

type State = 'CURRENT' | 'DRIFT' | 'UNVERIFIED' | 'UNREADABLE';
const verdict = (state: State, detail = ''): never => {
  if (detail) console.log(detail);
  console.log(`roster-check: ${state}`);
  process.exit(state === 'CURRENT' || state === 'UNVERIFIED' ? 0 : 1);
};

async function main(): Promise<void> {
  const local = JSON.parse(
    await readFile(join(ROOT, 'data/characters.json'), 'utf8'),
  ) as CharacterRecord[];
  const localIds = new Set(local.map((c) => c.id));
  const gated = new Set(UNRELEASED.map((u) => u.id));

  let html: string;
  try {
    const res = await fetch(INDEX, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`GET ${INDEX} → HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    return void verdict('UNVERIFIED', `! could not reach SNK's index — ${(e as Error).message}`);
  }

  const entries = [
    ...html.matchAll(/<li><a href="([a-z0-9_.-]+)\.php"[^>]*>([\s\S]*?)<\/a><\/li>/g),
  ];
  const linkSlugs = new Set(entries.map((m) => m[1]!));
  if (linkSlugs.size === 0)
    return void verdict(
      'UNREADABLE',
      '✖ the index yielded no character links — markup drift.\n' +
        '  Re-read the page before trusting any roster verdict.',
    );

  const thumbless = entries.filter((m) => !/<img[^>]+src="/.test(m[2]!)).map((m) => m[1]!);
  if (thumbless.length)
    return void verdict(
      'UNREADABLE',
      `✖ ${thumbless.length} character entry(s) carry no thumbnail: ${thumbless.join(', ')}\n` +
        '  The index is not the shape this parser expects, so its count cannot be trusted.',
    );

  // The map must cover the roster before any verdict is meaningful.
  const mapped = new Set(Object.values(SLUG_TO_ID));
  const unmappable = [...localIds].filter((id) => !mapped.has(id) && !linkSlugs.has(id)).sort();
  if (unmappable.length)
    return void verdict(
      'UNREADABLE',
      `✖ ${unmappable.length} roster id(s) have no SNK slug and are not slugs themselves:\n` +
        `    ${unmappable.join(', ')}\n` +
        '  Add them to SLUG_TO_ID in this file. Until then this check would quietly\n' +
        '  under-report, which is worse than not running it.',
    );

  const upstreamIds = new Set([...linkSlugs].map((s) => SLUG_TO_ID[s] ?? s));
  const missing = [...upstreamIds].filter((id) => !localIds.has(id) && !gated.has(id)).sort();
  const extra = [...localIds].filter((id) => !upstreamIds.has(id)).sort();
  const held = [...upstreamIds].filter((id) => gated.has(id)).sort();

  console.log(
    `  ${linkSlugs.size} fighter(s) on SNK's index (all carry thumbnails) · ${localIds.size} in characters.json`,
  );
  if (gated.size) console.log(`  ${gated.size} announced and gated: ${[...gated].join(', ')}`);
  if (held.length)
    console.log(`  ${held.length} now paged upstream while still gated: ${held.join(', ')}`);

  if (!missing.length && !extra.length)
    return void verdict('CURRENT', '✓ roster matches SNK’s character index');

  const lines = ['✖ roster has drifted from SNK’s character index', ''];
  for (const id of missing)
    lines.push(
      `  MISSING  ${id} — on SNK's index, with no roster row.`,
      `           If PLAYABLE: full runbook in scripts/expiries.ts. Remember the alias`,
      `           table is MINED, not guessed, and check the banned list first.`,
      `           If ANNOUNCED but not playable: add an UNRELEASED row instead.`,
      `           Either way add the slug to SLUG_TO_ID in this file.`,
    );
  for (const id of extra)
    lines.push(
      `  EXTRA    ${id} — on the roster, not on SNK's index.`,
      `           Confirm before deleting: records already reference this id.`,
    );
  verdict('DRIFT', lines.join('\n'));
}

await main();
