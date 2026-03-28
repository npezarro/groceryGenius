/**
 * Pipeline orchestrator — coordinates adapters, validation, normalization,
 * and ingestion. Tracks runs in the scrape_runs table for audit/monitoring.
 */

import type { SourceAdapter, PipelineResult, ScrapeRun } from "./types";
import { validateProducts } from "./validator";
import { ingestProducts } from "./normalizer";
import { KrogerAdapter } from "./adapters/kroger";
import { TraderJoesAdapter } from "./adapters/traderjoes";
import { SafewayAdapter } from "./adapters/safeway";
import { WholeFoodsAdapter } from "./adapters/wholefoodsmarket";
import { BLSAdapter } from "./adapters/bls";
import { db } from "../db";
import { scrapeRuns, stores } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { storage } from "../storage";

/** Geocode a zip code using Nominatim (free, no API key) */
async function geocodeZip(zipCode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${zipCode}&country=US&format=json&limit=1`,
      { headers: { "User-Agent": "GroceryGenius/1.0" } }
    );
    if (!response.ok) return null;
    const data = await response.json() as Array<{ lat: string; lon: string }>;
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.warn("[pipeline] Geocode failed for zip", zipCode, err);
  }
  return null;
}

/** All registered adapters */
const adapters: SourceAdapter[] = [
  new BLSAdapter(),
  new KrogerAdapter(),
  new TraderJoesAdapter(),
  new SafewayAdapter(),
  new WholeFoodsAdapter(),
];

/** Get all adapters and their configuration status */
export function getAdapters(): Array<{ sourceId: string; sourceName: string; configured: boolean }> {
  return adapters.map(a => ({
    sourceId: a.sourceId,
    sourceName: a.sourceName,
    configured: a.isConfigured(),
  }));
}

/** Get adapter by source ID */
export function getAdapter(sourceId: string): SourceAdapter | undefined {
  return adapters.find(a => a.sourceId === sourceId);
}

/** Map a source ID to the store name used in the stores table */
const SOURCE_STORE_NAMES: Record<string, string> = {
  bls: "BLS Average Prices",
  kroger: "Kroger",
  traderjoes: "Trader Joe's",
  safeway: "Safeway",
  wholefoods: "Whole Foods",
};

/** Run a single source adapter against a store */
export async function runAdapter(
  sourceId: string,
  storeId: string,
  zipCode: string,
): Promise<PipelineResult> {
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    return { source: sourceId, storeId, itemsIngested: 0, pricesCreated: 0, errors: [`Unknown source: ${sourceId}`], durationMs: 0 };
  }
  if (!adapter.isConfigured()) {
    return { source: sourceId, storeId, itemsIngested: 0, pricesCreated: 0, errors: [`${sourceId} not configured`], durationMs: 0 };
  }

  const startTime = Date.now();

  // Create scrape run record
  const [run] = await db.insert(scrapeRuns).values({
    source: sourceId,
    storeId,
    status: "running",
    itemCount: 0,
  }).returning();

  try {
    // 1. Fetch raw products
    console.log(`[pipeline] Fetching products from ${adapter.sourceName}...`);
    const rawProducts = await adapter.fetchProducts(storeId, zipCode);
    console.log(`[pipeline] Got ${rawProducts.length} raw products from ${adapter.sourceName}`);

    // 2. Validate
    const { valid, rejected } = validateProducts(rawProducts);
    console.log(`[pipeline] Validated: ${valid.length} valid, ${rejected} rejected`);

    // 3. Ensure the store exists in our DB
    let dbStoreId = storeId;
    if (storeId === "auto") {
      const storeName = SOURCE_STORE_NAMES[sourceId] || adapter.sourceName;
      const allStores = await storage.getAllStores();
      const existing = allStores.find(s => s.name.toLowerCase().includes(storeName.toLowerCase()));

      // Try to get real store details from the adapter (e.g., Kroger Locations API)
      const storeDetails = adapter.resolveStoreDetails
        ? await adapter.resolveStoreDetails(zipCode).catch(() => null)
        : null;

      if (existing) {
        dbStoreId = existing.id;
        // Backfill address/coordinates if still placeholder
        if (!existing.lat || !existing.lng || existing.address === `${zipCode} area`) {
          const coords = storeDetails || await geocodeZip(zipCode);
          if (coords) {
            await storage.updateStoreCoordinates(existing.id, coords.lat, coords.lng);
          }
          // Update name and address if we got real details
          if (storeDetails) {
            await db.update(stores)
              .set({
                name: storeDetails.name,
                address: storeDetails.address,
                lat: storeDetails.lat,
                lng: storeDetails.lng,
              })
              .where(eq(stores.id, existing.id));
            console.log(`[pipeline] Updated store "${existing.name}" → "${storeDetails.name}" at ${storeDetails.address}`);
          }
        }
      } else {
        const coords = storeDetails || await geocodeZip(zipCode);
        const newStore = await storage.createStore({
          name: storeDetails?.name || `${storeName} — ${zipCode}`,
          address: storeDetails?.address || `${zipCode} area`,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        dbStoreId = newStore.id;
        console.log(`[pipeline] Created store "${newStore.name}" at ${storeDetails?.address || zipCode}`);
      }
    }

    // 4. Ingest into database
    const { pricesCreated } = await ingestProducts(valid, dbStoreId, sourceId);

    // 5. Update scrape run
    await db.update(scrapeRuns)
      .set({
        status: "completed",
        itemCount: pricesCreated,
        completedAt: new Date(),
      })
      .where(eq(scrapeRuns.id, run.id));

    const durationMs = Date.now() - startTime;
    console.log(`[pipeline] ${adapter.sourceName} completed: ${pricesCreated} prices in ${durationMs}ms`);

    return {
      source: sourceId,
      storeId: dbStoreId,
      itemsIngested: valid.length,
      pricesCreated,
      errors: rejected > 0 ? [`${rejected} products failed validation`] : [],
      durationMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] ${adapter.sourceName} failed:`, errorMsg);

    await db.update(scrapeRuns)
      .set({
        status: "failed",
        errorSummary: errorMsg.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(scrapeRuns.id, run.id));

    return {
      source: sourceId,
      storeId,
      itemsIngested: 0,
      pricesCreated: 0,
      errors: [errorMsg],
      durationMs: Date.now() - startTime,
    };
  }
}

/** Run all configured adapters */
export async function runAllAdapters(zipCode: string = "94102"): Promise<PipelineResult[]> {
  const results: PipelineResult[] = [];

  for (const adapter of adapters) {
    if (!adapter.isConfigured()) {
      console.log(`[pipeline] Skipping ${adapter.sourceName} — not configured`);
      continue;
    }

    try {
      const result = await runAdapter(adapter.sourceId, "auto", zipCode);
      results.push(result);
    } catch (err) {
      console.error(`[pipeline] Fatal error running ${adapter.sourceName}:`, err);
      results.push({
        source: adapter.sourceId,
        storeId: "auto",
        itemsIngested: 0,
        pricesCreated: 0,
        errors: [err instanceof Error ? err.message : String(err)],
        durationMs: 0,
      });
    }
  }

  return results;
}

/** Get recent scrape runs for monitoring */
export async function getRecentRuns(limit: number = 20): Promise<ScrapeRun[]> {
  return await db.select().from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit) as ScrapeRun[];
}

/** Get the last successful run for a source */
export async function getLastSuccessfulRun(sourceId: string): Promise<ScrapeRun | null> {
  const [run] = await db.select().from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, sourceId), eq(scrapeRuns.status, "completed")))
    .orderBy(desc(scrapeRuns.completedAt))
    .limit(1) as ScrapeRun[];
  return run || null;
}

/** Check if a source's data is stale (no successful run in the last N hours) */
export async function isSourceStale(sourceId: string, maxAgeHours: number = 48): Promise<boolean> {
  const lastRun = await getLastSuccessfulRun(sourceId);
  if (!lastRun || !lastRun.completedAt) return true;
  const ageMs = Date.now() - new Date(lastRun.completedAt).getTime();
  return ageMs > maxAgeHours * 60 * 60 * 1000;
}
