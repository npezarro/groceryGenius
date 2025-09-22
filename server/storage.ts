import { 
  stores, items, prices, storeItems, shoppingLists, tripPlans, users,
  type Store, type Item, type Price, type StoreItem, type ShoppingList, type TripPlan, type User,
  type InsertStore, type InsertItem, type InsertPrice, type InsertStoreItem, 
  type InsertShoppingList, type InsertTripPlan, type InsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, sql, desc, asc } from "drizzle-orm";

export interface IStorage {
  // User methods (keep existing)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Store methods
  getAllStores(): Promise<Store[]>;
  getStoresWithinRadius(lat: number, lng: number, radiusMiles: number): Promise<Store[]>;
  createStore(store: InsertStore): Promise<Store>;
  updateStoreCoordinates(id: string, lat: number, lng: number): Promise<Store>;
  importStores(stores: InsertStore[]): Promise<void>;

  // Item methods
  getAllItems(): Promise<Item[]>;
  searchItems(query: string): Promise<Item[]>;
  createItem(item: InsertItem): Promise<Item>;
  importItems(items: InsertItem[]): Promise<void>;

  // Price methods
  getPricesForItems(itemIds: string[], storeIds?: string[]): Promise<Price[]>;
  getCheapestPricesForItems(itemIds: string[], storeIds?: string[], userHasMembership?: boolean): Promise<Price[]>;
  getPromotionalPrices(itemIds?: string[], storeIds?: string[]): Promise<Price[]>;
  createPrice(price: InsertPrice): Promise<Price>;
  importPrices(prices: InsertPrice[]): Promise<void>;

  // Store Items methods
  getStoreItemsForStore(storeId: string): Promise<StoreItem[]>;
  updateStoreItemStock(storeId: string, itemId: string, inStock: boolean): Promise<StoreItem>;
  importStoreItems(storeItems: InsertStoreItem[]): Promise<void>;

  // Shopping List methods
  createShoppingList(list: InsertShoppingList): Promise<ShoppingList>;
  getShoppingList(id: string): Promise<ShoppingList | undefined>;
  getAllShoppingLists(): Promise<ShoppingList[]>;

  // Trip Plan methods
  createTripPlan(plan: InsertTripPlan): Promise<TripPlan>;
  getTripPlansForShoppingList(shoppingListId: string): Promise<TripPlan[]>;

  // Stats methods
  getDataStats(): Promise<{
    storeCount: number;
    itemCount: number;
    priceCount: number;
    geocodedStoreCount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Store methods
  async getAllStores(): Promise<Store[]> {
    return await db.select().from(stores).orderBy(asc(stores.name));
  }

  async getStoresWithinRadius(lat: number, lng: number, radiusMiles: number): Promise<Store[]> {
    // Using Haversine formula for distance calculation
    const result = await db.select().from(stores).where(
      sql`
        ${stores.lat} IS NOT NULL AND ${stores.lng} IS NOT NULL AND
        (3959 * acos(cos(radians(${lat})) * cos(radians(${stores.lat})) * 
        cos(radians(${stores.lng}) - radians(${lng})) + 
        sin(radians(${lat})) * sin(radians(${stores.lat})))) <= ${radiusMiles}
      `
    );
    return result;
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

  // Item methods
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

  // Price methods
  async getPricesForItems(itemIds: string[], storeIds?: string[]): Promise<Price[]> {
    if (storeIds && storeIds.length > 0) {
      return await db.select().from(prices).where(
        and(inArray(prices.itemId, itemIds), inArray(prices.storeId, storeIds))
      );
    }
    
    return await db.select().from(prices).where(inArray(prices.itemId, itemIds));
  }

  async getCheapestPricesForItems(itemIds: string[], storeIds?: string[], userHasMembership: boolean = false): Promise<Price[]> {
    const now = new Date();
    
    // Calculate effective price considering promotions and member pricing
    const effectivePriceExpression = sql<number>`
      CASE 
        WHEN ${prices.isPromotion} = true 
          AND (${prices.promotionStartDate} IS NULL OR ${prices.promotionStartDate} <= ${now})
          AND (${prices.promotionEndDate} IS NULL OR ${prices.promotionEndDate} >= ${now})
          AND ${userHasMembership} = true 
          AND ${prices.memberPrice} IS NOT NULL
        THEN LEAST(${prices.price}, ${prices.memberPrice})
        WHEN ${prices.isPromotion} = true 
          AND (${prices.promotionStartDate} IS NULL OR ${prices.promotionStartDate} <= ${now})
          AND (${prices.promotionEndDate} IS NULL OR ${prices.promotionEndDate} >= ${now})
        THEN ${prices.price}
        WHEN ${userHasMembership} = true 
          AND ${prices.memberPrice} IS NOT NULL
        THEN LEAST(${prices.price}, ${prices.memberPrice})
        ELSE ${prices.price}
      END
    `.as('effective_price');

    const subquery = db.select({
      itemId: prices.itemId,
      minPrice: sql<number>`min(${effectivePriceExpression})`.as('min_effective_price')
    })
    .from(prices)
    .where(
      storeIds && storeIds.length > 0 
        ? and(inArray(prices.itemId, itemIds), inArray(prices.storeId, storeIds))
        : inArray(prices.itemId, itemIds)
    )
    .groupBy(prices.itemId)
    .as('cheapest');

    const result = await db.select({
      id: prices.id,
      itemId: prices.itemId,
      storeId: prices.storeId,
      priceType: prices.priceType,
      price: prices.price,
      quantity: prices.quantity,
      unit: prices.unit,
      capturedAt: prices.capturedAt,
      notes: prices.notes,
      isPromotion: prices.isPromotion,
      originalPrice: prices.originalPrice,
      promotionText: prices.promotionText,
      promotionStartDate: prices.promotionStartDate,
      promotionEndDate: prices.promotionEndDate,
      memberPrice: prices.memberPrice,
      loyaltyRequired: prices.loyaltyRequired
    })
      .from(prices)
      .innerJoin(subquery, and(
        eq(prices.itemId, subquery.itemId),
        eq(effectivePriceExpression, subquery.minPrice)
      ));
    
    return result;
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
    
    // Build conditions array
    const conditions = [
      eq(prices.isPromotion, true),
      // Only include active promotions (start date is null or in the past, end date is null or in the future)
      sql`(${prices.promotionStartDate} IS NULL OR ${prices.promotionStartDate} <= ${now})`,
      sql`(${prices.promotionEndDate} IS NULL OR ${prices.promotionEndDate} >= ${now})`
    ];
    
    if (itemIds && itemIds.length > 0) {
      conditions.push(inArray(prices.itemId, itemIds));
    }
    
    if (storeIds && storeIds.length > 0) {
      conditions.push(inArray(prices.storeId, storeIds));
    }
    
    return await db.select()
      .from(prices)
      .where(and(...conditions))
      .orderBy(desc(prices.capturedAt));
  }

  async getPriceHistory(itemId: string, storeId?: string, daysBack: number = 30): Promise<Price[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    const baseCondition = and(
      eq(prices.itemId, itemId),
      sql`${prices.capturedAt} >= ${cutoffDate}`
    );
    
    const condition = storeId 
      ? and(baseCondition, eq(prices.storeId, storeId))
      : baseCondition;
    
    return await db.select()
      .from(prices)
      .where(condition)
      .orderBy(prices.capturedAt);
  }

  async getPriceHistoryForMultipleItems(itemIds: string[], daysBack: number = 30): Promise<(Price & { item: Item, store: Store })[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    return await db.select({
      id: prices.id,
      itemId: prices.itemId,
      storeId: prices.storeId,
      priceType: prices.priceType,
      price: prices.price,
      quantity: prices.quantity,
      unit: prices.unit,
      capturedAt: prices.capturedAt,
      notes: prices.notes,
      isPromotion: prices.isPromotion,
      originalPrice: prices.originalPrice,
      promotionText: prices.promotionText,
      promotionStartDate: prices.promotionStartDate,
      promotionEndDate: prices.promotionEndDate,
      memberPrice: prices.memberPrice,
      loyaltyRequired: prices.loyaltyRequired,
      item: items,
      store: stores
    })
      .from(prices)
      .innerJoin(items, eq(prices.itemId, items.id))
      .innerJoin(stores, eq(prices.storeId, stores.id))
      .where(and(
        inArray(prices.itemId, itemIds),
        sql`${prices.capturedAt} >= ${cutoffDate}`
      ))
      .orderBy(prices.capturedAt);
  }

  // Store Items methods
  async getStoreItemsForStore(storeId: string): Promise<StoreItem[]> {
    return await db.select().from(storeItems).where(eq(storeItems.storeId, storeId));
  }

  async updateStoreItemStock(storeId: string, itemId: string, inStock: boolean): Promise<StoreItem> {
    const [existing] = await db.select().from(storeItems).where(
      and(eq(storeItems.storeId, storeId), eq(storeItems.itemId, itemId))
    );

    if (existing) {
      const [updated] = await db
        .update(storeItems)
        .set({ inStock })
        .where(eq(storeItems.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(storeItems)
        .values({ storeId, itemId, inStock })
        .returning();
      return created;
    }
  }

  async importStoreItems(storeItemList: InsertStoreItem[]): Promise<void> {
    if (storeItemList.length > 0) {
      await db.insert(storeItems).values(storeItemList);
    }
  }

  // Shopping List methods
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

  // Trip Plan methods
  async createTripPlan(plan: InsertTripPlan): Promise<TripPlan> {
    const [newPlan] = await db.insert(tripPlans).values(plan).returning();
    return newPlan;
  }

  async getTripPlansForShoppingList(shoppingListId: string): Promise<TripPlan[]> {
    return await db.select().from(tripPlans)
      .where(eq(tripPlans.shoppingListId, shoppingListId))
      .orderBy(desc(tripPlans.score));
  }

  // Stats methods
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
