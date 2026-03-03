import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, decimal, integer, timestamp, boolean, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Core tables ─────────────────────────────────────────

export const stores = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  hoursJson: jsonb("hours_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  descriptor: text("descriptor"),
  unit: text("unit"),
  organicConventional: text("organic_conventional"),
  bunchFlag: boolean("bunch_flag").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const prices = pgTable("prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id),
  storeId: varchar("store_id").notNull().references(() => stores.id),
  priceType: text("price_type"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }),
  unit: text("unit"),
  capturedAt: timestamp("captured_at").defaultNow(),
  notes: text("notes"),
  isPromotion: boolean("is_promotion").default(false),
  originalPrice: decimal("original_price", { precision: 10, scale: 2 }),
  promotionText: text("promotion_text"),
  promotionStartDate: timestamp("promotion_start_date"),
  promotionEndDate: timestamp("promotion_end_date"),
  memberPrice: decimal("member_price", { precision: 10, scale: 2 }),
  loyaltyRequired: boolean("loyalty_required").default(false),
  // Track who submitted this price (null = system/seed data)
  submittedBy: varchar("submitted_by").references(() => users.id),
});

export const storeItems = pgTable("store_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").notNull().references(() => stores.id),
  itemId: varchar("item_id").notNull().references(() => items.id),
  inStock: boolean("in_stock"),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  items: jsonb("items").notNull(),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tripPlans = pgTable("trip_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shoppingListId: varchar("shopping_list_id").notNull().references(() => shoppingLists.id),
  stores: jsonb("stores").notNull(),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  totalTime: integer("total_time").notNull(),
  totalDistance: real("total_distance").notNull(),
  score: real("score").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Users & Auth ────────────────────────────────────────

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  role: text("role").default("user"),
  emailVerified: boolean("email_verified").default(false),
  verificationCode: text("verification_code"),
  verificationExpires: timestamp("verification_expires"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── User Features ───────────────────────────────────────

export const userFavoriteStores = pgTable("user_favorite_stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  storeId: varchar("store_id").notNull().references(() => stores.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("user_store_unique").on(table.userId, table.storeId),
]);

export const receipts = pgTable("receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  storeId: varchar("store_id").references(() => stores.id),
  storeName: text("store_name"),
  imageData: text("image_data"), // base64 thumbnail for reference
  purchaseDate: timestamp("purchase_date"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  status: text("status").default("pending"), // pending | processed
  parsedItems: jsonb("parsed_items"), // [{name, price, quantity, unit}]
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// ── Relations ───────────────────────────────────────────

export const storesRelations = relations(stores, ({ many }) => ({
  prices: many(prices),
  storeItems: many(storeItems),
  favorites: many(userFavoriteStores),
}));

export const itemsRelations = relations(items, ({ many }) => ({
  prices: many(prices),
  storeItems: many(storeItems),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
  item: one(items, {
    fields: [prices.itemId],
    references: [items.id],
  }),
  store: one(stores, {
    fields: [prices.storeId],
    references: [stores.id],
  }),
  submitter: one(users, {
    fields: [prices.submittedBy],
    references: [users.id],
  }),
}));

export const storeItemsRelations = relations(storeItems, ({ one }) => ({
  store: one(stores, {
    fields: [storeItems.storeId],
    references: [stores.id],
  }),
  item: one(items, {
    fields: [storeItems.itemId],
    references: [items.id],
  }),
}));

export const shoppingListsRelations = relations(shoppingLists, ({ one, many }) => ({
  user: one(users, {
    fields: [shoppingLists.userId],
    references: [users.id],
  }),
  tripPlans: many(tripPlans),
}));

export const tripPlansRelations = relations(tripPlans, ({ one }) => ({
  shoppingList: one(shoppingLists, {
    fields: [tripPlans.shoppingListId],
    references: [shoppingLists.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  favoriteStores: many(userFavoriteStores),
  receipts: many(receipts),
  shoppingLists: many(shoppingLists),
}));

export const userFavoriteStoresRelations = relations(userFavoriteStores, ({ one }) => ({
  user: one(users, {
    fields: [userFavoriteStores.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [userFavoriteStores.storeId],
    references: [stores.id],
  }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  user: one(users, {
    fields: [receipts.userId],
    references: [users.id],
  }),
  store: one(stores, {
    fields: [receipts.storeId],
    references: [stores.id],
  }),
}));

// ── Insert Schemas ──────────────────────────────────────

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
});

export const insertPriceSchema = createInsertSchema(prices).omit({
  id: true,
  capturedAt: true,
});

export const insertStoreItemSchema = createInsertSchema(storeItems).omit({
  id: true,
});

export const insertShoppingListSchema = createInsertSchema(shoppingLists).omit({
  id: true,
  createdAt: true,
});

export const insertTripPlanSchema = createInsertSchema(tripPlans).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  displayName: true,
}).extend({
  email: z.string().email(),
});

export const insertFavoriteStoreSchema = createInsertSchema(userFavoriteStores).omit({
  id: true,
  createdAt: true,
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({
  id: true,
  uploadedAt: true,
});

// ── Types ───────────────────────────────────────────────

export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Price = typeof prices.$inferSelect;
export type InsertPrice = z.infer<typeof insertPriceSchema>;
export type StoreItem = typeof storeItems.$inferSelect;
export type InsertStoreItem = z.infer<typeof insertStoreItemSchema>;
export type ShoppingList = typeof shoppingLists.$inferSelect;
export type InsertShoppingList = z.infer<typeof insertShoppingListSchema>;
export type TripPlan = typeof tripPlans.$inferSelect;
export type InsertTripPlan = z.infer<typeof insertTripPlanSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserFavoriteStore = typeof userFavoriteStores.$inferSelect;
export type InsertFavoriteStore = z.infer<typeof insertFavoriteStoreSchema>;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
