/**
 * Player-page redirects — data/player-redirects.json.
 *
 * A player id is a slug of the handle, so a handle that changes spelling mints a
 * NEW page and abandons the old URL. That URL is prerendered, in the sitemap,
 * and possibly linked. This file maps a retired id to its current one; the
 * engine's 404 page and the static-artifacts module read it.
 *
 * HAND-AUTHORED, DELIBERATELY. Merging two player ids is a claim that two
 * handles are the same PERSON, which no amount of string distance can establish
 * — "KULA" and "KULA2" may be one player or two, and guessing wrong merges two
 * people's records into one page. The pipeline reports candidates
 * (`npm run data:player-dupes` in the siblings); a human decides.
 *
 * `--check` runs inside `npm run typecheck`: every target must exist and no
 * chain may loop, because a redirect to a missing page is a 404 wearing a 301.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlayerRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'player-redirects.json');

const load = (): Record<string, string> =>
  existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>) : {};

if (!existsSync(FILE)) writeFileSync(FILE, '{}\n');

const redirects = load();
const players = existsSync(join(ROOT, 'data', 'players.json'))
  ? (JSON.parse(readFileSync(join(ROOT, 'data', 'players.json'), 'utf8')) as PlayerRecord[])
  : [];
const ids = new Set(players.map((p) => p.id));

const errs: string[] = [];
for (const [from, to] of Object.entries(redirects)) {
  if (ids.has(from)) errs.push(`${from} redirects away but is still a live player id`);
  if (!ids.has(to))
    errs.push(`${from} → ${to}, but ${to} is not a player id (a 404 wearing a 301)`);
  // Chains: a redirect whose target also redirects is a double hop the static
  // host will not follow.
  if (redirects[to]) errs.push(`${from} → ${to} → ${redirects[to]}: chained redirect`);
}

if (process.argv.includes('--check')) {
  if (errs.length) {
    console.error(`✖ player-redirects.json is invalid:\n${errs.map((e) => `    ${e}`).join('\n')}`);
    process.exit(1);
  }
  console.log(
    `✓ player-redirects.json — ${Object.keys(redirects).length} redirect(s), all resolve`,
  );
}
