/**
 * Post-deploy smoke check — the collapse guard's downstream twin, and the
 * platform's deploy fingerprint.
 *
 * scripts/parse.ts protects the REPOSITORY: it refuses to write when an intake
 * loses records. This protects what visitors actually get, which is a different
 * thing — the repo can be perfect while production serves a build from before
 * the push, or from a build that failed.
 *
 * IT POLLS, deliberately. Vercel builds asynchronously off the git push and
 * there is no post-deploy hook to run after, so a single fetch races the build
 * and reports yesterday's payload as a collapse.
 *
 * A slow build is NOT a failure while the shortfall is inside the SAME band the
 * collapse guard uses (>10% AND >20 records) — the two gates agree on what the
 * word "collapse" means, which is the point of duplicating the constants rather
 * than importing a different pair. Out of band at the deadline is a hard fail.
 *
 * THE FETCH IS CACHE-COLD. `no-store` plus a cache-busting query is not
 * paranoia: a cached probe once produced a confident, wrong, nine-hour-old
 * conclusion about production on this platform.
 *
 * IT COMPARES CONTENT, NOT ONLY THE RECORD COUNT. Counting records catches an
 * archive collapsing and is blind to a record's CHARACTERS changing while the
 * count does not — which is what a review-queue resolution or an override does,
 * and it is the common case. So the comparison is a DIGEST: the record count,
 * the total side appearances, and a hash over every record's id and characters.
 *
 * The second number is side appearances rather than the sibling's "complete
 * sides". On a 1v1 game every side is complete by construction, so that metric
 * would be a constant equal to 2× the count and would prove nothing. Side
 * appearances is the game's declared stat unit (scripts/stats.ts), so it moves
 * exactly when the published characters move.
 *
 * Failure semantics are deliberately UNCHANGED from the sibling: a count
 * collapse past the band is the only hard failure, because a hash mismatch
 * cannot tell a slow build from a wrong one and builds here are async. What the
 * hash changes is that the success claim is TRUE when it is made.
 *
 * Run: npm run verify:deployed
 *   SMOKE_HOST     default https://replaydatabase.com — point at the game's own
 *                  *.vercel.app before the shell rewrite exists
 *   SMOKE_TIMEOUT_SEC (900) · SMOKE_INTERVAL_SEC (20)
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** This app's URL segment — app/app.config.ts game.slug. */
const SLUG = 'ffcotw';
/** The apex the shell owns; it edge-rewrites /<slug>/* to this project. */
const HOST = (process.env.SMOKE_HOST ?? 'https://replaydatabase.com').replace(/\/$/, '');

const TIMEOUT_SEC = Number(process.env.SMOKE_TIMEOUT_SEC ?? 900);
const INTERVAL_SEC = Number(process.env.SMOKE_INTERVAL_SEC ?? 20);

// The collapse guard's thresholds, deliberately identical (scripts/parse-finish.ts).
//
// Worth knowing at THIS archive's size, and it is the opposite of the sibling's
// note: 20 records is 0.4% of ~4,500, so the PERCENTAGE term dominates here and
// the absolute never binds. This is the first game on the platform where the
// guard is genuinely awake on both terms from day one.
const COLLAPSE_PCT = 0.1;
const COLLAPSE_ABS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Digest {
  count: number;
  appearances: number;
  hash: string;
}

function digest(payload: unknown): Digest | null {
  if (!Array.isArray(payload)) return null;
  const h = createHash('sha256');
  let appearances = 0;
  for (const r of payload as { id?: string; sides?: { characters?: string[] }[] }[]) {
    h.update(String(r.id ?? ''));
    for (const s of r.sides ?? []) {
      const cs = s.characters ?? [];
      appearances += cs.length;
      h.update(`|${cs.join(',')}`);
    }
    h.update(';');
  }
  return { count: payload.length, appearances, hash: h.digest('hex').slice(0, 12) };
}

const same = (a: Digest, b: Digest): boolean => a.count === b.count && a.hash === b.hash;
const show = (d: Digest): string =>
  `${d.count.toLocaleString('en-US')} replays · ${d.appearances.toLocaleString('en-US')} side appearances · ${d.hash}`;

async function servedDigest(url: string): Promise<Digest | null> {
  try {
    const res = await fetch(`${url}?_cb=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.log(`   … HTTP ${res.status}`);
      return null;
    }
    const d = digest(await res.json());
    if (!d) console.log('   … payload is not an array');
    return d;
  } catch (e) {
    console.log(`   … ${(e as Error).message}`);
    return null;
  }
}

const local = digest(JSON.parse(readFileSync(join(ROOT, 'data', 'replays.json'), 'utf8')));
if (!local) {
  console.error('✖ data/replays.json is not an array — nothing to compare against.');
  process.exit(1);
}
const committed = local.count;
const url = `${HOST}/${SLUG}/data/replays.json`;

console.log(`Smoke check: ${url}`);
console.log(`  committed ${show(local)} · polling ${TIMEOUT_SEC}s`);

const deadline = Date.now() + TIMEOUT_SEC * 1000;
let last: Digest | null = null;

for (let attempt = 1; ; attempt++) {
  const d = await servedDigest(url);
  if (d !== null) {
    last = d;
    const lost = committed - d.count;
    const pct = committed > 0 ? (lost / committed) * 100 : 0;
    const why =
      lost !== 0
        ? `  (${lost > 0 ? '-' : '+'}${Math.abs(lost)} records, ${pct.toFixed(1)}%)`
        : `  (same count, content differs — ${d.appearances} appearances vs ${local.appearances})`;
    console.log(`  [${attempt}] served ${show(d)}${same(local, d) ? '  ✓ matches' : why}`);
    if (same(local, d)) {
      console.log(`\n✓ Production serves the committed archive — ${show(d)}.`);
      process.exit(0);
    }
  }
  if (Date.now() + INTERVAL_SEC * 1000 >= deadline) break;
  await sleep(INTERVAL_SEC * 1000);
}

if (last === null) {
  console.error(
    `\n✖ Never got a readable payload from ${url} in ${TIMEOUT_SEC}s.\n` +
      '  That is not a slow deploy — the file is missing, unparseable, or the\n' +
      '  route is broken. Check the deployment and the shell rewrite.',
  );
  process.exit(1);
}

const lost = committed - last.count;
// Signed on purpose: a LARGER served count (negative `lost`) means the local
// checkout is behind production, which is not a collapse.
const collapsed = lost > COLLAPSE_ABS && lost / committed > COLLAPSE_PCT;

if (!collapsed) {
  console.warn(
    `\n⚠ Deploy has not landed within ${TIMEOUT_SEC}s.\n` +
      `  committed ${show(local)}\n` +
      `  served    ${show(last)}\n` +
      (lost === 0
        ? '  The record count matches and the CONTENT does not, so this is a build that\n' +
          '  has not shipped the latest characters yet — the failure mode a count-only\n' +
          '  check reports as success.\n'
        : '  That is inside the collapse band, so what is live is a stale build, not a\n' +
          '  lost archive.\n') +
      '  Re-run this check, or watch the Vercel deployment.',
  );
  process.exit(0);
}

console.error(
  `\n✖ PRODUCTION IS SERVING A COLLAPSED ARCHIVE.\n` +
    `  committed ${committed.toLocaleString('en-US')} · served ${last.count.toLocaleString('en-US')} · lost ${lost.toLocaleString('en-US')} (${((lost / committed) * 100).toFixed(1)}%)\n` +
    `  Past the ${COLLAPSE_PCT * 100}% AND ${COLLAPSE_ABS}-record band after ${TIMEOUT_SEC}s, so this is\n` +
    '  not a build still in flight. Visitors are seeing this right now.\n\n' +
    '  Check the latest Vercel deployment for this project, and confirm\n' +
    '  data/replays.json in the repo is the archive you meant to publish.',
);
process.exit(1);
