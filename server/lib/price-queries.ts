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

/** A receipt line as stored in `receipts.parsedItems`. */
export interface ReceiptLine {
  name?: string;
  price?: number;
  quantity?: number;
  unit?: string;
}

/**
 * Split a receipt's parsed items into lines that can become price records and
 * a count of lines that cannot.
 *
 * `price` is optional on stored lines (AI parsing leaves it unset when the
 * receipt shows no price, and the edit endpoint accepts lines without one), but
 * `prices.price` is a NOT NULL decimal: `String(undefined)` would write
 * "undefined" and the insert would fail partway through the receipt. A line
 * needs a non-empty name and a finite price above zero.
 */
export function usablePriceEntries(items: unknown): {
  usable: Array<ReceiptLine & { name: string; price: number }>;
  skipped: number;
} {
  const lines = Array.isArray(items) ? (items as ReceiptLine[]) : [];
  const usable = lines.filter(
    (it): it is ReceiptLine & { name: string; price: number } =>
      it != null &&
      typeof it.name === "string" &&
      it.name.trim() !== "" &&
      typeof it.price === "number" &&
      Number.isFinite(it.price) &&
      it.price > 0,
  );
  return { usable, skipped: lines.length - usable.length };
}
