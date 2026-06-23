/**
 * Centralized runtime configuration for Grocery Genius.
 *
 * Single source of truth for values that were previously hardcoded across
 * the pipeline, scheduler, and routes.
 */

/**
 * Default zip code used when none is supplied. Set to the operator's home
 * neighborhood (Inner Richmond, SF) so the pipeline scrapes locally relevant
 * stores. Override per-request via the `zipCode` parameter.
 */
export const DEFAULT_ZIP = process.env.DEFAULT_ZIP || "94118";

/**
 * Freshness window (days) for prices used in trip planning and "current price"
 * comparisons. Prices older than this are treated as stale (e.g. seed data)
 * and excluded so recommendations reflect recently captured prices.
 */
export const PRICE_FRESHNESS_DAYS = Number(process.env.PRICE_FRESHNESS_DAYS) || 21;
