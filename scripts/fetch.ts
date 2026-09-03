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

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_CHANNELS, CHANNELS, hasCotwMarker } from './channels';
import { apiGet, parseDuration, requireApiKey } from './youtube';
import type { ChannelConfig, RawVideoRecord } from '../types/index';

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

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const targets = only ? ACTIVE_CHANNELS.filter((c) => c.id === only) : ACTIVE_CHANNELS;
  if (only && targets.length === 0) {
    console.error(`✖ --only=${only} matches no active channel`);
    process.exit(1);
  }

  console.log(`▶ Fetching ${targets.length} channel(s)…\n`);
  const rows: { ch: string; total: number; marked: number; newest: string }[] = [];
  for (const ch of targets) {
    const vids = await fetchChannel(ch);
    await writeFile(join(RAW_DIR, `${ch.id}.json`), JSON.stringify(vids));
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
