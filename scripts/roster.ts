/**
 * Shared roster helpers: text normalization and SPAN EXTRACTION.
 *
 * ── NORMALIZATION RUNS BEFORE ANYTHING ELSE ────────────────────────────────
 * Measured on the live corpus 2026-09-03: 182 titles across 18 channels carry
 * an invisible or non-ASCII space — 333 U+202F (narrow no-break space, all on
 * cotwReplays), 142 U+3000 (ideographic space, SNK OFFICIAL), 4 U+00A0, 2
 * U+200B, 3 U+200D. Thirty-one of those titles contain NO ASCII space at all.
 * Descriptions carry far more: 763 U+3000, 335 U+202F, 167 U+200B.
 *
 * WHERE IT ACTUALLY BITES IS NOT THE REGEXES. Both JS and Python spell `\s` to
 * include U+202F, so a regex-boundary parser is already immune — measured: the
 * parse rate is byte-identical with and without normalization (4,447 of 4,800
 * either way). The damage is in EXACT-STRING work, which is most of what a
 * pipeline does with a title once it has parsed it:
 *   · player identity. `handle.toLowerCase().replace(/ /g,'-')` yields a
 *     DIFFERENT id for "MOMO AYASE" and "MOMO<U+202F>AYASE" — 43 of 43 U+202F
 *     titles produce a different player slug raw vs normalized. That mints two
 *     player pages for one person, and both look correct.
 *   · alias lookup. "Duck King" !== "Duck<U+202F>King" under any Map keyed on the
 *     literal string.
 *   · `title.split(' ')` — 19 titles yield fewer than 3 tokens.
 * So the positive control for this must exercise IDENTITY, not the parse rate.
 * A control that only checks "does it still parse" passes on a pipeline with no
 * normalization at all.
 * (Reported upstream: the checklist has no text-normalization step, and the
 * obvious control for one is the ineffective control.)
 *
 * ── CHARACTER MATCHING IS SPAN EXTRACTION, NEVER A SEPARATOR SPLIT ─────────
 * Checklist 5c, and on this game it is load-bearing rather than defensive:
 * `ffCotwReplays` writes "Fatal Fury COTW Automattock Tizoc VS FrancoHwan Rock
 * High Level Gameplay" — the handle and the character are separated by a SPACE
 * and nothing else. There is no separator to split on, so the roster spans ARE
 * the boundary and everything they do not cover is the handle. The same code
 * path then handles "(Rock)", "Rock", "MR BIG 🐺 FDYNASTY", "Mr. Karate" and
 * "B.Jenet" identically, because it never looks at the separators at all.
 *
 * Punctuated names make the split approach actively destructive here:
 * "Kain R. Heinlein", "B. Jenet", "Chun-Li", "Mr. Big" and "Mr. Karate" all
 * shred on a `[/-.]` split, and half-resolve rather than failing cleanly.
 *
 * The safety net is the RESIDUE GATE (scripts/parse.ts): whatever text no span
 * covered is reported verbatim with a count, so a DLC fighter, a new nickname
 * or an uploader's typo surfaces as a counted line instead of vanishing into a
 * silently shorter side.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CharacterRecord } from '../types/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Space-like characters that are not U+0020, folded to a plain space.
 *
 * WRITTEN AS ESCAPES, NEVER AS LITERALS. An earlier version pasted the actual
 * characters into the class, which is unreviewable by construction: the whole
 * point of this list is that these characters are invisible, so a diff adding or
 * removing one shows nothing. ESLint's no-irregular-whitespace rule flags the
 * literal form for the same reason.
 */
const SPACE_LIKE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
/**
 * IN-WORD hyphens, folded to ASCII '-'.
 *
 * MEASURED SPLIT, and the two halves are treated differently on purpose. Across
 * raw/ titles: U+2011 NON-BREAKING HYPHEN appears 28 times and ALL 28 are
 * between two letters — inside "Chun-Li" and "High-Level" on cotwReplays. U+2014
 * EM DASH appears 50 times and only 4 are in-word; U+2013 EN DASH appears 5
 * times and none are. So the first is part of a NAME and must fold, while the
 * dashes are SEPARATORS and are already handled as such by the split rules —
 * folding those would merge a separator into a name.
 *
 * "Chun-Li" not folding cost 18 records on cotwReplays: the alias matcher never
 * fired, the character read as absent, and the record became an honest miss
 * rather than a wrong record. Cheap to find only because the miss was visible.
 */
const IN_WORD_HYPHEN = /[\u2010\u2011\u2012\u2212\uFE63\uFF0D\u00AD]/g;
/** Zero-width and directional marks, deleted outright — they are not spaces and
 *  folding them to one would split a word that was never split. */
const ZERO_WIDTH = /[\u200B-\u200F\u2060\uFEFF\u061C\u180E]/g;

/**
 * NFC + space folding + zero-width removal + whitespace collapse.
 *
 * NFC FIRST, and it matters beyond the spaces: uploaders write "Mr Karatê" and
 * "SÂO BRISADO" with both precomposed and decomposed forms, and a Map keyed on
 * the decomposed spelling misses the precomposed one silently.
 */
export function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(SPACE_LIKE, ' ')
    .replace(IN_WORD_HYPHEN, '-')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function loadCharacters(): Promise<CharacterRecord[]> {
  const raw = await readFile(join(ROOT, 'data', 'characters.json'), 'utf8');
  const characters = JSON.parse(raw) as CharacterRecord[];
  if (characters.length === 0) {
    throw new Error('data/characters.json is empty — run `npm run data:characters` first.');
  }
  return characters;
}

export interface AliasMatch {
  id: string;
  /** [start, end) span of the alias inside the searched text. */
  start: number;
  end: number;
  /** The literal text that matched, for the residue report and for telemetry. */
  literal: string;
}

export interface AliasMatcher {
  /** All character matches in the text, longest-alias-first, overlaps
   *  suppressed — so "Kain R. Heinlein" absorbs the inner "Kain", and
   *  "Blue Mary" is never seen as "Mary" with a stray "Blue". */
  find(text: string): AliasMatch[];
  /** Ordered, de-duplicated ids — the union a side fielded, first appearance
   *  first, which is exactly the engine's `Side.characters` contract. */
  ids(text: string): string[];
  /** The single character a fragment names, or null when it names zero or 2+. */
  one(text: string): string | null;
  /** The characters of `text` that no span covered and that are not ordinary
   *  separator punctuation or known decoration. Non-empty residue is a report
   *  line, never a silent drop. */
  residue(text: string): string;
  /** Every alias key, for gates and for the report. */
  aliasCount: number;
}

/** Punctuation and decoration that is never part of a handle or a name, so its
 *  presence in the residue means nothing. Kept narrow on purpose: the residue
 *  gate is only useful if it still reports real words. */
const RESIDUE_NOISE =
  /(?:\b(?:vs|versus|ft|feat|and|the|de|el|la|a|an|of|match|matches|replay|replays|gameplay|high|level|rank|ranked|ranking|online|set|ft\d|fatal|fury|cotw|ff|city|wolves|season|dlc|day|one|hd|4k|1080p|60fps|shorts|short|new|update|patch|now|live|full|best|top|pro|player|players|round|final|finals|semi|winners|losers|pools|bracket|tournament|offline|evo|combo|combos|guide|guides|training|ranqueadas|partidas|show|hard)\b|[^\p{L}\p{N}]+|\d+)/giu;

/**
 * Build the matcher.
 *
 * LONGEST-FIRST IS THE WHOLE CORRECTNESS ARGUMENT. Aliases are sorted by length
 * descending and compiled into one alternation; the scan then takes
 * non-overlapping matches left to right. Without that ordering "Kain" wins
 * inside "Kain R. Heinlein" and "Mary" wins inside "Blue Mary", producing a
 * shorter alias that happens to resolve to the same id — harmless there — but
 * also "Ken" inside "Kenshiro", which resolves to the WRONG fighter. The
 * trailing `(?![\p{L}\p{N}])` guard makes that specific case impossible
 * independently, and the ordering makes it impossible in general.
 */
export function buildAliasMatcher(characters: CharacterRecord[]): AliasMatcher {
  const pairs: { alias: string; id: string }[] = [];
  for (const c of characters) {
    const aliases = (c.extra?.aliases as string[] | undefined) ?? [];
    for (const a of [c.name, ...aliases]) pairs.push({ alias: a, id: c.id });
  }
  pairs.sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));

  // A literal alias becomes a pattern in which every run of space / period /
  // hyphen matches any of them, in any amount: "B. Jenet" then matches
  // "B.Jenet", "B Jenet" and "B.  Jenet" from one entry. That is why the alias
  // list does not have to enumerate spacing variants — only genuinely different
  // SPELLINGS.
  const flex = (a: string) =>
    a
      .split('')
      .map((ch) => (/[.\-\s]/.test(ch) ? '[.\\-\\s]*' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('');
  const RE = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${pairs.map((p) => flex(p.alias)).join('|')})(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const byKey = new Map<string, string>();
  for (const p of pairs) byKey.set(p.alias.toLowerCase().replace(/[^a-z0-9]/g, ''), p.id);

  const resolve = (literal: string): string | undefined =>
    byKey.get(literal.toLowerCase().replace(/[^a-z0-9]/g, ''));

  const find = (text: string): AliasMatch[] => {
    const t = normalizeText(text);
    const out: AliasMatch[] = [];
    RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(t)) !== null) {
      const id = resolve(m[0]);
      if (id) out.push({ id, start: m.index, end: m.index + m[0].length, literal: m[0] });
      // A zero-length match would spin; aliases are never empty, but the guard
      // costs nothing and a bad alias entry would otherwise hang the cron.
      if (m[0].length === 0) RE.lastIndex += 1;
    }
    return out;
  };

  const ids = (text: string): string[] => {
    const seen: string[] = [];
    for (const m of find(text)) if (!seen.includes(m.id)) seen.push(m.id);
    return seen;
  };

  return {
    find,
    ids,
    one: (text) => {
      const found = ids(text);
      return found.length === 1 ? found[0]! : null;
    },
    residue: (text) => {
      const t = normalizeText(text);
      const spans = find(t);
      let prev = 0;
      const gaps: string[] = [];
      for (const s of spans) {
        gaps.push(t.slice(prev, s.start));
        prev = s.end;
      }
      gaps.push(t.slice(prev));
      return gaps.join(' ').replace(RESIDUE_NOISE, ' ').replace(/\s+/g, ' ').trim();
    },
    aliasCount: byKey.size,
  };
}

/** Player id from a handle. NORMALIZED FIRST — this is the function the
 *  invisible-space finding is really about (see the header). */
export function playerId(handle: string): string {
  return normalizeText(handle)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
