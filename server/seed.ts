// server/seed.ts
import { storage } from "./storage";
import type { InsertPrice, Store, Item } from "@shared/schema";
import { mockStores, mockItems, mockPricesByStore } from "./mock-data";

export async function seed({ force = false }: { force?: boolean } = {}) {
  const stats = await storage.getDataStats();
  console.log(`[seed] BEFORE stores=${stats.storeCount}, items=${stats.itemCount}, prices=${stats.priceCount}`);

  // Check if mock data already exists by looking for our specific test stores
  const existingStores = await storage.getAllStores();
  const mockStoreNames = mockStores.map(s => s.name);
  const hasMockData = mockStoreNames.some(name => existingStores.some(store => store.name === name));

  const needsSeed = (force || stats.storeCount === 0 || stats.itemCount === 0 || stats.priceCount === 0) && !hasMockData;
  if (!needsSeed) {
    const reason = hasMockData ? "mock data already exists" : "database already populated";
    console.log(`[seed] Skipping — ${reason}.`);
    return { seeded: false, before: stats, after: stats };
  }

  console.log(force ? "[seed] Force seeding mock data…" : "[seed] Seeding mock data…");

  const createdStores: Store[] = [];
  for (const s of mockStores) createdStores.push(await storage.createStore(s));

  const createdItems: Item[] = [];
  for (const i of mockItems) createdItems.push(await storage.createItem(i));

  const storeIdByName = Object.fromEntries(createdStores.map(s => [s.name, s.id]));
  const itemIdByName  = Object.fromEntries(createdItems.map(i => [i.name, i.id]));

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

  const storeItems = createdStores.flatMap(s => createdItems.map(i => ({ storeId: s.id, itemId: i.id, inStock: true })));
  await storage.importStoreItems(storeItems);

  const after = await storage.getDataStats();
  console.log(`[seed] AFTER stores=${after.storeCount}, items=${after.itemCount}, prices=${after.priceCount}`);
  return { seeded: true, before: stats, after };
}