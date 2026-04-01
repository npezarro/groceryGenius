/**
 * Trip planning pure functions — extracted from routes.ts for testability.
 *
 * All functions here are pure (no I/O, no storage calls) so they can be
 * unit-tested without mocking the database.
 */

import type { Price } from "@shared/schema";

// ── CSV parsing ──

export function parseCSV(csvText: string): string[][] {
  const lines = csvText.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const result: string[] = [];
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

// ── Effective price calculation ──

export function calculateEffectivePrice(price: Price, userHasMembership: boolean = false): number {
  const now = new Date();

  // Start with original price or current price as fallback
  let effectivePrice = parseFloat(price.originalPrice || price.price);
  const currentPrice = parseFloat(price.price);

  // Guard against non-numeric price strings
  if (isNaN(currentPrice)) return 0;
  if (isNaN(effectivePrice)) effectivePrice = currentPrice;

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
    if (!isNaN(memberPrice)) {
      effectivePrice = Math.min(effectivePrice, memberPrice);
    }
  }

  return effectivePrice;
}

// ── Distance helpers ──

export interface Coordinates {
  lat?: number | null;
  lng?: number | null;
}

/** Approximate distance in miles from a point to a store (Euclidean × 69). */
export function distToStore(store: Coordinates, userLat: number, userLng: number): number {
  if (store.lat == null || store.lng == null) return Infinity;
  return Math.sqrt(
    Math.pow(userLat - store.lat, 2) + Math.pow(userLng - store.lng, 2)
  ) * 69;
}

/** Approximate distance in miles between two stores (Euclidean × 69). */
export function distBetweenStores(a: Coordinates, b: Coordinates): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  return Math.sqrt(
    Math.pow(a.lat - b.lat, 2) + Math.pow(a.lng - b.lng, 2)
  ) * 69;
}

// ── Plan building and scoring ──

export interface StoreWithId extends Coordinates {
  id: string;
  name: string;
  address?: string | null;
}

export interface MatchedItem {
  id: string;
  name: string;
}

export interface PlanStore {
  store: { id: string; name: string; address?: string | null; lat?: number | null; lng?: number | null };
  items: Array<{ itemId: string; itemName: string; price: number; unit: string | null; quantity: string | null }>;
  subtotal: number;
}

export interface TripPlan {
  stores: PlanStore[];
  totalCost: number;
  totalTime: number;
  totalDistance: number;
  score: number;
  coverage: number;
}

/**
 * Build a trip plan from a set of stores, assigning each item to its cheapest source.
 */
export function buildPlan(
  planStores: StoreWithId[],
  matchedItems: MatchedItem[],
  pricesByStore: Map<string, Price[]>,
  itemsByStore: Map<string, Set<string>>,
  userLat: number,
  userLng: number,
  userHasMembership: boolean = false,
): TripPlan {
  const storeData = planStores.map(store => ({
    store,
    items: [] as MatchedItem[],
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
    let bestPriceRecord: Price | null = null;

    for (let i = 0; i < storeData.length; i++) {
      const sp = storeData[i].prices.find(p => p.itemId === item.id);
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
        itemId: item.id,
        itemName: item.name,
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
    totalDistance = distToStore(planStores[0], userLat, userLng);
  } else {
    totalDistance = distToStore(planStores[0], userLat, userLng);
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

/**
 * Score and rank candidate plans using min/max normalization and weighted penalties.
 * Mutates plan.score in place.
 */
export function scorePlans(
  plans: TripPlan[],
  weights: { price: number; time: number; distance: number },
): void {
  if (plans.length === 0) return;

  const costs = plans.map(p => p.totalCost);
  const times = plans.map(p => p.totalTime);
  const distances = plans.map(p => p.totalDistance);
  const minCost = Math.min(...costs), maxCost = Math.max(...costs);
  const minTime = Math.min(...times), maxTime = Math.max(...times);
  const minDist = Math.min(...distances), maxDist = Math.max(...distances);

  for (const plan of plans) {
    const normCost = maxCost > minCost ? (plan.totalCost - minCost) / (maxCost - minCost) : 0;
    const normTime = maxTime > minTime ? (plan.totalTime - minTime) / (maxTime - minTime) : 0;
    const normDist = maxDist > minDist ? (plan.totalDistance - minDist) / (maxDist - minDist) : 0;

    const penalty = weights.price * normCost + weights.time * normTime + weights.distance * normDist;
    plan.score = Math.round((1 - penalty) * plan.coverage * 100);
  }
}

/**
 * Sort plans by coverage (desc) then score (desc), ensuring at least one
 * multi-store plan is included if it has positive coverage.
 */
export function rankPlans(plans: TripPlan[], maxResults: number = 6): TripPlan[] {
  plans.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return b.score - a.score;
  });

  const finalPlans = plans.slice(0, maxResults);
  const hasMultiStore = finalPlans.some(p => p.stores.length > 1);
  if (!hasMultiStore) {
    const bestMulti = plans.find(p => p.stores.length > 1);
    if (bestMulti && bestMulti.coverage > 0) {
      finalPlans.pop();
      finalPlans.push(bestMulti);
      finalPlans.sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return b.score - a.score;
      });
    }
  }

  return finalPlans;
}

/**
 * Fuzzy-match item names against a catalog.
 * Returns matched items (maintaining input order) with nulls filtered out.
 */
export function matchItems<T extends { name: string }>(
  searchNames: string[],
  catalog: T[],
): T[] {
  return searchNames.map(name => {
    const exactMatch = catalog.find(item =>
      item.name.toLowerCase() === name.toLowerCase()
    );
    if (exactMatch) return exactMatch;
    const fuzzyMatch = catalog.find(item =>
      item.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(item.name.toLowerCase())
    );
    return fuzzyMatch;
  }).filter((item): item is T => item != null);
}
