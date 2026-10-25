## ⚠ ACTION REQUIRED

2 self-expiring gate(s) are due:

- **manjiro-sano** (unreleased-character, due 2026-10-22)
  manjiro-sano should now be playable. If it is: confirm the name and spelling on snk-corp.co.jp/us/games/fatalfury-cotw/characters/, add --char-manjiro-sano to design/handoff/tokens.css (accent from a Claude Design session — never invent one — contrast ≥4.5:1 on --color-surface and a hue ≥8–12° off its roster neighbours), add the same hex to accents in app/app.config.ts, add the fighter to ROSTER in scripts/characters.ts with the aliases its uploaders actually use, drop this entry from UNRELEASED, then run `npm run data:characters` and `npm run data:art`. Also add a comboforge null for it in app/app.config.ts until `npm run verify:comboforge` says they carry it. If it has NOT shipped, re-date this row to the new window — do not delete it.

- **ken-ryuguji** (unreleased-character, due 2026-10-22)
  ken-ryuguji should now be playable. If it is: confirm the name and spelling on snk-corp.co.jp/us/games/fatalfury-cotw/characters/, add --char-ken-ryuguji to design/handoff/tokens.css (accent from a Claude Design session — never invent one — contrast ≥4.5:1 on --color-surface and a hue ≥8–12° off its roster neighbours), add the same hex to accents in app/app.config.ts, add the fighter to ROSTER in scripts/characters.ts with the aliases its uploaders actually use, drop this entry from UNRELEASED, then run `npm run data:characters` and `npm run data:art`. Also add a comboforge null for it in app/app.config.ts until `npm run verify:comboforge` says they carry it. If it has NOT shipped, re-date this row to the new window — do not delete it.


## ⚠ AN UNRELEASED FIGHTER MAY HAVE SHIPPED

- **manjiro-sano** appears in parser residue. Promote it — see scripts/expiries.ts.
- **ken-ryuguji** appears in parser residue. Promote it — see scripts/expiries.ts.

# CotW pipeline report

- **4971** published records · **2223** players · **31** fighters
- **682** pending review item(s) — absent from the site, never guessed
- **0** duplicate id(s) resolved by intake precedence

## Per intake

| intake | raw uploads | CotW-marked | parsed | published |
| --- | ---: | ---: | ---: | ---: |
| fatalFuryReplays | 6671 | 1371 | 1347 | 1347 |
| wolfFgc | 2009 | 1353 | 1302 | 1302 |
| svcHighlights | 749 | 696 | 676 | 676 |
| ffCotwReplays | 763 | 762 | 642 | 642 |
| bestOfSnk | 521 | 265 | 252 | 252 |
| cotwReplays | 169 | 169 | 143 | 143 |
| nomiiAegis | 379 | 352 | 151 | 151 |
| bestOfFgc | 1452 | 340 | 321 | 321 |
| dildilFatalFury | 2546 | 1804 | 9 | 9 |
| evoEvents | 2831 | 103 | 0 | 0 |
| replayTheater | — | — | — | 128 |

## Tournament placements — Liquipedia Tier 1–2, CC BY-SA 3.0

84 events with placements read; 46 of 2223 registry players carry a title (65 wins). 19 placed names are not in the registry yet — they are featured the day a replay of theirs is ingested, unless listed below as needing a human.

**Titled:** `xiaohai` 9W/1R · `el-maza` 5W/4R · `go1` 6W/3R · `didimokof` 3W/3R · `darkangel` 4W/1R · `nemo` 1W/4R · `poongko` 1W/4R · `score` 2W/3R · `fenritti` 2W/2R · `kindevu` 0W/4R · `kojikog` 2W/2R · `laggia` 3W/1R · `zjz` 2W/2R · `abao` 2W/1R · `kula` 3W/0R · `lokof` 1W/2R · `reynald` 0W/3R · `thegio` 1W/2R · `abuomar` 1W/1R · `basher` 1W/1R · `dai` 1W/1R · `frezzer` 2W/0R · `neku` 1W/1R · `pangma` 2W/0R · `shadow-x` 1W/1R · `sharkurien` 0W/2R · `tamago` 1W/1R · `alex` 0W/1R · `alfinete` 1W/0R · `alioune` 0W/1R · `arusu` 0W/1R · `boros` 0W/1R · `cientifikof` 1W/0R · `diaphone` 1W/0R · `iceskyrain` 0W/1R · `javier-yagami` 0W/1R · `kaiser666` 1W/0R · `leffen` 0W/1R · `mok` 1W/0R · `monib` 0W/1R · `pida` 0W/1R · `rigosam` 0W/1R · `rondun` 0W/1R · `seis-mx` 1W/0R · `sosicknashfan` 1W/0R · `xyzzy` 1W/0R

**Need a human** (data/tournament-aliases.json — an id, or `null` to ignore):

- `ET` (page E.T.) — too-short: under three alphanumerics — add an alias row to confirm; 3 title(s), latest BeePro Cup 2025
- `RB` (page RB) — too-short: under three alphanumerics — add an alias row to confirm; 1 title(s), latest SWC 2025 Online Round: East Asia #2

**Weak matches** (short display-name key — confirm or `null` them):

- `ALEX` → `alex` via name
- `Boros` → `boros` via name
- `Dai` → `dai` via name
- `iceskyrain` → `iceskyrain` via name
- `RonDun` → `rondun` via name

**Waiting for footage** (17): b_HAUNT, bar_barXII, Cicak ⁽ⁿᵒ ᵖᵃᵍᵉ⁾, Coach Steve, Dune, Gummy, H-DOPE, Hazz, K-TOP, Koopatj, MadoKula, mi2ha4, NaiWang, R.PunK, Redraven ⁽ⁿᵒ ᵖᵃᵍᵉ⁾, XiaoCai, yunwu

## Misses

- `no-marker` — 10875
- `no-char` — 681
- `vs-count` — 636
- `no-vs` — 505
- `no-handle` — 262
- `too-short` — 257
- `before-floor` — 30
- `slot-ambiguous` — 1

## Residue — text no roster span covered

A new nickname, a DLC fighter or an uploader typo surfaces here as a counted
line with its literal text, instead of vanishing into a silently shorter side.

- 59× `DildilFatalFury`
- 51× `Wolves HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER`
- 28× `Mirro`
- 21× `Early Access`
- 17× `Wolves show HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT GURDCANCEL`
- 17× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT GURDCAN`
- 16× `DildilFatalFury Assis DREAM`
- 16× `Wolves show HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT GURD`
- 16× `Wolves HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT`
- 16× `Wolves HAYPERDEFENSE JUSTDEFENSE zero FRAMES COU`
- 15× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero F`
- 14× `HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT`
- 14× `Wolves HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTE`
- 13× `TREINING TREINING`
- 12× `DildilfatalFury Ruinha`
- 12× `Dream DildilFatalFury Assis`
- 12× `DREAM DildilFatalFury Assis`
- 11× `Dream`
- 11× `Wolves TREINING HAWORD HAYPERDEFENSE JUSTDEFENSE`
- 10× `DildilfatalFury TsukiGoose B Janet`
- 10× `Wolves TREINING SOUTH TOWN O CHEFE DA MAFIA HAYPERDEFE`
- 10× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUN`
- 9× `Dream DildilfatalFury Assis`
- 8× `DildilfatalFury DllaKof Rankeada`
- 8× `Rankeadas`
- 8× `Wlfgang DildilFatalFury`
- 8× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero FRAMES`
- 8× `Wolves HAYPERDEFENSE JUSTDEFENSE zero FRAMES COUNTER HIT Alcateia Lobo`
- 8× `Wolves DildilFatalFury SNK SEMPRE`
- 7× `Rankeada DildilfatalFury`
- 7× `Dream DildilfatalFury Correia`
- 7× `DildilFatalFury Klebin`
- 6× `FT DildilfatalFury MarcosAssis`
- 6× `Treining Hayperdefense Justdefense counter hit zero frame especial move Ge`
- 6× `Mirro Dream DildilFatalFury Assis`
- 6× `HAYPERDEFENSE JUSTDEFENSE zero FRAME NO especial Move Haoshoukukem do Mr Kara`
- 6× `TREINING`
- 6× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero`
- 6× `Wolves TREINING`
- 6× `Wolves TREINING HAYPERDEFENSE JUSTDEFENSE zero FRAMES CO`
- … 1045 more

> Replay Theater: 150 dumped, 150 already known here, 0 candidates, 0 rebuilt, 128 carried (add-only), 128 total.

_Generated 2026-10-25T13:14:57.055Z_
