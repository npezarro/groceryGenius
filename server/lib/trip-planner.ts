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

// ── Price indexing ──

/**
 * Index prices into per-store maps for O(1) lookups.
 * Returns { pricesByStore, itemsByStore } where:
 * - pricesByStore: Map<storeId, Price[]>
 * - itemsByStore: Map<storeId, Set<itemId>>
 */
export function indexPrices<P extends { storeId: string; itemId: string }>(
  stores: Array<{ id: string }>,
  allPrices: P[],
): { pricesByStore: Map<string, P[]>; itemsByStore: Map<string, Set<string>> } {
  const pricesByStore = new Map<string, P[]>();
  const itemsByStore = new Map<string, Set<string>>();
  for (const store of stores) {
    pricesByStore.set(store.id, []);
    itemsByStore.set(store.id, new Set());
  }
  for (const p of allPrices) {
    pricesByStore.get(p.storeId)?.push(p);
    itemsByStore.get(p.storeId)?.add(p.itemId);
  }
  return { pricesByStore, itemsByStore };
}

// ── Candidate plan generation ──

/**
 * Generate candidate trip plans: single-store, 2-store combos, and
 * 3-store greedy set-cover plans.
 *
 * This is the core algorithm that determines which store combinations
 * to evaluate. It does NOT call the database — all inputs are pre-fetched.
 *
 * @param stores - Stores with coordinates (already filtered to radius)
 * @param itemsByStore - Map of storeId → Set of itemIds available at that store
 * @param matchedItems - Items the user wants to buy
 * @param itemIds - IDs of matchedItems (for set operations)
 * @param planBuilder - Function that builds a TripPlan from a list of stores
 */
export function generateCandidatePlans(
  stores: StoreWithId[],
  itemsByStore: Map<string, Set<string>>,
  matchedItems: MatchedItem[],
  itemIds: string[],
  planBuilder: (planStores: StoreWithId[]) => TripPlan,
): TripPlan[] {
  const candidatePlans: TripPlan[] = [];

  // 1. Single-store plans (include any store with at least 1 item)
  for (const store of stores) {
    const storeItemSet = itemsByStore.get(store.id);
    if (!storeItemSet || storeItemSet.size === 0) continue;
    candidatePlans.push(planBuilder([store]));
  }

  // 2. Multi-store plans via greedy set-cover
  // Sort stores by coverage (descending) and take top 8 for combo generation
  const storesByCoverage = [...stores]
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
        candidatePlans.push(planBuilder([topStores[i], topStores[j]]));
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
      const chosen: StoreWithId[] = [];
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
          candidatePlans.push(planBuilder(chosen));
        }
      }
    }
  }

  return candidatePlans;
}
