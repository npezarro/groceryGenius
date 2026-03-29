import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { prices, stores, type Price, type InsertStore, type InsertItem, type InsertPrice } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { seedTopUp, type SeedMode } from "./seed";
import { hashPassword, verifyPassword, requireAuth, validateInput } from "./auth";
import { getAdapters, getRecentRuns, isSourceStale } from "./pipeline/index";
import { triggerManualRun, triggerSingleRun, getSchedulerStatus } from "./pipeline/scheduler";

// Geocoding — Mapbox primary, Nominatim (OpenStreetMap) fallback
async function geocodeWithNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  const encodedAddress = encodeURIComponent(address);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
    { headers: { "User-Agent": "GroceryGenius/1.0" } }
  );
  if (!response.ok) return null;
  const data = await response.json();
  if (data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;

  if (mapboxToken) {
    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1`
      );
      if (!response.ok) throw new Error(`Mapbox API error: ${response.statusText}`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
      return null;
    } catch (error) {
      console.error("Mapbox geocoding error, falling back to Nominatim:", error);
    }
  }

  // Fallback to Nominatim (no API key required)
  try {
    return await geocodeWithNominatim(address);
  } catch (error) {
    console.error("Nominatim geocoding error:", error);
    return null;
  }
}

// CSV parsing utility
function parseCSV(csvText: string): string[][] {
  const lines = csvText.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  });
}

// Trip planning algorithm
// Helper function to calculate effective price considering promotions and member pricing
function calculateEffectivePrice(price: Price, userHasMembership: boolean = false): number {
  const now = new Date();
  
  // Start with original price or current price as fallback
  let effectivePrice = parseFloat(price.originalPrice || price.price);
  const currentPrice = parseFloat(price.price);
  
  // Check if promotion is active
  const isActivePromotion = price.isPromotion && 
    (!price.promotionStartDate || new Date(price.promotionStartDate) <= now) &&
    (!price.promotionEndDate || new Date(price.promotionEndDate) >= now);
  
  // Apply promotional pricing if active
  if (isActivePromotion) {
    effectivePrice = Math.min(effectivePrice, currentPrice);
  }
  
  // Apply member pricing if user has membership and member price exists
  if (userHasMembership && price.memberPrice) {
    const memberPrice = parseFloat(price.memberPrice);
    effectivePrice = Math.min(effectivePrice, memberPrice);
  }
  
  return effectivePrice;
}

async function generateTripPlans(
  itemNames: string[],
  userLat: number,
  userLng: number,
  radiusMiles: number,
  weights: { price: number; time: number; distance: number },
  userHasMembership: boolean = false
) {
  // Find items by fuzzy matching
  const allItems = await storage.getAllItems();
  const matchedItems = itemNames.map(name => {
    const exactMatch = allItems.find(item =>
      item.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch;
    const fuzzyMatch = allItems.find(item =>
      item.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(item.name.toLowerCase())
    );
    return fuzzyMatch;
  }).filter(Boolean);

  if (matchedItems.length === 0) return [];

  // Get stores within radius
  const nearbyStores = await storage.getStoresWithinRadius(userLat, userLng, radiusMiles);
  const storesWithCoords = nearbyStores.filter(store => store.lat && store.lng);
  if (storesWithCoords.length === 0) return [];

  // Get prices for matched items at nearby stores
  const itemIds = matchedItems.map(item => item!.id);
  const storeIds = storesWithCoords.map(store => store.id);
  const allPrices = await storage.getPricesForItems(itemIds, storeIds);

  // Pre-index prices into Maps for O(1) lookups
  const pricesByStore = new Map<string, typeof allPrices>();
  const itemsByStore = new Map<string, Set<string>>();
  for (const store of storesWithCoords) {
    pricesByStore.set(store.id, []);
    itemsByStore.set(store.id, new Set());
  }
  for (const p of allPrices) {
    pricesByStore.get(p.storeId)?.push(p);
    itemsByStore.get(p.storeId)?.add(p.itemId);
  }

  // Helper: calculate distance from user to a store (in miles)
  function distToStore(store: { lat?: number | null; lng?: number | null }) {
    return Math.sqrt(
      Math.pow(userLat - store.lat!, 2) + Math.pow(userLng - store.lng!, 2)
    ) * 69;
  }

  // Helper: calculate distance between two stores
  function distBetweenStores(
    a: { lat?: number | null; lng?: number | null },
    b: { lat?: number | null; lng?: number | null }
  ) {
    return Math.sqrt(
      Math.pow(a.lat! - b.lat!, 2) + Math.pow(a.lng! - b.lng!, 2)
    ) * 69;
  }

  // Helper: build a plan from a list of stores, assigning each item to cheapest source
  function buildPlan(planStores: typeof storesWithCoords) {
    const storeData = planStores.map(store => ({
      store,
      items: [] as typeof matchedItems,
      itemPrices: [] as Array<{ itemId: string; itemName: string; price: number; unit: string | null; quantity: string | null }>,
      subtotal: 0,
      prices: pricesByStore.get(store.id) || [],
      coveredItems: itemsByStore.get(store.id) || new Set<string>()
    }));

    let totalCost = 0;
    let coveredCount = 0;

    for (const item of matchedItems) {
      let bestPrice = Infinity;
      let bestStoreIdx = -1;
      let bestPriceRecord: typeof allPrices[0] | null = null;

      for (let i = 0; i < storeData.length; i++) {
        const sp = storeData[i].prices.find(p => p.itemId === item!.id);
        if (sp) {
          const ep = calculateEffectivePrice(sp, userHasMembership);
          if (ep < bestPrice) {
            bestPrice = ep;
            bestStoreIdx = i;
            bestPriceRecord = sp;
          }
        }
      }

      if (bestStoreIdx >= 0 && bestPriceRecord) {
        storeData[bestStoreIdx].items.push(item);
        storeData[bestStoreIdx].itemPrices.push({
          itemId: item!.id,
          itemName: item!.name,
          price: bestPrice,
          unit: bestPriceRecord.unit,
          quantity: bestPriceRecord.quantity,
        });
        storeData[bestStoreIdx].subtotal += bestPrice;
        totalCost += bestPrice;
        coveredCount++;
      }
    }

    // Calculate route distance: user -> store1 -> store2 -> ...
    let totalDistance = 0;
    if (planStores.length === 1) {
      totalDistance = distToStore(planStores[0]);
    } else {
      totalDistance = distToStore(planStores[0]);
      for (let i = 1; i < planStores.length; i++) {
        totalDistance += distBetweenStores(planStores[i - 1], planStores[i]);
      }
    }

    const baseTime = 10 * planStores.length; // 10 min per stop
    const travelTime = totalDistance * 3; // ~3 min per mile
    const totalTime = Math.max(baseTime, baseTime + travelTime);
    const coverage = coveredCount / matchedItems.length;

    // Filter out stores with no items assigned (can happen in combos)
    const activeStores = storeData
      .filter(sd => sd.items.length > 0)
      .map(sd => ({
        store: { id: sd.store.id, name: sd.store.name, address: sd.store.address, lat: sd.store.lat, lng: sd.store.lng },
        items: sd.itemPrices,
        subtotal: sd.subtotal,
      }));

    return { stores: activeStores, totalCost, totalTime, totalDistance, score: 0, coverage };
  }

  // ── Generate all candidate plans ──

  const candidatePlans: ReturnType<typeof buildPlan>[] = [];

  // 1. Single-store plans (include any store with at least 1 item)
  for (const store of storesWithCoords) {
    const storeItemSet = itemsByStore.get(store.id);
    if (!storeItemSet || storeItemSet.size === 0) continue;
    candidatePlans.push(buildPlan([store]));
  }

  // 2. Multi-store plans via greedy set-cover
  // Sort stores by coverage (descending) and take top 8 for combo generation
  const storesByCoverage = [...storesWithCoords]
    .map(store => ({ store, coverCount: itemsByStore.get(store.id)?.size || 0 }))
    .filter(s => s.coverCount > 0)
    .sort((a, b) => b.coverCount - a.coverCount)
    .slice(0, 8);

  const topStores = storesByCoverage.map(s => s.store);
  const bestSingleCoverage = storesByCoverage.length > 0 ? storesByCoverage[0].coverCount / matchedItems.length : 0;

  // Generate 2-store combos from top stores
  for (let i = 0; i < topStores.length; i++) {
    for (let j = i + 1; j < topStores.length; j++) {
      const items1 = itemsByStore.get(topStores[i].id) || new Set<string>();
      const items2 = itemsByStore.get(topStores[j].id) || new Set<string>();
      const combined = new Set([...items1, ...items2]);
      // Only include if the combo covers more than the best single store
      if (combined.size > bestSingleCoverage * matchedItems.length) {
        candidatePlans.push(buildPlan([topStores[i], topStores[j]]));
      }
    }
  }

  // Generate 3-store combos via greedy set-cover from top stores
  if (matchedItems.length > 1 && topStores.length >= 3) {
    // Start from each of the top 4 stores as seed, greedily add stores
    const seeds = topStores.slice(0, Math.min(4, topStores.length));
    const seen3 = new Set<string>();

    for (const seed of seeds) {
      const uncovered = new Set(itemIds);
      const chosen: typeof storesWithCoords = [];
      const remaining = topStores.filter(s => s.id !== seed.id);

      // Add seed
      chosen.push(seed);
      const seedItems = itemsByStore.get(seed.id) || new Set<string>();
      for (const id of seedItems) uncovered.delete(id);

      // Greedily add up to 2 more stores
      while (chosen.length < 3 && uncovered.size > 0 && remaining.length > 0) {
        let bestIdx = -1;
        let bestCover = 0;

        for (let r = 0; r < remaining.length; r++) {
          const rItems = itemsByStore.get(remaining[r].id) || new Set<string>();
          let coverCount = 0;
          for (const id of uncovered) {
            if (rItems.has(id)) coverCount++;
          }
          if (coverCount > bestCover) {
            bestCover = coverCount;
            bestIdx = r;
          }
        }

        if (bestIdx < 0 || bestCover === 0) break;

        const nextStore = remaining.splice(bestIdx, 1)[0];
        chosen.push(nextStore);
        const nextItems = itemsByStore.get(nextStore.id) || new Set<string>();
        for (const id of nextItems) uncovered.delete(id);
      }

      if (chosen.length >= 2) {
        // Deduplicate by sorted store IDs
        const key = chosen.map(s => s.id).sort().join(',');
        if (!seen3.has(key)) {
          seen3.add(key);
          candidatePlans.push(buildPlan(chosen));
        }
      }
    }
  }

  if (candidatePlans.length === 0) return [];

  // ── Score all plans with min/max normalization ──

  const costs = candidatePlans.map(p => p.totalCost);
  const times = candidatePlans.map(p => p.totalTime);
  const distances = candidatePlans.map(p => p.totalDistance);
  const minCost = Math.min(...costs), maxCost = Math.max(...costs);
  const minTime = Math.min(...times), maxTime = Math.max(...times);
  const minDist = Math.min(...distances), maxDist = Math.max(...distances);

  for (const plan of candidatePlans) {
    // Normalize each dimension to 0-1 (0 = best, 1 = worst)
    const normCost = maxCost > minCost ? (plan.totalCost - minCost) / (maxCost - minCost) : 0;
    const normTime = maxTime > minTime ? (plan.totalTime - minTime) / (maxTime - minTime) : 0;
    const normDist = maxDist > minDist ? (plan.totalDistance - minDist) / (maxDist - minDist) : 0;

    // Weighted penalty (lower = better)
    const penalty = weights.price * normCost + weights.time * normTime + weights.distance * normDist;

    // Score: 0-100, multiplied by coverage so partial-coverage plans are penalized
    plan.score = Math.round((1 - penalty) * plan.coverage * 100);
  }

  // ── Sort: coverage descending, then score descending ──
  candidatePlans.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return b.score - a.score;
  });

  // Ensure at least one multi-store plan appears if it has better coverage than any single-store plan
  const finalPlans = candidatePlans.slice(0, 6);
  const hasMultiStore = finalPlans.some(p => p.stores.length > 1);
  if (!hasMultiStore) {
    const bestMulti = candidatePlans.find(p => p.stores.length > 1);
    if (bestMulti && bestMulti.coverage > 0) {
      finalPlans.pop();
      finalPlans.push(bestMulti);
      // Re-sort after insertion
      finalPlans.sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return b.score - a.score;
      });
    }
  }

  return finalPlans;
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
      const { name, items } = req.body;
      const shoppingList = await storage.createShoppingList({
        name: name || "Shopping List",
        items: items || [],
        userId: req.session.userId!,
      });
      res.json(shoppingList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  router.patch("/api/shopping-lists/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, items } = req.body;
      const updated = await storage.updateShoppingList(req.params.id, req.session.userId!, { name, items });
      if (!updated) {
        res.status(404).json({ error: "List not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
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

      // Deduplicate to latest price per store
      const latestByStore = new Map<string, typeof results[0]>();
      for (const r of results) {
        if (!latestByStore.has(r.storeId)) {
          latestByStore.set(r.storeId, r);
        }
      }

      const comparison = [...latestByStore.values()].sort(
        (a, b) => parseFloat(a.price) - parseFloat(b.price)
      );
      res.json(comparison);
    } catch (_error) {
      res.status(500).json({ error: "Failed to fetch price comparison" });
    }
  });

  // Price history endpoints
  router.get("/api/prices/history/:itemId", async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      const { storeId, days } = req.query;
      
      const daysBack = days ? parseInt(days as string) : 30;
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
      const daysBack = days ? parseInt(days as string) : 30;
      
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
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
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
        items: z.array(z.string()),
        location: z.object({
          lat: z.number(),
          lng: z.number()
        }),
        radius: z.number().min(1).max(50),
        weights: z.object({
          price: z.number().min(0).max(1),
          time: z.number().min(0).max(1),
          distance: z.number().min(0).max(1)
        }),
        userHasMembership: z.boolean().optional().default(false)
      });

      const { items, location, radius, weights, userHasMembership } = schema.parse(req.body);
      
      const tripPlans = await generateTripPlans(
        items,
        location.lat,
        location.lng,
        radius,
        weights,
        userHasMembership
      );
      
      res.json(tripPlans);
    } catch (error) {
      console.error("Trip planning error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Trip planning failed" });
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

      const rows = parseCSV(csvData);
      if (rows.length === 0) {
        return res.status(400).json({ error: "CSV data is empty" });
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const stores = dataRows.map(row => {
        const store: Partial<InsertStore> = {};
        headers.forEach((header, index) => {
          const value = row[index]?.replace(/^"|"$/g, ''); // Remove quotes
          switch (header.toLowerCase()) {
            case 'name':
              store.name = value;
              break;
            case 'address':
              store.address = value;
              break;
            case 'lat':
            case 'latitude':
              store.lat = value ? parseFloat(value) : null;
              break;
            case 'lng':
            case 'longitude':
              store.lng = value ? parseFloat(value) : null;
              break;
            case 'hours':
            case 'hours_json':
              try {
                store.hoursJson = value ? JSON.parse(value) : null;
              } catch {
                store.hoursJson = null;
              }
              break;
          }
        });
        return store;
      }).filter(store => store.name && store.address);

      await storage.importStores(stores as InsertStore[]);
      res.json({ imported: stores.length, message: "Stores imported successfully" });
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

      const rows = parseCSV(csvData);
      if (rows.length === 0) {
        return res.status(400).json({ error: "CSV data is empty" });
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const items = dataRows.map(row => {
        const item: Partial<InsertItem> = {};
        headers.forEach((header, index) => {
          const value = row[index]?.replace(/^"|"$/g, '');
          switch (header.toLowerCase()) {
            case 'name':
              item.name = value;
              break;
            case 'descriptor':
              item.descriptor = value || null;
              break;
            case 'unit':
              item.unit = value || null;
              break;
            case 'organic_conventional':
              item.organicConventional = value || null;
              break;
            case 'bunch_flag':
              item.bunchFlag = value?.toLowerCase() === 'true';
              break;
          }
        });
        return item;
      }).filter(item => item.name);

      await storage.importItems(items as InsertItem[]);
      res.json({ imported: items.length, message: "Items imported successfully" });
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

      const rows = parseCSV(csvData);
      if (rows.length === 0) {
        return res.status(400).json({ error: "CSV data is empty" });
      }
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const prices = dataRows.map(row => {
        const price: Partial<InsertPrice> = {};
        headers.forEach((header, index) => {
          const value = row[index]?.replace(/^"|"$/g, '');
          switch (header.toLowerCase()) {
            case 'item_id':
              price.itemId = value;
              break;
            case 'store_id':
              price.storeId = value;
              break;
            case 'price_type':
              price.priceType = value || null;
              break;
            case 'price':
              price.price = value;
              break;
            case 'quantity':
              price.quantity = value || null;
              break;
            case 'unit':
              price.unit = value || null;
              break;
            case 'notes':
              price.notes = value || null;
              break;
          }
        });
        return price;
      }).filter(price => price.itemId && price.storeId && price.price);

      await storage.importPrices(prices as InsertPrice[]);
      res.json({ imported: prices.length, message: "Prices imported successfully" });
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
    password: z.string().min(6),
    displayName: z.string().max(100).optional(),
  });

  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
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
    req.session.destroy(() => {
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
        imageData: z.string().optional(), // base64 image
        purchaseDate: z.string().optional(),
        totalAmount: z.number().optional(),
        parsedItems: z.array(z.object({
          name: z.string(),
          price: z.number(),
          quantity: z.number().optional(),
          unit: z.string().optional(),
        })).optional(),
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
        })),
      }).parse(req.body);

      const receipt = await storage.updateReceipt(req.params.id, req.session.userId!, {
        parsedItems: body.parsedItems,
        status: "processed",
      });
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
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
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
      const result = await triggerManualRun(zipCode || "94102");
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
      const result = await triggerSingleRun(req.params.sourceId, zipCode || "94102");
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
