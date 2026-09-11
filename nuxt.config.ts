import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinURL } from 'ufo';

import charactersData from './data/characters.json';
import playersData from './data/players.json';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const engineDir = fileURLToPath(
  new URL(process.env.ENGINE_PATH || '../replay-engine', new URL('.', import.meta.url)),
);

// Prerender EVERYTHING entity-shaped: the full 30-fighter roster + every player
// profile (players parsed from titles must not 404 on static hosting), plus the
// core routes. The engine seeds '/', '/health' and '/not-found' itself and
// emits sitemap/robots/manifest/404.html from the REAL prerendered list
// (modules/static-artifacts).
//
// CotW keeps the engine's default 'characters' route segment — the game's own
// vocabulary is already the engine's default, so there is nothing to override
// and no URL parity to preserve on a greenfield slug.
const characters = charactersData as { id: string }[];
const players = playersData as { id: string }[];
const appRoutes = [
  '/stats',
  '/characters',
  '/players',
  ...characters.map((c) => `/characters/${c.id}`),
  ...players.map((p) => `/players/${p.id}`),
];

export default defineNuxtConfig({
  // The replay-engine layer: local checkout during co-development (ENGINE_PATH
  // in .env), the pinned tag everywhere else (Vercel leaves ENGINE_PATH unset).
  // Never track a branch — bump the pin deliberately. `install: true` is
  // REQUIRED for git layers: without it the cloned layer gets no node_modules
  // and its runtime deps (@tailwindcss/vite, ufo, …) don't resolve.
  //
  // v0.12.0 is the floor for this app, not a preference: it is the release that
  // shipped the partner registry and the `Combos ↗` nav item, both of which
  // this app's ComboForge block depends on.
  extends: [process.env.ENGINE_PATH || ['github:joeycf/replay-engine#v0.13.0', { install: true }]],

  compatibilityDate: '2025-07-01',

  app: {
    // MUST stay an env expression, never a literal. A literal shadows the
    // engine's own env read (app config wins the layer merge) and
    // NUXT_APP_BASE_URL alone then flips only the runtime router, leaving the
    // prerender seeds root-based → every route 404s the build (STACK §5.3
    // desync, reproduced empirically in Phase 5). The committed default IS
    // production truth: CotW is born behind the shell at
    // replaydatabase.com/ffcotw.
    baseURL: process.env.NUXT_APP_BASE_URL || '/ffcotw/',
  },

  // The CotW skin (palette + three @fontsource families) — loads after the
  // engine's CSS, so its unlayered :root custom properties shadow the umbrella
  // defaults. MUST stay :root, never @theme (STACK §5.13 — see theme.css).
  css: ['~/assets/theme.css'],

  modules: [
    // Seed the entity routes under the final resolved base (same mechanism as
    // the engine's own seeds — static prerender arrays are not base-prefixed).
    function appPrerenderSeeds(_options, nuxt) {
      nuxt.hook('nitro:init', (nitro) => {
        for (const route of appRoutes) {
          nitro.options.prerender.routes.push(joinURL(nuxt.options.app.baseURL, route));
        }
      });
    },
  ],

  nitro: {
    prerender: {
      // The /dev curation pages guard themselves behind import.meta.dev and
      // 404 outside `nuxt dev`; keep the crawler from discovering and
      // prerendering them, so every REAL page failure stays a hard build error.
      ignore: ['/dev'],
    },
  },

  hooks: {
    // The client-fetched files: data/*.json (committed, pipeline-emitted) →
    // public/data/ (gitignored). Lives in the BUILD because Vercel never runs
    // the pipeline. replays.json is the engine's whale; summary.json is the
    // apex selector's card payload, fetched same-origin through the shell's
    // /ffcotw rewrite.
    'build:before'() {
      const dataDir = join(rootDir, 'public/data');
      mkdirSync(dataDir, { recursive: true });
      for (const f of ['replays.json', 'summary.json']) {
        cpSync(join(rootDir, `data/${f}`), join(dataDir, f));
        console.log(`✓ copied data/${f} → public/data/${f}`);
      }
    },
  },

  typescript: {
    typeCheck: false,
    nodeTsConfig: {
      compilerOptions: {
        paths: {
          '@engine': [engineDir],
          '@engine/*': [`${engineDir}/*`],
        },
      },
    },
  },
});
