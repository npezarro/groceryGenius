import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStoreSchema, insertItemSchema, insertPriceSchema, insertShoppingListSchema, prices } from "@shared/schema";
import { db } from "./db";
import { z } from "zod";

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
async function generateTripPlans(
  itemNames: string[],
  userLat: number,
  userLng: number,
  radiusMiles: number,
  weights: { price: number; time: number; distance: number }
) {
  // Find items by fuzzy matching
  const allItems = await storage.getAllItems();
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

  if (matchedItems.length === 0) {
    return [];
  }

  // Get stores within radius
  const nearbyStores = await storage.getStoresWithinRadius(userLat, userLng, radiusMiles);
  const storesWithCoords = nearbyStores.filter(store => store.lat && store.lng);

  if (storesWithCoords.length === 0) {
    return [];
  }

  // Get prices for matched items at nearby stores
  const itemIds = matchedItems.map(item => item!.id);
  const storeIds = storesWithCoords.map(store => store.id);
  const prices = await storage.getPricesForItems(itemIds, storeIds);

  // Generate single-store options
  const singleStorePlans = [];
  for (const store of storesWithCoords) {
    const storePrices = prices.filter(p => p.storeId === store.id);
    const availableItems = new Set(storePrices.map(p => p.itemId));
    
    if (availableItems.size === 0) continue;
    
    const totalCost = matchedItems.reduce((sum, item) => {
      const itemPrice = storePrices.find(p => p.itemId === item!.id);
      return sum + (itemPrice ? parseFloat(itemPrice.price) : 0);
    }, 0);

    const coverage = availableItems.size / matchedItems.length;
    
    if (coverage > 0.5) { // At least 50% coverage
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
    }
  }

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
            // Choose cheaper option
            if (parseFloat(price1.price) <= parseFloat(price2.price)) {
              store1Items.push(item);
              totalCost += parseFloat(price1.price);
            } else {
              store2Items.push(item);
              totalCost += parseFloat(price2.price);
            }
          } else if (price1) {
            store1Items.push(item);
            totalCost += parseFloat(price1.price);
          } else if (price2) {
            store2Items.push(item);
            totalCost += parseFloat(price2.price);
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
              return sum + (price ? parseFloat(price.price) : 0);
            }, 0) },
            { store: store2, items: store2Items, subtotal: store2Items.reduce((sum, item) => {
              const price = store2Prices.find(p => p.itemId === item!.id);
              return sum + (price ? parseFloat(price.price) : 0);
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
  return allPlans.sort((a, b) => b.score - a.score).slice(0, 6);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Shopping list endpoints
  app.post("/api/shopping-lists", async (req: Request, res: Response) => {
    try {
      const validatedData = insertShoppingListSchema.parse(req.body);
      const shoppingList = await storage.createShoppingList(validatedData);
      res.json(shoppingList);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid data" });
    }
  });

  app.get("/api/shopping-lists", async (req: Request, res: Response) => {
    try {
      const lists = await storage.getAllShoppingLists();
      res.json(lists);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch shopping lists" });
    }
  });

  // Items endpoints
  app.get("/api/items", async (req: Request, res: Response) => {
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
  app.get("/api/stores", async (req: Request, res: Response) => {
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
  app.get("/api/prices", async (req: Request, res: Response) => {
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

  // Geocoding endpoint
  app.post("/api/geocode", async (req: Request, res: Response) => {
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
  app.post("/api/trip-plans", async (req: Request, res: Response) => {
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
        })
      });

      const { items, location, radius, weights } = schema.parse(req.body);
      
      const tripPlans = await generateTripPlans(
        items,
        location.lat,
        location.lng,
        radius,
        weights
      );
      
      res.json(tripPlans);
    } catch (error) {
      console.error("Trip planning error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Trip planning failed" });
    }
  });

  // CSV import endpoints
  app.post("/api/import/stores", async (req: Request, res: Response) => {
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

  app.post("/api/import/items", async (req: Request, res: Response) => {
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

  app.post("/api/import/prices", async (req: Request, res: Response) => {
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
  app.post("/api/geocode-stores", async (req: Request, res: Response) => {
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
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDataStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
