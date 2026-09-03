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
const MUTED = '#B5ADA2';
const FAINT = '#8B837A';

interface Chunk {
  path: string;
  /** x offset of this chunk within the whole string, in px. */
  dx: number;
  /** advance width of this chunk alone, so its canvas can be cropped to it. */
  w: number;
}

/**
 * Text → a SEQUENCE of SVG paths, each short, each drawn at the origin and
 * positioned by its measured advance.
 *
 * TWO LIBRSVG LIMITS ARE BEING ROUTED AROUND HERE, and both were found by
 * looking at the rendered card rather than by any assertion on the data:
 *
 *  · a long `d` attribute truncates mid-string. The 46-character subtitle
 *    (~14k chars of path data) renders in full; the 43-character stat line
 *    (~17k) stops after "character usage · ma".
 *  · the same path emitted at a non-zero x offset truncates EARLIER than at
 *    x=0, at the same glyph regardless of coordinate precision.
 *
 * Neither is root-caused. Both disappear if every path is short and starts at
 * the origin, so that is what this does: split on spaces into chunks of at most
 * MAX_CHUNK_CHARS, draw each at (0, size), and place it with the compositor at
 * the advance width of everything before it. Advance widths come from the font,
 * so the spacing is the font's own metrics and not an approximation.
 *
 * The failure this prevents is the one 5d is really about: a card that has
 * silently dropped half a line still looks like a deliberate design.
 */
const MAX_CHUNK_CHARS = 14;

function chunksOf(font: opentype.Font, text: string, size: number): Chunk[] {
  const words = text.split(' ');
  const groups: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > MAX_CHUNK_CHARS && cur) {
      groups.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) groups.push(cur);

  const out: Chunk[] = [];
  let dx = 0;
  for (const [i, g] of groups.entries()) {
    // The chunk carries its own trailing space when it is not the last, so the
    // advance below is the real distance to the next chunk.
    const withSpace = i === groups.length - 1 ? g : `${g} `;
    const d = font.getPath(g, 0, size, size).toPathData(2);
    // ── THE GEOMETRY MUST BE FINITE, AND THIS IS CHECKED ON THE ARTIFACT ───
    // opentype.js emits literal `NaN` coordinates for some glyphs of a
    // VARIABLE font. Measured on Figtree[wght].ttf: the word "character"
    // produced "Q12.22 14.33 NaN 15.78", librsvg stopped parsing at the NaN,
    // and the word rendered as its first letter and nothing else.
    //
    // AN EARLIER VERSION OF THIS CHECK PROBED EACH GLYPH IN ISOLATION AT THE
    // ORIGIN AND DID NOT FIRE — the NaN only appears in the composed,
    // positioned path, which is the thing that actually ships. So the check
    // reads the emitted `d` string itself. That is checklist 5k's rule
    // ("read the current answer live", never a cached proxy for it) applied to
    // geometry rather than to a label cache.
    //
    // It is also why design/fonts/ carries STATIC instances and never variable
    // fonts: the advance width was correct and every glyph reported contours,
    // so both of the other assertions passed while the output was broken.
    if (d.includes('NaN') || d.includes('Infinity')) {
      console.error(
        [
          `✖ non-finite path geometry for ${JSON.stringify(g)} at size ${size}.`,
          `    ${d.slice(Math.max(0, d.indexOf('NaN') - 40), d.indexOf('NaN') + 20)}`,
          '',
          '  librsvg stops parsing a path at the first bad number, so this word would have',
          '  rendered as its first glyph and nothing else — which looks like a design choice.',
          '  Cause, every time so far: a VARIABLE font. Use a static instance.',
        ].join('\n'),
      );
      process.exit(1);
    }
    out.push({ path: d, dx, w: font.getAdvanceWidth(g, size) });
    dx += font.getAdvanceWidth(withSpace, size);
  }
  return out;
}

/** Parse a committed TTF and assert it can actually draw `text`. */
function loadFont(fontFile: string, text: string, size: number): opentype.Font {
  const font = opentype.parse(readFileSync(join(FONT_DIR, fontFile)).buffer as ArrayBuffer);
  const advance = font.getAdvanceWidth(text, size);
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

  const WORD = 'COTW/REPLAY';
  const L1 = 'FATAL FURY: City of the Wolves — replay archive';
  const L2 = 'character usage · matchups · meta over time';
  const L3 = 'replaydatabase.com/ffcotw';

  const anton = loadFont('Anton-Regular.ttf', WORD, 104);
  const figtree = loadFont('Figtree-Regular.ttf', `${L1}${L2}${L3}`, 34);

  // TIGHTLY CROPPED, one small canvas per chunk. Full-page 1200×630 layers
  // still dropped chunks — the first word of the stat line rendered as a single
  // dot with twelve layers in flight — and a small canvas is both the fix and
  // obviously cheaper. Height allows for descenders; width for the chunk's own
  // advance plus a little slack so the final glyph's right sidebearing is not
  // clipped.
  const layer = async (
    d: string,
    fill: string,
    w: number,
    size: number,
    left: number,
    top: number,
  ) => ({
    input: await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w) + 12}" height="${Math.ceil(size * 1.6)}">` +
          `<path d="${d}" fill="${fill}"/></svg>`,
      ),
    )
      .png()
      .toBuffer(),
    left,
    top,
  });

  const line = async (
    font: opentype.Font,
    text: string,
    size: number,
    fill: string,
    left: number,
    top: number,
  ) =>
    Promise.all(
      chunksOf(font, text, size).map((c) =>
        layer(c.path, fill, c.w, size, left + Math.round(c.dx), top),
      ),
    );

  // The wordmark is three chunks so the slash can take the primary colour.
  const cotwW = anton.getAdvanceWidth('COTW', 104);
  const slashW = anton.getAdvanceWidth('/', 104);
  const WORD_Y = 196;
  const layers = [
    ...(await line(anton, 'COTW', 104, TEXT, 70, WORD_Y)),
    ...(await line(anton, '/', 104, PRIMARY, 70 + Math.round(cotwW), WORD_Y)),
    ...(await line(anton, 'REPLAY', 104, TEXT, 70 + Math.round(cotwW + slashW), WORD_Y)),
    ...(await line(figtree, L1, 34, MUTED, 74, 334)),
    ...(await line(figtree, L2, 26, MUTED, 74, 398)),
    ...(await line(figtree, L3, 22, FAINT, 74, 538)),
  ];

  const base = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${SURFACE}"/>
          <stop offset="100%" stop-color="${BG}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect x="0" y="0" width="${W}" height="10" fill="${PRIMARY}"/>
    </svg>`,
  );

  const out = join(ROOT, 'public', 'og-default.png');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await sharp(base).composite(layers).png().toBuffer());
  console.log(
    `✓ public/og-default.png — ${W}×${H}, ${layers.length} outline layer(s) from committed OFL ` +
      `TTFs; no font resolution at raster time, so there is no fallback to be plausible about`,
  );
}

main();
