/**
 * Player-page redirects — data/player-redirects.json, served from vercel.json.
 *
 * A player id is a slug of the handle, so a handle that changes spelling mints a
 * NEW page and abandons the old URL. That URL is prerendered, in the sitemap,
 * and possibly linked. This file maps a retired id to its current one, and
 * `npm run data:redirects` writes every row into vercel.json as a permanent
 * redirect — the same mechanism as Tekken and Tōkon, and the only redirect layer
 * on this platform.
 *
 * THIS HEADER USED TO SAY "the engine's 404 page and the static-artifacts module
 * read it". Neither does, and nothing else did: until 2026-09-28 this repo had
 * no vercel.json and no code anywhere served a row, so the first merge anyone
 * recorded here would have 404ed exactly as if it had never been written. The
 * ledger has always been empty, so nothing was lost, but the one comment that
 * said where a redirect goes pointed at a place that never read it.
 *
 * HAND-AUTHORED, DELIBERATELY. Merging two player ids is a claim that two
 * handles are the same PERSON, which no amount of string distance can establish
 * — "KULA" and "KULA2" may be one player or two, and guessing wrong merges two
 * people's records into one page. The pipeline reports candidates
 * (`npm run data:player-dupes` in the siblings); a human decides.
 *
 * THE CRON STILL REGENERATES vercel.json before its commit and then runs
 * `--drift`, which refuses the commit — holding the day's data — if a row cannot
 * ship. The ledger here does not drift; the corpus under it does. The cron
 * rewrites players.json nightly, so a destination can stop being a player, or a
 * retired source can come back as one, with nobody touching this file. A held
 * run must be a two-minute fix from the log alone, so every refusal names the
 * row and its fix.
 *
 * THE DESTINATION MUST BE RELATIVE. The shell rewrites /ffcotw/:path* to this
 * deployment (replay-database-shell/vercel.json), so an absolute Location would
 * send a visitor on replaydatabase.com to ffcotw-replay-database.vercel.app.
 *
 * Run: npm run data:redirects   write vercel.json from the ledger (the cron's
 *                               "Regenerate player redirects" step)
 *      --drift / --check        verify, never write: bad rows, lost rows,
 *                               vercel.json out of step with the ledger (the
 *                               cron's pre-commit "Refuse redirect drift" step,
 *                               and `npm run typecheck`)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlayerRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data', 'player-redirects.json');
const BASE = '/ffcotw';

interface Redirect {
  source: string;
  destination: string;
  permanent: boolean;
}

// --drift and --check verify the same things and never write. They stay two
// names so the cron's step reads the same in every repo; in Tekken --check also
// runs a retirement guard that this repo does not have.
const drift = process.argv.includes('--drift');
const check = drift || process.argv.includes('--check');

// A person can let a lost row go once, in the open — for the rare row a
// retarget cannot save — named the way this platform's other refusals are
// (`--allow-collapse`, `--allow-shrink`, Tekken's `--allow-retire`).
const allowIdx = process.argv.indexOf('--allow-retire');
const allowed = new Set(
  allowIdx === -1 ? [] : (process.argv[allowIdx + 1] ?? '').split(',').map((x) => x.trim()),
);

const load = (): Record<string, string> =>
  existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>) : {};

if (!existsSync(FILE)) writeFileSync(FILE, '{}\n');

const redirects = load();
const players = existsSync(join(ROOT, 'data', 'players.json'))
  ? (JSON.parse(readFileSync(join(ROOT, 'data', 'players.json'), 'utf8')) as PlayerRecord[])
  : [];
const ids = new Set(players.map((p) => p.id));

/**
 * YESTERDAY'S LEDGER, and the baseline is git because there is no other record
 * of it: the working tree when the file is uncommitted, HEAD~1 when it is not.
 * Both are absent in a shallow or non-git checkout, and the caller SAYS SO
 * rather than passing quietly.
 */
function baseline(path: string): { where: string; text: string } | null {
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const where = git('status', '--porcelain', '--', path).trim() !== '' ? 'HEAD' : 'HEAD~1';
    return { where, text: git('show', `${where}:${path}`) };
  } catch {
    return null;
  }
}

// Where a retired id's redirect should land: follow the ledger until it reaches
// a live player. null when the trail ends in an id that is neither live nor
// redirected, or loops.
function successor(id: string): string | null {
  const seen = new Set<string>();
  let at = id;
  while (!ids.has(at)) {
    if (seen.has(at) || redirects[at] === undefined) return null;
    seen.add(at);
    at = redirects[at];
  }
  return at;
}

/**
 * A ROW THAT CANNOT SHIP, named with its fix. Its SOURCE is still a live player
 * (the redirect would send a real profile away), or its DESTINATION is not one
 * (a 404 wearing a 301). A chain is the second case — the static host will not
 * follow a double hop — and its fix is the retarget the ledger already implies,
 * so the refusal works that out instead of leaving the reader to.
 */
function rowsThatCannotShip(): string[] {
  const out: string[] = [];
  for (const [from, to] of Object.entries(redirects)) {
    if (ids.has(from)) {
      out.push(
        `"${from}": "${to}"\n` +
          `      ${from} is a live player, so this redirect would send its profile away.\n` +
          `      fix: retire the row (delete it).`,
      );
    } else if (!ids.has(to)) {
      const next = successor(to);
      out.push(
        `"${from}": "${to}"\n` +
          `      ${to} is not a player, so this redirect would land on a 404.\n` +
          (next
            ? `      fix: retarget it to "${next}" (the ledger sends ${to} on to ${next}),\n`
            : `      fix: retarget it to the live id ${from} belongs to,\n`) +
          `           or retire it (delete the row; ${BASE}/players/${from} then answers 404).`,
      );
    }
  }
  return out;
}

// A row that left the ledger while its source is still retired and a live
// successor exists is a redirect someone dropped that a retarget would have
// kept. The ledger here only changes by hand, so this guards the hand; a drop
// whose source is live again, or whose trail ends in a player who left the
// corpus, is let through.
function lostRows(): string[] | null {
  const base = baseline('data/player-redirects.json');
  if (!base) return null;
  const was = JSON.parse(base.text) as Record<string, string>;
  const out: string[] = [];
  for (const [from, to] of Object.entries(was)) {
    if (redirects[from] !== undefined || ids.has(from) || allowed.has(from)) continue;
    const next = successor(to);
    if (next === null) continue;
    out.push(
      `"${from}": "${to}"  (in the ledger at ${base.where}, gone now)\n` +
        `      ${from} is still retired, so ${BASE}/players/${from} loses its redirect and answers 404.\n` +
        (next === to
          ? `      fix: put the row back.`
          : `      fix: put the row back retargeted: "${from}": "${next}".`),
    );
  }
  return out;
}

const playerRedirects: Redirect[] = Object.entries(redirects)
  .map(([from, to]) => ({
    source: `${BASE}/players/${from}`,
    destination: `${BASE}/players/${to}`,
    permanent: true,
  }))
  .sort((a, b) => a.source.localeCompare(b.source));

const cfgPath = join(ROOT, 'vercel.json');
const cfg = (
  existsSync(cfgPath)
    ? JSON.parse(readFileSync(cfgPath, 'utf8'))
    : { $schema: 'https://openapi.vercel.sh/vercel.json', redirects: [] }
) as { redirects?: Redirect[]; [k: string]: unknown };

// Everything that is NOT a generated player redirect is hand-authored and kept
// verbatim — the "/" → "/ffcotw" entry lives here too.
const manual = (cfg.redirects ?? []).filter((r) => !r.source.startsWith(`${BASE}/players/`));
const next = [...manual, ...playerRedirects];

const before = JSON.stringify(cfg.redirects ?? []);
const after = JSON.stringify(next);

// vercel.json against the ledger, rule by rule, so the refusal can say WHICH.
function outOfStep(): string[] {
  const want = new Map(playerRedirects.map((r) => [r.source, r.destination]));
  const have = new Map(
    (cfg.redirects ?? [])
      .filter((r) => r.source.startsWith(`${BASE}/players/`))
      .map((r) => [r.source, r.destination]),
  );
  const out: string[] = [];
  for (const [source, destination] of want) {
    const is = have.get(source);
    if (is === undefined) out.push(`vercel.json is missing  ${source} → ${destination}`);
    else if (is !== destination) out.push(`vercel.json sends  ${source} → ${is}, but the ledger says ${destination}`);
  }
  for (const [source, is] of have) {
    if (!want.has(source)) out.push(`vercel.json still has  ${source} → ${is}, which no ledger row asks for`);
  }
  if (!existsSync(cfgPath)) out.push('vercel.json does not exist');
  else if (out.length === 0 && before !== after) out.push('vercel.json has every player redirect, but not in the generated form');
  return out;
}

if (check) {
  const bad = rowsThatCannotShip();
  const lostOrSkipped = lostRows();
  if (lostOrSkipped === null) {
    console.log('  (no git baseline for data/player-redirects.json — lost-row check skipped)');
  }
  const lost = lostOrSkipped ?? [];
  const stale = outOfStep();
  if (bad.length > 0 || lost.length > 0 || stale.length > 0) {
    const blocks: string[] = [];
    if (bad.length > 0) {
      blocks.push(
        `  ${bad.length} row(s) in data/player-redirects.json cannot ship:\n\n` +
          bad.map((r) => `    ${r}`).join('\n\n'),
      );
    }
    if (lost.length > 0) {
      blocks.push(
        `  ${lost.length} row(s) left data/player-redirects.json and took a live redirect with them:\n\n` +
          lost.map((r) => `    ${r}`).join('\n\n'),
      );
    }
    if (stale.length > 0) blocks.push(stale.map((s) => `  ${s}`).join('\n'));
    console.error(
      `✖ REDIRECT DRIFT — ${drift ? 'this run commits nothing' : 'not shippable as it stands'}.\n\n` +
        blocks.join('\n\n'),
    );
    console.error(
      '\n  To clear it (a two-minute fix, from a fresh pull):\n' +
        (bad.length > 0 || lost.length > 0
          ? '    1. Edit data/player-redirects.json as above (it is hand-authored; the\n' +
            '       pipeline never writes it).\n'
          : '    1. (No row to edit; vercel.json only needs regenerating.)\n') +
        '    2. npm run data:redirects                  (rewrites vercel.json from the ledger)\n' +
        '    3. npx tsx scripts/redirects.ts --drift    (must print ✓)\n' +
        '    4. Commit both files and push, then re-run "Daily data refresh" from the\n' +
        "       Actions tab, or leave it to tomorrow's run. A held day loses nothing:\n" +
        '       every run re-fetches every upload.',
    );
    process.exit(1);
  }
  console.log(
    `✓ player-redirects.json — ${Object.keys(redirects).length} redirect(s), all resolve, ` +
      'and vercel.json carries every one',
  );
  process.exit(0);
}

cfg.redirects = next;
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');

console.log(
  `✓ vercel.json — ${manual.length} hand-authored redirect(s) kept, ` +
    `${playerRedirects.length} player redirect(s) generated`,
);
for (const r of playerRedirects) console.log(`    ${r.source}  →  ${r.destination}`);
