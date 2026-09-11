/**
 * The source channels — checklist step 1, done before a fetcher existed.
 *
 * Eleven intakes: ten YouTube channels and one third-party INDEX. All of them
 * are ordinary daily channels; there is no backfill-once mechanism on this
 * platform and never was. The first cron run IS the backfill, which is why the
 * cron-preservation gate (a simulated daily run proving untouched channels
 * survive) is the one that matters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY MEASUREMENT BELOW WAS TAKEN 2026-09-03 against the live corpus
 * (32,376 uploads swept across 18 candidate channels; 7,586 CotW-marked).
 * "parse" is the share of a channel's CotW-marked uploads from which both
 * sides resolve to exactly one roster character.
 *
 * ARRAY ORDER IS DEDUPE PRECEDENCE. Reordering changes which copy of a
 * cross-posted match survives, so the order is argued, not incidental:
 *
 *   1 fatalFuryReplays  1,217 CotW · 99.7% parse. Richest metadata on the
 *                       platform for this game: full character names AND the
 *                       player's live leaderboard position ("#1 Ranked
 *                       B.Jenet"). Highest volume of any single contributor.
 *   2 wolfFgc           1,118 · 97.5%. Full names, dated suffix, and the
 *                       fastest-publishing channel right now (4.37/day over 30
 *                       days). Second only on grammar richness.
 *   3 svcHighlights       662 · 98.3%. Same grammar family as wolfFgc but
 *                       writes SHORT aliases ("CR7", "Dong Hwan", "Jae Hoon"),
 *                       so its rows depend on the alias table where 1 and 2 do
 *                       not. Ranked below them for exactly that reason.
 *   4 ffCotwReplays       705 · 93.9%. NO PARENTHESES — "HANDLE Char VS HANDLE
 *                       Char" — so the handle/character boundary is inferred
 *                       from roster spans rather than read off punctuation.
 *                       Correct far more often than not, and still the weakest
 *                       structure among the clean channels.
 *   5 bestOfSnk           211 · 97.6%. CHARACTER-FIRST ("MR BIG 🐺 FDYNASTY VS
 *                       HMMA 🐺 DUCK KING"). Clean, but low volume.
 *   6 cotwReplays         138 · 86.2%. Five title shapes and BOTH slot orders
 *                       in the same month. Also the U+202F carrier: 43 of its
 *                       138 titles use a narrow no-break space, 19 of them with
 *                       no ASCII space at all.
 *   7 nomiiAegis          320 · 64.1%. A player's own commentary channel —
 *                       36% of its uploads are editorial titles with no "vs"
 *                       at all ("World Rank #1 Geese Is A NIGHTMARE !!"), which
 *                       are misses, not records.
 *   8 bestOfFgc           429 · 70.2%. Four games on one channel (1,205 SF6,
 *                       133 Tekken, 18 Tōkon) and a second grammar for its
 *                       122 shorts. Same operator family as bestOfSnk.
 *   9 dildilFatalFury   1,704 marked · 33.1% parse. ONE PLAYER'S OWN uploads,
 *                       in Portuguese, at ~11/day — combo guides and training
 *                       clips mixed in with real ranked sets. Ranked last of
 *                       the online channels: lowest specificity, noisiest
 *                       grammar, and its matches are its owner's own, so a
 *                       cross-post tie should resolve to whoever else has it.
 *                       NOTE FOR THE README: this channel is ~10% of the
 *                       published corpus and one handle appears on every one of
 *                       its records, which skews the player leaderboard. That
 *                       is real footage and it stays, but it is stated.
 *  10 evoEvents            72 · 0% parse BY CONSTRUCTION — "Evo 2026: Fenritti
 *                       vs K-TOP | FATAL FURY: City of the Wolves | Winners
 *                       Semifinals" names both handles and neither character.
 *                       Every parsed row lands in the review queue as
 *                       character-completion. CotW was an Evo 2026 MAIN GAME
 *                       (Top 24, Top 8, Grand Final, its own intro video), so
 *                       this is the anchor of the Tournament group.
 *  11 replayTheater      the INDEX. Last, deliberately — array order is dedupe
 *                       precedence and lowest is right for a source that
 *                       re-indexes other people's uploads. Measured: 67.7% of
 *                       its 3,348 videos are already ours from channels 1 and
 *                       2, posted the SAME DAY in 98.7% of cases.
 *
 * THE DEDUPE KEY IS `id` (the intake ChannelKey), never `source`. They are 1:1
 * today and the types are still kept distinct, because the moment one physical
 * channel starts publishing two kinds of footage they stop being 1:1 — and
 * keying dedupe on a shared public token means channel priority silently never
 * fires between the two, while override protection leaks from one channel's
 * hand corrections to the other's. Both failures look exactly like working
 * dedupe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PRE_RELEASE } from './patches';
import type { ChannelConfig } from '../types/index';

/** The uploads playlist is always 'UU' + channelId.slice(2). Pinned rather than
 *  looked up: it saves a quota unit per channel per run, and the id is stable
 *  where a handle is not. */
const uploads = (channelId: string) => `UU${channelId.slice(2)}`;

export const CHANNELS: ChannelConfig[] = [
  {
    id: 'fatalFuryReplays',
    source: 'fatalFuryReplays',
    name: 'Fatal Fury Replays',
    channelId: 'UC3q-Hf_qmSiXhvZqoepRaIA',
    uploadsPlaylist: uploads('UC3q-Hf_qmSiXhvZqoepRaIA'),
    // "FF COTW ▰ MIKADO (Rock) vs JOYSOL (Gato) ▰ High Level Gameplay"
    // The channel's own name is "FATAL FURY REPLAYS ▰ City of the Wolves
    // (+KOF XV)" — it advertises the second game in its title. 5,212 of its
    // 6,428 uploads are KOF XV, and KOF XV's roster shares Terry, Andy, Rock,
    // B. Jenet, Mai, Geese, Blue Mary, Kim and Billy with this one. Without the
    // marker gate those parse cleanly and become CotW matches.
    cotwSignal: 'title',
    preReleaseFrom: PRE_RELEASE,
  },
  {
    id: 'wolfFgc',
    source: 'wolfFgc',
    name: 'Wolf FGC',
    channelId: 'UC38zYum58FDDifYjjWArZ6w',
    uploadsPlaylist: uploads('UC38zYum58FDDifYjjWArZ6w'),
    // "FF:CotW 🐺 KAISER (Terry Bogard) vs SHARK URIEN (Kain)⭐Replay Match -
    //  FATAL FURY: CotW - 1/26" — the leading emoji varies (🐺/🥊/🐦) and so
    // does the separator (⭐/🪶). Neither is load-bearing; the parser reads the
    // parens and never the decoration.
    // 651 KOF XV uploads share the channel, and this is the channel whose KOF
    // shorts carry "#cotw" in their hashtag run — see MARKER below.
    cotwSignal: 'title',
    preReleaseFrom: PRE_RELEASE,
  },
  {
    id: 'svcHighlights',
    source: 'svcHighlights',
    name: 'SVC Highlights',
    channelId: 'UCqivrb-hjN1p3dc_kbN2E1Q',
    uploadsPlaylist: uploads('UCqivrb-hjN1p3dc_kbN2E1Q'),
    // "FF:CotW 🌟 KULA (CR7) vs SCOOBY (Krauser)🌟Replay Match - FATAL FURY:
    //  City of the Wolves!" — short aliases throughout.
    cotwSignal: 'title',
    preReleaseFrom: PRE_RELEASE,
  },
  {
    id: 'ffCotwReplays',
    source: 'ffCotwReplays',
    name: 'Fatal Fury COTW Replays',
    channelId: 'UC6wv1ogElo-czzCdEXGUGJw',
    uploadsPlaylist: uploads('UC6wv1ogElo-czzCdEXGUGJw'),
    // "Fatal Fury COTW Automattock Tizoc VS FrancoHwan Rock High Level
    //  Gameplay" — no punctuation between handle and character at all. This is
    // the channel that makes span extraction mandatory rather than convenient:
    // there is no separator to split on, so the roster spans ARE the boundary
    // and everything they do not cover is the handle.
    cotwSignal: 'title',
    preReleaseFrom: PRE_RELEASE,
  },
  {
    id: 'bestOfSnk',
    source: 'bestOfSnk',
    name: 'The Best Of SNK',
    channelId: 'UCnQ7BKrIRx9cmM_nMOejblQ',
    uploadsPlaylist: uploads('UCnQ7BKrIRx9cmM_nMOejblQ'),
    // "MR BIG 🐺 FDYNASTY VS HMMA 🐺 DUCK KING | FATAL FURY COTW" — the
    // character comes FIRST on both sides. The parser never chooses a slot
    // order; it finds the roster span and takes the rest.
    cotwSignal: 'title',
  },
  {
    id: 'cotwReplays',
    source: 'cotwReplays',
    name: 'City Of The Wolves Replays',
    channelId: 'UCW_Bk02mHnDzcWiCUQyyV5w',
    uploadsPlaylist: uploads('UCW_Bk02mHnDzcWiCUQyyV5w'),
    // FIVE SHAPES, BOTH ORDERS, on 138 uploads:
    //   "Fatal Fury COTW High Level Games! Jacvinjack (Marco) vs. choi2k2 (Kain). (4K)"
    //   "Fatal Fury COTW — Kenshiro (Munahageman) vs. Mr. Karate (Tyunidora) [4K]"   ← reversed
    //   "Fatal Fury COTW | chen1234 (Billy) vs Kuu (Marco)"
    //   "Dracov (Tizoc) vs. Lintu (Ken). Fatal Fury COTW Replay! (4K)"
    //   "Rock Howard vs Vox – LSRROZUHEBI vs Kakuzu | Fatal Fury: CotW …"           ← two vs
    // Both orders appear in the SAME month, which is the whole argument for
    // resolving the slot by what the roster matches rather than by position.
    // Also the U+202F channel: normalization runs before any matching.
    cotwSignal: 'title',
  },
  {
    id: 'nomiiAegis',
    source: 'nomiiAegis',
    name: 'NoMii Aegis',
    channelId: 'UCex2YwyWa8hFDWZh4C3SdBw',
    uploadsPlaylist: uploads('UCex2YwyWa8hFDWZh4C3SdBw'),
    // Mixed: "FF Season 2 ▰ Goodman1457 (JOE) VS NeloAlchemist (GATO) ▰ …"
    // parses; "Season 2 ▰ World Rank #1 Jae Hoon Is Back Ft. SoSickNASHFAN ▰ …"
    // does not, and must not — it names one fighter and one handle and states
    // no matchup. 115 of 320 uploads carry no "vs" at all.
    cotwSignal: 'title',
  },
  {
    id: 'bestOfFgc',
    source: 'bestOfFgc',
    name: 'The Best of FGC',
    channelId: 'UCw9RSiQOWexVoX3ntFfVBSg',
    uploadsPlaylist: uploads('UCw9RSiQOWexVoX3ntFfVBSg'),
    // Character-first like bestOfSnk, but FOUR games share the channel and its
    // shorts use a second grammar entirely:
    //   "WOLFMAN VS FREZZER - HOKUTOMARU VS HOKUTOMARU #fatalfury #cotw …"
    // — handles first, characters second, two "vs" separators. Those are 122 of
    // its 429 CotW-marked uploads and they are DROPPED rather than guessed: the
    // shape is ambiguous with the "CHAR vs CHAR – HANDLE vs HANDLE" shape on
    // cotwReplays, and guessing wrong swaps every player and character on the
    // record while looking perfectly normal.
    cotwSignal: 'title',
  },
  {
    id: 'dildilFatalFury',
    source: 'dildilFatalFury',
    name: 'Dildil Fatal Fury',
    channelId: 'UCT9pEREfrdP5n8cNiGZeP9Q',
    uploadsPlaylist: uploads('UCT9pEREfrdP5n8cNiGZeP9Q'),
    // "FATAL FURY: CotW (Geese Vs Mr Karate) DildilFatalFury Vs ViinnAliXoFM
    //  FT2" — Portuguese, and two thirds of the channel is combo guides,
    // training footage and HAYPERDEFENSE tutorials that carry no matchup. Those
    // fail the shape gate and are counted as misses, which is correct; only the
    // ranked sets become records.
    cotwSignal: 'title',
  },
  {
    id: 'evoEvents',
    source: 'evoEvents',
    name: 'Evo',
    channelId: 'UCWI626ZNdqM5tOlctPUTW2g',
    uploadsPlaylist: uploads('UCWI626ZNdqM5tOlctPUTW2g'),
    // A general FGC event channel — 2,764 uploads, 72 of them CotW. The gate
    // has to read the description too: several uploads name the game only in
    // the description, and the inverse error (a title gate reading 0 of a
    // first-party archive) is the one the checklist records as costing 1,025
    // records on another game.
    cotwSignal: 'titleOrDescription',
    eventsOnly: true,
  },
  {
    /**
     * THE INDEX SOURCE. replaytheater.app is a fan-curated match catalogue: it
     * hosts no video, it points AT video. See types/index.ts ChannelIndex for
     * the measurement that shaped this intake — briefly:
     *
     *   · 3,465 entries. 127 are TAGGED tournament segments across 10 VODs
     *     (100% carry a t= offset, median 9 per VOD); 3,338 are UNTAGGED whole
     *     videos, one entry each (0.03% carry an offset).
     *   · 67.7% of its videos are already ours from fatalFuryReplays and
     *     wolfFgc, posted the same day. On those it is a WITNESS, not a source,
     *     and a near-dependent one — it agrees because it read the same title.
     *   · 1,075 of its 3,348 videos no longer resolve on YouTube. The join
     *     drops them and the report states the rate.
     *
     * NO channelId, NO uploadsPlaylist, NO cotwSignal: there is no channel and
     * no title to gate. The game is checked per ENTRY against `gameLabel`,
     * because ?game= is a filter the catalogue answers, not one we control.
     */
    // `name` is kept in lockstep with app/app.config.ts by hand — two TypeScript
    // tracks, no compiler sees both. Since engine v0.13.0 it is a FALLBACK: the
    // badge prints each record's own `event` or `channelName` first.
    id: 'replayTheater',
    source: 'replayTheater',
    name: 'Tournament',
    index: {
      endpoint: 'https://replaytheater.app/api/matches',
      // THEIR slug, not ours. `?game=ffcotw` returns HTTP 400 "Invalid game".
      slug: 'cotw',
      gameLabel: 'Fatal Fury: City of the Wolves',
      pageSize: 50,
      pacingMs: 1200,
      admitUntagged: true,
    },
    cronFetchedWithCarry: true,
    // The catalogue's oldest CotW row is 2025-02-22, inside Open Beta Test 1.
    // 105 of its entries predate launch; without this floor they vanish.
    preReleaseFrom: PRE_RELEASE,
  },
];

export const CHANNEL_BY_ID = new Map(CHANNELS.map((c) => [c.id, c]));

/**
 * THE GAME-MARKER GATE (checklist step 3).
 *
 * ── WHY THE HASHTAG RUN IS STRIPPED FIRST ─────────────────────────────────
 * The checklist says "gate on a marker the other game cannot carry". On this
 * corpus the other game DOES carry it: wolfFgc tags its KOF XV shorts with
 * "#cotw", and LA GEMA tags KOF XV combo clips the same way. Measured on the
 * live corpus, 164 titles contain the marker ONLY inside a trailing hashtag
 * run, and 8 of those name another game outright:
 *
 *   KOF XV - "😱100% combo Ash Crimson!!!" - Combo made by (TW) HUEI
 *            - #shorts #evo2025 #cotw #kofxv
 *   Ryo CRAZY 850 HP Combo & K' | The King of Fighters XV KOF 15 Replays FGC
 *            #kof #kofxv #kof2002 #cotw
 *
 * Eight records is small; eight records of ANOTHER GAME published under this
 * one is the failure the step exists to prevent, and it arrives looking
 * completely normal. So the refinement is: the marker must be LOAD-BEARING in
 * the title, not decorative in a hashtag run. Strip trailing hashtags, then
 * look for the marker.
 * (Reported upstream as a checklist amendment.)
 *
 * ── WHY "FATAL FURY" ALONE IS NOT THE MARKER ──────────────────────────────
 * The series is 30 years old and its back catalogue is live on these channels:
 * Garou: Mark of the Wolves, Real Bout, Fatal Fury Special. Matching the SERIES
 * name reads 177 SNK OFFICIAL uploads and 115 dildilFatalFury uploads that are
 * not this game. The marker is the SUBTITLE — CotW / City of the Wolves —
 * never the series.
 */
const HASHTAG_RUN = /(?:(?:^|\s)#[\p{L}\p{N}_]+)+\s*$/u;

/** Remove the trailing hashtag block, repeatedly (a title can end in several
 *  runs separated by other punctuation). */
export function stripHashtagRun(title: string): string {
  let out = title.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(HASHTAG_RUN, '').trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** The CotW subtitle in the spellings the corpus actually uses. Deliberately
 *  NOT the series name. */
export const COTW_MARKER =
  /(?:\bFF\s*:?\s*C\s*O\s*T\s*W\b|\bCOTW\b|CITY\s+OF\s+THE\s+WOLVES|餓狼伝説\s*City\s*of\s*the\s*Wolves)/iu;

/** Does this text carry a load-bearing CotW marker? */
export function hasCotwMarker(text: string): boolean {
  return COTW_MARKER.test(stripHashtagRun(text ?? ''));
}

/** Channels the daily fetch actually contacts, and the channels whose records
 *  are built by a TITLE PARSE — the two happen to be the same set.
 *
 *  A frozen channel is skipped: its committed records are carried forward
 *  byte-stable by parse.ts, which also hard-asserts the pinned count. Nothing
 *  is frozen yet; the mechanism ships on day one so it is tested before it is
 *  needed. An INDEX source is skipped for a different reason — it has no
 *  channel to fetch and no title to parse, and its records are built by their
 *  own function. Note it is still in CHANNELS, so the collapse guard and the
 *  report both still see it; only these two jobs skip it. */
export const ACTIVE_CHANNELS = CHANNELS.filter((c) => !c.frozen && !c.index);

/**
 * Sponsor/team prefix on a catalogue handle: "NP | Senshi", "BBB | Aerodat".
 * STRIPPED, never split — "|" is not a duo delimiter here, and treating it as
 * one would mint a player called "BBB" with a page of its own.
 *
 * APPLIED REPEATEDLY, and that is not defensive coding: the catalogue carries
 * doubly-prefixed handles ("Sweet | BBB | Aerodat"), and a single .replace()
 * leaves "BBB | Aerodat" — a worse outcome than not stripping at all, because
 * it mints a player whose name CONTAINS a sponsor tag rather than one that is
 * merely wrong. Loop until stable.
 */
export const THEATER_SPONSOR = /^[^|]{1,12}\s*\|\s*/;

export const stripTheaterSponsor = (handle: string): string => {
  let out = handle.trim();
  for (let i = 0; i < 4; i++) {
    const next = out.replace(THEATER_SPONSOR, '').trim();
    if (next === out || next === '') break;
    out = next;
  }
  return out;
};
