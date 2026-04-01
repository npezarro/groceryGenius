import { describe, it, expect } from "vitest";
import type { Price } from "@shared/schema";
import {
  parseCSV,
  calculateEffectivePrice,
  distToStore,
  distBetweenStores,
  matchItems,
  buildPlan,
  scorePlans,
  rankPlans,
} from "../lib/trip-planner";

// Helper: build a minimal Price object for testing
function makePrice(overrides: Partial<Price> & { price: string; itemId: string; storeId: string }): Price {
  return {
    id: "p-1",
    priceType: null,
    quantity: null,
    unit: null,
    capturedAt: null,
    notes: null,
    isPromotion: false,
    originalPrice: null,
    promotionText: null,
    promotionStartDate: null,
    promotionEndDate: null,
    memberPrice: null,
    loyaltyRequired: false,
    submittedBy: null,
    ...overrides,
  } as Price;
}

// ── parseCSV ──

describe("parseCSV", () => {
  it("parses simple CSV rows", () => {
    const result = parseCSV("a,b,c\n1,2,3");
    expect(result).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with commas", () => {
    const result = parseCSV('"hello, world",bar,baz');
    expect(result).toEqual([["hello, world", "bar", "baz"]]);
  });

  it("trims whitespace from fields", () => {
    const result = parseCSV("  foo , bar , baz  ");
    expect(result).toEqual([["foo", "bar", "baz"]]);
  });

  it("skips empty lines", () => {
    const result = parseCSV("a,b\n\nc,d\n");
    expect(result).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles single column", () => {
    const result = parseCSV("one\ntwo\nthree");
    expect(result).toEqual([["one"], ["two"], ["three"]]);
  });

  it("handles empty input", () => {
    expect(parseCSV("")).toEqual([]);
    expect(parseCSV("\n\n")).toEqual([]);
  });
});

// ── calculateEffectivePrice ──

describe("calculateEffectivePrice", () => {
  it("returns current price for simple non-promotional item", () => {
    const price = makePrice({ price: "3.99", itemId: "i1", storeId: "s1" });
    expect(calculateEffectivePrice(price)).toBe(3.99);
  });

  it("returns 0 for non-numeric price", () => {
    const price = makePrice({ price: "N/A", itemId: "i1", storeId: "s1" });
    expect(calculateEffectivePrice(price)).toBe(0);
  });

  it("falls back to currentPrice when originalPrice is non-numeric", () => {
    const price = makePrice({ price: "3.99", originalPrice: "N/A", itemId: "i1", storeId: "s1" });
    expect(calculateEffectivePrice(price)).toBe(3.99);
  });

  it("uses originalPrice when higher than current (active promotion)", () => {
    const price = makePrice({
      price: "2.49",
      originalPrice: "4.99",
      isPromotion: true,
      promotionStartDate: new Date(Date.now() - 86400000),
      promotionEndDate: new Date(Date.now() + 86400000),
      itemId: "i1",
      storeId: "s1",
    });
    // Active promotion: min(originalPrice=4.99, currentPrice=2.49) = 2.49
    expect(calculateEffectivePrice(price)).toBe(2.49);
  });

  it("ignores expired promotion", () => {
    const price = makePrice({
      price: "2.49",
      originalPrice: "4.99",
      isPromotion: true,
      promotionEndDate: new Date(Date.now() - 86400000), // ended yesterday
      itemId: "i1",
      storeId: "s1",
    });
    // Promotion expired: effectivePrice = originalPrice (4.99), not reduced
    expect(calculateEffectivePrice(price)).toBe(4.99);
  });

  it("ignores future promotion", () => {
    const price = makePrice({
      price: "2.49",
      originalPrice: "4.99",
      isPromotion: true,
      promotionStartDate: new Date(Date.now() + 86400000), // starts tomorrow
      itemId: "i1",
      storeId: "s1",
    });
    expect(calculateEffectivePrice(price)).toBe(4.99);
  });

  it("applies member price when user has membership", () => {
    const price = makePrice({
      price: "5.99",
      memberPrice: "4.49",
      itemId: "i1",
      storeId: "s1",
    });
    expect(calculateEffectivePrice(price, true)).toBe(4.49);
  });

  it("does not apply member price without membership", () => {
    const price = makePrice({
      price: "5.99",
      memberPrice: "4.49",
      itemId: "i1",
      storeId: "s1",
    });
    expect(calculateEffectivePrice(price, false)).toBe(5.99);
  });

  it("ignores non-numeric member price", () => {
    const price = makePrice({
      price: "5.99",
      memberPrice: "invalid",
      itemId: "i1",
      storeId: "s1",
    });
    expect(calculateEffectivePrice(price, true)).toBe(5.99);
  });

  it("chooses cheapest among original, current, and member price", () => {
    const price = makePrice({
      price: "3.99",
      originalPrice: "5.99",
      memberPrice: "2.99",
      isPromotion: true,
      promotionStartDate: new Date(Date.now() - 86400000),
      promotionEndDate: new Date(Date.now() + 86400000),
      itemId: "i1",
      storeId: "s1",
    });
    // Active promo: min(5.99, 3.99) = 3.99, then member: min(3.99, 2.99) = 2.99
    expect(calculateEffectivePrice(price, true)).toBe(2.99);
  });
});

// ── distToStore ──

describe("distToStore", () => {
  it("returns 0 for same point", () => {
    expect(distToStore({ lat: 37.77, lng: -122.42 }, 37.77, -122.42)).toBe(0);
  });

  it("calculates rough distance between SF and Oakland", () => {
    const dist = distToStore({ lat: 37.8044, lng: -122.2712 }, 37.7749, -122.4194);
    expect(dist).toBeGreaterThan(5);
    expect(dist).toBeLessThan(20);
  });

  it("returns Infinity when lat is null", () => {
    expect(distToStore({ lat: null, lng: -122.4 }, 37.77, -122.42)).toBe(Infinity);
  });

  it("returns Infinity when lng is null", () => {
    expect(distToStore({ lat: 37.77, lng: null }, 37.77, -122.42)).toBe(Infinity);
  });

  it("returns Infinity when both are null", () => {
    expect(distToStore({ lat: null, lng: null }, 37.77, -122.42)).toBe(Infinity);
  });
});

// ── distBetweenStores ──

describe("distBetweenStores", () => {
  it("returns 0 for same coordinates", () => {
    expect(distBetweenStores(
      { lat: 37.77, lng: -122.42 },
      { lat: 37.77, lng: -122.42 },
    )).toBe(0);
  });

  it("returns Infinity when first store has null coords", () => {
    expect(distBetweenStores(
      { lat: null, lng: -122.42 },
      { lat: 37.78, lng: -122.43 },
    )).toBe(Infinity);
  });

  it("returns Infinity when second store has null coords", () => {
    expect(distBetweenStores(
      { lat: 37.77, lng: -122.42 },
      { lat: null, lng: null },
    )).toBe(Infinity);
  });

  it("calculates reasonable distance", () => {
    const dist = distBetweenStores(
      { lat: 37.77, lng: -122.42 },
      { lat: 37.78, lng: -122.43 },
    );
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(5);
  });
});

// ── matchItems ──

describe("matchItems", () => {
  const catalog = [
    { id: "1", name: "Russet Potato" },
    { id: "2", name: "Baby Bananas" },
    { id: "3", name: "Kroger® Pure Cane Sugar" },
    { id: "4", name: "Milk" },
  ];

  it("matches exact names case-insensitively", () => {
    const result = matchItems(["russet potato"], catalog);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("fuzzy matches when search term is contained in item name", () => {
    const result = matchItems(["cane sugar"], catalog);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("fuzzy matches when item name is contained in search term", () => {
    const result = matchItems(["organic milk from California"], catalog);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("4");
  });

  it("returns empty array when nothing matches", () => {
    expect(matchItems(["chocolate cake"], catalog)).toEqual([]);
  });

  it("returns empty array for empty search list", () => {
    expect(matchItems([], catalog)).toEqual([]);
  });

  it("returns empty array for empty catalog", () => {
    expect(matchItems(["eggs"], [])).toEqual([]);
  });

  it("matches multiple items preserving order", () => {
    const result = matchItems(["milk", "russet potato"], catalog);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("4"); // milk first (input order)
    expect(result[1].id).toBe("1"); // potato second
  });

  it("prefers exact match over fuzzy", () => {
    const items = [
      { id: "1", name: "Banana Chips" },
      { id: "2", name: "Banana" },
    ];
    const result = matchItems(["Banana"], items);
    expect(result[0].id).toBe("2"); // exact match
  });
});

// ── buildPlan ──

describe("buildPlan", () => {
  const storeA = { id: "s-a", name: "Store A", address: "1 Main St", lat: 37.77, lng: -122.42 };
  const storeB = { id: "s-b", name: "Store B", address: "2 Oak Ave", lat: 37.78, lng: -122.43 };
  const items = [
    { id: "egg", name: "Eggs" },
    { id: "milk", name: "Milk" },
  ];
  const userLat = 37.76;
  const userLng = -122.41;

  it("assigns items to cheapest store", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [
      makePrice({ itemId: "egg", storeId: "s-a", price: "3.99" }),
      makePrice({ itemId: "milk", storeId: "s-a", price: "4.99" }),
    ]);
    pricesByStore.set("s-b", [
      makePrice({ itemId: "egg", storeId: "s-b", price: "2.49" }),
      makePrice({ itemId: "milk", storeId: "s-b", price: "5.49" }),
    ]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg", "milk"]));
    itemsByStore.set("s-b", new Set(["egg", "milk"]));

    const plan = buildPlan([storeA, storeB], items, pricesByStore, itemsByStore, userLat, userLng);

    // Eggs cheaper at B (2.49), Milk cheaper at A (4.99)
    const storeAItems = plan.stores.find(s => s.store.id === "s-a")?.items || [];
    const storeBItems = plan.stores.find(s => s.store.id === "s-b")?.items || [];
    expect(storeAItems.map(i => i.itemId)).toContain("milk");
    expect(storeBItems.map(i => i.itemId)).toContain("egg");
  });

  it("calculates correct totalCost", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [
      makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" }),
      makePrice({ itemId: "milk", storeId: "s-a", price: "2.00" }),
    ]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg", "milk"]));

    const plan = buildPlan([storeA], items, pricesByStore, itemsByStore, userLat, userLng);
    expect(plan.totalCost).toBe(5.00);
  });

  it("coverage reflects ratio of covered items", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [
      makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" }),
      // milk not available at store A
    ]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg"]));

    const plan = buildPlan([storeA], items, pricesByStore, itemsByStore, userLat, userLng);
    expect(plan.coverage).toBe(0.5); // 1 of 2 items
  });

  it("full coverage returns 1.0", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [
      makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" }),
      makePrice({ itemId: "milk", storeId: "s-a", price: "2.00" }),
    ]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg", "milk"]));

    const plan = buildPlan([storeA], items, pricesByStore, itemsByStore, userLat, userLng);
    expect(plan.coverage).toBe(1.0);
  });

  it("excludes stores with no items assigned from output", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [
      makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" }),
      makePrice({ itemId: "milk", storeId: "s-a", price: "2.00" }),
    ]);
    pricesByStore.set("s-b", []); // no prices at B
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg", "milk"]));
    itemsByStore.set("s-b", new Set());

    const plan = buildPlan([storeA, storeB], items, pricesByStore, itemsByStore, userLat, userLng);
    expect(plan.stores).toHaveLength(1);
    expect(plan.stores[0].store.id).toBe("s-a");
  });

  it("calculates positive totalDistance for non-zero location", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" })]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg"]));

    const plan = buildPlan([storeA], [items[0]], pricesByStore, itemsByStore, userLat, userLng);
    expect(plan.totalDistance).toBeGreaterThan(0);
  });

  it("calculates totalTime based on distance and number of stops", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" })]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg"]));

    const plan = buildPlan([storeA], [items[0]], pricesByStore, itemsByStore, userLat, userLng);
    // 10 min per stop + 3 min per mile travel
    expect(plan.totalTime).toBeGreaterThanOrEqual(10);
  });

  it("multi-store route adds inter-store distances", () => {
    const pricesByStore = new Map<string, Price[]>();
    pricesByStore.set("s-a", [makePrice({ itemId: "egg", storeId: "s-a", price: "3.00" })]);
    pricesByStore.set("s-b", [makePrice({ itemId: "milk", storeId: "s-b", price: "2.00" })]);
    const itemsByStore = new Map<string, Set<string>>();
    itemsByStore.set("s-a", new Set(["egg"]));
    itemsByStore.set("s-b", new Set(["milk"]));

    const singlePlan = buildPlan([storeA], [items[0]], pricesByStore, itemsByStore, userLat, userLng);
    const multiPlan = buildPlan([storeA, storeB], items, pricesByStore, itemsByStore, userLat, userLng);
    expect(multiPlan.totalDistance).toBeGreaterThan(singlePlan.totalDistance);
  });
});

// ── scorePlans ──

describe("scorePlans", () => {
  it("assigns higher score to cheaper plan (price-weighted)", () => {
    const plans = [
      { stores: [{ store: { id: "a", name: "A" }, items: [], subtotal: 0 }], totalCost: 50, totalTime: 30, totalDistance: 5, score: 0, coverage: 1.0 },
      { stores: [{ store: { id: "b", name: "B" }, items: [], subtotal: 0 }], totalCost: 20, totalTime: 30, totalDistance: 5, score: 0, coverage: 1.0 },
    ];
    scorePlans(plans, { price: 1, time: 0, distance: 0 });
    expect(plans[1].score).toBeGreaterThan(plans[0].score); // cheaper = higher score
  });

  it("assigns higher score to closer plan (distance-weighted)", () => {
    const plans = [
      { stores: [{ store: { id: "a", name: "A" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 30, totalDistance: 20, score: 0, coverage: 1.0 },
      { stores: [{ store: { id: "b", name: "B" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 30, totalDistance: 2, score: 0, coverage: 1.0 },
    ];
    scorePlans(plans, { price: 0, time: 0, distance: 1 });
    expect(plans[1].score).toBeGreaterThan(plans[0].score);
  });

  it("penalizes partial coverage", () => {
    const plans = [
      { stores: [{ store: { id: "a", name: "A" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 30, totalDistance: 5, score: 0, coverage: 0.5 },
      { stores: [{ store: { id: "b", name: "B" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 30, totalDistance: 5, score: 0, coverage: 1.0 },
    ];
    scorePlans(plans, { price: 0.5, time: 0.25, distance: 0.25 });
    expect(plans[1].score).toBeGreaterThan(plans[0].score);
  });

  it("handles single plan (no normalization spread)", () => {
    const plans = [
      { stores: [{ store: { id: "a", name: "A" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 20, totalDistance: 5, score: 0, coverage: 1.0 },
    ];
    scorePlans(plans, { price: 0.5, time: 0.25, distance: 0.25 });
    expect(plans[0].score).toBe(100); // single plan, full coverage, no penalty
  });

  it("does nothing for empty array", () => {
    scorePlans([], { price: 1, time: 0, distance: 0 });
    // no error
  });
});

// ── rankPlans ──

describe("rankPlans", () => {
  it("sorts by coverage descending, then score descending", () => {
    const plans = [
      { stores: [{ store: { id: "a", name: "A" }, items: [], subtotal: 0 }], totalCost: 30, totalTime: 20, totalDistance: 5, score: 80, coverage: 0.8 },
      { stores: [{ store: { id: "b", name: "B" }, items: [], subtotal: 0 }], totalCost: 20, totalTime: 15, totalDistance: 3, score: 90, coverage: 1.0 },
      { stores: [{ store: { id: "c", name: "C" }, items: [], subtotal: 0 }], totalCost: 25, totalTime: 20, totalDistance: 4, score: 85, coverage: 1.0 },
    ];
    const ranked = rankPlans(plans);
    expect(ranked[0].stores[0].store.id).toBe("b"); // 1.0 coverage, score 90
    expect(ranked[1].stores[0].store.id).toBe("c"); // 1.0 coverage, score 85
    expect(ranked[2].stores[0].store.id).toBe("a"); // 0.8 coverage
  });

  it("limits results to maxResults", () => {
    const plans = Array.from({ length: 10 }, (_, i) => ({
      stores: [{ store: { id: `s-${i}`, name: `Store ${i}` }, items: [], subtotal: 0 }],
      totalCost: 30, totalTime: 20, totalDistance: 5, score: 50 + i, coverage: 1.0,
    }));
    const ranked = rankPlans(plans, 3);
    expect(ranked).toHaveLength(3);
  });

  it("promotes multi-store plan if none in top results", () => {
    // 6 single-store plans + 1 multi-store plan with positive coverage
    const plans = Array.from({ length: 7 }, (_, i) => ({
      stores: i === 6
        ? [
            { store: { id: "m1", name: "Multi 1" }, items: [], subtotal: 0 },
            { store: { id: "m2", name: "Multi 2" }, items: [], subtotal: 0 },
          ]
        : [{ store: { id: `s-${i}`, name: `Store ${i}` }, items: [], subtotal: 0 }],
      totalCost: i === 6 ? 60 : 30, totalTime: 20, totalDistance: 5,
      score: i === 6 ? 40 : 90 - i, coverage: i === 6 ? 0.9 : 1.0,
    }));
    const ranked = rankPlans(plans, 6);
    const hasMulti = ranked.some(p => p.stores.length > 1);
    expect(hasMulti).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(rankPlans([])).toEqual([]);
  });
});
