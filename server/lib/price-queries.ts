/**
 * Pure helper functions for price query routes.
 *
 * Extracted from routes.ts to enable unit testing of:
 * - Price comparison deduplication (latest-per-store, sorted by price)
 * - Days parameter parsing (shared across history endpoints)
 */

/**
 * Given price rows sorted by capturedAt descending (newest first),
 * deduplicate to the latest price per store, then sort ascending by price.
 *
 * Each row must have at least `storeId` and `price` (as a string parseable to float).
 */
export function deduplicateLatestByStore<
  T extends { storeId: string; price: string },
>(rows: T[]): T[] {
  const latestByStore = new Map<string, T>();
  for (const row of rows) {
    if (!latestByStore.has(row.storeId)) {
      latestByStore.set(row.storeId, row);
    }
  }
  return [...latestByStore.values()].sort(
    (a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0),
  );
}

/**
 * Parse a `days` query parameter string into a bounded integer.
 *
 * Returns `defaultDays` when the input is undefined, empty, NaN, or < 1.
 * Clamps to `maxDays` when the parsed value exceeds it.
 */
export function parseDaysParam(
  raw: string | undefined,
  defaultDays = 30,
  maxDays = 365,
): number {
  if (!raw) return defaultDays;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) return defaultDays;
  return Math.min(parsed, maxDays);
}
