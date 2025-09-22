// server/seed.ts
import { storage } from "./storage";
import type { InsertPrice } from "@shared/schema";
import { mockStores, mockItems, mockPricesByStore } from "./mock-data";

export type SeedMode = "stores" | "items" | "prices" | "all";
type Counts = { storeCount: number; itemCount: number; priceCount: number };
type Result = {
  ok: true;
  seeded: boolean;
  inserted: { stores: number; items: number; prices: number; storeItems: number };
  before: Counts;
  after: Counts;
  message: string;
};

async function getCounts(): Promise<Counts> {
  const s = await storage.getDataStats();
  return { storeCount: s.storeCount, itemCount: s.itemCount, priceCount: s.priceCount };
}

// Helpers to fetch existing by name — adapt to your storage API
async function mapStoreIdsByName(): Promise<Record<string, string>> {
  const all = await storage.getAllStores();
  return Object.fromEntries(all.map((s: any) => [s.name, s.id]));
}
async function mapItemIdsByName(): Promise<Record<string, string>> {
  const all = await storage.getAllItems();
  return Object.fromEntries(all.map((i: any) => [i.name, i.id]));
}

async function ensureStores(): Promise<number> {
  const existing = await mapStoreIdsByName();
  let inserted = 0;
  for (const s of mockStores) {
    if (!existing[s.name]) {
      const created = await storage.createStore(s);
      existing[s.name] = created.id;
      inserted++;
    }
  }
  return inserted;
}

async function ensureItems(): Promise<number> {
  const existing = await mapItemIdsByName();
  let inserted = 0;
  for (const i of mockItems) {
    if (!existing[i.name]) {
      const created = await storage.createItem(i);
      existing[i.name] = created.id;
      inserted++;
    }
  }
  return inserted;
}

async function ensurePrices(force = false): Promise<{ prices: number; storeItems: number }> {
  // Make sure we can resolve names to IDs
  const storeIdByName = await mapStoreIdsByName();
  const itemIdByName = await mapItemIdsByName();

  // Collect all potential store/item combinations from mock data
  const potentialPairs: Array<{ storeId: string; itemId: string; data: any }> = [];
  for (const p of mockPricesByStore) {
    const storeId = storeIdByName[p.storeName];
    const itemId  = itemIdByName[p.itemName];
    if (!storeId || !itemId) continue; // dependency not satisfied; caller should have run ensureStores/ensureItems
    potentialPairs.push({ storeId, itemId, data: p });
  }

  // Get existing price pairs to check for duplicates
  const storeIds = [...new Set(potentialPairs.map(p => p.storeId))];
  const itemIds = [...new Set(potentialPairs.map(p => p.itemId))];
  const existingPairs = await storage.getExistingPricePairs(storeIds, itemIds);
  
  // Create a set for fast lookup of existing pairs
  const existingPairSet = new Set(existingPairs.map(p => `${p.storeId}:${p.itemId}`));

  const toInsert: InsertPrice[] = [];
  const missingPairs: Array<{ storeId: string; itemId: string }> = [];

  for (const { storeId, itemId, data: p } of potentialPairs) {
    const pairKey = `${storeId}:${itemId}`;
    const exists = existingPairSet.has(pairKey);
    
    // Only insert if it doesn't exist OR if force=true
    if (!exists || force) {
      const row: InsertPrice = {
        storeId,
        itemId,
        price: String(p.price),
        unit: p.unit,
        quantity: p.quantity != null ? String(p.quantity) : undefined,
        priceType: p.priceType,
        isPromotion: p.isPromotion ?? false,
        originalPrice: p.originalPrice != null ? String(p.originalPrice) : undefined,
        promotionText: p.promotionText,
        promotionStartDate: p.promotionStartDate,
        promotionEndDate: p.promotionEndDate,
        memberPrice: p.memberPrice != null ? String(p.memberPrice) : undefined,
        loyaltyRequired: p.loyaltyRequired ?? false
      };
      
      toInsert.push(row);
      missingPairs.push({ storeId, itemId });
    }
  }

  let pricesInserted = 0;
  if (toInsert.length) {
    const res = await storage.importPrices(toInsert);
    // If importPrices returns inserted count, use it; else approximate:
    pricesInserted = Array.isArray(res) ? res.length : toInsert.length;
  }

  // Mark all seeded items in stock at the corresponding stores
  // storage.importStoreItems([{ storeId, itemId, inStock: true }, ...])
  let storeItemsInserted = 0;
  if (storage.importStoreItems) {
    const payload = missingPairs.map(({ storeId, itemId }) => ({ storeId, itemId, inStock: true }));
    if (payload.length) {
      const r = await storage.importStoreItems(payload);
      storeItemsInserted = Array.isArray(r) ? r.length : payload.length;
    }
  }

  return { prices: pricesInserted, storeItems: storeItemsInserted };
}

/**
 * Top-up seeding controller. Ensures dependencies:
 * prices => items => stores (run in this order: stores, items, prices).
 */
export async function seedTopUp(mode: SeedMode = "all", force = false): Promise<Result> {
  const before = await getCounts();
  console.log(`[seed] BEFORE stores=${before.storeCount} items=${before.itemCount} prices=${before.priceCount} mode=${mode} force=${force}`);

  let storesInserted = 0, itemsInserted = 0, pricesInserted = 0, storeItemsInserted = 0;

  const needStores = mode === "stores" || mode === "all" || mode === "prices" || mode === "items";
  const needItems  = mode === "items"  || mode === "all" || mode === "prices";
  const needPrices = mode === "prices" || mode === "all";

  if (needStores) storesInserted += await ensureStores();
  if (needItems)  itemsInserted  += await ensureItems();
  if (needPrices) {
    const r = await ensurePrices(force);
    pricesInserted += r.prices;
    storeItemsInserted += r.storeItems;
  }

  const after = await getCounts();
  const seeded = (storesInserted + itemsInserted + pricesInserted + storeItemsInserted) > 0;

  const message = seeded
    ? `Inserted stores=${storesInserted}, items=${itemsInserted}, prices=${pricesInserted}`
    : `No changes (already present for mode=${mode}).`;

  console.log(`[seed] AFTER  stores=${after.storeCount} items=${after.itemCount} prices=${after.priceCount} :: ${message}`);

  return { ok: true, seeded, inserted: { stores: storesInserted, items: itemsInserted, prices: pricesInserted, storeItems: storeItemsInserted }, before, after, message };
}