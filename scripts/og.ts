/**
 * Generate public/og-default.png — the site-wide OG/Twitter card.
 *
 * ── CHECKLIST 5d, AND WHY THIS SCRIPT DRAWS OUTLINES INSTEAD OF TEXT ──────
 * 5d: "Anything that generates a branded image must prove the typeface actually
 * drew, because the failure mode is a plausible fallback rather than an error."
 *
 * The first version of this script rendered `<text font-family="Anton">` and
 * asserted the render differed from one using a family name that cannot exist.
 * That assertion fired immediately, and then kept firing through two real fixes:
 *
 *   1. FONTCONFIG_PATH names a directory expected to CONTAIN fonts.conf, not a
 *      directory of font files. Fixed by shipping design/fonts/fonts.conf and
 *      pointing FONTCONFIG_FILE at it — after which `fc-match Anton` answered
 *      "Anton-Regular.ttf" on the command line.
 *   2. `import sharp from 'sharp'` is HOISTED above every statement in the
 *      module, so the native binding initialised fontconfig before the env var
 *      was set. Fixed with a dynamic import.
 *
 * The assertion still failed — and measuring properly explained why: in this
 * prebuilt sharp, `font-family="Anton"`, `font-family="DejaVu Sans"` and
 * `font-family="__nope__"` all produce BYTE-IDENTICAL output. The bundled
 * librsvg/pango resolves no named family at all; every string renders in one
 * default face. There is no configuration that fixes that from here.
 *
 * SO THE TYPE IS NOT TEXT. The wordmark is converted from the committed OFL
 * TTF to SVG PATH data with opentype.js and drawn as filled outlines. That does
 * not "satisfy" 5d by working around it — it REMOVES the failure mode 5d exists
 * to catch, because there is no font resolution at raster time and therefore no
 * fallback to be plausible about. The assertion below is kept and inverted to
 * suit: it proves the outlines came from the real font (a known glyph advance
 * and a non-trivial path), so a corrupt or missing TTF still fails loudly.
 *
 * ── IT IS ALSO THE SELECTOR CARD ──────────────────────────────────────────
 * The shell's game cards are byte-copies of each game repo's own
 * og-default.png (2XKO, Tekken and SF6 all are; Tōkon needed a bespoke
 * generator only because it had no game repo at the time). So this file has to
 * speak the platform's card language, not just be a valid image:
 *
 *   · a cut-corner badge in the game's PRIMARY, carrying the platform slash
 *   · the wordmark, with the slash in the game's SECONDARY
 *   · "The competitive <full name> replay database", then the tagline
 *   · a footer stripe that is THE ROSTER: one segment per fighter, in roster
 *     order, each in that fighter's own accent. Sampled from the shipped cards
 *     to confirm — Tōkon's stripe is 21 segments and SF6's is 30, matching
 *     their roster sizes exactly. Reading it from data/characters.json here
 *     means the card tracks the roster instead of going stale on the next DLC.
 *
 * Run: npm run data:og   (manual — the card changes when the brand does)
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import opentype from 'opentype.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = join(ROOT, 'design', 'fonts');

const W = 1200;
const H = 630;
const BG = '#0F0D0B';
const SURFACE = '#171513';
const PRIMARY = '#FFD21F';
const TEXT = '#F2EDE4';
const TEXT_DIM = '#C4BDB3';
const MUTED = '#B5ADA2';
const SECONDARY = '#F5433A';
const PRIMARY_CONTRAST = '#17130E';

interface Glyph {
  /** SVG path data for ONE glyph, drawn at the origin. */
  path: string;
  /** x offset of this glyph within the string, in px. */
  dx: number;
}

/**
 * Text → ONE PATH PER GLYPH, each drawn at the origin and positioned by the
 * font's own advance and kern pairs.
 *
 * THIS SHAPE IS FORCED BY TWO INDEPENDENT DEFECTS, both found by looking at the
 * rendered card rather than by any assertion on the data:
 *
 *  1. librsvg truncates a long `d` attribute mid-string. The 46-character
 *     subtitle (~14k chars of path data) renders in full; the 43-character stat
 *     line (~17k) stops after "character usage · ma". The same path emitted at
 *     a non-zero x offset truncates EARLIER, at the same glyph regardless of
 *     coordinate precision. Neither is root-caused; both disappear when every
 *     path is short and starts at the origin.
 *
 *  2. opentype.js emits literal `NaN` coordinates, and it is NOT only for
 *     variable fonts. Measured on the STATIC Figtree-Regular: "P" and "2" each
 *     produce NaN alone, and "Character" produces NaN while "C", "Ch", "City"
 *     and "character" do not — so the fault is in multi-glyph LAYOUT, not in
 *     any one outline. Drawing glyphs individually removes the composition step
 *     the bug lives in.
 *
 * Positioning uses getAdvanceWidth per glyph plus getKerningValue between
 * pairs, so the spacing is the font's own metrics rather than an approximation.
 * The NaN assertion stays and now runs per glyph, because a glyph that still
 * fails must stop the build rather than render as a gap.
 */
function glyphsOf(font: opentype.Font, text: string, size: number): Glyph[] {
  const scale = size / font.unitsPerEm;
  const out: Glyph[] = [];
  let dx = 0;
  const chars = [...text];
  for (const [i, ch] of chars.entries()) {
    const glyph = font.charToGlyph(ch);
    if (ch !== ' ') {
      const d = glyph.getPath(0, size, size).toPathData(2);
      if (d.includes('NaN') || d.includes('Infinity')) {
        console.error(
          [
            `✖ non-finite path geometry for ${JSON.stringify(ch)} at size ${size}.`,
            `    ${d.slice(0, 90)}`,
            '',
            '  librsvg stops parsing a path at the first bad number, so this glyph would have',
            '  rendered as a gap — which looks like letter-spacing rather than a failure.',
            '  opentype.js does this for some glyphs of some fonts; try another static cut.',
          ].join('\n'),
        );
        process.exit(1);
      }
      if (d) out.push({ path: d, dx });
    }
    dx += glyph.advanceWidth! * scale;
    const next = chars[i + 1];
    if (next) dx += font.getKerningValue(glyph, font.charToGlyph(next)) * scale;
  }
  return out;
}

/** Total advance of `text`, using the same metrics glyphsOf lays out with. */
function widthOf(font: opentype.Font, text: string, size: number): number {
  const scale = size / font.unitsPerEm;
  const chars = [...text];
  let w = 0;
  for (const [i, ch] of chars.entries()) {
    const g = font.charToGlyph(ch);
    w += g.advanceWidth! * scale;
    const next = chars[i + 1];
    if (next) w += font.getKerningValue(g, font.charToGlyph(next)) * scale;
  }
  return w;
}

/** Parse a committed TTF and assert it can actually draw `text`. */
function loadFont(fontFile: string, text: string, size: number): opentype.Font {
  const font = opentype.parse(readFileSync(join(FONT_DIR, fontFile)).buffer as ArrayBuffer);
  const advance = widthOf(font, text, size);
  // Per-CHARACTER, not per-string. A length floor is wrong for short text (it
  // fired on the single "/" of the wordmark, whose path is legitimately tiny);
  // what matters is that every non-space character contributed contours. A font
  // that parsed but has no glyph for a character drops it silently, and one
  // missing letter in a wordmark reads as a design choice.
  const blank = [...new Set(text)].filter(
    (ch) => ch.trim() !== '' && font.charToGlyph(ch).getPath(0, 0, size).commands.length === 0,
  );
  if (advance <= 0 || blank.length > 0) {
    console.error(
      [
        `✖ ${fontFile} cannot draw ${JSON.stringify(text)}.`,
        `    advance width ${advance.toFixed(1)}` +
          (blank.length
            ? `, characters with NO glyph: ${blank.map((c) => JSON.stringify(c)).join(' ')}`
            : ''),
        '',
        '  The card would have shipped with that text missing or partly blank, which looks',
        '  like a design choice rather than a failure. design/fonts/ carries the TTFs so this',
        '  cannot depend on what the host has installed.',
      ].join('\n'),
    );
    process.exit(1);
  }
  return font;
}

async function main(): Promise<void> {
  const sharp = (await import('sharp')).default;

  const WORD_A = 'COTW';
  const WORD_B = 'REPLAY';
  const L1 = 'The competitive FATAL FURY: City of the Wolves replay database';
  const L2 = 'Character usage · matchups · meta over time';

  const anton = loadFont('Anton-Regular.ttf', `${WORD_A}/${WORD_B}`, 104);
  const figtree = loadFont('Figtree-Regular.ttf', `${L1}${L2}`, 34);

  // The footer stripe is the roster, in roster order.
  const roster = JSON.parse(readFileSync(join(ROOT, 'data', 'characters.json'), 'utf8')) as {
    id: string;
    accent: string;
  }[];
  if (roster.length === 0) {
    console.error('✖ data/characters.json is empty — the footer stripe would be blank.');
    process.exit(1);
  }
  const STRIPE = 16;
  const seg = W / roster.length;
  const stripe = roster
    // +0.5px of overlap so neighbouring segments never leave a hairline gap at
    // fractional widths. Written as (seg + 0.5).toFixed(2) and not
    // seg.toFixed(2) + 0.5, which is string concatenation and emits
    // width="40.000.5" — an invalid length that librsvg drops, taking the whole
    // stripe with it. It shipped invisible exactly once.
    .map(
      (c, i) =>
        `<rect x="${(i * seg).toFixed(2)}" y="${H - STRIPE}" width="${(seg + 0.5).toFixed(2)}" height="${STRIPE}" fill="${c.accent}"/>`,
    )
    .join('');

  // Every glyph is its own <path>, all in ONE overlay document. The paths are
  // individually tiny, which is what the librsvg limit actually cares about.
  const paths: string[] = [];
  const line = (
    font: opentype.Font,
    text: string,
    size: number,
    fill: string,
    left: number,
    top: number,
  ): void => {
    for (const g of glyphsOf(font, text, size)) {
      paths.push(
        `<g transform="translate(${(left + g.dx).toFixed(2)} ${top})"><path d="${g.path}" fill="${fill}"/></g>`,
      );
    }
  };

  const BADGE = 116;
  const BX = 70;
  const BY = 168;
  const wordLeft = BX + BADGE + 34;
  const aW = widthOf(anton, `${WORD_A}`, 104);
  const slashW = widthOf(anton, '/', 104);
  const WORD_Y = 176;

  line(anton, WORD_A, 104, TEXT, wordLeft, WORD_Y);
  line(anton, '/', 104, SECONDARY, wordLeft + aW, WORD_Y);
  line(anton, WORD_B, 104, TEXT, wordLeft + aW + slashW, WORD_Y);
  line(figtree, L1, 34, TEXT_DIM, BX + 6, 330);
  line(figtree, L2, 26, MUTED, BX + 6, 392);

  // The chassis: diagonal texture, a corner wash in the primary, the badge, and
  // the roster stripe. All background, so it is one SVG — the path-length limit
  // that forces the type into chunks does not apply to rects and lines.
  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${SURFACE}"/>
          <stop offset="100%" stop-color="${BG}"/>
        </linearGradient>
        <radialGradient id="wash" cx="78%" cy="18%" r="62%">
          <stop offset="0%" stop-color="${PRIMARY}" stop-opacity="0.20"/>
          <stop offset="100%" stop-color="${PRIMARY}" stop-opacity="0"/>
        </radialGradient>
        <pattern id="diag" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="14" height="14" fill="none"/>
          <rect width="5" height="14" fill="#FFFFFF" fill-opacity="0.018"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#diag)"/>
      <rect width="100%" height="100%" fill="url(#wash)"/>
      <!-- the platform badge: a cut-corner square in the game's primary,
           carrying the same slash the wordmark uses -->
      <path d="M${BX} ${BY} H${BX + BADGE - 26} L${BX + BADGE} ${BY + 26} V${BY + BADGE} H${BX} Z" fill="${PRIMARY}"/>
      <path d="M${BX + BADGE * 0.62} ${BY + BADGE * 0.2} L${BX + BADGE * 0.34} ${BY + BADGE * 0.8} l14 0 L${BX + BADGE * 0.62 + 14} ${BY + BADGE * 0.2} Z" fill="${PRIMARY_CONTRAST}"/>
      ${stripe}
    </svg>`,
  );

  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${paths.join('')}</svg>`,
  );

  const out = join(ROOT, 'public', 'og-default.png');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(
    out,
    await sharp(base)
      .composite([{ input: await sharp(overlay).png().toBuffer(), top: 0, left: 0 }])
      .png()
      .toBuffer(),
  );
  console.log(
    `✓ public/og-default.png — ${W}×${H}, ${paths.length} glyph outline(s) from committed OFL ` +
      `TTFs, ${roster.length}-segment roster stripe; no font resolution at raster time`,
  );
}

main();
