/**
 * The engine's KnownStats shape, restated for the pipeline track.
 *
 * The pipeline is plain node/tsx and cannot resolve the Nuxt `@engine` alias,
 * so the emitted shapes are declared here exactly as the four sibling
 * pipelines declare theirs. This file must mirror
 * replay-engine/types/stats.ts; emit.ts asserts the parts that matter at
 * runtime, because a type that only exists at compile time cannot catch a
 * drift in a JSON file the engine fetches.
 */
export interface KnownStats {
  totals: {
    replays: number;
    characters: number;
    players: number;
    byPatch?: Record<string, number>;
  };
  characterUsage?: Record<string, number>;
  byPatchUsage?: Record<string, Record<string, number>>;
  playerCharacters?: Record<string, Record<string, number>>;
  [k: string]: unknown;
}
