import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStoreSchema, insertItemSchema, insertPriceSchema, insertShoppingListSchema, prices } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";
import { seedTopUp, type SeedMode } from "./seed";
import { hashPassword, verifyPassword, requireAuth } from "./auth";

// Mapbox integration
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;
  if (!mapboxToken) {
    throw new Error("Mapbox access token not configured");
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1`
    );
    
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
    
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

async function getDistanceMatrix(origins: [number, number][], destinations: [number, number][]): Promise<any> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;
  if (!mapboxToken) {
    throw new Error("Mapbox access token not configured");
  }

  try {
    const allCoords = [...origins, ...destinations];
    const coordString = allCoords.map(coord => `${coord[0]},${coord[1]}`).join(';');
    
    const sources = origins.map((_, index) => index).join(';');
    const destinations_param = destinations.map((_, index) => origins.length + index).join(';');
    
    const response = await fetch(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordString}?sources=${sources}&destinations=${destinations_param}&access_token=${mapboxToken}`
    );
    
    if (!response.ok) {
      throw new Error(`Mapbox Matrix API error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Distance matrix error:", error);
    throw error;
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
function calculateEffectivePrice(price: any, userHasMembership: boolean = false): number {
  const now = new Date();
  
  // Start with original price or current price as fallback
  let effectivePrice = parseFloat(price.originalPrice || price.price);
  let currentPrice = parseFloat(price.price);
  
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
  console.log(`Trip planning: Found ${allItems.length} items in database`);
  console.log(`Trip planning: Looking for items: ${itemNames.join(', ')}`);
  
  const matchedItems = itemNames.map(name => {
    const exactMatch = allItems.find(item => 
      item.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch;
    
    // Fuzzy match
    const fuzzyMatch = allItems.find(item =>
      item.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(item.name.toLowerCase())
    );
    return fuzzyMatch;
  }).filter(Boolean);

  console.log(`Trip planning: Matched ${matchedItems.length} items: ${matchedItems.map(i => i?.name).join(', ')}`);

  if (matchedItems.length === 0) {
    console.log('Trip planning: No matched items found');
    return [];
  }

  // Get stores within radius
  const nearbyStores = await storage.getStoresWithinRadius(userLat, userLng, radiusMiles);
  const storesWithCoords = nearbyStores.filter(store => store.lat && store.lng);
  console.log(`Trip planning: Found ${storesWithCoords.length} stores within ${radiusMiles} miles`);

  if (storesWithCoords.length === 0) {
    console.log('Trip planning: No stores within radius');
    return [];
  }

  // Get prices for matched items at nearby stores
  const itemIds = matchedItems.map(item => item!.id);
  const storeIds = storesWithCoords.map(store => store.id);
  const prices = await storage.getPricesForItems(itemIds, storeIds);
  console.log(`Trip planning: Found ${prices.length} price records for items: ${itemIds.join(', ')} at stores: ${storeIds.join(', ')}`);

  // Generate single-store options
  const singleStorePlans = [];
  console.log(`Trip planning: Generating single store plans for ${storesWithCoords.length} stores`);
  
  for (const store of storesWithCoords) {
    const storePrices = prices.filter(p => p.storeId === store.id);
    const availableItems = new Set(storePrices.map(p => p.itemId));
    
    console.log(`Trip planning: Store ${store.name} has ${storePrices.length} prices, ${availableItems.size} unique items`);
    
    if (availableItems.size === 0) {
      console.log(`Trip planning: Skipping ${store.name} - no available items`);
      continue;
    }
    
    const totalCost = matchedItems.reduce((sum, item) => {
      const itemPrice = storePrices.find(p => p.itemId === item!.id);
      return sum + (itemPrice ? calculateEffectivePrice(itemPrice, userHasMembership) : 0);
    }, 0);

    const coverage = availableItems.size / matchedItems.length;
    console.log(`Trip planning: Store ${store.name} coverage: ${(coverage * 100).toFixed(1)}% (${availableItems.size}/${matchedItems.length} items), total cost: $${totalCost}`);
    
    if (coverage >= 0.5) { // At least 50% coverage
      // Calculate distance and time (simplified)
      const distance = Math.sqrt(
        Math.pow(userLat - store.lat!, 2) + Math.pow(userLng - store.lng!, 2)
      ) * 69; // Rough miles conversion
      
      const estimatedTime = Math.max(10, distance * 3); // 3 minutes per mile + base time
      
      // Calculate composite score (lower is better)
      const normalizedPrice = totalCost / 100; // Normalize to 0-1 range
      const normalizedTime = estimatedTime / 60; // Normalize to hours
      const normalizedDistance = distance / 10; // Normalize to 0-1 range
      
      const score = (
        weights.price * normalizedPrice +
        weights.time * normalizedTime +
        weights.distance * normalizedDistance
      );

      singleStorePlans.push({
        stores: [{ 
          store, 
          items: matchedItems.filter(item => availableItems.has(item!.id)),
          subtotal: totalCost 
        }],
        totalCost,
        totalTime: estimatedTime,
        totalDistance: distance,
        score: 100 - score * 10, // Invert for display (higher is better)
        coverage
      });
      
      console.log(`Trip planning: Added single-store plan for ${store.name} - ${availableItems.size} items, $${totalCost}, score: ${(100 - score * 10).toFixed(1)}`);
    } else {
      console.log(`Trip planning: Skipped ${store.name} - coverage ${(coverage * 100).toFixed(1)}% below 50% threshold`);
    }
  }
  
  console.log(`Trip planning: Generated ${singleStorePlans.length} single-store plans`);

  // Generate two-store combinations (simplified for now)
  const twoStorePlans = [];
  for (let i = 0; i < storesWithCoords.length && twoStorePlans.length < 3; i++) {
    for (let j = i + 1; j < storesWithCoords.length && twoStorePlans.length < 3; j++) {
      const store1 = storesWithCoords[i];
      const store2 = storesWithCoords[j];
      
      const store1Prices = prices.filter(p => p.storeId === store1.id);
      const store2Prices = prices.filter(p => p.storeId === store2.id);
      
      const allAvailableItems = new Set([
        ...store1Prices.map(p => p.itemId),
        ...store2Prices.map(p => p.itemId)
      ]);
      
      if (allAvailableItems.size >= matchedItems.length * 0.8) { // 80% coverage
        let totalCost = 0;
        const store1Items = [];
        const store2Items = [];
        
        for (const item of matchedItems) {
          const price1 = store1Prices.find(p => p.itemId === item!.id);
          const price2 = store2Prices.find(p => p.itemId === item!.id);
          
          if (price1 && price2) {
            // Choose cheaper option using effective pricing
            const effectivePrice1 = calculateEffectivePrice(price1, userHasMembership);
            const effectivePrice2 = calculateEffectivePrice(price2, userHasMembership);
            
            if (effectivePrice1 <= effectivePrice2) {
              store1Items.push(item);
              totalCost += effectivePrice1;
            } else {
              store2Items.push(item);
              totalCost += effectivePrice2;
            }
          } else if (price1) {
            store1Items.push(item);
            totalCost += calculateEffectivePrice(price1, userHasMembership);
          } else if (price2) {
            store2Items.push(item);
            totalCost += calculateEffectivePrice(price2, userHasMembership);
          }
        }
        
        // Calculate total distance and time
        const dist1 = Math.sqrt(
          Math.pow(userLat - store1.lat!, 2) + Math.pow(userLng - store1.lng!, 2)
        ) * 69;
        
        const dist2 = Math.sqrt(
          Math.pow(store1.lat! - store2.lat!, 2) + Math.pow(store1.lng! - store2.lng!, 2)
        ) * 69;
        
        const totalDistance = dist1 + dist2;
        const totalTime = Math.max(20, totalDistance * 3 + 10); // Additional time for second stop
        
        const normalizedPrice = totalCost / 100;
        const normalizedTime = totalTime / 60;
        const normalizedDistance = totalDistance / 20;
        
        const score = (
          weights.price * normalizedPrice +
          weights.time * normalizedTime +
          weights.distance * normalizedDistance
        );

        twoStorePlans.push({
          stores: [
            { store: store1, items: store1Items, subtotal: store1Items.reduce((sum, item) => {
              const price = store1Prices.find(p => p.itemId === item!.id);
              return sum + (price ? calculateEffectivePrice(price, userHasMembership) : 0);
            }, 0) },
            { store: store2, items: store2Items, subtotal: store2Items.reduce((sum, item) => {
              const price = store2Prices.find(p => p.itemId === item!.id);
              return sum + (price ? calculateEffectivePrice(price, userHasMembership) : 0);
            }, 0) }
          ],
          totalCost,
          totalTime,
          totalDistance,
          score: 100 - score * 10,
          coverage: (store1Items.length + store2Items.length) / matchedItems.length
        });
      }
    }
  }

  // Combine and sort all plans
  const allPlans = [...singleStorePlans, ...twoStorePlans];
  console.log(`Trip planning: Final results - ${singleStorePlans.length} single-store plans, ${twoStorePlans.length} two-store plans, ${allPlans.length} total plans`);
  const finalPlans = allPlans.sort((a, b) => b.score - a.score).slice(0, 6);
  console.log(`Trip planning: Returning ${finalPlans.length} sorted plans`);
  return finalPlans;
}

function checkAdminAuth(req: Request) {
  const key = process.env.ADMIN_KEY;
  const header = req.headers["x-admin-key"];
  return Boolean(key) && header === key;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const basePath = process.env.BASE_PATH || "";
  const router = express.Router();

  // --- Diagnostics: counts + masked DB info
  router.get("/api/diag/stats", async (_req, res) => {
    try {
      const stats = await storage.getDataStats();
      res.json({ ok: true, stats });
    } catch {
      res.status(500).json({ ok: false, error: "diag_failed" });
    }
  });

  function isAuthorized(req: any) {
    const adminKey = process.env.ADMIN_KEY;
    const header = req.headers["x-admin-key"];
    return Boolean(adminKey) && header === adminKey;
  }

  router.post("/api/admin/seed", async (req, res) => {
    // Admin key requirement removed for easier test data loading

    // Accept mode via query (?mode=prices) or JSON body { mode, force }
    const modeQ = (req.query?.mode as string)?.toLowerCase();
    const body = typeof req.body === "object" ? req.body : {};
    const mode: SeedMode = (body.mode || modeQ || "all") as SeedMode;
    const force = (body.force ?? req.query?.force === "1") ? true : false;

    try {
      const result = await seedTopUp(mode, force);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: "seed_failed" });
    }
  });

  // Shopping list endpoints
  router.post("/api/shopping-lists", async (req: Request, res: Response) => {
    try {
      const validatedData = insertShoppingListSchema.parse(req.body);
      const shoppingList = await storage.createShoppingList(validatedData);
      res.json(shoppingList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  router.get("/api/shopping-lists", async (req: Request, res: Response) => {
    try {
      const lists = await storage.getAllShoppingLists();
      res.json(lists);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shopping lists" });
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
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // Stores endpoints
  router.get("/api/stores", async (req: Request, res: Response) => {
    try {
      const { lat, lng, radius } = req.query;
      
      if (lat && lng && radius) {
        const stores = await storage.getStoresWithinRadius(
          parseFloat(lat as string),
          parseFloat(lng as string),
          parseFloat(radius as string)
        );
        res.json(stores);
      } else {
        const stores = await storage.getAllStores();
        res.json(stores);
      }
    } catch (error) {
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
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const rows = parseCSV(csvData);
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const stores = dataRows.map(row => {
        const store: any = {};
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

      await storage.importStores(stores);
      res.json({ imported: stores.length, message: "Stores imported successfully" });
    } catch (error) {
      console.error("Store import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  router.post("/api/import/items", async (req: Request, res: Response) => {
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const rows = parseCSV(csvData);
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const items = dataRows.map(row => {
        const item: any = {};
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

      await storage.importItems(items);
      res.json({ imported: items.length, message: "Items imported successfully" });
    } catch (error) {
      console.error("Item import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  router.post("/api/import/prices", async (req: Request, res: Response) => {
    try {
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ error: "CSV data is required" });
      }

      const rows = parseCSV(csvData);
      const headers = rows[0];
      const dataRows = rows.slice(1);

      const prices = dataRows.map(row => {
        const price: any = {};
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

      await storage.importPrices(prices);
      res.json({ imported: prices.length, message: "Prices imported successfully" });
    } catch (error) {
      console.error("Price import error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Import failed" });
    }
  });

  // Geocode stores endpoint
  router.post("/api/geocode-stores", async (req: Request, res: Response) => {
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
        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 100));
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
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ── Auth routes ───────────────────────────────────────

  router.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const body = z.object({
        username: z.string().min(3).max(50),
        email: z.string().email().optional(),
        password: z.string().min(6),
        displayName: z.string().max(100).optional(),
      }).parse(req.body);

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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Register error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = z.object({
        username: z.string(),
        password: z.string(),
      }).parse(req.body);

      const user = await storage.getUserByUsername(username);
      if (!user || !(await verifyPassword(user.password, password))) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
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
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.json(null);
    }
    res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName });
  });

  // ── Favorite stores ─────────────────────────────────

  router.get("/api/user/favorite-stores", requireAuth, async (req: Request, res: Response) => {
    try {
      const favorites = await storage.getFavoriteStores(req.session.userId!);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  router.post("/api/user/favorite-stores/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      const fav = await storage.addFavoriteStore(req.session.userId!, req.params.storeId);
      res.json(fav);
    } catch (error) {
      res.status(500).json({ error: "Failed to add favorite" });
    }
  });

  router.delete("/api/user/favorite-stores/:storeId", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.removeFavoriteStore(req.session.userId!, req.params.storeId);
      res.json({ ok: true });
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });

  router.get("/api/user/receipts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const receipt = await storage.getReceipt(req.params.id, req.session.userId!);
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      res.json(receipt);
    } catch (error) {
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

  // Mount the router at the base path (e.g., "/grocerygenius" or "" for root)
  if (basePath) {
    app.use(basePath, router);
  } else {
    app.use(router);
  }

  const httpServer = createServer(app);
  return httpServer;
}
