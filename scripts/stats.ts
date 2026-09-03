/**
 * Aggregate the parse substrate into the engine's KnownStats shape.
 *
 * ── THE STAT UNIT IS SIDE APPEARANCES (checklist step 8) ───────────────────
 * CotW is 1v1, so a side fields one character and a mirror match adds TWO to
 * that character's total — which is what the engine's "appearances" labels read
 * as, and what its own fixtures emit.
 *
 * The alternative unit — a per-record deduped union, "how many replays feature
 * this character" — is legitimate for a tag game on a shared roster, where both
 * sides routinely field the same fighter and double-counting a mirror would
 * mislead. It is the WRONG unit here: on a 1v1 game the deduped union silently
 * under-counts every mirror match, and this corpus has 148 of them.
 *
 * ONE UNIT, EVERYWHERE. characterUsage, byPatchUsage and playerCharacters share
 * a denominator, so the usage bars, the per-patch timeline and the player
 * tables agree. Mixing them makes three panels disagree with no visible symptom,
 * which is the failure step 8 exists to prevent. emit.ts asserts the totals.
 *
 * NO pairingUsage. There is no same-side duo on a 1v1 game; emitting C(n,2)
 * over a counter-pick side would fabricate pairs that were never played.
 */

import type { KnownStats } from '../types/stats-shim';
import type { MatchVideo } from '../types/index';

/** GameConfig.charactersPerSide, restated for the pipeline track (which cannot
 *  resolve the Nuxt `@engine` alias). app/app.config.ts is the authority. */
export const CHARACTERS_PER_SIDE = 1;

const bump = (m: Record<string, number>, k: string, n = 1) => {
  m[k] = (m[k] ?? 0) + n;
};

export function buildStats(
  records: MatchVideo[],
  characterIds: string[],
  patchOrder: string[],
): KnownStats {
  const characterUsage: Record<string, number> = {};
  const playerCharacters: Record<string, Record<string, number>> = {};
  const byPatchUsage: Record<string, Record<string, number>> = {};
  const byPatch: Record<string, number> = {};

  // byPatchUsage key ORDER is the timeline order — JSON preserves insertion
  // order and the engine reads it as the x-axis of the meta chart. Seeded from
  // the patch table (oldest → newest) rather than from record order, so a patch
  // with no replays still holds its slot instead of the chart silently
  // re-ordering when one arrives.
  for (const p of patchOrder) {
    byPatchUsage[p] = {};
    byPatch[p] = 0;
  }

  const players = new Set<string>();
  for (const r of records) {
    if (byPatch[r.patch] === undefined) {
      byPatchUsage[r.patch] = {};
      byPatch[r.patch] = 0;
    }
    byPatch[r.patch]! += 1;
    for (const s of r.sides) {
      players.add(s.player);
      for (const c of s.characters) {
        bump(characterUsage, c);
        bump((playerCharacters[s.player] ??= {}), c);
        bump(byPatchUsage[r.patch]!, c);
      }
    }
  }

  // Patches with no replays are dropped from the emitted tables: an empty
  // column on the meta chart is noise, and the facet already lists every patch
  // from GameConfig.patchGroups whether or not it has data.
  //
  // Rebuilt rather than deleted from, so INSERTION ORDER survives — the engine
  // reads byPatchUsage key order as the meta chart's x-axis, and `delete`
  // leaves order intact today but is a property of the engine nobody should
  // have to rely on.
  const usedPatches = Object.keys(byPatch).filter((p) => byPatch[p]! > 0);
  const byPatchUsed: Record<string, number> = {};
  const byPatchUsageUsed: Record<string, Record<string, number>> = {};
  for (const p of usedPatches) {
    byPatchUsed[p] = byPatch[p]!;
    byPatchUsageUsed[p] = byPatchUsage[p]!;
  }

  return {
    totals: {
      replays: records.length,
      characters: characterIds.length,
      players: players.size,
      byPatch: byPatchUsed,
    },
    characterUsage,
    byPatchUsage: byPatchUsageUsed,
    playerCharacters,
  };
}
