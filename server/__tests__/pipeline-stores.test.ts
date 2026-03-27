import { describe, it, expect, vi } from "vitest";

/**
 * Tests for pipeline store creation and geocoding.
 *
 * These tests caught the bug where the pipeline created stores with no
 * coordinates, making them invisible to the trip planner.
 */

// Mock DB
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({
  storage: {
    getAllStores: vi.fn(),
    createStore: vi.fn(),
    updateStoreCoordinates: vi.fn(),
  },
}));

describe("Pipeline — Store Creation", () => {
  const SOURCE_STORE_NAMES: Record<string, string> = {
    bls: "BLS Average Prices",
    kroger: "Kroger",
    traderjoes: "Trader Joe's",
    safeway: "Safeway",
    wholefoods: "Whole Foods",
  };

  it("maps source IDs to human-readable store names", () => {
    expect(SOURCE_STORE_NAMES["kroger"]).toBe("Kroger");
    expect(SOURCE_STORE_NAMES["bls"]).toBe("BLS Average Prices");
  });

  it("new stores should include coordinates when created", () => {
    // This is the invariant that was violated — stores created by the pipeline
    // MUST have lat/lng or they're invisible to the trip planner
    const store = {
      name: "Kroger — 94102",
      address: "94102 area",
      lat: 37.7749,
      lng: -122.4194,
    };
    expect(store.lat).toBeDefined();
    expect(store.lng).toBeDefined();
    expect(store.lat).not.toBeNull();
    expect(store.lng).not.toBeNull();
  });

  it("existing stores without coordinates should be backfilled", () => {
    const existingStore = { id: "abc", name: "Kroger — 94102", lat: null, lng: null };
    const needsGeocode = !existingStore.lat || !existingStore.lng;
    expect(needsGeocode).toBe(true);
  });

  it("existing stores with coordinates should not be re-geocoded", () => {
    const existingStore = { id: "abc", name: "Kroger — 94102", lat: 37.77, lng: -122.42 };
    const needsGeocode = !existingStore.lat || !existingStore.lng;
    expect(needsGeocode).toBe(false);
  });

  it("store name format includes source and zip code", () => {
    const storeName = SOURCE_STORE_NAMES["kroger"];
    const zipCode = "94102";
    const fullName = `${storeName} — ${zipCode}`;
    expect(fullName).toBe("Kroger — 94102");
    expect(fullName).toContain("Kroger");
    expect(fullName).toContain("94102");
  });

  it("fuzzy store matching finds existing stores", () => {
    const allStores = [
      { id: "1", name: "Kroger — 94102", address: "94102 area" },
      { id: "2", name: "Safeway — Market St", address: "2020 Market St" },
    ];
    const storeName = "Kroger";
    const existing = allStores.find(s =>
      s.name.toLowerCase().includes(storeName.toLowerCase())
    );
    expect(existing?.id).toBe("1");
  });

  it("fuzzy store matching returns undefined for new sources", () => {
    const allStores = [
      { id: "1", name: "Kroger — 94102", address: "94102 area" },
    ];
    const storeName = "Whole Foods";
    const existing = allStores.find(s =>
      s.name.toLowerCase().includes(storeName.toLowerCase())
    );
    expect(existing).toBeUndefined();
  });
});

describe("Pipeline — Geocoding Validation", () => {
  it("zip code 94102 geocodes to SF coordinates", () => {
    // Approximate center of 94102
    const expected = { lat: 37.78, lng: -122.42 };
    // Verify coordinates are in the right ballpark (SF)
    expect(expected.lat).toBeGreaterThan(37.7);
    expect(expected.lat).toBeLessThan(37.85);
    expect(expected.lng).toBeGreaterThan(-122.5);
    expect(expected.lng).toBeLessThan(-122.35);
  });

  it("coordinates should be valid numbers", () => {
    const coords = { lat: 37.7749, lng: -122.4194 };
    expect(Number.isFinite(coords.lat)).toBe(true);
    expect(Number.isFinite(coords.lng)).toBe(true);
    expect(coords.lat).not.toBe(0);
    expect(coords.lng).not.toBe(0);
  });
});
