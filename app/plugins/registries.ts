import characters from '../../data/characters.json';
import players from '../../data/players.json';
import stats from '../../data/stats.json';
import type { Character, KnownStats, Player } from '@engine/types';

/**
 * Hand the small registries to the engine at build time.
 *
 * PROVIDED, not fetched: bundled once and synchronously available during
 * prerender, which is what makes /characters/:id and /players/:id emit real
 * HTML with data-derived titles instead of an empty shell the crawler sees.
 * replays.json stays client-fetched — it is the whale, and it is the one file
 * the engine reads under the base path at runtime.
 */
export default defineNuxtPlugin(() => {
  provideRegistries({
    characters: characters as Character[],
    players: players as Player[],
    stats: stats as KnownStats,
  });
});
