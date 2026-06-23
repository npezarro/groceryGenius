import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { prices, stores, type InsertStore, type InsertItem, type InsertPrice } from "@shared/schema";
import { parseStoresFromCsv, parseItemsFromCsv, parsePricesFromCsv } from "./lib/csv-importer";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { seedTopUp, type SeedMode } from "./seed";
import { hashPassword, verifyPassword, requireAuth, validateInput } from "./auth";
import { getAdapters, getRecentRuns, isSourceStale } from "./pipeline/index";
import { triggerManualRun, triggerSingleRun, getSchedulerStatus } from "./pipeline/scheduler";
import {
  buildPlan,
  scorePlans,
  rankPlans,
  matchItems,
  indexPrices,
  generateCandidatePlans,
  distToStore,
  type StoreWithId,
} from "./lib/trip-planner";
import { geocodeAddress } from "./lib/geocoding";
import { deduplicateLatestByStore, parseDaysParam } from "./lib/price-queries";
import { PRICE_FRESHNESS_DAYS, DEFAULT_ZIP } from "./config";
import { aiEnabled, AIUnavailableError } from "./lib/ai-bridge";
import {
  mealPlanToList,
  organizeListByAisle,
  matchItemsAI,
  suggestSubstitutions,
  parseReceiptText,
  type SubstitutionCandidate,
} from "./lib/ai-features";
import { ocrBase64, OCRUnavailableError } from "./lib/ocr";

// Trip planning algorithm

async function generateTripPlans(
  itemNames: string[],
  userLat: number,
  userLng: number,
  radiusMiles: number,
  weights: { price: number; time: number; distance: number },
  userHasMembership: boolean = false,
  smartMatch: boolean = false
) {
  // Get stores within radius up front so we can scope the catalog to items that
  // actually have fresh prices nearby.
  const nearbyStores = await storage.getStoresWithinRadius(userLat, userLng, radiusMiles);
  const storesWithCoords = nearbyStores.filter(store => store.lat && store.lng);
  if (storesWithCoords.length === 0) return [];
  const nearbyStoreIds = storesWithCoords.map(store => store.id);

  // Match against the LIVE catalog: items with fresh prices at nearby stores.
  // Matching the full catalog maps "milk" to a generic seed item that has no
  // current price, while live prices sit under verbose product names; scoping
  // to fresh-priced items makes the planner reflect real, buyable prices.
  const allItems = await storage.getItemsWithFreshPrices(nearbyStoreIds, PRICE_FRESHNESS_DAYS);
  const catalog = allItems.length > 0 ? allItems : await storage.getAllItems();
  let matchedItems = matchItems(itemNames, catalog);

  // Optional AI semantic matching: when the deterministic matcher leaves items
  // unmatched (e.g. "whole milk" vs "Kroger 2% Reduced Fat Milk"), ask the
  // bridge to map the unmatched user names to real catalog names, then re-match.
  if (smartMatch && aiEnabled() && matchedItems.length < itemNames.length) {
    const matchedNames = new Set(matchedItems.map((i) => i.name.toLowerCase()));
    const unmatched = itemNames.filter((n) => {
      const lower = n.toLowerCase();
      return !catalog.some(
        (it) => it.name.toLowerCase() === lower || matchedNames.has(it.name.toLowerCase()),
      );
    });
    if (unmatched.length > 0) {
      try {
        const mapping = await matchItemsAI(unmatched, catalog.map((i) => i.name));
        const aiNames = Object.values(mapping).filter((v): v is string => Boolean(v));
        if (aiNames.length > 0) {
          const extra = matchItems(aiNames, catalog);
          const seen = new Set(matchedItems.map((i) => i.id));
          matchedItems = [...matchedItems, ...extra.filter((i) => !seen.has(i.id))];
        }
      } catch (err) {
        // AI matching is best-effort; fall back to deterministic matches.
        console.warn("[trip-plan] smartMatch failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  if (matchedItems.length === 0) return [];

  // Get prices for matched items at nearby stores (reuse stores resolved above)
  const itemIds = matchedItems.map(item => item.id);
  const allPrices = await storage.getPricesForItems(itemIds, nearbyStoreIds, PRICE_FRESHNESS_DAYS);

  // Index prices for O(1) lookups
  const { pricesByStore, itemsByStore } = indexPrices(storesWithCoords, allPrices);

  // Build plan helper
  const makePlan = (planStores: StoreWithId[]) =>
    buildPlan(planStores, matchedItems, pricesByStore, itemsByStore, userLat, userLng, userHasMembership);

  // Generate, score, and rank candidate plans
  const candidatePlans = generateCandidatePlans(storesWithCoords, itemsByStore, matchedItems, itemIds, makePlan);
  if (candidatePlans.length === 0) return [];

  scorePlans(candidatePlans, weights);
  return rankPlans(candidatePlans);
}

export async function registerRoutes(app: Express): Promise<Server> {
  const basePath = process.env.BASE_PATH || "";
  const router = express.Router();

  // --- Diagnostics: counts + masked DB info (requires auth or admin key)
  router.get("/api/diag/stats", async (req, res) => {
    if (!req.session.userId && !isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
    try {
      const stats = await storage.getDataStats();
      res.json({ ok: true, stats });
    } catch {
      res.status(500).json({ ok: false, error: "diag_failed" });
    }
  });

  function isAuthorized(req: Request) {
    const adminKey = process.env.ADMIN_KEY;
    const header = req.headers["x-admin-key"];
    return Boolean(adminKey) && header === adminKey;
  }

  router.post("/api/admin/seed", async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }

    // Accept mode via query (?mode=prices) or JSON body { mode, force }
    const modeQ = (req.query?.mode as string)?.toLowerCase();
    const body = typeof req.body === "object" ? req.body : {};
    const mode: SeedMode = (body.mode || modeQ || "all") as SeedMode;
    const force = (body.force ?? req.query?.force === "1") ? true : false;

    try {
      const result = await seedTopUp(mode, force);
      res.json(result);
    } catch (_e) {
      res.status(500).json({ ok: false, error: "seed_failed" });
    }
  });

  // Shopping list endpoints
  router.get("/api/shopping-lists", requireAuth, async (req: Request, res: Response) => {
    try {
      const lists = await storage.getUserShoppingLists(req.session.userId!);
      res.json(lists);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch shopping lists" });
    }
  });

  router.post("/api/shopping-lists", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        name: z.string().min(1).max(200).optional(),
        items: z.array(z.object({
          name: z.string().min(1),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          checked: z.boolean().optional(),
        })).max(500).optional(),
      }).parse(req.body);

      const shoppingList = await storage.createShoppingList({
        name: body.name || "Shopping List",
        items: body.items || [],
        userId: req.session.userId!,
      });
      res.json(shoppingList);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  router.patch("/api/shopping-lists/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        name: z.string().min(1).max(200).optional(),
        items: z.array(z.object({
          name: z.string().min(1),
          quantity: z.number().optional(),
          unit: z.string().optional(),
          checked: z.boolean().optional(),
        })).max(500).optional(),
      }).parse(req.body);

      const updated = await storage.updateShoppingList(req.params.id, req.session.userId!, body);
      if (!updated) {
        res.status(404).json({ error: "List not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  router.delete("/api/shopping-lists/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteShoppingList(req.params.id, req.session.userId!);
      if (!deleted) {
        res.status(404).json({ error: "List not found" });
        return;
      }
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: "Failed to delete shopping list" });
    }
  });

  // Items endpoints
  router.get("/api/items", async (req: Request, res: Response) => {
    try {
      const { search } = req.query;
      let items;
      
      if (search && typeof search === 'string') {
        items = await storage.searchItems(search);
      } else {
        items = await storage.getAllItems();
      }
      
      res.json(items);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // Stores endpoints
  router.get("/api/stores", async (req: Request, res: Response) => {
    try {
      const { lat, lng, radius } = req.query;
      
      if (lat && lng && radius) {
        const parsedLat = parseFloat(lat as string);
        const parsedLng = parseFloat(lng as string);
        const parsedRadius = parseFloat(radius as string);
        if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius) || parsedRadius <= 0) {
          return res.status(400).json({ error: "lat, lng must be valid numbers and radius must be positive" });
        }
        if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
          return res.status(400).json({ error: "lat must be between -90 and 90, lng must be between -180 and 180" });
        }
        const stores = await storage.getStoresWithinRadius(parsedLat, parsedLng, parsedRadius);
        res.json(stores);
      } else {
        const stores = await storage.getAllStores();
        res.json(stores);
      }
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch stores" });
    }
  });

  // Prices endpoints
  router.get("/api/prices", async (req: Request, res: Response) => {
    try {
      const { itemIds, storeIds } = req.query;
      
      let priceResults;
      if (itemIds && typeof itemIds === 'string') {
        const itemIdArray = itemIds.split(',');
        const storeIdArray = storeIds && typeof storeIds === 'string' ? storeIds.split(',') : undefined;
        priceResults = await storage.getPricesForItems(itemIdArray, storeIdArray);
      } else {
        // Get all prices
        priceResults = await db.select().from(prices);
      }
      
      res.json(priceResults);
    } catch (error) {
      console.error("Prices endpoint error:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  // Price comparison: latest price per store for a given item
  router.get("/api/prices/compare/:itemId", async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      // Get the latest price per store for this item
      const results = await db.select({
        storeId: prices.storeId,
        storeName: stores.name,
        storeAddress: stores.address,
        price: prices.price,
        unit: prices.unit,
        isPromotion: prices.isPromotion,
        originalPrice: prices.originalPrice,
        memberPrice: prices.memberPrice,
        capturedAt: prices.capturedAt,
      })
        .from(prices)
        .innerJoin(stores, eq(prices.storeId, stores.id))
        .where(eq(prices.itemId, itemId))
        .orderBy(desc(prices.capturedAt));

      res.json(deduplicateLatestByStore(results));
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch price comparison" });
    }
  });

  // Price history endpoints
  router.get("/api/prices/history/:itemId", async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      const { storeId, days } = req.query;
      const daysBack = parseDaysParam(days as string);
      const history = await storage.getPriceHistory(itemId, storeId as string, daysBack);
      
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch price history" });
    }
  });

  router.get("/api/prices/history", async (req: Request, res: Response) => {
    try {
      const { itemIds, days } = req.query;
      
      if (!itemIds) {
        return res.status(400).json({ error: "itemIds parameter is required" });
      }
      
      const itemIdArray = (itemIds as string).split(',');
      const daysBack = parseDaysParam(days as string);
      
      const history = await storage.getPriceHistoryForMultipleItems(itemIdArray, daysBack);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch price history" });
    }
  });

  // Promotional prices endpoint
  router.get("/api/prices/promotions", async (req: Request, res: Response) => {
    try {
      const { itemIds, storeIds } = req.query;
      
      const itemIdArray = itemIds && typeof itemIds === 'string' ? itemIds.split(',') : undefined;
      const storeIdArray = storeIds && typeof storeIds === 'string' ? storeIds.split(',') : undefined;
      
      const promotions = await storage.getPromotionalPrices(itemIdArray, storeIdArray);
      res.json(promotions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch promotional prices" });
    }
  });

  // Geocoding endpoint
  router.post("/api/geocode", async (req: Request, res: Response) => {
    try {
      const { address } = req.body;
      if (!address || typeof address !== "string") {
        return res.status(400).json({ error: "Address is required" });
      }
      if (address.length > 500) {
        return res.status(400).json({ error: "Address must be 500 characters or fewer" });
      }
      
      const coordinates = await geocodeAddress(address);
      if (coordinates) {
        res.json(coordinates);
      } else {
        res.status(404).json({ error: "Address not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Geocoding failed" });
    }
  });

  // Trip planning endpoint
  router.post("/api/trip-plans", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        items: z.array(z.string().min(1)).min(1),
        location: z.object({
          lat: z.number().min(-90).max(90),
          lng: z.number().min(-180).max(180)
        }),
        radius: z.number().min(1).max(50),
        weights: z.object({
          price: z.number().min(0).max(1),
          time: z.number().min(0).max(1),
          distance: z.number().min(0).max(1)
        }),
        userHasMembership: z.boolean().optional().default(false),
        smartMatch: z.boolean().optional().default(false)
      });

      const { items, location, radius, weights, userHasMembership, smartMatch } = schema.parse(req.body);

      const tripPlans = await generateTripPlans(
        items,
        location.lat,
        location.lng,
        radius,
        weights,
        userHasMembership,
        smartMatch
      );

      res.json(tripPlans);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Trip planning error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Trip planning failed" });
    }
  });

  // ── AI features (alt-account Claude bridge) ──────────

  // AI availability flag for the client to show/hide AI affordances.
  router.get("/api/ai/status", (_req: Request, res: Response) => {
    res.json({ enabled: aiEnabled() });
  });

  function handleAIError(res: Response, error: unknown, label: string) {
    if (error instanceof AIUnavailableError || error instanceof OCRUnavailableError) {
      return res.status(503).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error(`${label} error:`, error);
    res.status(500).json({ error: `${label} failed` });
  }

  // 1. Meal plan / free text -> structured shopping list
  router.post("/api/ai/meal-plan", async (req: Request, res: Response) => {
    try {
      const { text } = z.object({ text: z.string().min(1).max(8000) }).parse(req.body);
      const items = await mealPlanToList(text);
      res.json({ items });
    } catch (error) {
      handleAIError(res, error, "Meal plan");
    }
  });

  // 1b. Organize a list by aisle (no price data needed)
  router.post("/api/ai/organize-list", async (req: Request, res: Response) => {
    try {
      const { items } = z.object({ items: z.array(z.string().min(1)).min(1).max(200) }).parse(req.body);
      const groups = await organizeListByAisle(items);
      res.json({ groups });
    } catch (error) {
      handleAIError(res, error, "Organize list");
    }
  });

  // 2. Substitutions — cheaper, sensible swaps grounded in real nearby prices
  router.post("/api/ai/substitutions", async (req: Request, res: Response) => {
    try {
      const { itemName } = z.object({ itemName: z.string().min(1).max(200) }).parse(req.body);

      const matches = await storage.searchItems(itemName);
      const target = matches[0];
      if (!target) return res.json({ target: itemName, suggestions: [], note: "Item not found" });

      const stores = await storage.getAllStores();
      const storeName = new Map(stores.map((s) => [s.id, s.name]));

      // Target's cheapest fresh price
      const targetPrices = await storage.getPricesForItems([target.id], undefined, PRICE_FRESHNESS_DAYS);
      const targetPrice = targetPrices
        .map((p) => parseFloat(p.price))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b)[0];
      if (targetPrice == null) return res.json({ target: target.name, suggestions: [], note: "No recent price" });

      // Candidate pool: items sharing the head keyword, cheaper than the target
      const keyword = target.name.split(/[\s,]+/).filter((w) => w.length > 2).pop() || target.name;
      const related = (await storage.searchItems(keyword)).filter((i) => i.id !== target.id).slice(0, 40);
      const relPrices = await storage.getPricesForItems(related.map((i) => i.id), undefined, PRICE_FRESHNESS_DAYS);
      const cheapestByItem = new Map<string, { price: number; storeId: string }>();
      for (const p of relPrices) {
        const v = parseFloat(p.price);
        if (isNaN(v)) continue;
        const cur = cheapestByItem.get(p.itemId);
        if (!cur || v < cur.price) cheapestByItem.set(p.itemId, { price: v, storeId: p.storeId });
      }
      const candidates: SubstitutionCandidate[] = related
        .map((i) => {
          const c = cheapestByItem.get(i.id);
          return c && c.price < targetPrice
            ? { itemId: i.id, name: i.name, price: c.price, storeName: storeName.get(c.storeId) || "a nearby store" }
            : null;
        })
        .filter((c): c is SubstitutionCandidate => c != null)
        .sort((a, b) => a.price - b.price)
        .slice(0, 25);

      const suggestions = await suggestSubstitutions({ name: target.name, price: targetPrice }, candidates);
      res.json({ target: target.name, targetPrice, suggestions });
    } catch (error) {
      handleAIError(res, error, "Substitutions");
    }
  });

  // 3. Deals — active promotions, ranked, with AI-written shopper blurbs
  router.get("/api/ai/deals", async (_req: Request, res: Response) => {
    try {
      const promos = await storage.getPromotionalPrices();
      const items = await storage.getAllItems();
      const stores = await storage.getAllStores();
      const itemName = new Map(items.map((i) => [i.id, i.name]));
      const storeName = new Map(stores.map((s) => [s.id, s.name]));

      const deals = promos
        .map((p) => {
          const price = parseFloat(p.price);
          const orig = p.originalPrice ? parseFloat(p.originalPrice) : NaN;
          const savings = !isNaN(orig) && orig > price ? orig - price : 0;
          return {
            item: itemName.get(p.itemId) || "Unknown",
            store: storeName.get(p.storeId) || "Unknown",
            price,
            originalPrice: !isNaN(orig) ? orig : undefined,
            savings,
            promotionText: p.promotionText || undefined,
          };
        })
        .filter((d) => d.savings > 0)
        .sort((a, b) => b.savings - a.savings)
        .slice(0, 25);

      let summary: string | undefined;
      if (deals.length > 0 && aiEnabled()) {
        try {
          const { callBridge } = await import("./lib/ai-bridge");
          summary = await callBridge(
            `Write 2-3 short, upbeat sentences highlighting the best of these grocery deals for a shopper. Mention specific items and savings. No markdown.\n\n` +
              deals
                .slice(0, 10)
                .map((d) => `- ${d.item} at ${d.store}: $${d.price.toFixed(2)}${d.originalPrice ? ` (was $${d.originalPrice.toFixed(2)}, save $${d.savings.toFixed(2)})` : ""}`)
                .join("\n"),
            "haiku",
          );
        } catch {
          /* summary is optional */
        }
      }
      res.json({ deals, summary });
    } catch (error) {
      handleAIError(res, error, "Deals");
    }
  });

  // 4. Receipt ingest — OCR the stored photo, structure it, save items + prices
  router.post("/api/user/receipts/:id/parse", requireAuth, async (req: Request, res: Response) => {
    try {
      const receipt = await storage.getReceipt(req.params.id, req.session.userId!);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      if (!receipt.imageData) return res.status(400).json({ error: "Receipt has no image to parse" });

      const ocrText = await ocrBase64(receipt.imageData);
      if (!ocrText || ocrText.length < 8) {
        return res.status(422).json({ error: "Could not read any text from the receipt image" });
      }
      const parsed = await parseReceiptText(ocrText);

      const updated = await storage.updateReceipt(req.params.id, req.session.userId!, {
        storeName: parsed.storeName ?? receipt.storeName ?? undefined,
        purchaseDate: parsed.purchaseDate ? new Date(parsed.purchaseDate) : undefined,
        totalAmount: parsed.total != null ? String(parsed.total) : undefined,
        parsedItems: parsed.items,
        status: "processed",
      });

      res.json({ receipt: updated, parsed });
    } catch (error) {
      handleAIError(res, error, "Receipt parse");
    }
  });

  // ── Store directory (anonymized community receipt data) ──
  router.get("/api/store-directory", async (req: Request, res: Response) => {
    try {
      const lat = parseFloat(String(req.query.lat ?? ""));
      const lng = parseFloat(String(req.query.lng ?? ""));
      const radius = parseFloat(String(req.query.radius ?? "")) || 10;
      const hasLoc = !isNaN(lat) && !isNaN(lng);

      const stores = hasLoc
        ? await storage.getStoresWithinRadius(lat, lng, radius)
        : await storage.getAllStores();
      const coverage = await storage.getStoreCoverageCounts();
      const receipts = await storage.getAnonymizedReceipts();

      // Group anonymized receipts by storeId, with a name fallback for imports
      // that were never tied to a store record.
      const byStoreId = new Map<string, typeof receipts>();
      const byName = new Map<string, typeof receipts>();
      for (const r of receipts) {
        const items = Array.isArray(r.parsedItems) ? r.parsedItems : [];
        if (items.length === 0) continue;
        if (r.storeId) {
          (byStoreId.get(r.storeId) ?? byStoreId.set(r.storeId, []).get(r.storeId)!).push(r);
        } else if (r.storeName) {
          const key = r.storeName.toLowerCase().trim();
          (byName.get(key) ?? byName.set(key, []).get(key)!).push(r);
        }
      }

      const toDataPoint = (r: typeof receipts[number], fallbackLoc?: string | null) => ({
        date: (r.purchaseDate ?? r.uploadedAt ?? null),
        location: r.storeLocation || fallbackLoc || null,
        total: r.totalAmount != null ? Number(r.totalAmount) : null,
        items: (Array.isArray(r.parsedItems) ? r.parsedItems : []).map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            name: String(o.name ?? ""),
            price: Number(o.price) || 0,
            discount: o.discount != null ? Number(o.discount) : undefined,
            originalPrice: o.originalPrice != null ? Number(o.originalPrice) : undefined,
          };
        }).filter((i) => i.name),
      });

      const usedNameKeys = new Set<string>();
      const entries = stores.map((s) => {
        const direct = byStoreId.get(s.id) ?? [];
        const nameKey = s.name.toLowerCase().trim();
        const named = byName.get(nameKey) ?? [];
        if (named.length) usedNameKeys.add(nameKey);
        const recs = [...direct, ...named];
        const distance = hasLoc && s.lat != null && s.lng != null
          ? distToStore({ lat: s.lat, lng: s.lng }, lat, lng) : undefined;
        return {
          store: { id: s.id, name: s.name, address: s.address, lat: s.lat, lng: s.lng, distance },
          coverage: coverage.get(s.id) ?? 0,
          reportCount: recs.length,
          dataPoints: recs.slice(0, 20).map((r) => toDataPoint(r, s.address)),
        };
      });

      // Imported receipts whose store name matched no store record become their
      // own "community-reported" directory entries.
      for (const [key, recs] of byName) {
        if (usedNameKeys.has(key)) continue;
        entries.push({
          store: { id: `reported:${key}`, name: recs[0].storeName || "Reported store", address: recs[0].storeLocation || "Community reported", lat: null, lng: null, distance: undefined },
          coverage: 0,
          reportCount: recs.length,
          dataPoints: recs.slice(0, 20).map((r) => toDataPoint(r)),
        });
      }

      // Sort: stores with data first, then by distance (if known) else coverage
      entries.sort((a, b) => {
        if ((b.reportCount > 0 ? 1 : 0) !== (a.reportCount > 0 ? 1 : 0)) {
          return (b.reportCount > 0 ? 1 : 0) - (a.reportCount > 0 ? 1 : 0);
        }
        if (hasLoc && a.store.distance != null && b.store.distance != null) {
          return a.store.distance - b.store.distance;
        }
        return b.coverage - a.coverage;
      });

      res.json({ stores: entries });
    } catch (error) {
      console.error("Store directory error:", error);
      res.status(500).json({ error: "Failed to load store directory" });
    }
  });

  // CSV import endpoints
  router.post("/api/import/stores", async (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }
      const mapped = parseStoresFromCsv(csvData);
      if (mapped.length === 0) {
        return res.status(400).json({ error: "CSV data is empty or contains no valid stores" });
      }
      await storage.importStores(mapped as InsertStore[]);
      res.json({ imported: mapped.length, message: "Stores imported successfully" });
    } catch (error) {
      console.error("Store import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  router.post("/api/import/items", async (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }
      const mapped = parseItemsFromCsv(csvData);
      if (mapped.length === 0) {
        return res.status(400).json({ error: "CSV data is empty or contains no valid items" });
      }
      await storage.importItems(mapped as InsertItem[]);
      res.json({ imported: mapped.length, message: "Items imported successfully" });
    } catch (error) {
      console.error("Item import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  router.post("/api/import/prices", async (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }
      const mapped = parsePricesFromCsv(csvData);
      if (mapped.length === 0) {
        return res.status(400).json({ error: "CSV data is empty or contains no valid prices" });
      }
      await storage.importPrices(mapped as InsertPrice[]);
      res.json({ imported: mapped.length, message: "Prices imported successfully" });
    } catch (error) {
      console.error("Price import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  // Geocode stores endpoint
  router.post("/api/geocode-stores", async (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }
    try {
      const stores = await storage.getAllStores();
      const storesWithoutCoords = stores.filter(store => !store.lat || !store.lng);
      
      let geocoded = 0;
      for (const store of storesWithoutCoords) {
        const coords = await geocodeAddress(store.address);
        if (coords) {
          await storage.updateStoreCoordinates(store.id, coords.lat, coords.lng);
          geocoded++;
        }
        // Rate limiting — Nominatim requires max 1 req/sec
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      
      res.json({ 
        geocoded, 
        total: storesWithoutCoords.length,
        message: `Geocoded ${geocoded} of ${storesWithoutCoords.length} stores` 
      });
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Geocoding failed" });
    }
  });

  // Stats endpoint
  router.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDataStats();
      res.json(stats);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ── Auth routes ───────────────────────────────────────

  const registerSchema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6).max(128),
    displayName: z.string().max(100).optional(),
  });

  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required").max(128),
  });

  router.post("/api/auth/register", validateInput(registerSchema), async (req: Request, res: Response) => {
    try {
      const body = req.body;

      const existing = await storage.getUserByUsername(body.username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }
      if (body.email) {
        const emailExists = await storage.getUserByEmail(body.email);
        if (emailExists) {
          return res.status(409).json({ error: "Email already registered" });
        }
      }

      const hashed = await hashPassword(body.password);
      const user = await storage.createUser({
        username: body.username,
        email: body.email,
        password: hashed,
        displayName: body.displayName,
      });

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/api/auth/login", validateInput(loginSchema), async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      const user = await storage.getUserByUsername(username);
      if (!user || !(await verifyPassword(user.password, password))) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName });
    } catch (_error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  router.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        res.status(500).json({ error: "Logout failed" });
        return;
      }
      res.json({ ok: true });
    });
  });

  router.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.json(null);
    }
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.json(null);
      }
      res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName });
    } catch {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // ── Favorite stores ─────────────────────────────────

  router.get("/api/user/favorite-stores", requireAuth, async (req: Request, res: Response) => {
    try {
      const favorites = await storage.getFavoriteStores(req.session.userId!);
      res.json(favorites);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  router.post("/api/user/favorite-stores/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const fav = await storage.addFavoriteStore(req.session.userId!, req.params.storeId);
      res.json(fav);
    } catch (_error) {
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  router.delete("/api/user/favorite-stores/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.removeFavoriteStore(req.session.userId!, req.params.storeId);
      res.json({ ok: true });
    } catch (_error) {
      res.status(500).json({ error: "Failed to remove favorite" });
    }
  });

  // ── User price submissions ──────────────────────────

  router.post("/api/user/prices", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        itemName: z.string().min(1),
        storeId: z.string(),
        price: z.number().positive(),
        unit: z.string().optional(),
        quantity: z.number().optional(),
      }).parse(req.body);

      // Find or create the item
      const item = await storage.findOrCreateItem(body.itemName, body.unit);

      // Insert into the main prices table so it's part of trip planning
      const priceRecord = await storage.createPrice({
        itemId: item.id,
        storeId: body.storeId,
        price: String(body.price),
        unit: body.unit,
        quantity: body.quantity != null ? String(body.quantity) : undefined,
        submittedBy: req.session.userId,
      });

      res.json(priceRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Submit price error:", error);
      res.status(500).json({ error: "Failed to submit price" });
    }
  });

  router.get("/api/prices/community/:itemId", async (req: Request, res: Response) => {
    try {
      const communityPrices = await storage.getCommunityPricesForItem(req.params.itemId);
      res.json(communityPrices);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch community prices" });
    }
  });

  // ── Receipts ────────────────────────────────────────

  router.post("/api/user/receipts", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        storeId: z.string().optional(),
        storeName: z.string().optional(),
        imageData: z.string().max(5242880).optional(), // base64 image, 5MB limit
        purchaseDate: z.string().optional(),
        totalAmount: z.number().optional(),
        parsedItems: z.array(z.object({
          name: z.string(),
          price: z.number(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
        })).max(200).optional(),
      }).parse(req.body);

      const receipt = await storage.createReceipt({
        userId: req.session.userId!,
        storeId: body.storeId,
        storeName: body.storeName,
        imageData: body.imageData,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
        totalAmount: body.totalAmount != null ? String(body.totalAmount) : undefined,
        parsedItems: body.parsedItems,
        status: body.parsedItems && body.parsedItems.length > 0 ? "processed" : "pending",
      });

      res.json(receipt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Receipt upload error:", error);
      res.status(500).json({ error: "Failed to upload receipt" });
    }
  });

  router.get("/api/user/receipts", requireAuth, async (req: Request, res: Response) => {
    try {
      const receipts = await storage.getUserReceipts(req.session.userId!);
      res.json(receipts);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });

  router.get("/api/user/receipts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const receipt = await storage.getReceipt(req.params.id, req.session.userId!);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      res.json(receipt);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch receipt" });
    }
  });

  router.put("/api/user/receipts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        parsedItems: z.array(z.object({
          name: z.string(),
          price: z.number(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
        })).max(200),
      }).parse(req.body);

      const receipt = await storage.updateReceipt(req.params.id, req.session.userId!, {
        parsedItems: body.parsedItems,
        status: "processed",
      });
      if (!receipt) {
        res.status(404).json({ error: "Receipt not found" });
        return;
      }
      res.json(receipt);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update receipt" });
    }
  });

  /** Submit all parsed items from a receipt as price records */
  router.post("/api/user/receipts/:id/submit-prices", requireAuth, async (req: Request, res: Response) => {
    try {
      const receipt = await storage.getReceipt(req.params.id, req.session.userId!);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      if (!receipt.parsedItems || !receipt.storeId) {
        return res.status(400).json({ error: "Receipt must have parsed items and a store" });
      }

      const items = receipt.parsedItems as Array<{ name: string; price: number; quantity?: number; unit?: string }>;
      let submitted = 0;

      for (const entry of items) {
        const item = await storage.findOrCreateItem(entry.name, entry.unit);
        await storage.createPrice({
          itemId: item.id,
          storeId: receipt.storeId,
          price: String(entry.price),
          unit: entry.unit,
          quantity: entry.quantity != null ? String(entry.quantity) : undefined,
          submittedBy: req.session.userId,
        });
        submitted++;
      }

      await storage.updateReceipt(receipt.id, req.session.userId!, { status: "processed" });
      res.json({ ok: true, submitted });
    } catch (error) {
      console.error("Submit receipt prices error:", error);
      res.status(500).json({ error: "Failed to submit prices from receipt" });
    }
  });

  // ── Pipeline / Data Ingestion API ──────────────────────

  /** List all source adapters and their configuration status */
  router.get("/api/pipeline/sources", async (_req, res) => {
    try {
      const sources = getAdapters();
      const status = getSchedulerStatus();
      const runs = await getRecentRuns(10);

      // Check staleness for each source
      const sourcesWithStatus = await Promise.all(
        sources.map(async (s) => ({
          ...s,
          stale: await isSourceStale(s.sourceId),
        })),
      );

      res.json({ sources: sourcesWithStatus, scheduler: status, recentRuns: runs });
    } catch {
      res.status(500).json({ error: "Failed to fetch pipeline status" });
    }
  });

  /** Get recent scrape run history */
  router.get("/api/pipeline/runs", async (req, res) => {
    try {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      const limit = Math.min(isNaN(parsedLimit) || parsedLimit < 1 ? 20 : parsedLimit, 100);
      const runs = await getRecentRuns(limit);
      res.json(runs);
    } catch {
      res.status(500).json({ error: "Failed to fetch run history" });
    }
  });

  /** Trigger a pipeline run for all configured sources (admin only) */
  router.post("/api/pipeline/run", async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }

    try {
      const { zipCode } = req.body || {};
      if (zipCode && !/^\d{5}(-\d{4})?$/.test(zipCode)) {
        return res.status(400).json({ error: "Invalid zipCode format (expected 5-digit or ZIP+4)" });
      }
      const result = await triggerManualRun(zipCode || DEFAULT_ZIP);
      res.json(result);
    } catch (error) {
      console.error("Pipeline run error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Pipeline run failed" });
    }
  });

  /** Trigger a single source adapter (admin only) */
  router.post("/api/pipeline/run/:sourceId", async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
    }

    try {
      const { zipCode } = req.body || {};
      if (zipCode && !/^\d{5}(-\d{4})?$/.test(zipCode)) {
        return res.status(400).json({ error: "Invalid zipCode format (expected 5-digit or ZIP+4)" });
      }
      const result = await triggerSingleRun(req.params.sourceId, zipCode || DEFAULT_ZIP);
      res.json(result);
    } catch (error) {
      console.error("Pipeline single-run error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Pipeline run failed" });
    }
  });

  // Mount the router at the base path (e.g., "/grocerygenius" or "" for root)
  if (basePath) {
    app.use(basePath, router);
  } else {
    app.use(router);
  }

  const httpServer = createServer(app);
  return httpServer;
}
