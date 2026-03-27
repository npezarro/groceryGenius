import {
  stores, items, prices, storeItems, shoppingLists, tripPlans, users,
  userFavoriteStores, receipts,
  type Store, type Item, type Price, type StoreItem, type ShoppingList, type TripPlan, type User,
  type InsertStore, type InsertItem, type InsertPrice, type InsertStoreItem,
  type InsertShoppingList, type InsertTripPlan, type InsertUser,
  type UserFavoriteStore,
  type Receipt, type InsertReceipt
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql, desc, asc } from "drizzle-orm";

export class DatabaseStorage {
  // ── User methods ────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // ── Store methods ───────────────────────────────────

  async getAllStores(): Promise<Store[]> {
    return await db.select().from(stores).orderBy(asc(stores.name));
  }

  async getStoresWithinRadius(lat: number, lng: number, radiusMiles: number): Promise<Store[]> {
    return await db.select().from(stores).where(
      sql`
        ${stores.lat} IS NOT NULL AND ${stores.lng} IS NOT NULL AND
        (3959 * acos(cos(radians(${lat})) * cos(radians(${stores.lat})) *
        cos(radians(${stores.lng}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${stores.lat})))) <= ${radiusMiles}
      `
    );
  }

  async createStore(store: InsertStore): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  async updateStoreCoordinates(id: string, lat: number, lng: number): Promise<Store> {
    const [updatedStore] = await db
      .update(stores)
      .set({ lat, lng })
      .where(eq(stores.id, id))
      .returning();
    return updatedStore;
  }

  async importStores(storeList: InsertStore[]): Promise<void> {
    if (storeList.length > 0) {
      await db.insert(stores).values(storeList);
    }
  }

  // ── Item methods ────────────────────────────────────

  async getAllItems(): Promise<Item[]> {
    return await db.select().from(items).orderBy(asc(items.name));
  }

  async searchItems(query: string): Promise<Item[]> {
    return await db.select().from(items).where(
      sql`${items.name} ILIKE ${`%${query}%`} OR ${items.descriptor} ILIKE ${`%${query}%`}`
    );
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  }

  async importItems(itemList: InsertItem[]): Promise<void> {
    if (itemList.length > 0) {
      await db.insert(items).values(itemList);
    }
  }

  async findOrCreateItem(name: string, unit?: string): Promise<Item> {
    const existing = await db.select().from(items).where(
      sql`LOWER(${items.name}) = LOWER(${name})`
    );
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(items).values({ name, unit }).returning();
    return created;
  }

  // ── Price methods ───────────────────────────────────

  async getPricesForItems(itemIds: string[], storeIds?: string[]): Promise<Price[]> {
    if (storeIds && storeIds.length > 0) {
      return await db.select().from(prices).where(
        and(inArray(prices.itemId, itemIds), inArray(prices.storeId, storeIds))
      );
    }
    return await db.select().from(prices).where(inArray(prices.itemId, itemIds));
  }

  async getExistingPricePairs(storeIds: string[], itemIds: string[]): Promise<Array<{storeId: string, itemId: string}>> {
    if (storeIds.length === 0 || itemIds.length === 0) return [];
    return await db.select({
      storeId: prices.storeId,
      itemId: prices.itemId
    }).from(prices).where(
      and(inArray(prices.storeId, storeIds), inArray(prices.itemId, itemIds))
    );
  }

  async createPrice(price: InsertPrice): Promise<Price> {
    const [newPrice] = await db.insert(prices).values(price).returning();
    return newPrice;
  }

  async importPrices(priceList: InsertPrice[]): Promise<void> {
    if (priceList.length > 0) {
      await db.insert(prices).values(priceList);
    }
  }

  async getPromotionalPrices(itemIds?: string[], storeIds?: string[]): Promise<Price[]> {
    const now = new Date();
    const conditions = [
      eq(prices.isPromotion, true),
      sql`(${prices.promotionStartDate} IS NULL OR ${prices.promotionStartDate} <= ${now})`,
      sql`(${prices.promotionEndDate} IS NULL OR ${prices.promotionEndDate} >= ${now})`
    ];
    if (itemIds && itemIds.length > 0) conditions.push(inArray(prices.itemId, itemIds));
    if (storeIds && storeIds.length > 0) conditions.push(inArray(prices.storeId, storeIds));
    return await db.select().from(prices).where(and(...conditions)).orderBy(desc(prices.capturedAt));
  }

  async getPriceHistory(itemId: string, storeId?: string, daysBack: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const baseCondition = and(
      eq(prices.itemId, itemId),
      sql`${prices.capturedAt} >= ${cutoffDate}`
    );
    const condition = storeId ? and(baseCondition, eq(prices.storeId, storeId)) : baseCondition;
    return await db.select({
      id: prices.id, itemId: prices.itemId, storeId: prices.storeId,
      priceType: prices.priceType, price: prices.price, quantity: prices.quantity,
      unit: prices.unit, capturedAt: prices.capturedAt, notes: prices.notes,
      isPromotion: prices.isPromotion, originalPrice: prices.originalPrice,
      promotionText: prices.promotionText, memberPrice: prices.memberPrice,
      loyaltyRequired: prices.loyaltyRequired,
      storeName: stores.name,
    })
      .from(prices)
      .innerJoin(stores, eq(prices.storeId, stores.id))
      .where(condition)
      .orderBy(prices.capturedAt);
  }

  async getPriceHistoryForMultipleItems(itemIds: string[], daysBack: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    return await db.select({
      id: prices.id, itemId: prices.itemId, storeId: prices.storeId,
      priceType: prices.priceType, price: prices.price, quantity: prices.quantity,
      unit: prices.unit, capturedAt: prices.capturedAt, notes: prices.notes,
      isPromotion: prices.isPromotion, originalPrice: prices.originalPrice,
      promotionText: prices.promotionText, promotionStartDate: prices.promotionStartDate,
      promotionEndDate: prices.promotionEndDate, memberPrice: prices.memberPrice,
      loyaltyRequired: prices.loyaltyRequired,
      item: items, store: stores
    })
      .from(prices)
      .innerJoin(items, eq(prices.itemId, items.id))
      .innerJoin(stores, eq(prices.storeId, stores.id))
      .where(and(inArray(prices.itemId, itemIds), sql`${prices.capturedAt} >= ${cutoffDate}`))
      .orderBy(prices.capturedAt);
  }

  /** Get latest community-submitted prices for an item across stores */
  async getCommunityPricesForItem(itemId: string): Promise<Price[]> {
    return await db.select().from(prices)
      .where(and(eq(prices.itemId, itemId), sql`${prices.submittedBy} IS NOT NULL`))
      .orderBy(desc(prices.capturedAt))
      .limit(50);
  }

  // ── Store Items methods ─────────────────────────────

  async getStoreItemsForStore(storeId: string): Promise<StoreItem[]> {
    return await db.select().from(storeItems).where(eq(storeItems.storeId, storeId));
  }

  async updateStoreItemStock(storeId: string, itemId: string, inStock: boolean): Promise<StoreItem> {
    const [existing] = await db.select().from(storeItems).where(
      and(eq(storeItems.storeId, storeId), eq(storeItems.itemId, itemId))
    );
    if (existing) {
      const [updated] = await db.update(storeItems).set({ inStock }).where(eq(storeItems.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(storeItems).values({ storeId, itemId, inStock }).returning();
    return created;
  }

  async importStoreItems(storeItemList: InsertStoreItem[]): Promise<void> {
    if (storeItemList.length > 0) {
      await db.insert(storeItems).values(storeItemList);
    }
  }

  // ── Shopping List methods ───────────────────────────

  async createShoppingList(list: InsertShoppingList): Promise<ShoppingList> {
    const [newList] = await db.insert(shoppingLists).values(list).returning();
    return newList;
  }

  async getShoppingList(id: string): Promise<ShoppingList | undefined> {
    const [list] = await db.select().from(shoppingLists).where(eq(shoppingLists.id, id));
    return list || undefined;
  }

  async getAllShoppingLists(): Promise<ShoppingList[]> {
    return await db.select().from(shoppingLists).orderBy(desc(shoppingLists.createdAt));
  }

  async getUserShoppingLists(userId: string): Promise<ShoppingList[]> {
    return await db.select().from(shoppingLists)
      .where(eq(shoppingLists.userId, userId))
      .orderBy(desc(shoppingLists.updatedAt));
  }

  async updateShoppingList(id: string, userId: string, data: { name?: string; items?: unknown }): Promise<ShoppingList | undefined> {
    const [updated] = await db.update(shoppingLists)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteShoppingList(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(shoppingLists)
      .where(and(eq(shoppingLists.id, id), eq(shoppingLists.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Trip Plan methods ───────────────────────────────

  async createTripPlan(plan: InsertTripPlan): Promise<TripPlan> {
    const [newPlan] = await db.insert(tripPlans).values(plan).returning();
    return newPlan;
  }

  async getTripPlansForShoppingList(shoppingListId: string): Promise<TripPlan[]> {
    return await db.select().from(tripPlans)
      .where(eq(tripPlans.shoppingListId, shoppingListId))
      .orderBy(desc(tripPlans.score));
  }

  // ── Favorite Stores ─────────────────────────────────

  async getFavoriteStores(userId: string): Promise<(UserFavoriteStore & { store: Store })[]> {
    return await db.select({
      id: userFavoriteStores.id,
      userId: userFavoriteStores.userId,
      storeId: userFavoriteStores.storeId,
      createdAt: userFavoriteStores.createdAt,
      store: stores,
    })
      .from(userFavoriteStores)
      .innerJoin(stores, eq(userFavoriteStores.storeId, stores.id))
      .where(eq(userFavoriteStores.userId, userId))
      .orderBy(asc(stores.name));
  }

  async addFavoriteStore(userId: string, storeId: string): Promise<UserFavoriteStore> {
    const [fav] = await db.insert(userFavoriteStores)
      .values({ userId, storeId })
      .onConflictDoNothing()
      .returning();
    // If already exists, fetch and return it
    if (!fav) {
      const [existing] = await db.select().from(userFavoriteStores)
        .where(and(eq(userFavoriteStores.userId, userId), eq(userFavoriteStores.storeId, storeId)));
      return existing;
    }
    return fav;
  }

  async removeFavoriteStore(userId: string, storeId: string): Promise<void> {
    await db.delete(userFavoriteStores)
      .where(and(eq(userFavoriteStores.userId, userId), eq(userFavoriteStores.storeId, storeId)));
  }

  // ── Receipts ────────────────────────────────────────

  async createReceipt(receipt: InsertReceipt): Promise<Receipt> {
    const [newReceipt] = await db.insert(receipts).values(receipt).returning();
    return newReceipt;
  }

  async getUserReceipts(userId: string): Promise<Receipt[]> {
    return await db.select().from(receipts)
      .where(eq(receipts.userId, userId))
      .orderBy(desc(receipts.uploadedAt));
  }

  async getReceipt(id: string, userId: string): Promise<Receipt | undefined> {
    const [receipt] = await db.select().from(receipts)
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)));
    return receipt || undefined;
  }

  async updateReceipt(id: string, userId: string, data: Partial<InsertReceipt>): Promise<Receipt> {
    const [updated] = await db.update(receipts)
      .set(data)
      .where(and(eq(receipts.id, id), eq(receipts.userId, userId)))
      .returning();
    return updated;
  }

  // ── Stats ───────────────────────────────────────────

  async getDataStats(): Promise<{
    storeCount: number;
    itemCount: number;
    priceCount: number;
    geocodedStoreCount: number;
  }> {
    const [storeStats] = await db.select({
      storeCount: sql<number>`count(*)`,
      geocodedStoreCount: sql<number>`count(*) filter (where lat is not null and lng is not null)`
    }).from(stores);

    const [itemStats] = await db.select({
      itemCount: sql<number>`count(*)`
    }).from(items);

    const [priceStats] = await db.select({
      priceCount: sql<number>`count(*)`
    }).from(prices);

    return {
      storeCount: storeStats.storeCount,
      itemCount: itemStats.itemCount,
      priceCount: priceStats.priceCount,
      geocodedStoreCount: storeStats.geocodedStoreCount,
    };
  }
}

export const storage = new DatabaseStorage();
