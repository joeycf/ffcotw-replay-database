/**
 * Build data/characters.json — the roster registry.
 *
 * TWO SOURCES, BOTH OF THEM BINDING:
 *
 * 1. ROSTER below: ids, official names, season, and the parse/search aliases.
 *    Names are the spelling SNK's own character pages use, title-cased. The
 *    site renders them in caps; that is display styling, and the UI uppercases
 *    where a label wants it. Enumerated from
 *    https://www.snk-corp.co.jp/us/games/fatalfury-cotw/characters/ on
 *    2026-09-03 — thirty pages, thirty fighters, and the same thirty distinct
 *    character strings the Replay Theater catalogue uses across 3,465 entries.
 *
 * 2. design/handoff/tokens.css: the accents, read from its `--char-<id>` block.
 *    THE DESIGN TOKENS ARE THE SOURCE OF TRUTH FOR ACCENTS. app/app.config.ts
 *    mirrors the same block, so config and data cannot drift, and A ROSTER ID
 *    WITH NO TOKEN FAILS THIS SCRIPT LOUD rather than shipping an unstyled
 *    fighter. Never invent an accent here — get it from Claude Design.
 *
 * THE IDS ARE FULL-NAME KEBAB, and that is a decision with a second payoff.
 * SNK's own page slugs are short (`jenet`, `donghwan`, `mrkarate`), but
 * ComboForge keys characters as `${gameId}-${full name kebab}`. Taking the
 * design handoff's full-name ids makes 26 of 32 ComboForge deep links DERIVE
 * with no map entry at all; the short-slug alternative needed 21 hand
 * overrides. One naming decision, made once, for the design system and the
 * partner link both.
 *
 * ── THE ALIAS TABLE IS MINED, NOT GUESSED ─────────────────────────────────
 * Every alias below was measured against the real corpus (7,586 CotW-marked
 * uploads across 18 channels, 2026-09-03) by counting how often a candidate
 * appears in a CHARACTER slot versus a HANDLE. Four were rejected on that
 * evidence, and every one of them is a name a hand-written table would have
 * included:
 *
 *   'Griffon' / 'Griffon Mask'  — Tizoc's series nickname. 58 handle hits, ZERO
 *       character-slot hits: "GRIFFON LEGEND" and "GriffonMasker" are two
 *       prolific PLAYERS. Exactly one title in the corpus uses "Griffon Mask"
 *       to mean Tizoc. Adding the alias would corrupt ~90 records to rescue 1.
 *   'Bogard'                    — 58 handle hits ("PHANPY BOGARD", "BROTHER
 *       BOGARD", "B. BOGARD"). The full names Terry Bogard / Andy Bogard are
 *       safe because spans match longest-first; the bare surname is not.
 *   'Duck'                      — a Wolf FGC title reads "DUCK (Kenshiro) vs
 *       GRIFFON LEGEND (Tizoc)". Duck is a player. Only 'Duck King' is safe.
 *   'Kim'                       — three Kims on this roster (Dong Hwan, Jae
 *       Hoon, and Kaphwan in September). A bare Kim cannot resolve and must
 *       reach the residue gate instead of being guessed.
 *
 * The residue gate (scripts/parse.ts) is the safety net: whatever text no span
 * covered is reported verbatim with a count, so a new nickname or a DLC
 * fighter surfaces as a counted line instead of vanishing into a silently
 * shorter side. That is also how an UNRELEASED fighter announces itself.
 *
 * Run: npm run data:characters   (only when the roster changes — never in cron)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { dueExpiries, UNRELEASED } from './expiries';
import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = join(ROOT, 'design/handoff/tokens.css');
const OUT = join(ROOT, 'data/characters.json');

interface RosterEntry {
  id: string;
  name: string;
  /** Which content era the fighter arrived in. 0 = base roster at launch. */
  season: 0 | 1 | 2 | 3;
  /** ISO release day, for provenance and for the DLC-day title suffix. */
  released: string;
  /**
   * Parse + search vocabulary. The app's search and the pipeline's parser read
   * the SAME list, so a new nickname is added once.
   *
   * Curation rules applied here:
   *  · the official name always appears;
   *  · punctuation variants are listed explicitly ("Mr.Karate" / "Mr Karate"),
   *    because the alias matcher compares literal text and a missing variant is
   *    a silent miss, not an error;
   *  · a shortening is included only where the corpus shows it in a character
   *    slot AND not in a handle — see the header for the four that failed that;
   *  · observed uploader TYPOS are included and marked. This is curation, not
   *    silent correction: without them those uploads become char-unresolved
   *    misses, and the alternative to a curated variant is losing a real match.
   */
  aliases: string[];
}

/**
 * Thirty released fighters. Kim Kaphwan (September 2026) and Laocorn (November
 * 2026) are announced and NOT here — they live in UNRELEASED in expiries.ts and
 * arrive on release day. Their accents are already in the design handoff, so
 * promotion is a one-line change rather than a design task.
 */
const ROSTER: RosterEntry[] = [
  // ── Base roster (Early Access 2025-04-21) ────────────────────────────────
  { id: 'rock-howard', name: 'Rock Howard', season: 0, released: '2025-04-21', aliases: ['Rock'] },
  {
    id: 'terry-bogard',
    name: 'Terry Bogard',
    season: 0,
    released: '2025-04-21',
    aliases: ['Terry'],
  },
  {
    id: 'hotaru-futaba',
    name: 'Hotaru Futaba',
    season: 0,
    released: '2025-04-21',
    // 'Hotaro' is a measured uploader typo, kept deliberately.
    aliases: ['Hotaru', 'Hotaro'],
  },
  { id: 'preecha', name: 'Preecha', season: 0, released: '2025-04-21', aliases: [] },
  { id: 'vox-reaper', name: 'Vox Reaper', season: 0, released: '2025-04-21', aliases: ['Vox'] },
  {
    id: 'marco-rodrigues',
    name: 'Marco Rodrigues',
    season: 0,
    released: '2025-04-21',
    // 'Khushnood Butt' is his Garou-era localised name; 'Marcos' is a measured typo (×4).
    aliases: ['Marco', 'Marcos', 'Khushnood Butt'],
  },
  { id: 'kevin-rian', name: 'Kevin Rian', season: 0, released: '2025-04-21', aliases: ['Kevin'] },
  {
    id: 'b-jenet',
    name: 'B. Jenet',
    season: 0,
    released: '2025-04-21',
    // 'B.Jene' is a measured truncation (×1). 'Jenet' alone is safe: 179 character
    // slots against 1 handle hit.
    aliases: ['B.Jenet', 'B Jenet', 'Jenet', 'BJenet', 'B.Jene'],
  },
  { id: 'gato', name: 'Gato', season: 0, released: '2025-04-21', aliases: [] },
  // NOT 'Griffon' / 'Griffon Mask' — see the header. 58 handle hits, 0 character hits.
  { id: 'tizoc', name: 'Tizoc', season: 0, released: '2025-04-21', aliases: [] },
  { id: 'hokutomaru', name: 'Hokutomaru', season: 0, released: '2025-04-21', aliases: [] },
  {
    id: 'kain-r-heinlein',
    name: 'Kain R. Heinlein',
    season: 0,
    released: '2025-04-21',
    // 'Kain' carries 244 character slots against 8 handle hits (all "VIOLENT KAIN"),
    // so it stays — but it is the tightest of the accepted shortenings.
    aliases: ['Kain', 'Kain R Heinlein', 'Kain Heinlein'],
  },
  { id: 'billy-kane', name: 'Billy Kane', season: 0, released: '2025-04-21', aliases: ['Billy'] },
  { id: 'mai-shiranui', name: 'Mai Shiranui', season: 0, released: '2025-04-21', aliases: ['Mai'] },
  {
    id: 'kim-dong-hwan',
    name: 'Kim Dong Hwan',
    season: 0,
    released: '2025-04-21',
    // 'Don Hwan' is a measured typo. Bare 'Kim' is deliberately absent — three Kims.
    aliases: ['Dong Hwan', 'DongHwan', 'Dong H.', 'Kim Donghwan', 'Don Hwan'],
  },
  {
    id: 'cristiano-ronaldo',
    name: 'Cristiano Ronaldo',
    season: 0,
    released: '2025-04-21',
    aliases: ['CR7', 'Ronaldo', 'C. Ronaldo', 'C Ronaldo', 'Cristiano'],
  },
  {
    id: 'salvatore-ganacci',
    name: 'Salvatore Ganacci',
    season: 0,
    released: '2025-04-21',
    aliases: ['Salvatore', 'Ganacci', 'S. Ganacci', 'Salvatore G.'],
  },

  // ── Season 1 (2025) ──────────────────────────────────────────────────────
  { id: 'andy-bogard', name: 'Andy Bogard', season: 1, released: '2025-06-24', aliases: ['Andy'] },
  {
    id: 'ken',
    name: 'Ken',
    season: 1,
    released: '2025-08-04',
    // SNK's page title is bare "KEN"; ComboForge and Replay Theater both say
    // "Ken Masters", and so do most uploaders. Both spellings resolve.
    aliases: ['Ken Masters'],
  },
  {
    id: 'joe-higashi',
    name: 'Joe Higashi',
    season: 1,
    released: '2025-10-14',
    aliases: ['Joe', 'Joe Higshi'],
  },
  {
    id: 'chun-li',
    name: 'Chun-Li',
    season: 1,
    released: '2025-11-05',
    aliases: ['Chun Li', 'ChunLi', 'Chun-lin'],
  },
  {
    id: 'mr-big',
    name: 'Mr. Big',
    season: 1,
    released: '2025-12-10',
    // Bare 'Big' is absent: the six outside-paren hits are all the "DLC: Mr. Big
    // Day One" title suffix, and a one-syllable common word is not worth it.
    aliases: ['Mr.Big', 'Mr Big', 'MrBig'],
  },

  // ── Season 2 · Legends Unleashed (2026) ──────────────────────────────────
  {
    id: 'kim-jae-hoon',
    name: 'Kim Jae Hoon',
    season: 2,
    released: '2026-01-22',
    aliases: ['Jae Hoon', 'JaeHoon', 'J. Hoon', 'Kim Jaehoon'],
  },
  {
    id: 'nightmare-geese',
    name: 'Nightmare Geese',
    season: 2,
    released: '2026-02-26',
    // 'Gueese' is a measured typo. 'Geese Howard' is the series name uploaders reach for.
    aliases: ['Geese', 'N. Geese', 'N.Geese', 'Geese Howard', 'Gueese'],
  },
  {
    id: 'blue-mary',
    name: 'Blue Mary',
    season: 2,
    released: '2026-03-26',
    aliases: ['Mary', 'BlueMary'],
  },
  {
    id: 'wolfgang-krauser',
    name: 'Wolfgang Krauser',
    season: 2,
    released: '2026-04-23',
    // 'Klauser' is a measured typo.
    aliases: ['Krauser', 'W. Krauser', 'W.Krauser', 'Krauser von Stroheim', 'Klauser'],
  },
  {
    id: 'mr-karate',
    name: 'Mr. Karate',
    season: 2,
    released: '2026-05-27',
    // 'Kr.Karate' is a measured typo. Bare 'Karate' is absent — its 15
    // outside-paren hits are the DLC-day suffix, and the word is too generic.
    aliases: ['Mr.Karate', 'Mr Karate', 'MrKarate', 'Mr Karatê', 'Kr.Karate'],
  },
  { id: 'kenshiro', name: 'Kenshiro', season: 2, released: '2026-06-29', aliases: ['Ken shiro'] },

  // ── Season 3 · Destined for Revenge (2026) ───────────────────────────────
  {
    id: 'rick-strowd',
    name: 'Rick Strowd',
    season: 3,
    released: '2026-07-23',
    aliases: ['Rick', 'Rick S.', 'Strowd'],
  },
  {
    id: 'duck-king',
    name: 'Duck King',
    season: 3,
    released: '2026-08-27',
    // Bare 'Duck' is deliberately absent: "DUCK (Kenshiro) vs GRIFFON LEGEND
    // (Tizoc)" is a real title, and Duck is the PLAYER there.
    aliases: ['DuckKing'],
  },
];

/** Read the `--char-<id>: #hex;` block out of the design handoff. */
async function readAccents(): Promise<Map<string, string>> {
  const css = await readFile(TOKENS, 'utf8');
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--char-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    out.set(m[1]!, m[2]!.toUpperCase());
  }
  return out;
}

/** WCAG relative luminance / contrast, so the AA floor is asserted rather than
 *  trusted. The handoff states a ratio per accent; this recomputes it. */
const SURFACE = '#171513';
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

async function main(): Promise<void> {
  // A manual roster run is the RIGHT place for a hard stop: it is not the cron,
  // nobody is blocked by it, and a fighter added without their accent is
  // exactly the mistake this script exists to prevent.
  const due = dueExpiries();
  if (due.length) {
    console.error(`✖ ${due.length} expiry(s) due — resolve them before rebuilding the roster:\n`);
    for (const d of due) console.error(`  ${d.id} (${d.kind}, due ${d.date})\n    ${d.action}\n`);
    process.exit(1);
  }

  const accents = await readAccents();
  const errs: string[] = [];

  // Every roster id needs a token. A missing one ships an unstyled fighter.
  for (const c of ROSTER) {
    if (!accents.has(c.id)) errs.push(`${c.id}: no --char-${c.id} in design/handoff/tokens.css`);
  }
  // Every UNRELEASED id that already HAS a token keeps it — that is the point of
  // deriving them early — but an unreleased fighter must not reach the roster.
  const rosterIds = new Set(ROSTER.map((c) => c.id));
  for (const u of UNRELEASED) {
    if (rosterIds.has(u.id)) errs.push(`${u.id} is in ROSTER and in UNRELEASED — pick one`);
  }
  // Ids unique, aliases unique ACROSS the roster (a shared alias is a silent
  // mis-resolution, and longest-first span matching cannot save it).
  const seenId = new Set<string>();
  const aliasOwner = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const c of ROSTER) {
    if (seenId.has(c.id)) errs.push(`duplicate id ${c.id}`);
    seenId.add(c.id);
    for (const a of [c.name, ...c.aliases]) {
      const k = norm(a);
      const owner = aliasOwner.get(k);
      if (owner && owner !== c.id) errs.push(`alias "${a}" claimed by both ${owner} and ${c.id}`);
      aliasOwner.set(k, c.id);
    }
  }
  // The four rejected aliases must STAY rejected. Written as an assertion
  // rather than a comment, because the comment is what a future edit deletes.
  for (const banned of ['griffon', 'griffonmask', 'bogard', 'duck', 'kim', 'karate', 'big']) {
    const owner = aliasOwner.get(banned);
    if (owner) {
      errs.push(
        `"${banned}" is a BANNED alias (measured as a player handle or ambiguous across the ` +
          `roster) but ${owner} claims it — see this file's header before re-adding it`,
      );
    }
  }
  // The AA floor, recomputed rather than trusted.
  for (const c of ROSTER) {
    const hex = accents.get(c.id);
    if (!hex) continue;
    const ratio = contrast(hex, SURFACE);
    if (ratio < 4.5)
      errs.push(`${c.id}: accent ${hex} is ${ratio.toFixed(2)}:1 on ${SURFACE} (<4.5)`);
  }

  if (errs.length) {
    console.error(`✖ roster is invalid:\n${errs.map((e) => `    ${e}`).join('\n')}`);
    process.exit(1);
  }

  const records: CharacterRecord[] = ROSTER.map((c) => ({
    id: c.id,
    name: c.name,
    imgPortrait: `/img/char/${c.id}.webp`,
    imgSplash: `/img/splash/${c.id}.webp`,
    accent: accents.get(c.id)!,
    extra: {
      aliases: c.aliases,
      season: c.season,
      released: c.released,
      // `--suggest` in the engine's verify-comboforge reads extra['full name']
      // and extra.aliases when matching our roster to theirs. `Ken` only
      // resolves to their `ffcotw-ken-masters` through the alias, so this is
      // load-bearing rather than decorative.
      'full name': c.name,
    },
  }));

  await writeFile(OUT, `${JSON.stringify(records, null, 2)}\n`);
  const worst = ROSTER.map((c) => ({ id: c.id, r: contrast(accents.get(c.id)!, SURFACE) })).sort(
    (a, b) => a.r - b.r,
  )[0]!;
  console.log(
    `✓ data/characters.json — ${records.length} fighters ` +
      `(${ROSTER.filter((c) => c.season === 0).length} base + ` +
      `${ROSTER.filter((c) => c.season > 0).length} DLC), ` +
      `${[...aliasOwner.keys()].length} unique alias keys; ` +
      `lowest accent contrast ${worst.id} ${worst.r.toFixed(2)}:1; ` +
      `${UNRELEASED.length} announced-but-unreleased held back`,
  );
}

main();
