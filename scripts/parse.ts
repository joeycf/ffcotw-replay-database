/**
 * Stage 2: turn raw/*.json into the committed substrate data/videos.json, plus
 * data/players.json, data/review-queue.json and data/report.md.
 *
 * ONE PARSER, NOT NINE. Nine channels publish six title grammars between them,
 * and the parser handles all of them without a per-channel branch, because it
 * never chooses a slot order: it finds the ROSTER SPANS and takes what is left
 * as the handle. That is why "MIKADO (Rock)", "Rock (MIKADO)", "Automattock
 * Tizoc" and "MR BIG 🐺 FDYNASTY" all read correctly from one code path, and
 * why cotwReplays using BOTH orders in the same month costs nothing.
 *
 * The pipeline order is load → gate → parse → index-merge → dedupe → guard →
 * write, and the guards are the point:
 *
 *   · game marker, hashtag-stripped   (checklist 3, amended — see channels.ts)
 *   · date floor per channel          (pre-release admitted only where declared)
 *   · stale-raw, DATA-ONLY            (checklist 9's neighbour; no mtime)
 *   · residue                         (checklist 5c)
 *   · collapse, parsed-vs-committed   (checklist 7)
 *   · freeze carry with a pinned count(checklist 7)
 *   · dedupe on the INTAKE key        (checklist 2)
 *   · review queue, never guessed     (checklist 6)
 *
 * Run: npm run data:parse
 */

import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_CHANNELS, hasCotwMarker, stripHashtagRun } from './channels';
import { LAUNCH, patchForDate, seasonForDate } from './patches';
import { buildAliasMatcher, loadCharacters, normalizeText, playerId } from './roster';
// The back half of the same pipeline — index merge, dedupe, collapse guard,
// freeze carry, players, report. Split from this file for legibility only;
// there is one parse and it is these two files.
import { writeReportAndData } from './parse-finish';
import type { AliasMatcher } from './roster';
import type {
  ChannelKey,
  CharProvenance,
  MatchSide,
  MatchVideo,
  RawVideoRecord,
  ReviewQueueItem,
  SlotOrder,
  SourcePins,
  VideoOverride,
} from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'raw');
const DATA = join(ROOT, 'data');

/**
 * A match record has to be long enough to BE a match. 120 seconds.
 *
 * Measured: 370 uploads across the tracked channels are under two minutes, and
 * they are highlight clips and #shorts cut FROM matches this archive already
 * holds in full — bestOfFgc alone posts 123 of them, on a second grammar
 * ("WOLFMAN VS FREZZER - HOKUTOMARU VS HOKUTOMARU #fatalfury"). Publishing both
 * would double-count the same match under two ids and inflate every usage
 * number. The floor is stated rather than inferred from the grammar because a
 * clip is a clip whatever its title looks like.
 *
 * The shortest genuine CotW match in the corpus is 202s (a 2-round Evo set), so
 * this floor has ~80 seconds of clearance and is nowhere near a real match.
 */
const MIN_MATCH_SEC = 120;

// ── decoration, stripped before parsing ─────────────────────────────────────
//
// Every one of these is a real, measured suffix or prefix. The DLC-day tag
// matters most: "▰ CotW DLC: Mr. Karate Day 1" NAMES A FIGHTER in the title
// suffix, so a free-span parser reads a third character out of it and the side
// counts stop making sense. 15 titles carry the Mr. Karate form alone.
//
// ORDER IS LOAD-BEARING, AND GETTING IT WRONG COST 820 RECORDS IN TESTING.
// The prefix strip runs FIRST. Several channels open with the marker —
// "Fatal Fury COTW Automattock Tizoc VS FrancoHwan Rock High Level Gameplay" —
// and a suffix pattern like /Fatal Fury CotW.*$/ happily matches that at index
// 0 and deletes the whole title. It then reads as `no-vs`, which looks exactly
// like a channel that stopped naming matchups: ffCotwReplays parsed 0 of 705
// and cotwReplays 17 of 139, with no error anywhere. Two defences, because one
// of them is a pattern nobody will re-check:
//   1. prefix first, then suffix;
//   2. `strip()` REFUSES any edit that empties the string or removes the last
//      `vs` — a decoration strip that takes the matchup with it is a bug by
//      definition, and reverting is always safer than proceeding.
const DECOR_SUFFIX = new RegExp(
  [
    String.raw`\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮]*\s*(?:FF\s*)?C[Oo]TW\s+DLC\s*:.*$`,
    String.raw`\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮]*\s*DLC\s*:.*$`,
    String.raw`\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮]+\s*(?:Replay\s*Match|Ranked\s*Match|High\s*Level|Early\s*Access|FF\s*CotW|Fatal\s*Fury|FATAL\s*FURY).*$`,
    String.raw`\s*\|\s*FATAL\s*FURY.*$`,
    String.raw`\s*[-–—]\s*(?:Replay|Ranked)\s*Match\b.*$`,
    String.raw`\s*[.!]\s*Fatal\s*Fury\s*C[Oo]TW\s*(?:Replay|Match)?!?.*$`,
    String.raw`\s*\|\s*Fatal\s*Fury\s*:?\s*City\s*of\s*the\s*Wolves.*$`,
    // Trailing house style with no decoration character in front of it — the
    // ffCotwReplays shape. Anchored to the END so it cannot eat a matchup.
    String.raw`\s+(?:FFCOTW\s+Replays?|High\s*Level\s*(?:Gameplay|Match|Replay|Games?|Action)|Level\s*Gameplay|Replay\s*Match|Ranked\s*Match)\s*!?\s*$`,
    String.raw`\s*\(?\[?4K\]?\)?\s*$`,
    String.raw`\s*\(?\[?(?:HD|1080p|60fps)\]?\)?\s*$`,
  ].join('|'),
  'iu',
);
const DECOR_PREFIX = new RegExp(
  [
    String.raw`^\s*(?:FF\s*Season\s*\d+|Season\s*\d+)\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|:\-–—]+\s*`,
    String.raw`^\s*FF\s*:?\s*C[Oo]TW\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|:\-–—]*\s*`,
    String.raw`^\s*FF\s+C[Oo]TW\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|:\-–—]*\s*`,
    String.raw`^\s*Fatal\s*Fury\s*:?\s*(?:C[Oo]TW|City\s*of\s*the\s*Wolves)\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|:\-–—!]*\s*`,
    String.raw`^\s*C[Oo]TW\s*[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|:\-–—]+\s*`,
    String.raw`^\s*High[\s\-‑]*Level[\s\-‑]*(?:Rank|Ranked|Mirror)?[\s\-‑]*(?:Games?|Match(?:es)?|Replay|Action)?\s*!?\s*[|:\-–—]*\s*`,
    String.raw`^\s*Replay\s*!?\s*[|:\-–—]*\s*`,
  ].join('|'),
  'iu',
);
/** "(#1 Ranked X)" / "#4 Ranked X" — a per-character leaderboard POSITION, not
 *  a ladder tier. Stripped and never turned into Side.rank; SF6 does the same.
 *  This is also why GameConfig.filters.rank stays off. */
const RANK_PREFIX = /^\s*#?\d+\s*(?:st|nd|rd|th)?\s*Ranked\s+/i;
/** The `vs` separator, in every spelling the corpus uses. */
const VS = /(?<![\p{L}\p{N}])(?:vs\.?|versus|×)(?![\p{L}\p{N}])/giu;
const PAREN = /[([]([^)\]]{1,60})[)\]]/g;

const countVs = (s: string): number => {
  VS.lastIndex = 0;
  return (s.match(VS) ?? []).length;
};

/** Apply a decoration pattern, but REFUSE the edit if it empties the string or
 *  drops the last `vs`. A strip that removes the matchup is never right, and
 *  the failure it causes is silent. */
const strip = (s: string, re: RegExp): string => {
  const next = s.replace(re, '').trim();
  if (!next) return s;
  if (countVs(s) > 0 && countVs(next) === 0) return s;
  return next;
};

/** Words that are decoration wherever they appear, used to stop the bare-path
 *  handle picker from choosing a house-style phrase over the player. Without
 *  this, "FrancoHwan Rock High Level Gameplay" yields the handle
 *  "High Level Gameplay" because it is the longest gap between roster spans. */
const DECOR_WORDS =
  /^(?:high|level|gameplay|match|matches|mirro|mirror|replay|replays|ranked|ranking|online|fatal|fury|cotw|ff|ffcotw|city|of|the|wolves|season|dlc|day|one|two|hd|4k|1080p|60fps|new|full|best|top|pro|vs|and|ft|ft\d|f\d|feat|early|access|show|dream|hard|snk|rankeada|rankeadas|ranqueada|ranqueadas|partidas|treining|training|guide|guides|combo|combos|especial|move|alcateia|lobos|sempre|\d{2,4})$/i;

/**
 * True when nothing in `s` could be somebody's name.
 *
 * Tokens are stripped to their alphanumerics first, so "(", "F/2" and
 * "FT10)" are judged on "", "f2" and "ft10" rather than on their punctuation —
 * without that, one stray bracket makes a pure-decoration fragment look like a
 * handle. A real handle has to contribute at least one token of two or more
 * alphanumerics that is not decoration; a single stray letter is not a player.
 */
const isDecorPhrase = (s: string): boolean => {
  const words = s
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  return !words.some((w) => w.length >= 2 && !DECOR_WORDS.test(w));
};

/**
 * Pick a handle from candidate fragments — the ONE place a handle is chosen,
 * used by both the structured and the bare path.
 *
 * A HANDLE THAT IS ENTIRELY DECORATION IS NOT A HANDLE. Applying this only to
 * the bare path published 118 dildilFatalFury records whose players were called
 * "show Match (", "FT2 rankeadas 2026 )" and "F/2)" — every count green, every
 * schema valid, and 118 player pages named after title furniture. That is
 * checklist 5e's "a variant that produces WRONG records rather than none is
 * invisible in every count", and the only thing that surfaced it was reading
 * the output instead of the totals.
 */
/**
 * A handle is at most MAX_HANDLE_WORDS words.
 *
 * MEASURED, not guessed: across 8,776 published sides, 80.5% of handles are one
 * word, 97.7% are two, 98.8% are three and 99.4% are four. Every single side
 * above four words was title decoration that had leaked into the handle —
 * "SOUTH TOWN O CHEFE DA MAFIA", "DREAM Match Hard Level Pai e Filho",
 * "SANDUNGERO 🪶Replay Match - FATAL FURY: CotW - 7/26". There is no player on
 * this corpus with a five-word handle, so the cap costs nothing real and turns
 * a whole class of silent garbage into an honest miss.
 */
const MAX_HANDLE_WORDS = 4;

const handleOf = (candidates: string[]): string =>
  candidates
    .map(clean)
    .filter((c) => c && !isDecorPhrase(c) && c.split(/\s+/).length <= MAX_HANDLE_WORDS)
    .sort((a, b) => b.length - a.length)[0] ?? '';

const clean = (s: string): string =>
  normalizeText(s)
    .replace(/[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮🔥👊😱]/gu, ' ')
    .replace(/[|｜]/g, ' ')
    .replace(/\s+/g, ' ')
    // NOTE: brackets are deliberately NOT trimmed here. Adding them stripped
    // the closing paren from every title that ends in one — "FRIEREN (#9 Ranked
    // Mr. Karate)" became "FRIEREN (#9 Ranked Mr. Karate", the paren no longer
    // matched, and the handle came out as "FRIEREN (#9 Ranked" on the platform's
    // single best channel. Stray brackets are handled where they actually
    // matter, in isDecorPhrase, which strips punctuation per token.
    .replace(/^[\s.\-–—:!,]+|[\s.\-–—:!,]+$/g, '')
    .trim();

interface ParsedSide {
  handle: string;
  characters: string[];
  slotOrder: SlotOrder;
}

/** One side segment → handle + characters, with no positional assumption. */
function parseSide(segment: string, matcher: AliasMatcher): ParsedSide | null {
  const seg = normalizeText(segment);
  const parens = [...seg.matchAll(PAREN)].map((m) => m[1]!);
  const outside = seg.replace(PAREN, ' ');

  // STRUCTURED: at least one paren. The characters are in whichever paren
  // resolves; if none does, they are outside and the paren holds something else
  // (a resolution tag, an episode number).
  if (parens.length > 0) {
    const inner = parens.map((p) => p.replace(RANK_PREFIX, '').trim());
    const fromParen = inner.flatMap((p) => matcher.ids(p));
    if (fromParen.length > 0) {
      // MORE THAN ONE paren resolving is ambiguous — which one names the
      // fighter? Never guessed; the caller routes it to the queue.
      const resolvingParens = inner.filter((p) => matcher.ids(p).length > 0);
      if (resolvingParens.length > 1) return null;
      const handle = handleOf(outside.split(/[▰⭐🌟🐺🥊🐦🪶💥⚡✨🔥👑🎮|｜]/u));
      if (!handle) return null;
      return { handle, characters: [...new Set(fromParen)], slotOrder: 'handle-first' };
    }
    // Characters outside, paren holds the handle — cotwReplays' reversed shape.
    const fromOutside = matcher.ids(outside);
    if (fromOutside.length > 0) {
      const handle = handleOf(inner);
      if (!handle) return null;
      return { handle, characters: fromOutside, slotOrder: 'chars-first' };
    }
    return null;
  }

  // BARE: no parens at all (ffCotwReplays, bestOfSnk, bestOfFgc). The spans are
  // the boundary; the gaps are the handle.
  const spans = matcher.find(seg);
  if (spans.length === 0) return null;
  const gaps: string[] = [];
  let prev = 0;
  for (const s of spans) {
    gaps.push(seg.slice(prev, s.start));
    prev = s.end;
  }
  gaps.push(seg.slice(prev));
  const handle = handleOf(gaps);
  if (!handle) return null;
  const ids: string[] = [];
  for (const s of spans) if (!ids.includes(s.id)) ids.push(s.id);
  // Which side of the character the handle sat on — telemetry only.
  const order: SlotOrder = spans[0]!.start === 0 ? 'chars-first' : 'handle-first';
  return { handle, characters: ids, slotOrder: order };
}

export interface ParseOutcome {
  ok?: [ParsedSide, ParsedSide];
  miss?:
    | 'no-marker'
    | 'before-floor'
    | 'live'
    | 'too-short'
    | 'no-vs'
    | 'vs-count'
    | 'no-char'
    | 'no-handle'
    | 'slot-ambiguous'
    | 'parallel-ambiguous';
}

/** Title → two sides, or a named miss. Pure; the caller owns policy. */
export function parseTitle(rawTitle: string, matcher: AliasMatcher): ParseOutcome {
  let t = normalizeText(stripHashtagRun(rawTitle));
  t = strip(t, DECOR_PREFIX); // PREFIX FIRST — see the note above DECOR_SUFFIX
  t = strip(t, DECOR_SUFFIX);
  t = clean(t);

  VS.lastIndex = 0;
  const parts = t
    .split(VS)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parts.length < 2) return { miss: 'no-vs' };

  if (parts.length === 2) {
    const a = parseSide(parts[0]!, matcher);
    const b = parseSide(parts[1]!, matcher);
    if (!a || !b) {
      const chars = matcher.ids(t).length;
      if (chars === 0) return { miss: 'no-char' };
      // A side that saw two resolving parens is a slot ambiguity, not a miss.
      const twoParens = [parts[0]!, parts[1]!].some(
        (p) =>
          [...p.matchAll(PAREN)].map((m) => m[1]!).filter((x) => matcher.ids(x).length).length > 1,
      );
      return { miss: twoParens ? 'slot-ambiguous' : a || b ? 'no-handle' : 'no-char' };
    }
    return { ok: [a, b] };
  }

  // ── PARALLEL LISTS: "A vs B – C vs D" ──────────────────────────────────
  // Two shapes exist and they are MIRRORS of each other:
  //   "Rock Howard vs Vox – LSRROZUHEBI vs Kakuzu"   characters first
  //   "WOLFMAN VS FREZZER - HOKUTOMARU VS HOKUTOMARU" handles first
  // Position cannot tell them apart. What CAN is which pair resolves against
  // the roster. If both pairs resolve — "Terry vs Rock – Terry vs Rock" — it is
  // genuinely ambiguous and goes to the queue rather than being guessed. That
  // is the checklist's "never align positionally" applied to a shape it does
  // not cover.
  if (parts.length === 3) {
    const SPLIT = /\s*[–—|]\s*|\s+[-]\s+/;
    const mid = parts[1]!.split(SPLIT);
    if (mid.length !== 2) return { miss: 'vs-count' };
    const groupA = [parts[0]!, mid[0]!];
    const groupB = [mid[1]!, parts[2]!];
    const aResolves = groupA.every((g) => matcher.ids(g).length === 1);
    const bResolves = groupB.every((g) => matcher.ids(g).length === 1);
    if (aResolves === bResolves) return { miss: 'parallel-ambiguous' };
    const chars = aResolves ? groupA : groupB;
    const handles = aResolves ? groupB : groupA;
    const sides: ParsedSide[] = [0, 1].map((i) => ({
      handle: handleOf([handles[i]!]),
      characters: matcher.ids(chars[i]!),
      slotOrder: 'parallel-lists' as SlotOrder,
    }));
    if (sides.some((s) => !s.handle)) return { miss: 'no-handle' };
    if (sides.some((s) => s.characters.length === 0)) return { miss: 'no-char' };
    return { ok: [sides[0]!, sides[1]!] };
  }

  return { miss: 'vs-count' };
}

// ── stale-raw guard (DATA ONLY — no filesystem metadata) ────────────────────
//
// Ported from the Tōkon repo, which learned it twice. Wall-clock age was a
// proxy and leaked; mtime was a proxy and leaked the same way, because
// `cp`, `git checkout` and a fresh clone all stamp a months-old dump as new.
//
// THE TEST READS ONLY DATA. A dump cannot contain an upload published after it
// was taken, so if the committed corpus holds a record for this intake NEWER
// than the newest upload anywhere in the dump, that record cannot have come
// from this dump and parsing would drop it. Both sides are publish timestamps
// written by YouTube and carried in the files themselves.
function assertRawIsFresh(id: ChannelKey, dump: RawVideoRecord[], committed: MatchVideo[]): void {
  let newestInDump = '';
  for (const r of dump) if (r.publishedAt > newestInDump) newestInDump = r.publishedAt;
  if (!newestInDump) return;

  let newestCommitted: MatchVideo | undefined;
  for (const v of committed) {
    if (v.intake !== id) continue;
    if (!newestCommitted || v.publishedAt > newestCommitted.publishedAt) newestCommitted = v;
  }
  if (!newestCommitted) return;
  if (newestCommitted.publishedAt <= newestInDump) return;

  throw new Error(
    [
      `raw/${id}.json is stale: the committed corpus holds an upload it cannot contain.`,
      ``,
      `  newest upload in the dump   ${newestInDump}`,
      `  newest committed record     ${newestCommitted.publishedAt}  ${newestCommitted.id}`,
      ``,
      `  A dump cannot contain an upload published after it was taken, so parsing`,
      `  now would drop that record and every one like it — and the next run would`,
      `  treat the smaller archive as the new baseline.`,
      ``,
      `  Refresh first:  npm run data:fetch`,
    ].join('\n'),
  );
}

const readJson = async <T>(name: string, fallback: T): Promise<T> => {
  const p = join(DATA, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(await readFile(p, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

/** NOT readJson: its catch-all fallback is wrong for this one file. `committed`
 *  is the baseline for the freeze carry, the index intake's add-only merge AND
 *  the collapse guard, so a truncated videos.json silently becoming [] would
 *  carry nothing, leave the add-only merge with nothing to preserve, and disarm
 *  the guard for every channel at once (`before > 0` false everywhere) — a
 *  total loss with every gate green. Absent is fine and means a first run;
 *  unreadable is a hard stop. */
async function readCommitted(): Promise<MatchVideo[]> {
  const p = join(DATA, 'videos.json');
  if (!existsSync(p)) return [];
  const text = await readFile(p, 'utf8');
  try {
    const v = JSON.parse(text) as MatchVideo[];
    if (!Array.isArray(v)) throw new Error('not an array');
    return v;
  } catch (err) {
    throw new Error('data/videos.json exists but will not parse — refusing to treat it as empty.', {
      cause: err,
    });
  }
}

async function main(): Promise<void> {
  await mkdir(DATA, { recursive: true });
  const characters = await loadCharacters();
  const matcher = buildAliasMatcher(characters);
  const overrides = await readJson<Record<string, VideoOverride>>('overrides.json', {});
  const committed = await readCommitted();
  const pins = await readJson<SourcePins>('source-pins.json', {});

  const built: MatchVideo[] = [];
  const misses: { ch: ChannelKey; kind: string }[] = [];
  const residue = new Map<string, number>();
  const queue: ReviewQueueItem[] = [];
  const perChannel = new Map<ChannelKey, { raw: number; marked: number; parsed: number }>();
  const rawSeen = new Map<string, string>();
  const slotOrders: string[] = [];

  // ── title-parsed channels ────────────────────────────────────────────────
  for (const ch of ACTIVE_CHANNELS) {
    const file = join(RAW, `${ch.id}.json`);
    if (!existsSync(file)) {
      console.warn(`  ⚠ raw/${ch.id}.json missing — skipping (run \`npm run data:fetch\`)`);
      perChannel.set(ch.id, { raw: 0, marked: 0, parsed: 0 });
      continue;
    }
    const dump = JSON.parse(await readFile(file, 'utf8')) as RawVideoRecord[];
    if (dump.length === 0) throw new Error(`raw/${ch.id}.json is empty — refusing to parse.`);
    assertRawIsFresh(ch.id, dump, committed);

    const floor = ch.preReleaseFrom ?? LAUNCH;
    let marked = 0;
    let parsed = 0;
    for (const v of dump) {
      rawSeen.set(v.id, `raw/${ch.id}.json`);
      const ov = overrides[v.id];
      if (ov?.exclude) continue;

      const inTitle = hasCotwMarker(v.title);
      const inDesc = ch.cotwSignal === 'titleOrDescription' && hasCotwMarker(v.description ?? '');
      if (!inTitle && !inDesc) {
        misses.push({ ch: ch.id, kind: 'no-marker' });
        continue;
      }
      marked++;
      const day = v.publishedAt.slice(0, 10);
      if (day < floor) {
        misses.push({ ch: ch.id, kind: 'before-floor' });
        continue;
      }
      if (v.liveBroadcastContent !== 'none') {
        misses.push({ ch: ch.id, kind: 'live' });
        continue;
      }
      if (v.durationSec && v.durationSec < MIN_MATCH_SEC) {
        misses.push({ ch: ch.id, kind: 'too-short' });
        continue;
      }

      const out = parseTitle(v.title, matcher);
      if (!out.ok) {
        misses.push({ ch: ch.id, kind: out.miss ?? 'no-char' });
        const r = matcher.residue(stripHashtagRun(v.title).replace(DECOR_SUFFIX, ''));
        if (r) residue.set(r, (residue.get(r) ?? 0) + 1);
        // Match-shaped footage the parser could not complete goes to a human,
        // never to a guess. An events-only channel's uploads land here by
        // construction: Evo names both handles and neither character.
        if (
          out.miss === 'no-char' ||
          out.miss === 'slot-ambiguous' ||
          out.miss === 'parallel-ambiguous'
        ) {
          queue.push({
            id: v.id,
            kind: out.miss === 'no-char' ? 'character-completion' : 'slot-ambiguous',
            channel: ch.id,
            title: v.title,
            publishedAt: v.publishedAt,
            durationSec: v.durationSec,
          });
        }
        continue;
      }

      const sides = out.ok.map<MatchSide>((s) => {
        const provenance: CharProvenance = {
          tier: 'title',
          tiers: ['title'],
          fromTitle: s.characters,
          slotOrder: s.slotOrder,
          complete: s.characters.length >= 1,
        };
        return {
          player: playerId(s.handle),
          handle: clean(s.handle),
          characters: s.characters,
          provenance,
        };
      });
      if (sides.some((s) => !s.player || s.characters.length === 0)) {
        misses.push({ ch: ch.id, kind: 'no-handle' });
        continue;
      }
      slotOrders.push(out.ok[0].slotOrder);

      parsed++;
      built.push({
        id: v.id,
        channel: ch.source,
        intake: ch.id,
        title: normalizeText(v.title),
        publishedAt: v.publishedAt,
        durationSec: v.durationSec,
        ...(v.viewCount ? { viewCount: v.viewCount } : {}),
        season: seasonForDate(day),
        patch: patchForDate(day),
        sides: [sides[0]!, sides[1]!] as [MatchSide, MatchSide],
      });
    }
    perChannel.set(ch.id, { raw: dump.length, marked, parsed });
  }

  console.log(`▶ title parse: ${built.length} record(s) from ${ACTIVE_CHANNELS.length} channel(s)`);
  await writeReportAndData({
    built,
    committed,
    overrides,
    pins,
    misses,
    residue,
    queue,
    perChannel,
    rawSeen,
    slotOrders,
    matcher,
    characters,
  });
}

main();
