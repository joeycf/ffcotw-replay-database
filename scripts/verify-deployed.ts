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
 * AND THE CODE VERSION (checklist 10i). The digest says which DATA is live and
 * nothing about which CODE: a pin bump on unchanged data deploys a build whose
 * replays.json is byte-identical to the old one, so this check would call
 * success on a deployment still building. scripts/emit.ts writes the engine tag
 * it reads out of nuxt.config.ts into data/summary.json; this script fetches
 * summary.json FIRST (a wrong `game` there is the copied-env failure, 10h, and
 * no polling fixes it) and passes only when the served tag is the pin. The
 * archive matching while the tag does not is a hard failure at the deadline.
 *
 * Run: npm run verify:deployed
 *   SMOKE_HOST     default https://replaydatabase.com — the apex the shell
 *                  owns, which edge-rewrites /ffcotw/* to this project (shell
 *                  ae9fabc, 2026-09-03). The workflow uses the default. Point
 *                  it at https://ffcotw-replay-database.vercel.app to read the
 *                  game's own host directly, which tells a broken rewrite from
 *                  a broken deployment.
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

/** This app's identity — app/app.config.ts game.id, which summary.json carries as
 *  `game`. Never compare it with SLUG: on Tekken the two differ (tekken8 / tekken). */
const GAME_ID = 'ffcotw';

/**
 * THE ENGINE PIN, READ OUT OF nuxt.config.ts — the same strict reader
 * scripts/emit.ts uses: exactly one `github:joeycf/replay-engine#vX.Y.Z`
 * literal, or this check cannot say what "the pinned code" is and exits 1.
 */
function enginePin(): string {
  const src = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8');
  const hits = [...src.matchAll(/github:joeycf\/replay-engine#(v\d+\.\d+\.\d+)/g)].map(
    (m) => m[1]!,
  );
  const unique = [...new Set(hits)];
  if (unique.length !== 1) {
    console.error(
      `✖ nuxt.config.ts pins ${unique.length} engine tag(s) (${unique.join(', ') || 'none'}) — ` +
        'the code-version half of this check needs exactly one (checklist 10i).',
    );
    process.exit(1);
  }
  return unique[0]!;
}
const ENGINE_PIN = enginePin();

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

/** summary.json, cache-cold like the payload: the identity (`game`) and the
 *  deployed code version (`engine`) that emit copied out of the pin. */
async function servedSummary(url: string): Promise<{ game?: string; engine?: string } | null> {
  try {
    const res = await fetch(`${url}?_cb=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.log(`   … HTTP ${res.status} (summary.json)`);
      return null;
    }
    return (await res.json()) as { game?: string; engine?: string };
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
const summaryUrl = `${HOST}/${SLUG}/data/summary.json`;

// LOCAL CONSISTENCY FIRST. A pin bump that did not re-run emit leaves
// data/summary.json saying yesterday's tag; polling production could then
// never pass, and the failure would read as a deploy problem. In the cron emit
// always runs first, so this fires for a human after a pin-only commit.
const committedEngine = (
  JSON.parse(readFileSync(join(ROOT, 'data', 'summary.json'), 'utf8')) as { engine?: string }
).engine;
if (committedEngine !== ENGINE_PIN) {
  console.error(
    `✖ data/summary.json carries engine ${committedEngine ?? '(absent)'} but nuxt.config.ts pins ` +
      `${ENGINE_PIN} — a pin-only commit. Run \`npm run data:emit\` and commit data/summary.json.`,
  );
  process.exit(1);
}

console.log(`Smoke check: ${url}`);
console.log(`  committed ${show(local)} · engine pin ${ENGINE_PIN} · polling ${TIMEOUT_SEC}s`);

const deadline = Date.now() + TIMEOUT_SEC * 1000;
let last: Digest | null = null;
let lastEngine: string | null = null;

for (let attempt = 1; ; attempt++) {
  // summary.json FIRST, because the base-path failure makes every other reading
  // meaningless: a wrong `game` means the archive at that path belongs to another
  // project, and comparing digests against it would be comparing two games.
  const summary = await servedSummary(summaryUrl);
  if (summary && typeof summary.game === 'string' && summary.game !== GAME_ID) {
    console.error(
      `\n✖ THE DEPLOYMENT AT ${HOST}/${SLUG}/ IS NOT THIS GAME.\n` +
        `  summary.json says game "${summary.game}"; this project is "${GAME_ID}".\n\n` +
        '  This is the copied-env failure (checklist 10h): NUXT_APP_BASE_URL carried over from\n' +
        "  another project, so the build mounted at that game's base path. Nothing about the\n" +
        '  deployment looks wrong — it builds, it renders, the JSON parses — and polling longer\n' +
        '  will never make it true.\n\n' +
        `  Fix NUXT_APP_BASE_URL (/${SLUG}/) and NUXT_PUBLIC_SITE_URL on Production AND Preview,\n` +
        '  then redeploy.',
    );
    process.exit(1);
  }
  if (summary && typeof summary.engine === 'string') lastEngine = summary.engine;

  const d = await servedDigest(url);
  if (d !== null) {
    last = d;
    const lost = committed - d.count;
    const pct = committed > 0 ? (lost / committed) * 100 : 0;
    const why =
      lost !== 0
        ? `  (${lost > 0 ? '-' : '+'}${Math.abs(lost)} records, ${pct.toFixed(1)}%)`
        : `  (same count, content differs — ${d.appearances} appearances vs ${local.appearances})`;
    const enginesAgree = lastEngine === ENGINE_PIN;
    console.log(
      `  [${attempt}] served ${show(d)} · engine ${lastEngine ?? '(absent)'}${
        same(local, d) && enginesAgree ? '  ✓ matches' : same(local, d) ? '' : why
      }`,
    );
    if (same(local, d) && enginesAgree) {
      console.log(`\n✓ Production serves the committed archive on ${ENGINE_PIN} — ${show(d)}.`);
      process.exit(0);
    }
    if (same(local, d) && !enginesAgree) {
      // The records match and the CODE does not. This is exactly the case 10i
      // was written from, and it is why a digest-only check claimed success on a
      // deployment that was still building.
      console.log(
        `   … the archive matches but the deployment is on engine ${lastEngine ?? '(absent)'}, ` +
          `not ${ENGINE_PIN} — a build still in flight, or a pin that never deployed.`,
      );
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

// THE DEADLINE VERDICT ON THE CODE VERSION. The archive matches and the engine
// does not: the data landed, so this is not "a deploy that has not landed" — it
// is a deployment that is not on the pinned code (checklist 10i), or a
// summary.json that never learned the pin. A hard failure, not a warning: a
// warning that exits 0 is a success gate, and this is an assertion.
if (same(local, last) && lastEngine !== ENGINE_PIN) {
  console.error(
    `\n✖ STALE BUILD: production serves the committed archive but engine ` +
      `${lastEngine ?? 'absent from summary.json'}, not ${ENGINE_PIN}.\n` +
      `  The records are right and the CODE is not — a build still in flight after ${TIMEOUT_SEC}s,\n` +
      '  or a pin that never deployed. Check the latest Vercel deployment for this project and\n' +
      '  re-run this check once it is live.',
  );
  process.exit(1);
}

if (!collapsed) {
  console.warn(
    `\n⚠ Deploy has not landed within ${TIMEOUT_SEC}s.\n` +
      `  committed ${show(local)}  (engine ${ENGINE_PIN})\n` +
      `  served    ${show(last)}  (engine ${lastEngine ?? 'absent from summary.json'})\n` +
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
