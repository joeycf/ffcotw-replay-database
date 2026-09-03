/**
 * Stage 1 for the INDEX intake: pull Replay Theater's CotW catalogue, join each
 * entry to the YouTube metadata of the video it points at, and dump the result
 * to raw/replayTheater.json.
 *
 * Run: npm run data:theater   (and every morning, from the cron)
 *
 * ── WHAT MAKES IT SAFE ─────────────────────────────────────────────────────
 * Two rules that hold even when the goodwill does not:
 *
 *   1. ADD-ONLY. This intake can only ADD records. A committed record is
 *      carried whether or not the catalogue still lists it; entries that vanish
 *      are COUNTED in report.md, never removed, and the pin only grows.
 *   2. THE CRON NEVER DEPENDS ON THIS SUCCEEDING. The step runs LAST and is
 *      allowed to fail. On any failure — network, non-200, malformed page — there
 *      is simply no dump, parse.ts carries exactly as it does today, and the
 *      cron stays green. A bad day upstream costs that day's new entries and
 *      nothing else.
 *
 * robots.txt at replaytheater.app read 2026-09-03 is `User-agent: * / Disallow:`;
 * requests carry a contactable user-agent and 1.2s pacing.
 *
 * ── WHAT THIS CATALOGUE IS, AND HOW IT DIFFERS FROM THE SIBLINGS ───────────
 * Measured over the whole catalogue on 2026-09-03 (3,465 entries, 70 pages):
 *
 *   TAGGED    127 entries across 10 videos. 100% carry a `t=` offset, median 9
 *             per VOD. These are SEGMENTS — the shape every sibling repo
 *             assumes, and the shape their `${videoId}@${start}` id rule is
 *             written for.
 *   UNTAGGED  3,338 entries across 3,338 videos, one entry each. 0.03% carry an
 *             offset. These are WHOLE VIDEOS, not segments at all.
 *
 * So the id follows the ENTRY, not the source (see types/index.ts). And the
 * intake is a source AND a witness in different proportions than anywhere else:
 * 67.7% of the catalogue's videos are already ours from fatalFuryReplays and
 * wolfFgc, submitted the SAME DAY as the upload in 98.7% of cases. On those
 * this is a near-DEPENDENT witness — it agrees because it read the same title —
 * so the 99.87% character agreement measured against them is close to
 * tautological and is reported with that caveat rather than as verification.
 *
 * ── THE DEAD-LINK RATE IS A PROPERTY OF THE SOURCE ─────────────────────────
 * 1,075 of the catalogue's 3,348 videos no longer resolve (oEmbed 403 on 52/52
 * sampled, against a positive control of HTTP 200 on live ids and 400 on a
 * fabricated one). The decay is age-graded: 0.4% dead among 2026-08 rows,
 * 55.6% among 2025-12. The YouTube join below drops them — a record whose video
 * does not resolve is never built — and the stats file records the RATE. The
 * sibling enumerates every missing VOD, which is right at n≤5 and would be
 * 1,075 log lines here.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHANNEL_BY_ID } from './channels';
import { fetchVideoMeta, requireApiKey, sleep } from './youtube';
import type { TheaterRawRecord } from '../types/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'raw');
const OUT = join(RAW_DIR, 'replayTheater.json');
/** What this pull did, for parse.ts to read. ABSENT on a run that never
 *  pulled, which report.md states rather than printing 0. */
const STATS = join(RAW_DIR, '.replayTheater.stats.json');
/** EVERY entry this run saw, in the catalogue's own shape. Kept OUT of the
 *  intake file on purpose: raw/replayTheater.json is what parse.ts builds
 *  records from, and this file is the WITNESS — nothing that reads it may
 *  build. It is what makes the cross-check in the report possible without
 *  risking a witness row becoming a published record. */
const WITNESS = join(RAW_DIR, 'replayTheater.witness.json');
/** The cursor's committed state: the highest catalogue entry id ever seen.
 *  Written by parse.ts — every data/ write is parse's — and read here. */
const CURSOR = join(ROOT, 'data', 'theater-cursor.json');

const CH = CHANNEL_BY_ID.get('replayTheater');
if (!CH?.index) throw new Error('replayTheater is not registered as an index channel');
const INDEX = CH.index;

const argv = process.argv.slice(2);
const FULL = argv.includes('--full') || argv.includes('--fresh');
const CURSOR_MODE = !FULL;
/** Two clean pages, not one. The catalogue orders newest-first, so one day's
 *  submissions can straddle a page boundary and a single clean page is not
 *  proof there is nothing behind it. */
const CLEAN_PAGES_TO_STOP = 2;
/** A hard ceiling on the daily path, so a catalogue-side reordering can never
 *  turn the cron into a full sweep. The CotW catalogue is 70 pages today, so
 *  unlike the Tōkon repo (5 pages) this bound is well BELOW the catalogue and
 *  genuinely bites on a reorder — which is exactly what it is for. Hitting it
 *  is reported, not silent: under add-only nothing is lost, only late, and
 *  `npm run data:theater -- --full` reconciles. */
const CURSOR_MAX_PAGES = 10;

requireApiKey('data:theater');

const UA = 'replay-database/ffcotw (+https://github.com/joeycf) data:theater';

interface TheaterEntry {
  id?: number;
  game?: string;
  video_link?: string;
  tag?: string | null;
  upload_date?: string;
  p1_name?: string;
  p2_name?: string;
  [k: string]: unknown;
}
interface TheaterPage {
  matches?: TheaterEntry[];
  total_count?: number | string;
}

async function getPage(page: number, retries = 4): Promise<TheaterPage> {
  const url = `${INDEX.endpoint}?game=${encodeURIComponent(INDEX.slug)}&page=${page}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA } });
      if (res.ok) return (await res.json()) as TheaterPage;
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status} (not retryable)\n${await res.text().catch(() => '')}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= retries || msg.includes('not retryable')) {
        throw new Error(`Replay Theater page ${page} failed: ${msg}`, { cause: err });
      }
      const wait = Math.min(1500 * 2 ** (attempt - 1), 10_000);
      console.warn(
        `  ⚠ page ${page} (attempt ${attempt}/${retries}): ${msg}; retrying in ${wait}ms`,
      );
      await sleep(wait);
    }
  }
  throw new Error(`Exhausted retries for page ${page}`);
}

// ── video link → (videoId, startSeconds?) ───────────────────────────────────
//
// THE LINKS ARE CONCATENATED, NOT BUILT. The submission form does
// `video_link = base + "&t=" + t + "s"` regardless of what `base` looks like,
// so a youtu.be submission produces `https://youtu.be/<id>&t=554s` — a PATH
// with no query string at all. 13 of this catalogue's links are that shape. A
// URL-parsing extractor reads the id as "abcdefghijk&t=554s"; this matches the
// id shape explicitly and refuses anything else rather than guessing.
const VIDEO_ID =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/(?:live|shorts|embed)\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;
// GLOBAL, and the LAST match wins. The form appends its own offset last, so an
// earlier `t=` is whatever the submitter's clipboard carried in.
const START_ALL = /[?&]t=([^&#]*)/g;
const START_VALUE = /^(\d+)s?$/;

interface Link {
  videoId: string;
  /** Absent when the entry carried no `t=` at all — the entry is then the WHOLE
   *  video, which is 96% of this catalogue. */
  startSeconds?: number;
}

function parseLink(link: string): Link | { error: string } {
  const id = VIDEO_ID.exec(link ?? '');
  if (!id) return { error: 'no extractable YouTube id' };
  const values = [...(link ?? '').matchAll(START_ALL)].map((m) => m[1] ?? '');
  if (values.length === 0) return { videoId: id[1]! };
  const last = values[values.length - 1]!;
  const m = START_VALUE.exec(last);
  // A `t=` we cannot read is NOT the same as no `t=`. Falling through to "whole
  // video" would publish a three-hour VOD as one match and render exactly like
  // a correct record.
  if (!m) return { error: `unreadable t= value ${JSON.stringify(last)}` };
  const secs = Number(m[1]);
  return secs > 0 ? { videoId: id[1]!, startSeconds: secs } : { videoId: id[1]! };
}

/** A side's declared fighters, in slot order, blanks dropped. */
const chars = (e: TheaterEntry, side: 1 | 2): string[] =>
  ([`p${side}_char`, `p${side}_char2`, `p${side}_char3`, `p${side}_char4`] as const)
    .map((k) => (e as Record<string, unknown>)[k])
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map((c) => c.trim());

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  // Clear the previous run's self-report BEFORE fetching. parse.ts reads it to
  // learn what this pull did, and a file left over from yesterday describing a
  // pull that did not happen is worse than no file.
  await rm(STATS, { force: true });

  let cursorAt = 0;
  if (existsSync(CURSOR)) {
    try {
      cursorAt = Number(JSON.parse(await readFile(CURSOR, 'utf8')).highestId ?? 0) || 0;
    } catch {
      cursorAt = 0;
    }
  }

  console.log(`▶ Pulling the Replay Theater index (${INDEX.endpoint}, game=${INDEX.slug})…`);
  const first = await getPage(1);
  const total = Number(first.total_count ?? 0);
  const fullPages = Math.max(1, Math.ceil(total / INDEX.pageSize));

  // ── CURSOR PLAUSIBILITY BOUND ────────────────────────────────────────────
  // If the committed cursor is at or above the newest id the catalogue offers,
  // every page reads as already-seen, the stop rule fires immediately and the
  // pull silently does nothing — forever. That can happen from a bad write, a
  // catalogue-side id reset, or a manual edit. Detect it and fall back to a
  // full sweep rather than going quietly blind.
  const newestOnPage1 = Math.max(0, ...(first.matches ?? []).map((e) => Number(e.id ?? 0)));
  let cursorMode = CURSOR_MODE;
  if (cursorMode && cursorAt >= newestOnPage1 && newestOnPage1 > 0 && cursorAt > 0) {
    if (cursorAt > newestOnPage1) {
      console.warn(
        `  ⚠ committed cursor ${cursorAt} is AHEAD of the newest catalogue id ${newestOnPage1}.\n` +
          `    Left alone this is silent: every page reads as already-seen and the pull stops\n` +
          `    having looked at nothing. Falling back to a full sweep.`,
      );
      cursorMode = false;
    }
  }

  const pages = cursorMode ? Math.min(CURSOR_MAX_PAGES, fullPages) : fullPages;
  console.log(
    cursorMode
      ? `  catalogue reports ${total} match(es) (${fullPages} page(s) of ${INDEX.pageSize}); ` +
          `cursor at entry id ${cursorAt || '—'}, reading at most ${pages}`
      : `  catalogue reports ${total} match(es) → ${pages} page(s) of ${INDEX.pageSize}`,
  );

  const byId = new Map<number, TheaterEntry>();
  const add = (rows: TheaterEntry[]) => {
    for (const e of rows) if (typeof e.id === 'number') byId.set(e.id, e);
  };
  add(first.matches ?? []);
  let cleanRun = 0;
  let pagesRead = 1;
  let stoppedEarly = false;

  for (let p = 2; p <= pages; p++) {
    await sleep(INDEX.pacingMs);
    const page = await getPage(p);
    const rows = page.matches ?? [];
    if (rows.length === 0) break; // end of catalogue, not a clean page
    add(rows);
    pagesRead++;
    if (cursorMode) {
      const anyNew = rows.some((e) => Number(e.id ?? 0) > cursorAt);
      cleanRun = anyNew ? 0 : cleanRun + 1;
      if (cleanRun >= CLEAN_PAGES_TO_STOP) {
        stoppedEarly = true;
        break;
      }
    }
    if (!cursorMode && (p % 10 === 0 || p === pages)) {
      console.log(`  … page ${p}/${pages} (${byId.size} unique entries)`);
    }
  }

  const catalogue = [...byId.values()];
  const hitBound = cursorMode && !stoppedEarly && pagesRead >= pages;
  if (hitBound) {
    console.warn(
      `  ⚠ the cursor hit its ${CURSOR_MAX_PAGES}-page bound without going quiet — entries may\n` +
        `    be missing. Nothing is lost under add-only, only late.\n` +
        `    Reconcile with: npm run data:theater -- --full`,
    );
  }

  // ── THE PER-ENTRY GAME GATE ───────────────────────────────────────────────
  // ?game= is a filter the catalogue answers, not one we control. A mistagged
  // submission arrives looking exactly like a real one.
  const wrongGame = catalogue.filter((e) => (e.game ?? '') !== INDEX.gameLabel);
  const ours = catalogue.filter((e) => (e.game ?? '') === INDEX.gameLabel);

  await writeFile(WITNESS, JSON.stringify(ours));

  const links: { e: TheaterEntry; link: Link }[] = [];
  const badLinks: string[] = [];
  for (const e of ours) {
    const l = parseLink(String(e.video_link ?? ''));
    if ('error' in l) {
      badLinks.push(`${e.id}: ${l.error}`);
      continue;
    }
    links.push({ e, link: l });
  }

  // Composite ids must be unique. On this catalogue that is a REAL check rather
  // than a formality: the untagged arm keys on the plain video id, so two
  // catalogue rows pointing at the same video would collide here instead of
  // silently producing two records for one upload.
  const seen = new Map<string, number>();
  const collisions: string[] = [];
  const recId = (l: Link) =>
    l.startSeconds === undefined ? l.videoId : `${l.videoId}@${l.startSeconds}`;
  for (const { e, link } of links) {
    const id = recId(link);
    const prev = seen.get(id);
    if (prev !== undefined) collisions.push(`${id}: entries ${prev} and ${e.id}`);
    else seen.set(id, Number(e.id));
  }
  const deduped = links.filter(({ e, link }) => seen.get(recId(link)) === Number(e.id));

  // ── join to YouTube ───────────────────────────────────────────────────────
  const vodIds = [...new Set(deduped.map((l) => l.link.videoId))];
  console.log(`\n▶ Resolving ${vodIds.length} video(s) on YouTube…`);
  const vods = await fetchVideoMeta(vodIds);
  const missing = vodIds.filter((id) => !vods.has(id));

  const records: TheaterRawRecord[] = [];
  for (const { e, link } of deduped) {
    const vod = vods.get(link.videoId);
    if (!vod) continue; // unresolvable video — counted, not enumerated
    const c1 = chars(e, 1);
    const c2 = chars(e, 2);
    const tag = (e.tag ?? '').toString().trim();
    records.push({
      id: recId(link),
      channel: 'replayTheater',
      // SYNTHESIZED — the catalogue carries no title. It follows this corpus's
      // shape so cards read consistently, and it carries the event tag when
      // there is one because `title` is the engine's search haystack: that
      // placement is what makes "Combo Breaker 2025" find these records with no
      // new facet, field or render surface. Handles keep their sponsor
      // prefixes; stripping is the parser's job.
      title:
        `FF CotW ▰ ${e.p1_name ?? '?'} (${c1.join('/')}) vs ${e.p2_name ?? '?'} (${c2.join('/')})` +
        (tag ? ` ▰ ${tag}` : ''),
      description: '',
      // The video's real publish time. Deliberately NOT offset by startSeconds:
      // that would shift a record by up to several hours and could cross a
      // day-grained patch boundary, which is the authority era and patch are
      // derived from.
      publishedAt: vod.publishedAt,
      // The catalogue publishes no per-match duration. For a whole-video entry
      // the video's own duration IS the record's; for a segment there is
      // nothing honest to derive one from, so 0 means unknown and emit omits it.
      durationSec: link.startSeconds === undefined ? vod.durationSec : 0,
      liveBroadcastContent: 'none',
      theaterId: Number(e.id),
      videoId: link.videoId,
      ...(link.startSeconds !== undefined ? { startSeconds: link.startSeconds } : {}),
      tag,
      uploader: vod.uploader,
      players: [String(e.p1_name ?? '').trim(), String(e.p2_name ?? '').trim()],
      characters: [c1, c2],
    });
  }

  records.sort(
    (a, b) =>
      b.publishedAt.localeCompare(a.publishedAt) ||
      (a.startSeconds ?? 0) - (b.startSeconds ?? 0) ||
      a.id.localeCompare(b.id),
  );
  await writeFile(OUT, JSON.stringify(records));

  const tagged = records.filter((r) => r.tag).length;
  const stats = {
    mode: cursorMode ? 'cursor' : 'full',
    pagesRead,
    totalReported: total,
    seen: catalogue.length,
    wrongGame: wrongGame.length,
    badLinks: badLinks.length,
    collisions: collisions.length,
    videos: vodIds.length,
    unresolvable: missing.length,
    unresolvablePct: vodIds.length
      ? Number(((missing.length / vodIds.length) * 100).toFixed(1))
      : 0,
    records: records.length,
    tagged,
    untagged: records.length - tagged,
    highestId: Math.max(0, ...catalogue.map((e) => Number(e.id ?? 0))),
    hitCursorBound: hitBound,
  };
  await writeFile(STATS, JSON.stringify(stats, null, 2));

  console.log(
    `\n✓ raw/replayTheater.json — ${records.length} record(s) ` +
      `(${tagged} tagged segment(s), ${records.length - tagged} whole video(s))\n` +
      `  ${catalogue.length} entr(ies) seen over ${pagesRead} page(s)` +
      `${wrongGame.length ? `, ${wrongGame.length} rejected by the per-entry game gate` : ''}` +
      `${badLinks.length ? `, ${badLinks.length} unreadable link(s)` : ''}` +
      `${collisions.length ? `, ${collisions.length} id collision(s)` : ''}\n` +
      `  ${missing.length}/${vodIds.length} video(s) no longer resolve (${stats.unresolvablePct}%) — dropped, not published`,
  );
}

main();
