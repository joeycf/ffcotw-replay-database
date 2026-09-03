/**
 * THE MAINTENANCE RITUAL, AS ONE COMMAND.
 *
 * Run: npm run data:catchup
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONVENIENCE WRAPPER. `raw/` is
 * gitignored, so it is local and the daily cron never writes it. That means a
 * local `raw/` is routinely OLDER than the committed `data/` the cron produced
 * in CI — and running `data:parse` on its own then silently DELETES every
 * record the local dump cannot reproduce.
 *
 * The collapse guard does NOT catch that. It needs >10% AND >20 records lost
 * from one intake, and this arrives as one or two records spread across nine.
 * The data-only stale-raw guard in parse.ts catches the clear-cut case — a dump
 * that provably predates a committed record — but the two guards together still
 * leave a gap that only ordering closes. Pairing fetch with parse in one command
 * is what makes the mistake unhittable by accident, which is worth more than
 * either guard.
 *
 * THE ORDER IS THE POINT: fetch → theater → parse → emit. The index pull runs
 * before parse because parse merges its dump, and it is allowed to FAIL without
 * stopping the run — the same rule the cron follows, for the same reason.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MatchVideo, ReviewQueueItem } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const read = <T>(p: string, fallback: T): T =>
  existsSync(join(DATA, p)) ? (JSON.parse(readFileSync(join(DATA, p), 'utf8')) as T) : fallback;

function step(label: string, args: string[], allowFailure = false): boolean {
  console.log(`\n\x1b[1m── ${label}\x1b[0m`);
  const r = spawnSync('npm', ['run', ...args], { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) {
    if (allowFailure) {
      console.warn(`  ⚠ ${label} failed — continuing. This step is allowed to fail by design.`);
      return false;
    }
    console.error(`\n✖ ${label} failed. Nothing after it has run.`);
    process.exit(r.status ?? 1);
  }
  return true;
}

const before = {
  records: read<MatchVideo[]>('videos.json', []).length,
  pending: read<ReviewQueueItem[]>('review-queue.json', []).length,
};

step('1/4  fetch channel uploads', ['data:fetch']);
step('2/4  pull the Replay Theater index', ['data:theater'], true);
step('3/4  parse', ['data:parse']);
step('4/4  emit', ['data:emit']);

const after = {
  records: read<MatchVideo[]>('videos.json', []).length,
  pending: read<ReviewQueueItem[]>('review-queue.json', []).length,
};
const delta = (n: number) => (n > 0 ? `+${n}` : String(n));
console.log(
  `\n\x1b[1m✓ catchup complete\x1b[0m\n` +
    `  records ${before.records} → ${after.records} (${delta(after.records - before.records)})\n` +
    `  pending review ${before.pending} → ${after.pending} (${delta(after.pending - before.pending)})\n` +
    `  Nothing was drained to the site: resolving a review item stays a human decision.`,
);
