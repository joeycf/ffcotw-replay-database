# FATAL FURY: City of the Wolves — Replay Database

The CotW app for the [Replay Database](https://replaydatabase.com) platform: a
thin consumer of the shared `replay-engine` layer plus the bespoke CotW data
pipeline. Lives behind the umbrella shell at **replaydatabase.com/ffcotw**.

Game #5 on the platform, and the **second consumer of the engine's
[NEW-GAME-CHECKLIST](../replay-engine/NEW-GAME-CHECKLIST.md)** after Tōkon.
Where this repo diverges from a sibling, the divergence is argued in the file
that makes it — those arguments are the useful part of this README's job, so it
links to them rather than restating them.

## The genericity knobs, deliberately

| knob                   | value          | why                                                                                                                                                                                                            |
| ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `charactersPerSide`    | **1**          | The simplest schema on the platform. No bench queue, no description tier, no footage extractor.                                                                                                                |
| `filters.coOccurrence` | `false`        | There is no same-side duo on a 1v1 game; `pairingUsage` is not emitted.                                                                                                                                        |
| `filters.rank`         | unset          | CotW _has_ a ladder, but no source in the corpus states a player's tier. What titles carry — `(#1 Ranked B.Jenet)` — is a per-CHARACTER leaderboard position, which is stripped and never becomes `Side.rank`. |
| `terms`                | unset          | The engine's defaults (character / side / patch / source) are already this game's vocabulary.                                                                                                                  |
| `sourceGroups`         | set on day one | CotW was an **Evo 2026 main game**, so Online/Tournament is a real split at launch rather than an aspiration.                                                                                                  |

## The stat unit — side appearances

**`characterUsage` counts SIDE APPEARANCES.** A mirror match adds two.

The alternative unit — a per-record deduped union, "how many replays feature
this character" — is legitimate for a tag game on a shared roster and is the
**wrong** unit here: on a 1v1 game it silently under-counts every mirror, and
this corpus has hundreds.

`characterUsage`, `byPatchUsage` and `playerCharacters` share that denominator.
`scripts/emit.ts` asserts all three sum to the same number, because emitting one
unit for one table and another for the next makes three panels disagree with no
visible symptom.

## Nine channels, six title grammars, one parser

The parser never chooses a slot order. It finds the **roster spans** and takes
what is left as the handle, which is why all six grammars read correctly from
one code path:

```
FF COTW ▰ MIKADO (Rock) vs JOYSOL (Gato) ▰ High Level Gameplay      handle (char)
FF:CotW 🐺 KAISER (Terry Bogard) vs SHARK URIEN (Kain)⭐Replay Match  handle (char)
Fatal Fury COTW Automattock Tizoc VS FrancoHwan Rock High Level      no punctuation at all
MR BIG 🐺 FDYNASTY VS HMMA 🐺 DUCK KING | FATAL FURY COTW             char first
Fatal Fury COTW — Kenshiro (Munahageman) vs. Mr. Karate (Tyunidora)  char (handle) — reversed
Rock Howard vs Vox – LSRROZUHEBI vs Kakuzu | Fatal Fury: CotW        parallel lists
```

`cotwReplays` uses **both** slot orders in the same month, which is the whole
argument for resolving a slot by what the roster matches rather than by
position. The parallel-list shape is disambiguated by which pair resolves
against the roster; when both do, it goes to the review queue rather than being
guessed.

**The alias table is mined from the corpus, not written by hand** — see the
header of `scripts/characters.ts`. Four names a hand-written table would have
included are banned on measured evidence, `Griffon` chief among them: it is a
prolific _player_ (58 handle hits, zero character-slot hits) and adding it would
have corrupted ~90 records to rescue one.

## The game-marker gate is mandatory here

Five of the nine online channels publish another title too, and KOF XV shares
Terry, Andy, Rock, B. Jenet, Mai, Geese, Blue Mary, Kim and Billy with this
roster — so an ungated parse files KOF matches as CotW with every count green.

Two refinements over the checklist's step 3, both measured:

- **The marker must be load-bearing, not decorative.** 164 titles carry the
  marker _only_ inside a trailing hashtag run, and 8 of those name another game
  outright (`KOF XV - "100% combo Ash Crimson!!!" … #cotw #kofxv`). The gate
  strips the trailing hashtag block before looking.
- **The marker is the SUBTITLE, never the series.** "Fatal Fury" is 30 years
  old and its back catalogue is live on these channels; matching the series name
  reads 177 SNK OFFICIAL uploads and 115 others that are not this game.

## Replay Theater is two intakes wearing one endpoint

Measured over the whole catalogue (3,465 entries, 2026-09-03):

|                   | entries | videos | carry `t=` |
| ----------------- | ------: | -----: | ---------: |
| tagged (9 events) |     127 |     10 |       100% |
| untagged          |   3,338 |  3,338 |      0.03% |

So **the record id follows the entry, not the source**: composite
`${videoId}@${startSeconds}` for a real segment, the plain YouTube id for a
whole video. The sibling repos state the composite rule unconditionally because
their catalogues are all-segments; applying it here would give 3,338 records ids
of `vid@0` that can never dedupe by id against the same video from a channel.

Two more things this catalogue is honest about:

- **67.7% of its videos are already ours** from `fatalFuryReplays` and
  `wolfFgc`, submitted the same day as the upload in 98.7% of cases. On those it
  is a _near-dependent_ witness — it agrees because it read the same title — so
  the 99.87% character agreement measured against them is close to tautological
  and is reported with that caveat rather than banked as verification.
- **1,075 of its 3,348 videos no longer resolve** (32.1%; oEmbed 403 on 52/52
  sampled, against a positive control of 200 on live ids and 400 on a fabricated
  one). The YouTube join drops them and the report states the rate.

After the known-anywhere ignore and the liveness join, the catalogue's unique
live contribution is essentially its **127 tagged tournament segments**.

## Patches come from SNK's own CMS, not Steam

`scripts/patches.ts` has the full argument. In short:

- The **Steam** feed carries four update-titled posts and stops at Ver 1.1.7
  (2025-06-03). A checker pointed at it prints a tick forever.
- **SNK's own news CMS** carries all 25 patch posts and was current to Ver.3.1.3
  the same day this was built.
- The **date authority is each patch's own vendor page**, not the feed: the CMS
  dated Ver.2.2.0 to 2026-05-25, copied from the row above it, when its own page
  says June 22. Taking the feed at face value would have filed **950 measured
  records** under the wrong patch — rendering, filtering and asserting clean.

Eras open on balance overhauls declared in the vendor's own words
(Ver.1.7.2 "Season 2 … kicks off", Ver.3.0.0 "Season 3 … are here"), never on
major version numbers — Ver.2.0.1 is the live counter-example, an anniversary
major bump that its own notes place _inside_ Season 2.

**Nothing folds.** 1.1.3 → 1.1.7 are five separately announced balance updates
in six weeks; folding on Z would erase all five.

## The roster is 30, plus 2 announced

Enumerated from SNK's own character index. Kim Kaphwan (September 2026) and
Laocorn (November 2026) are announced on SNK's **press** path — a different feed
from the game site's news CMS, which has no reveal post for either — and are
held in `UNRELEASED` (`scripts/expiries.ts`) until they ship. Their accents are
already in the design handoff, so promotion is a one-line change.

Character art is **enumerated, never constructed**, from SNK's own markup.
Their filenames disagree with their own page slugs three different ways
(`jenet` → `character_index_janet`, `mrkarate` → `character_*_karate`,
`krauser` → `character_otherimg_kurauser`) and 9 of 30 files are `.webp` where
21 are `.png`. **10 of 30 fighters would have 404'd from a constructed path**,
silently — an `<img>` that fails to load renders as blank space.

## Scripts

| command                    | what it does                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run data:catchup`     | **The maintenance ritual.** fetch → theater → parse → emit, in that order. Use this rather than the parts. |
| `npm run data:fetch`       | Every upload from the nine channels → `raw/`. No game gate here; parse does the filtering.                 |
| `npm run data:theater`     | The Replay Theater index. Cursor-bounded; `-- --full` for a whole-catalogue reconcile.                     |
| `npm run data:parse`       | `raw/` → `data/videos.json` + players + review queue + `report.md`. Every guard lives here.                |
| `npm run data:emit`        | Substrate → the engine's public contract. Every assertion is a throw.                                      |
| `npm run data:characters`  | Rebuild the roster from `ROSTER` + the design tokens. Manual; never in the cron.                           |
| `npm run data:art`         | Character art from SNK's site, with per-file provenance. Manual.                                           |
| `npm run data:og`          | The OG card. Draws real glyph outlines — see below.                                                        |
| `npm run data:patch-check` | Diff the patch table against SNK's CMS **and** each patch's own page. Manual.                              |
| `npm run data:expiries`    | Self-expiring gates. Runs last in the cron and is designed to go red.                                      |
| `npm run verify:gates`     | **The positive-control suite.** 24 injected defects, each of which must exit non-zero, plus the clean run. |
| `npm run test:e2e`         | Assertions against the built static output, with a visible empty-corpus mode.                              |
| `npm run verify:deployed`  | Post-deploy smoke check — the deploy fingerprint (count + side appearances + content hash).                |

## Things worth knowing

**The collapse guard is AWAKE here, and that is new.** Tōkon had to record that
it _sleeps_ under ~200 records per channel. `fatalFuryReplays` and `wolfFgc`
commit over a thousand records each, so a 10% loss clears both thresholds
comfortably — this is the first game on the platform where the percentage term
binds rather than the absolute. It is still genuinely asleep for `evoEvents`
(~96) and `cotwReplays` (~139), where the freeze pin and the post-deploy smoke
check remain the live protection.

**`dildilFatalFury` currently publishes 8 records from 1,704 CotW-marked
uploads, and that number is the point.** Two thirds of the channel is combo
guides and training footage that names no matchup; most of the rest names one
player and one character rather than a matchup. An earlier, looser parse
published 118 of them — with players called `show Match (`, `FT2 rankeadas 2026`
and `F/2`. Those were not near-misses, they were 118 player pages named after
title furniture, and every count, schema and gate was green. The parser is now
strict about what a handle can be (checklist 5e), so this channel's output is
small and correct rather than large and wrong.

It stays configured because its ranked sets are real footage and because the
daily fetch is cheap. **If it is not worth 2,446 uploads a day for 8 records,
removing it is a one-line change to `scripts/channels.ts`** — the per-intake
table in `data/report.md` is what that decision should be made from.

**`evoEvents` publishes 0 records today, by construction.** Its grammar —
`Evo 2026: Fenritti vs K-TOP | FATAL FURY: City of the Wolves | Winners
Semifinals` — names both handles and neither character, so every parsed upload
lands in the review queue as `character-completion`. That is the intended path,
not a failure: the alternative is guessing a matchup. The Tournament group is
therefore carried by Replay Theater's 127 tagged segments until those queue
items are resolved. Evo's own descriptions DO carry per-match chapter listings
with characters — measured on 9 of its 72 uploads — which is a real future tier
and deliberately not built for launch (see below).

**Generated brand images draw outlines, not text** (`scripts/og.ts`). Checklist
5d says prove the typeface drew; here the honest resolution was to remove the
failure mode instead. `fc-match Anton` on a clean machine answers _DejaVu Sans_
(@fontsource ships only woff/woff2), and in this build of sharp
`font-family="Anton"`, `"DejaVu Sans"` and `"__nope__"` render **byte-identically** —
the bundled librsvg resolves no named family at all. So the wordmark is
converted from committed OFL TTFs to SVG path data. Three separate silent
failures were found on the way, each caught only by looking at the rendered
image: a fontconfig env var that names the wrong kind of path, an ESM import
hoisted above the env setup, and **opentype.js emitting literal `NaN`
coordinates for a variable font**, which made librsvg stop parsing mid-word. The
NaN check now reads the emitted path data rather than probing glyphs in
isolation, because the isolated probe passed while the output was broken.

**Text normalization runs before any matching, and the control has to point at
the right surface.** 182 titles carry an invisible or non-ASCII space (333
U+202F, 142 U+3000, plus NBSP/ZWSP/ZWJ) and 31 have no ASCII space at all. But
normalization changes the parse rate by _exactly zero_ — both JS and Python
spell `\s` to include U+202F, so a regex parser is already immune. What breaks is
exact-string work: **43 of 43** U+202F titles produce a different player slug
raw vs normalized, which mints two pages for one person. A control that only
checks "does it still parse" passes on a pipeline with no normalization at all.

**FOLLOW-UP — three player ids share a name with the roster, and all three are
real.** Found 2026-09-07 from Strive's Stage 0 recon, which needed the
player-registry-vs-roster invariant (checklist 5n) and looked for prior art.
This repo has no such guard, so nobody had checked. `data/players.json` holds
`mr-karate` and `mrkarate` against a character whose id is `mr-karate` and whose
aliases include `MrKarate`, plus `k4karate`.

Every one was adjudicated from its source title before anything was touched, and
**none is a mis-parse — the parser is correct on all four side-appearances:**

| player id | video | the title that produced it |
|---|---|---|
| `mrkarate` | `wuxZI5UWSGw` | `TTVTeiga (Rock Howard) vs MrKarate (Krauser)` |
| `mrkarate` | `xHslrureiqI` | `MRKARATE (Wolfgang Krauser) vs SOMBRA (#7 Ranked Mr. Karate)` |
| `mr-karate` | `McTZSWYV7nE` | `DARK ANGEL (Terry Bogard) vs MR KARATE (Mr.Karate)` |
| `k4karate` | `6_7zQlihiUI` | `DARK ANGEL (#5 Ranked Mr. Karate) vs K4KARATE (#4 Ranked Mr. Karate)` |

`xHslrureiqI` is the one that settles it: the same title carries a PLAYER called
MRKARATE and an OPPONENT playing Mr. Karate, and the parser separated them
correctly. `McTZSWYV7nE` is a player named after the fighter they main — the
"Star Lord" case, genuine.

So this is a true positive for the guard and a false alarm for the defect, which
is exactly why 5n requires a CONFIRMED list with a video id per entry rather than
a bare assertion. **Nothing here should be deleted.** The work outstanding is to
ADD the guard, seeded with these three as its first CONFIRMED entries; until then
this table is the record. Note also that `mr-karate` and `mrkarate` are two pages
for what may be one person — a player-redirect question, separate from the guard
and not settled by this evidence.

## The tier that was measured and declined

Checklist 5b says look for a cheaper text tier before building an extractor.
That look was done and is recorded rather than assumed. Of every CotW-marked
upload whose title does not yield two characters, descriptions name two roster
fighters on **84.2%** for `cotwReplays` (16 records), **12.5%** for `evoEvents`,
**4.3%** for `nomiiAegis`, **1.5%** for `dildilFatalFury` and **0.0%** for
`bestOfFgc`. Sixteen records did not justify a parser stage with its own
alignment hazards, so those uploads go to the review queue instead.

Re-measure before adding a channel — if a high-volume channel starts writing
prose benches, or if Evo's chapter listings are worth segmenting, this flips.
There is no footage-extraction track in this repo at all: CotW's titles state
both characters on 93.9–99.7% of the marked uploads across the five clean
channels, so the surface the checklist calls "the most defect-dense on the
platform" is simply not needed here.

## Daily data refresh

`.github/workflows/data-refresh.yml`, **08:17 UTC** — the fifth stagger slot,
after 2XKO 06:17, Tekken 06:47, SF6 07:17 and Tōkon 07:47. This entry widens the
platform's refresh window from 06:00–08:00 to 06:00–08:30; the next free slot is
08:47.

The Replay Theater step is `continue-on-error` on purpose: the cron never
depends on a third party succeeding. A failed pull means no dump, parse carries
the committed records against `data/source-pins.json`, and the day proceeds.

The commit step stages files **by name**, never `git add data/` — a blanket add
would sweep up a half-finished hand edit to `overrides.json` in an unattended
run.

## Vercel

Project `ffcotw-replay-database`, built from this repo's `main`.

```
NUXT_PUBLIC_SITE_URL=https://replaydatabase.com
NUXT_APP_BASE_URL=/ffcotw/
```

The shell owns the apex and edge-rewrites `/ffcotw/*` here. Web Analytics
beacons go to this project through the shell's `/ffcotw-insights/*` proxy —
the rewrite and `GameConfig.observability.insights` ship together or every
beacon 404s, silently.
