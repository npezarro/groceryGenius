import { TripWeights } from "./types";

/** Normalize weights so they sum to 1.0. Returns previous weights if total is 0. */
export function normalizeWeights(
  currentWeights: TripWeights,
  newWeights: Partial<TripWeights>
): TripWeights {
  const updated = { ...currentWeights, ...newWeights };
  const total = updated.price + updated.time + updated.distance;

  if (total > 0) {
    return {
      price: updated.price / total,
      time: updated.time / total,
      distance: updated.distance / total,
    };
  }

  return currentWeights;
}

/** Compute geocoding progress percentage */
export function computeGeocodingProgress(
  geocodedCount: number,
  totalCount: number
): number {
  return (geocodedCount / Math.max(totalCount, 1)) * 100;
}
