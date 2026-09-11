// Pipeline-track types (plain node/tsx code — never enters the Nuxt graph, so
// the engine contract is restated where emitted shapes must mirror it, exactly
// like the SF6, Tekken, 2XKO and Tōkon pipelines do).

/** The Replay.source contract: doubles as GameConfig.sourceChannels[].id
 *  (badge/filter). Grouping into Online/Tournament chips lives ONLY in
 *  app/app.config.ts sourceGroups; group ids never appear in data or URLs.
 *
 *  `replayTheater` is ONE token covering both arms of the catalogue (see
 *  ChannelIndex). That is deliberate and it is the opposite of what the
 *  sibling repos do, because this catalogue is shaped differently — measured
 *  2026-09-03: 127 of 3,465 entries are tagged tournament SEGMENTS cut from 10
 *  VODs, and the other 3,338 are whole online videos, one entry each. Both
 *  arms are the same publisher making the same kind of statement, so they
 *  share a badge; what differs is the record SHAPE, and that is carried on the
 *  record (videoId/startSeconds), not in the token. */
export type SourceId =
  | 'fatalFuryReplays'
  | 'wolfFgc'
  | 'ffCotwReplays'
  | 'svcHighlights'
  | 'bestOfSnk'
  | 'bestOfFgc'
  | 'cotwReplays'
  | 'nomiiAegis'
  | 'dildilFatalFury'
  | 'evoEvents'
  | 'replayTheater';

/**
 * Per-YouTube-channel intake key: names raw/<key>.json and the coverage
 * report's rows. THE DEDUPE KEY (checklist step 2) — never the SourceId, which
 * two channels may one day deliberately share.
 *
 * 1:1 with SourceId today. The two unions stay separate anyway: the moment one
 * physical channel starts publishing two kinds of footage they stop being 1:1,
 * and keying dedupe on a shared public token means channel priority silently
 * never fires between the two while override protection leaks from one
 * channel's hand corrections to the other's. Both failures look exactly like
 * working dedupe. SF6's kingArena is the shape that would land here.
 */
export type ChannelKey =
  | 'fatalFuryReplays'
  | 'wolfFgc'
  | 'ffCotwReplays'
  | 'svcHighlights'
  | 'bestOfSnk'
  | 'bestOfFgc'
  | 'cotwReplays'
  | 'nomiiAegis'
  | 'dildilFatalFury'
  | 'evoEvents'
  | 'replayTheater';

/**
 * Which side segment of a title holds the characters.
 *
 * TELEMETRY AND A HINT, NEVER A DECISION. The parser extracts the roster span
 * wherever it sits and takes the remainder as the handle, so it never has to
 * CHOOSE an order — which matters because `cotwReplays` uses BOTH orders in
 * the same month ("Pida (Andy) vs. Rocky (Joe)" and "Kenshiro (Munahageman)
 * vs. Mr. Karate (Tyunidora)"), and `bestOfSnk`/`bestOfFgc` are
 * character-first throughout. Recorded so a channel changing its grammar shows
 * up as a shift in the mix instead of as silence.
 */
export type SlotOrder = 'handle-first' | 'chars-first' | 'parallel-lists' | 'bare';

/**
 * An INDEX source: a third-party catalogue that points AT video rather than
 * hosting it.
 *
 * THE COTW CATALOGUE IS TWO INTAKES WEARING ONE ENDPOINT, and the split is
 * clean on the `tag` field (measured 2026-09-03, whole catalogue, n=3,465):
 *
 *   tagged    127 entries / 10 videos  · 100% carry a `t=` offset · median 9
 *             segments per VOD. These are Tōkon's shape exactly.
 *   untagged  3,338 entries / 3,338 videos · 0.03% carry `t=`. One entry per
 *             WHOLE video — not segments at all.
 *
 * So the record id follows the ENTRY, not the source: composite
 * `${videoId}@${startSeconds}` when there is a real offset, the plain YouTube
 * id when there is not. The sibling repos state the composite rule
 * unconditionally because their catalogues are all-segments; applying it here
 * would give 3,338 records ids of `vid@0` that can never dedupe by id against
 * the same video arriving from a channel.
 *
 * (Reported upstream as a checklist gap — the checklist has no index-source
 * step at all, and the composite-id rule lives only in four copies of
 * fetch-theater.ts.)
 */
export interface ChannelIndex {
  /** Catalogue endpoint, paged with &page=N. */
  endpoint: string;
  /** The index's own token for this game, used as the ?game= query value.
   *  'cotw' — NOT our slug. `?game=ffcotw` returns HTTP 400 "Invalid game". */
  slug: string;
  /** The game string each ENTRY states about itself. Checked per entry, because
   *  ?game= is a filter someone else answers and a mistagged submission arrives
   *  looking exactly like a real one. */
  gameLabel: string;
  /** Entries per page. Theirs, not ours. */
  pageSize: number;
  /** ms between requests — politeness, not rate-limit avoidance. */
  pacingMs: number;
  /**
   * Untagged entries are ADMITTED as an online source, not just kept as a
   * witness. They are 96% of the catalogue and they are real matches.
   *
   * THE PRICE, MEASURED: of the 3,348 distinct videos the catalogue points at,
   * 1,075 no longer resolve — oEmbed 403 on 52/52 sampled, against a positive
   * control of 200 on live ids and 400 on a fabricated one. The decay is
   * age-graded (0.4% dead for 2026-08 rows, 55.6% for 2025-12), so this is a
   * property of the source rather than an outage. The YouTube join drops them
   * (a record whose VOD does not resolve is never built) and the report states
   * the RATE; it does not enumerate 1,075 lines the way the sibling does at
   * n≤5.
   */
  admitUntagged: boolean;
}

export interface ChannelConfig {
  /** Raw-dump key / report row (unique per YouTube channel). */
  id: ChannelKey;
  /** The source this channel's replays publish under. */
  source: SourceId;
  /** Display name (mirrors app/app.config.ts sourceChannels[].name). */
  name: string;
  /** YouTube channel id. Absent on an `index` source, which has no channel. */
  channelId?: string;
  /** The channel's uploads playlist (UU + channelId.slice(2), pinned — saves a
   *  quota unit per channel per run, and the id is stable where a handle is
   *  not). Absent on an `index` source. */
  uploadsPlaylist?: string;
  /** This intake is a third-party INDEX, not a YouTube channel. Its dump is
   *  built by scripts/fetch-theater.ts, its records are not built by a title
   *  parse, and data:fetch skips it. Mutually exclusive with channelId. */
  index?: ChannelIndex;
  /**
   * CRON-FETCHED, WITH A CARRY FALLBACK. raw/ is gitignored and the cron works
   * from a fresh checkout, so a run whose pull failed has no dump. When the
   * dump is ABSENT OR EMPTY the intake's committed records are CARRIED (the
   * mechanism `frozen` uses); when it has rows they are rebuilt and merged over
   * the committed set add-only. The carry pin lives in data/source-pins.json
   * because this kind of source GROWS — a constant in this file would be
   * friction that teaches people to skip the check.
   */
  cronFetchedWithCarry?: boolean;
  /**
   * Where the is-CotW game marker may appear. Default 'title'.
   *
   * MANDATORY ON THIS GAME, not optional: five of the nine online channels
   * publish another title as well, and KOF XV shares Terry, Andy, Rock,
   * B. Jenet, Mai, Geese, Blue Mary, Kim and Billy with this roster — so an
   * ungated parse files KOF matches as CotW cleanly, with every count green.
   * Measured shares: fatalFuryReplays 5,212 KOF XV uploads against 1,217 CotW,
   * bestOfFgc 1,205 SF6 + 133 Tekken + 18 Tōkon against 429 CotW.
   */
  cotwSignal?: 'title' | 'titleOrDescription';
  /** This channel is ingested for EVENT FOOTAGE ONLY: a title carrying no
   *  event-brand signal is a miss (`not-an-event`), not a record. */
  eventsOnly?: boolean;
  /**
   * This channel's date floor, in place of the global LAUNCH gate.
   *
   * CotW ran two public betas before release (OBT1 from 2025-02-20, OBT2 from
   * 2025-03-26) and the catalogue's own oldest row is 2025-02-22 — real
   * competitive footage on a pre-release build, filed under the PRE_RELEASE era
   * so it has somewhere to live. Only meaningful together with a pre-release
   * era in patches.ts: emit throws on a patch token no boundary accounts for,
   * so a record admitted here with no era to file under fails loudly rather
   * than shipping undated.
   */
  preReleaseFrom?: string;
  /** A channel that stopped publishing this game. Its committed records are
   *  still real and still play at their URLs, so they are CARRIED FORWARD
   *  byte-stable rather than pruned; fetch skips it entirely. `records` is a
   *  hard-asserted pin — the committed data file is both the source and the
   *  target of the carry, so one bad run would poison the next run's reference
   *  permanently and silently. Editing the pin IS the deliberate-prune
   *  mechanism, and it shows up in review. (Checklist step 7.) */
  frozen?: { since: string; reason: string; records: number };
}

/** One upload as fetched from the YouTube Data API (raw/<key>.json). */
export interface RawVideoRecord {
  id: string;
  /** Intake channel, NOT the source — parse maps it via CHANNELS. */
  channel: ChannelKey;
  title: string;
  description: string;
  publishedAt: string; // ISO
  /** ISO8601 duration decoded to seconds; 0 = live/upcoming/unknown. */
  durationSec: number;
  viewCount?: number;
  /** 'none' for normal VODs; 'live'/'upcoming' are excluded by parse. */
  liveBroadcastContent: string;
  tags?: string[];
}

/**
 * One record in raw/replayTheater.json — an index entry already joined to its
 * VOD's YouTube metadata. Extends RawVideoRecord so the dump reads like any
 * other, but the fields below are what the record is actually BUILT from:
 * nothing here is recovered by parsing a title.
 */
export interface TheaterRawRecord extends RawVideoRecord {
  /** `${videoId}@${startSeconds}` for a tagged SEGMENT; the plain YouTube id
   *  for an untagged whole-video entry. See ChannelIndex for why the shape
   *  follows the entry rather than the source. */
  id: string;
  /** The catalogue's own entry id. Provenance, and the fetch resume key. */
  theaterId: number;
  /** The YouTube id this record lives in or is. */
  videoId: string;
  /** Offset into videoId, in seconds. Absent when the entry carried no `t=` —
   *  the record is then the whole video, which is the engine's own reading of
   *  a missing startSeconds. */
  startSeconds?: number;
  /** The catalogue's event tag, '' on the untagged arm. */
  tag: string;
  /** The VOD's own uploader, for the report. */
  uploader: string;
  /** [side0, side1] handles, exactly as the catalogue spells them — sponsor
   *  prefixes intact, for the parser to strip. */
  players: [string, string];
  /** [side0, side1] character names, exactly as the catalogue spells them.
   *  CotW is 1v1 so a side is normally 1 long — but the length is OBSERVED,
   *  never assumed: the catalogue carries four columns per side and exactly one
   *  entry in 3,465 uses a second (a counter-pick inside a set). */
  characters: [string[], string[]];
}

/**
 * Which stage produced a side's characters. Ordered weakest → strongest.
 *
 * THREE MEMBERS, NOT FIVE, AND THAT IS A MEASUREMENT NOT A SHORTCUT. CotW's
 * titles state both characters on 93.9–99.7% of the marked uploads across the
 * five clean channels, so there is no footage-extraction track in this repo at
 * all — the surface the checklist calls "the most defect-dense on the platform"
 * is simply not needed here.
 *
 * The DESCRIPTION tier was measured before being declined (checklist 5b says
 * look for a cheaper text tier before building an extractor — this is that
 * look, done and recorded): of every CotW-marked upload whose title does not
 * yield two characters, descriptions name two roster fighters on 84.2% for
 * `cotwReplays` (16 records), 12.5% for `evoEvents`, 4.3% for `nomiiAegis`,
 * 1.5% for `dildilFatalFury` and 0.0% for `bestOfFgc`. Sixteen records did not
 * justify a parser stage with its own alignment hazards; those uploads go to
 * the review queue instead, where a person answers. Re-measure before adding
 * a channel — if a big channel starts writing prose benches this flips.
 *
 * THE ORDER OF THIS UNION IS DOCUMENTATION, NOT CONTROL FLOW. Precedence is
 * the order of application in code, and nothing ever downgrades a side.
 */
export const CHAR_TIERS = ['title', 'index', 'human'] as const;

export type CharTier = (typeof CHAR_TIERS)[number];

/**
 * Per-side character provenance — the answer to "how did this record get its
 * characters", recorded at the moment it is decided (checklist 8b).
 *
 * SUBSTRATE ONLY. The engine's `Side` is { player, players?, characters, rank? }
 * with no `extra` bag. scripts/emit.ts projects sides field-by-field rather
 * than spreading, so provenance cannot leak into replays.json by construction;
 * emit asserts that anyway.
 */
export interface CharProvenance {
  /** The tier that produced the FINAL list (the strongest that contributed). */
  tier: CharTier;
  /** Every tier that contributed, in the order applied. */
  tiers: CharTier[];
  /** Ids the TITLE stated. Always present on a title-parsed record. An index
   *  intake parses no title — its title is synthesized FROM the catalogue's own
   *  character fields, so citing it as a source would be circular — and those
   *  sides carry `[]` here. */
  fromTitle: string[];
  /** Ids a third-party INDEX stated for this side, as discrete fields. No
   *  alignment step applies: the catalogue names the side. */
  fromIndex?: string[];
  /** Ids a PERSON entered, resolving a review-queue item. Authoritative over
   *  every automatic tier: a human read REPLACES a side's list. */
  fromHuman?: string[];
  /** Which slot order this side's title segment used. Telemetry. */
  slotOrder?: SlotOrder;
  /** Tiers disagreed — a title-stated id the index contradicts, or vice versa.
   *  The record is queued for review, WITHHELD rather than published: a union
   *  of two disagreeing tiers asserts a matchup neither source stated. */
  conflict?: boolean;
  /** characters.length >= charactersPerSide (1 here), i.e. the side is known.
   *  `>=` and not `===`: a set whose loser counter-picked legitimately lists
   *  every character used, and such a side is complete, not over-long. */
  complete: boolean;
}

/** One parsed side: one pilot, and every character they fielded.
 *
 *  CotW is 1v1, so a normal side holds exactly ONE. It is still a union of
 *  1..N in first-appearance order, not a fixed-length tuple:
 *   · MORE than 1 is a counter-pick inside a set — legal data, counted in
 *     characterUsage. There is no pairing surface on a 1v1 game, so the
 *     sibling's C(n,2) fabrication hazard does not arise here.
 *   · ZERO is the only failure, and emit hard-fails on it. */
export interface MatchSide {
  /** Player id (slug of handle). */
  player: string;
  /** Display handle, nicest casing seen. */
  handle: string;
  /** Roster character ids (data/characters.json), 1..N, first-appearance order. */
  characters: string[];
  /** How this side's characters were sourced. Substrate only — never emitted. */
  provenance: CharProvenance;
}

/** The committed parse substrate (data/videos.json): only structurally parsed
 *  matches enter it; misses are reported, not stored. */
export interface MatchVideo {
  id: string;
  /** Resolved source (Replay.source), not the intake channel. */
  channel: SourceId;
  /** The INTAKE channel — the dedupe key (checklist step 2). */
  intake: ChannelKey;
  title: string;
  publishedAt: string;
  durationSec: number;
  viewCount?: number;
  /** Balance era token — a SEASON here, resolved from the date boundaries.
   *  Never inferred from the major version: S2 opened 2026-01-22 on Ver.1.7.2
   *  and Ver.2.0.1 landed mid-season on the anniversary. */
  season: number;
  /** The vendor patch token in force on `publishedAt`, e.g. '1.7.2'. */
  patch: string;
  /** The YouTube id, when `id` is not it. */
  videoId?: string;
  /** Where this record's footage starts inside `videoId`, in seconds. Absent
   *  means the whole video. */
  startSeconds?: number;
  /** THE BADGE LABEL (engine v0.13.0). `event` is the catalogue's event tag —
   *  what the set was actually played at. `channelName` is the VOD's uploader,
   *  set only where it differs from the source's configured name, which is
   *  exactly the index intake: one token covering many uploaders. The engine
   *  prints the first one present INSTEAD of the source name, so this intake's
   *  untagged arm names whoever published the video rather than claiming a
   *  tournament that does not exist. Both absent on every channel record. */
  event?: string;
  channelName?: string;
  sides: [MatchSide, MatchSide];
}

/** data/source-pins.json — the carry pin for every `cronFetchedWithCarry`
 *  intake, keyed by ChannelKey. Written by every rebuilding run, hard-asserted
 *  by every carry, and refused if a rebuild would move it DOWN. */
export type SourcePins = Partial<Record<ChannelKey, number>>;

/** data/players.json entry (mirrors the engine's Player). */
export interface PlayerRecord {
  id: string;
  handle: string;
  featured?: boolean;
  extra?: { aliases?: string[] };
}

/** data/characters.json entry (mirrors the engine's Character). `aliases` is
 *  the shared search/parse key — the app's search vocabulary and the parser's
 *  vocabulary are the same data, which is why a new nickname only has to be
 *  added once. */
export interface CharacterRecord {
  id: string;
  name: string;
  imgPortrait: string;
  imgSplash?: string;
  accent: string;
  extra?: { aliases: string[]; [k: string]: unknown };
}

/** Per-video manual corrections (data/overrides.json). A hand verdict beats
 *  every automatic tier. */
export type VideoOverride = Partial<Pick<MatchVideo, 'season' | 'patch' | 'sides' | 'channel'>> & {
  /** Free-text provenance note. JSON has no comment syntax and this file is
   *  read by humans as often as by code, so an entry says how it got there. */
  '//'?: string;
  exclude?: boolean;
  /** Who resolved this. Load-bearing for dedupe: only HAND-AUTHORED `sides`
   *  overrides protect a record from dedupe (checklist step 2), so the priority
   *  check must test THIS field rather than the mere presence of `sides`. */
  resolvedBy?: 'human';
};

/** One pending item in data/review-queue.json — footage the pipeline refuses to
 *  publish. REGENERATED by every parse run (derived state: resolutions live
 *  solely in overrides.json, so the queue self-clears as verdicts land).
 *  Pending items NEVER reach videos.json or replays.json.
 *
 *  Kinds:
 *   'character-completion' — match-shaped footage whose characters no text
 *                            states. Every parsed `evoEvents` upload lands here
 *                            by construction: its grammar names both handles
 *                            and neither character.
 *   'source-classification'— a title carrying signals for two games, or an
 *                            events-only channel's upload with no event brand.
 *   'index-conflict'       — the catalogue and the uploader's own title
 *                            disagree about a side. Held, not merged.
 *   'slot-ambiguous'       — a side segment carried 2+ parens, so which one
 *                            names the character is a guess. Never guessed. */
export interface ReviewQueueItem {
  id: string;
  kind: 'character-completion' | 'source-classification' | 'index-conflict' | 'slot-ambiguous';
  channel: ChannelKey;
  title: string;
  publishedAt: string;
  durationSec: number;
  /** Handles the title DID state, canonicalised against players.json.
   *  Pre-fills the review form so a reviewer answers only the characters — and,
   *  more importantly, stops a verdict minting a second player page under a
   *  different spelling of an existing player. */
  handles?: [string, string];
  /** For 'index-conflict': what each tier claimed, so the reviewer sees the
   *  disagreement rather than re-deriving it. */
  conflict?: { side: 0 | 1; fromTitle: string[]; fromIndex: string[] };
}

/** One balance era (a named Season). */
export interface SeasonBoundary {
  season: number;
  start: string; // ISO date, inclusive
  end: string | null; // exclusive; null = open (current season)
  confirmed: boolean;
  /** Facet-parent display label. Defaults to `Season ${season}`, which reads
   *  wrong for the pre-release era — "Season 0" names a balance era the vendor
   *  never shipped. Set it there, and on the named seasons whose marketing
   *  title is the thing players say ("Legends Unleashed"). */
  label?: string;
  note?: string;
}

/**
 * One released CotW patch.
 *
 * THE VENDOR PUBLISHES A VERSION STRING and it is `Ver.X.Y.Z`, so unlike Tōkon
 * this game gets checklist step 4 proper rather than amendment 4b. The source
 * is SNK's OWN news CMS (`snk-corp.co.jp/fetch_news_en.php?type=news_os`,
 * filtered to the `PATCH` tag), NOT the Steam news feed: measured 2026-09-03,
 * Steam carries four update-titled posts and stops at Ver 1.1.7 (2025-06-03),
 * while the CMS carries all 25 and is current to Ver.3.1.3 the same day. A
 * checker polling the truncated feed prints a tick forever.
 *
 * NEVER INVENT A VERSION TO FILL A GAP. The vendor announced no 1.3.0, 1.7.0,
 * 1.7.1, 2.0.0, 2.1.0, 2.1.1, 3.1.0 or 3.1.1. Those numbers do not appear here.
 */
export interface PatchBoundary {
  /** Vendor version string, e.g. '1.7.2' — unique, and never an era token. */
  version: string;
  /** ISO release day, inclusive (the vendor's own publication date). */
  start: string;
  /** Canonical vendor patch-notes URL. Every versioned row has one; it is the
   *  provenance the checklist asks for and the thing to re-read when a row is
   *  questioned. */
  url?: string;
  /** Where the vendor announced it. An undocumented row cannot hide. */
  announcedOn: 'snk-news' | 'steam' | 'launch' | 'obt';
  /** Short community-facing hint, surfaced beside the child in the dropdown. */
  note?: string;
}

/** A patch plus its computed window and resolved era. */
export interface PatchWindow extends PatchBoundary {
  /** exclusive end: the next patch's start within the era, else the era's end,
   *  else null (open). Computed, never authored. */
  end: string | null;
  season: number;
}

/** A time-bomb that has gone off: something the data can tell us is due, rather
 *  than something a human has to remember. See scripts/expiries.ts. */
export interface Expiry {
  kind: 'unreleased-character' | 'unconfirmed-season' | 'stale-patch-table';
  /** roster id, `S${n}` for a season row, or 'patch-table' */
  id: string;
  /** the ISO date that has now passed */
  date: string;
  /** what a human must do to clear it */
  action: string;
}
