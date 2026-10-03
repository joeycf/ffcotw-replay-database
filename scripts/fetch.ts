// Stage 1: fetch every upload from the tracked CotW channels via the YouTube
// Data API v3, dump raw metadata to raw/<channel>.json, and print a
// reconnaissance report. The API key is LOCAL/CI-ONLY (never on Vercel — the
// site builds from committed JSON).
//
// NO GAME GATE HERE. raw/ holds everything the channels publish — including the
// 5,212 KOF XV uploads on fatalFuryReplays and the 1,205 SF6 uploads on
// bestOfFgc — and parse.ts does the filtering. That choice has one important
// consequence: THE COLLAPSE GUARD MUST COMPARE PARSED-VS-COMMITTED, never
// raw-vs-committed, or it would be measuring the game filter instead of the
// channel's health. On this game that is not a subtlety: raw is 4× the parsed
// corpus, so a raw-based guard would be numerically meaningless.
//
// Run: npm run data:fetch   (tsx --env-file-if-exists=.env scripts/fetch.ts)

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_CHANNELS, CHANNELS, hasCotwMarker } from './channels';
import { apiGet, parseDuration, requireApiKey } from './youtube';
import type {
  ChannelConfig,
  ChannelKey,
  DepartedEvidence,
  MatchVideo,
  RawVideoRecord,
} from '../types/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW_DIR = join(ROOT, 'raw');
requireApiKey('data:fetch');

interface PlaylistItemsResponse {
  items: { contentDetails: { videoId: string } }[];
  nextPageToken?: string;
}
interface VideosResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      liveBroadcastContent: string;
      tags?: string[];
    };
    contentDetails: { duration?: string };
    statistics?: { viewCount?: string };
  }[];
}

async function fetchChannel(ch: ChannelConfig): Promise<RawVideoRecord[]> {
  // An index source has no channel and no playlist; it is pulled by
  // `npm run data:theater` and skipped by the caller. Asserted rather than
  // assumed, because reaching here with one would otherwise page YouTube for
  // `playlistId=undefined` and return an empty dump that looks like a dead
  // channel — which is precisely the shape the collapse guard exists to refuse,
  // arriving from our own bug rather than the channel's.
  if (!ch.uploadsPlaylist) {
    throw new Error(
      `${ch.id} has no uploadsPlaylist — an index source must be skipped before fetchChannel.`,
    );
  }

  // 1) every videoId from the uploads playlist (50/page, 1 quota unit each)
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page: PlaylistItemsResponse = await apiGet('playlistItems', {
      part: 'contentDetails',
      playlistId: ch.uploadsPlaylist,
      maxResults: '50',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of page.items) ids.push(it.contentDetails.videoId);
    pageToken = page.nextPageToken;
  } while (pageToken);

  // 2) hydrate 50 at a time
  const out: RawVideoRecord[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res: VideosResponse = await apiGet('videos', {
      part: 'snippet,contentDetails,statistics',
      id: ids.slice(i, i + 50).join(','),
      maxResults: '50',
    });
    for (const v of res.items) {
      out.push({
        id: v.id,
        channel: ch.id,
        title: v.snippet.title,
        description: v.snippet.description,
        publishedAt: v.snippet.publishedAt,
        durationSec: parseDuration(v.contentDetails.duration),
        ...(v.statistics?.viewCount ? { viewCount: Number(v.statistics.viewCount) } : {}),
        liveBroadcastContent: v.snippet.liveBroadcastContent,
        ...(v.snippet.tags ? { tags: v.snippet.tags } : {}),
      });
    }
  }

  // A playlist that listed ids but hydrated to nothing is a bug, not a quiet
  // day. Reported here rather than left for the collapse guard, because the
  // guard runs on PARSED counts and this failure happens two stages earlier.
  if (ids.length > 0 && out.length === 0) {
    throw new Error(`${ch.id}: playlist listed ${ids.length} ids but videos.list returned none`);
  }
  return out;
}

// ── departures: the one case the stale-raw guard cannot judge from data ─────
//
// parse.ts refuses a dump when the committed corpus holds a record for that
// intake newer than anything in it. That proves the dump stale, EXCEPT when the
// record has left YouTube: delete a channel's newest upload, post nothing after
// it, and a dump fetched a minute ago fails the same test a month-old one does.
// Observed 2026-10-02 in the Strive repo: a deleted newest upload stopped that
// day's cron in Parse with every dump fresh.
//
// The data cannot separate the two cases, so this asks YouTube, and only about
// committed records newer than the dump. On an ordinary morning there are none,
// so it makes no call and costs nothing. One videos.list call covers 50 ids.
interface StatusResponse {
  items: { id: string; status: { privacyStatus: string } }[];
}

async function confirmDepartures(
  id: ChannelKey,
  dump: RawVideoRecord[],
  committed: MatchVideo[],
): Promise<DepartedEvidence> {
  const newestInDump = dump.reduce((a, v) => (v.publishedAt > a ? v.publishedAt : a), '');
  const ahead = newestInDump
    ? committed.filter((v) => v.intake === id && v.publishedAt > newestInDump).map((v) => v.id)
    : [];
  const ids: string[] = [];
  for (let i = 0; i < ahead.length; i += 50) {
    const batch = ahead.slice(i, i + 50);
    const res: StatusResponse = await apiGet('videos', {
      part: 'status',
      id: batch.join(','),
      maxResults: '50',
    });
    const live = new Set(
      res.items.filter((v) => v.status.privacyStatus === 'public').map((v) => v.id),
    );
    ids.push(...batch.filter((x) => !live.has(x)));
  }
  return { channel: id, newestInDump, checkedAt: new Date().toISOString(), ids };
}

/** The committed corpus, for the departure check only. Absent or unreadable is
 *  treated as empty here: no check runs, so no departure is recorded, and the
 *  guard stays strict. parse.ts refuses an unreadable videos.json itself. */
async function readCommitted(): Promise<MatchVideo[]> {
  const p = join(ROOT, 'data', 'videos.json');
  if (!existsSync(p)) return [];
  try {
    const v = JSON.parse(await readFile(p, 'utf8')) as MatchVideo[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const targets = only ? ACTIVE_CHANNELS.filter((c) => c.id === only) : ACTIVE_CHANNELS;
  if (only && targets.length === 0) {
    console.error(`✖ --only=${only} matches no active channel`);
    process.exit(1);
  }

  console.log(`▶ Fetching ${targets.length} channel(s)…\n`);
  const committed = await readCommitted();
  const rows: { ch: string; total: number; marked: number; newest: string }[] = [];
  for (const ch of targets) {
    const vids = await fetchChannel(ch);
    // Asked BEFORE the dump is written, and the departure file is written
    // beside EVERY dump, empty or not: a check that throws leaves the old dump
    // and its own file in place, so a new dump never sits next to an earlier
    // fetch's file. parse.ts also checks the binding.
    const departed = await confirmDepartures(ch.id, vids, committed);
    await writeFile(join(RAW_DIR, `${ch.id}.json`), JSON.stringify(vids));
    await writeFile(join(RAW_DIR, `${ch.id}.departed.json`), JSON.stringify(departed));
    // The marker count is RECON ONLY — it gates nothing here. It is printed so
    // a channel that quietly rebrands to another game is visible at fetch time
    // rather than three stages later as a collapse.
    const marked = vids.filter(
      (v) =>
        hasCotwMarker(v.title) ||
        (ch.cotwSignal === 'titleOrDescription' && hasCotwMarker(v.description)),
    ).length;
    const newest = vids.reduce((a, v) => (v.publishedAt > a ? v.publishedAt : a), '');
    rows.push({ ch: ch.id, total: vids.length, marked, newest: newest.slice(0, 10) });
    console.log(
      `  ${ch.id.padEnd(18)} ${String(vids.length).padStart(6)} uploads  ` +
        `${String(marked).padStart(5)} CotW-marked (${((marked / Math.max(1, vids.length)) * 100).toFixed(1)}%)  ` +
        `newest ${newest.slice(0, 10)}`,
    );
    if (departed.ids.length)
      console.log(
        `    ↘ ${departed.ids.length} committed upload(s) newer than this dump are gone from ` +
          `YouTube (deleted, private or unlisted): ${departed.ids.join(', ')}. parse prunes them.`,
      );
  }

  const frozen = CHANNELS.filter((c) => c.frozen);
  const index = CHANNELS.filter((c) => c.index);
  console.log(
    `\n✓ raw/ written — ${rows.reduce((n, r) => n + r.total, 0)} uploads, ` +
      `${rows.reduce((n, r) => n + r.marked, 0)} CotW-marked across ${rows.length} channel(s)` +
      `${frozen.length ? `; ${frozen.length} frozen channel(s) skipped` : ''}` +
      `${index.length ? `; ${index.length} index source(s) pulled by \`npm run data:theater\`` : ''}`,
  );
}

main();
