// server/seed.ts
import { storage } from "./storage";
import type { InsertPrice, Store, Item } from "@shared/schema";
import { mockStores, mockItems, mockPricesByStore } from "./mock-data";

/**
 * Seed the database with mock data if the core tables are EMPTY.
 * Safe to call at every boot; no-ops once data exists.
 */
export async function seedIfEmpty() {
  const stats = await storage.getDataStats();

  // BEFORE LOG
  console.log(`[seed] BEFORE counts stores=${stats.storeCount}, items=${stats.itemCount}, prices=${stats.priceCount}`);

  // FIX: seed if ANY are empty, or when SEED_FORCE=1
  const needsSeed =
    process.env.SEED_FORCE === "1" ||
    stats.storeCount === 0 ||
    stats.itemCount === 0 ||
    stats.priceCount === 0;

  if (!needsSeed) {
    console.log("[seed] Skipping — database already populated.");
    return;
  }

  console.log("[seed] Seeding mock data…");

  // Insert stores/items and keep their IDs by name for price linking
  const createdStores: Store[] = [];
  for (const s of mockStores) {
    createdStores.push(await storage.createStore(s));
  }
  const createdItems: Item[] = [];
  for (const i of mockItems) {
    createdItems.push(await storage.createItem(i));
  }

  const storeIdByName = Object.fromEntries(createdStores.map(s => [s.name, s.id]));
  const itemIdByName  = Object.fromEntries(createdItems.map(i => [i.name, i.id]));

  // Build InsertPrice rows from name-based mapping
  const priceRows: InsertPrice[] = mockPricesByStore.map(p => ({
    storeId: storeIdByName[p.storeName],
    itemId:  itemIdByName[p.itemName],
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
  }));

  await storage.importPrices(priceRows);

  // Mark all items in stock at all stores (simple demo behavior)
  const storeItems = createdStores.flatMap(s =>
    createdItems.map(i => ({ storeId: s.id, itemId: i.id, inStock: true }))
  );
  await storage.importStoreItems(storeItems);

  const after = await storage.getDataStats();
  console.log(`[seed] AFTER counts stores=${after.storeCount}, items=${after.itemCount}, prices=${after.priceCount}`);
}