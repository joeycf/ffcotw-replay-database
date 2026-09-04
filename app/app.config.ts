import patchGroups from '../data/patchGroups.json';
import type { GameConfig } from '@engine/types';

/**
 * The FATAL FURY: City of the Wolves GameConfig — merged OVER the engine's
 * neutral default. Everything game-shaped the engine renders comes from here
 * via useGame(); the visual skin lives separately in app/assets/theme.css.
 *
 * The genericity knobs, deliberately:
 *
 * - charactersPerSide 1 → the simplest schema on the platform. No bench queue,
 *   no description tier, no footage extractor. `Side.characters` is still 1..N
 *   rather than a single string, because a tournament SET whose loser
 *   counter-picked legitimately lists every character used — the catalogue
 *   carries exactly one such entry in 3,465, and the contract already blesses
 *   it. Zero is the only failure and emit hard-fails on it.
 *
 * - filters.coOccurrence FALSE. There is no same-side duo on a 1v1 game, so the
 *   panel would render an empty pair set. `pairingUsage` is not emitted.
 *
 * - filters.rank UNSET. CotW HAS a ranked ladder (Rookie → Legendary Wolf, and
 *   Ranked Match Phases), but no source in the corpus states a player's tier.
 *   What the titles DO carry — "(#1 Ranked B.Jenet)" on fatalFuryReplays — is a
 *   per-CHARACTER leaderboard POSITION, structurally identical to SF6's
 *   "#3 Ranked Guile", which SF6 strips and never turns into Side.rank. Turning
 *   the facet on would render a filter with nothing behind it.
 *
 * - terms UNSET. CotW says "character", "side", "patch" and "source" — the
 *   engine defaults are already this game's vocabulary, and overriding them to
 *   say the same thing would be noise. characterRouteSegment likewise stays
 *   'characters'.
 *
 * - sourceGroups SET FROM DAY ONE, unlike Tōkon which shipped without them.
 *   The split is real here on launch day rather than aspirational: CotW was an
 *   Evo 2026 MAIN GAME, and the Tournament group holds Evo's own uploads plus
 *   the 127 tagged tournament segments in the Replay Theater catalogue. With
 *   nine online re-uploaders, 1:1 chips would be a nine-chip filter bar.
 *
 *   Note what this costs: the engine renders ONLY group chips when sourceGroups
 *   is set, so the per-channel chips are gone from the filter bar. They are not
 *   gone from the data — SourceBadge still names the real channel on every
 *   card, and a group toggle writes its member ids into the same `?src=` CSV,
 *   so every per-channel deep link still resolves.
 *
 * Accents are transcribed from design/handoff/tokens.css (--char-*), the design
 * system's source of truth — scripts/characters.ts reads the same block when
 * building data/characters.json, so config and data cannot drift, and a roster
 * id with no token fails loud rather than shipping an unstyled fighter. The
 * handoff also carries --char-kim-kaphwan and --char-laocorn, which are
 * deliberately ABSENT here: both are announced but unreleased (Season 3,
 * September and November 2026) and live in UNRELEASED in scripts/expiries.ts
 * until they ship.
 */
export default defineAppConfig({
  game: {
    id: 'ffcotw',
    slug: 'ffcotw',
    name: 'FATAL FURY: City of the Wolves',
    // "COTW/REPLAY" in the header wordmark. The community's own short form and
    // the one every contributing channel writes ("FF COTW", "FF:CotW"); the
    // series name would make the wordmark "FATAL FURY/REPLAY", which is twice
    // the width of every sibling's. Pure ASCII, so no latin-ext dependency in
    // the display face — unlike Tōkon's macron.
    shortName: 'COTW',
    rightsHolder: 'SNK CORPORATION',
    baseURL: '/ffcotw', // behind the shell at replaydatabase.com/ffcotw
    siteUrl: 'https://replaydatabase.com',
    // Web Analytics beacons go to THIS project instead of pooling into the
    // shell. Paired 1:1 with the shell vercel.json rewrite
    //   /ffcotw-insights/:path* → https://ffcotw-replay-database.vercel.app/_vercel/insights/:path*
    // — the two ship together or every beacon 404s, silently. Same-origin on
    // purpose: the child's endpoints send no CORS headers, so an absolute URL
    // here would die at preflight. speedInsights stays at the engine default
    // (single-project on Hobby — it must reach the enabled project).
    observability: { insights: '/ffcotw-insights' },
    charactersPerSide: 1,
    filters: {
      coOccurrence: false,
      rank: false,
    },
    // No GameStatsPanels override ships, so the stats page's `beside-timeline`
    // anchor is empty — give the meta-over-time chart the whole row and, with
    // the room, plot the top 8 of a 30-fighter roster.
    stats: {
      metaTimelineTopN: 8,
      metaTimelineFullWidth: true,
    },
    // The hero crop. The engine default '70% 25%' is documented for WIDE
    // landscape splashes (2XKO's are 16:9); SNK's character_main_* renders are
    // tall action poses, so 25% lands on the hip — the hero showed B. Jenet's
    // waist. Y is 0% rather than Tekken's 4% because this game does the
    // normalising in the PIPELINE instead: scripts/art.ts crops each splash's
    // dead space above the head under a measured HERO_TOP table, so every
    // source arrives with the head at the top and one Y means the same thing
    // for all 30. That table exists because heroFocus is a single global value
    // and this roster is not uniform — the head sits at 0% of source height for
    // Kain and 42% for Tizoc, whose headdress fills everything above his mask.
    // X stays 70% to hold the subject clear of the name/stat scrim, which is
    // opaque over the left quarter of the hero.
    heroFocus: '70% 0%',
    accents: {
      // Base roster (Early Access 2025-04-21)
      'rock-howard': '#9C8CFF',
      'terry-bogard': '#FF7060',
      'hotaru-futaba': '#FFA3C9',
      preecha: '#5FD36A',
      'vox-reaper': '#B8F53F',
      'marco-rodrigues': '#C9B27E',
      'kevin-rian': '#7A9CC9',
      'b-jenet': '#E858C8',
      gato: '#C89AF5',
      tizoc: '#FFC24A',
      hokutomaru: '#7FE6BE',
      'kain-r-heinlein': '#6E8BFF',
      'billy-kane': '#B9C0CC',
      'mai-shiranui': '#FF6E8F',
      'kim-dong-hwan': '#4FD9FF',
      'cristiano-ronaldo': '#2FBF6F',
      'salvatore-ganacci': '#AC8CFF',
      // Season 1 (2025)
      'andy-bogard': '#E6E1F2',
      ken: '#F04250',
      'joe-higashi': '#FFA23C',
      'chun-li': '#3FA8E8',
      'mr-big': '#B95EE8',
      // Season 2 · Legends Unleashed (2026)
      'kim-jae-hoon': '#F04A2C',
      'nightmare-geese': '#D04FE0',
      'blue-mary': '#45D6E0',
      'wolfgang-krauser': '#8E6FE0',
      'mr-karate': '#FF7E30',
      kenshiro: '#C7DCF5',
      // Season 3 · Destined for Revenge (2026)
      'rick-strowd': '#C8895A',
      'duck-king': '#2FCBB0',
    },
    // Order matters: SourceBadge styles by index (0 = filled primary,
    // 1 = secondary outline, 2+ = warning outline). Ids mirror
    // scripts/channels.ts — the pipeline's Replay.source contract — and the
    // array order there is also the dedupe precedence, argued in its header.
    // APPEND only: inserting would recolour shipped badges.
    sourceChannels: [
      { id: 'fatalFuryReplays', name: 'Fatal Fury Replays' },
      { id: 'wolfFgc', name: 'Wolf FGC' },
      { id: 'svcHighlights', name: 'SVC Highlights' },
      { id: 'ffCotwReplays', name: 'Fatal Fury COTW Replays' },
      { id: 'bestOfSnk', name: 'The Best Of SNK' },
      { id: 'cotwReplays', name: 'City Of The Wolves Replays' },
      { id: 'nomiiAegis', name: 'NoMii Aegis' },
      { id: 'bestOfFgc', name: 'The Best of FGC' },
      { id: 'dildilFatalFury', name: 'Dildil Fatal Fury' },
      { id: 'evoEvents', name: 'Evo' },
      // Named for what the footage IS, not for the catalogue that indexed it.
      { id: 'replayTheater', name: 'Replay Theater' },
    ],
    // Filter chips consolidate to two groups (engine v0.5.5). Group ids appear
    // NOWHERE else — not in Replay.source, not in a URL: toggling a group
    // writes its member ids to the same `?src=` CSV the per-channel links
    // already used.
    //
    // replayTheater sits in TOURNAMENT even though 96% of its entries are
    // online play, and that is a deliberate, arguable call. The alternative is
    // splitting it into two source tokens; it is one publisher making one kind
    // of statement, its unique contribution is the tournament segments nothing
    // else here carries, and its online arm duplicates channels already in the
    // Online group. If its untagged arm ever stops being duplicative, split the
    // token — that is a config change, not a migration, because the record
    // already carries its intake.
    sourceGroups: [
      {
        id: 'online',
        name: 'Online',
        sources: [
          'fatalFuryReplays',
          'wolfFgc',
          'svcHighlights',
          'ffCotwReplays',
          'bestOfSnk',
          'cotwReplays',
          'nomiiAegis',
          'bestOfFgc',
          'dildilFatalFury',
        ],
      },
      {
        id: 'tournament',
        name: 'Tournament',
        sources: ['evoEvents', 'replayTheater'],
      },
    ],
    // Era → patch hierarchy. PIPELINE-EMITTED (scripts/emit.ts →
    // data/patchGroups.json) from the same boundary authority that derives every
    // replay's patch token, so the UI hierarchy and the data cannot drift.
    // Vercel never runs the pipeline, so that artifact has to be committed.
    patchGroups,
    fonts: {
      display: 'Anton',
      ui: 'Figtree',
      mono: 'JetBrains Mono',
    },
    manifest: {
      themeColor: '#FFD21F',
      backgroundColor: '#0F0D0B',
    },
    ogImage: '/og-default.png',
    // ComboForge cross-link on character pages (engine v0.11.0). Their game id
    // for this one IS ours — 'ffcotw' — which is not the norm (Tōkon's is
    // 'marveltokon'), so it is checked rather than assumed.
    //
    // 26 of our ids derive cleanly because the roster ids are full-name kebab,
    // which is the same shape ComboForge uses. Only 'ken' diverges: SNK's own
    // page title is bare "KEN" and they carry him as 'ffcotw-ken-masters'.
    //
    // The nulls are characters ComboForge does not carry yet — all Season 2/3
    // arrivals. A null means "band falls back to the game hub" rather than
    // emitting a dead deep link, and `npm run verify:comboforge` re-checks each
    // one every release so a gap gets PROMOTED to a real link the release after
    // they add it, instead of rotting as a hub fallback forever.
    //
    // kim-kaphwan and laocorn are listed although they are not on our roster
    // yet: the day the UNRELEASED gate promotes them, the null is already here
    // and their band cannot ship a dead link on day one.
    comboforge: {
      gameId: 'ffcotw',
      characters: {
        ken: 'ken-masters',
        'mr-karate': null,
        'rick-strowd': null,
        'duck-king': null,
        'kim-kaphwan': null,
        laocorn: null,
      },
    },
  } satisfies GameConfig,
});
