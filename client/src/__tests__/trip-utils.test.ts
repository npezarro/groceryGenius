import { describe, it, expect } from "vitest";
import {
  getSemanticLabel,
  formatTripTime,
  generateGoogleMapsLink,
  generateAppleMapsLink,
} from "../lib/trip-utils";
import { TripPlan } from "../lib/types";

function makePlan(overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    stores: [
      {
        store: { id: "s1", name: "Store A", address: "123 Main St", lat: 49.28, lng: -123.12 },
        items: [{ itemId: "i1", itemName: "Milk", price: 4.99, unit: "gal" }],
        subtotal: 5.0,
      },
    ],
    totalCost: 25.0,
    totalTime: 30,
    totalDistance: 5.0,
    score: 85,
    coverage: 1.0,
    ...overrides,
  };
}

describe("getSemanticLabel", () => {
  it("returns Best Overall for a single plan", () => {
    const plan = makePlan();
    expect(getSemanticLabel(plan, [plan])).toEqual({
      label: "Best Overall",
      color: "text-yellow-600",
    });
  });

  it("returns Best Overall for highest score", () => {
    const best = makePlan({ score: 95 });
    const other = makePlan({ score: 70, totalCost: 10 });
    expect(getSemanticLabel(best, [best, other]).label).toBe("Best Overall");
  });

  it("returns Best Price for lowest cost", () => {
    const best = makePlan({ score: 95 });
    const cheapest = makePlan({ score: 70, totalCost: 10 });
    expect(getSemanticLabel(cheapest, [best, cheapest]).label).toBe("Best Price");
  });

  it("returns Best Coverage for highest coverage", () => {
    const best = makePlan({ score: 95 });
    const fullCoverage = makePlan({ score: 70, totalCost: 30, coverage: 1.0 });
    const partial = makePlan({ score: 60, totalCost: 35, coverage: 0.5 });
    expect(getSemanticLabel(fullCoverage, [best, fullCoverage, partial]).label).toBe(
      "Best Coverage"
    );
  });

  it("returns Quickest Trip for shortest time", () => {
    const best = makePlan({ score: 95 });
    const fast = makePlan({ score: 70, totalCost: 30, coverage: 0.5, totalTime: 10 });
    expect(getSemanticLabel(fast, [best, fast]).label).toBe("Quickest Trip");
  });

  it("returns Great Option for score >= 80", () => {
    const best = makePlan({ score: 95 });
    const second = makePlan({ score: 80, totalCost: 30, totalTime: 35, coverage: 0.5 });
    expect(getSemanticLabel(second, [best, second]).label).toBe("Great Option");
  });

  it("returns Good Option for score >= 50", () => {
    const best = makePlan({ score: 95 });
    const mid = makePlan({ score: 55, totalCost: 30, totalTime: 35, coverage: 0.5 });
    expect(getSemanticLabel(mid, [best, mid]).label).toBe("Good Option");
  });

  it("returns Alternative for low score", () => {
    const best = makePlan({ score: 95 });
    const low = makePlan({ score: 30, totalCost: 30, totalTime: 35, coverage: 0.5 });
    expect(getSemanticLabel(low, [best, low]).label).toBe("Alternative");
  });

  it("does not label Best Coverage when coverage is 0", () => {
    const best = makePlan({ score: 95, coverage: 0 });
    const other = makePlan({ score: 40, totalCost: 30, totalTime: 35, coverage: 0 });
    expect(getSemanticLabel(other, [best, other]).label).not.toBe("Best Coverage");
  });
});

describe("formatTripTime", () => {
  it("formats minutes under 60", () => {
    expect(formatTripTime(45)).toBe("45 min");
  });

  it("rounds fractional minutes", () => {
    expect(formatTripTime(12.7)).toBe("13 min");
  });

  it("formats exactly 60 minutes as hours", () => {
    expect(formatTripTime(60)).toBe("1h 0m");
  });

  it("formats hours and minutes", () => {
    expect(formatTripTime(90)).toBe("1h 30m");
  });

  it("formats multiple hours", () => {
    expect(formatTripTime(150)).toBe("2h 30m");
  });

  it("handles 0 minutes", () => {
    expect(formatTripTime(0)).toBe("0 min");
  });
});

describe("generateGoogleMapsLink", () => {
  const coords = { lat: 49.28, lng: -123.12 };

  it("returns # when no coordinates", () => {
    expect(generateGoogleMapsLink(makePlan(), null)).toBe("#");
    expect(generateGoogleMapsLink(makePlan(), undefined)).toBe("#");
  });

  it("uses store address for waypoints when available", () => {
    const plan = makePlan();
    const url = generateGoogleMapsLink(plan, coords);
    expect(url).toContain("49.28,-123.12"); // origin coords
    expect(url).toContain(encodeURIComponent("123 Main St")); // store address
  });

  it("falls back to coordinates when address is a zip placeholder", () => {
    const plan = makePlan({
      stores: [
        { store: { id: "s1", name: "Kroger", address: "94102 area", lat: 37.77, lng: -122.42 }, items: [], subtotal: 0 },
      ],
    });
    const url = generateGoogleMapsLink(plan, coords);
    expect(url).toContain("37.77,-122.42");
  });

  it("joins multiple store waypoints with /", () => {
    const plan = makePlan({
      stores: [
        { store: { id: "s1", name: "A", address: "100 First Ave", lat: 49.1, lng: -123.1 }, items: [], subtotal: 0 },
        { store: { id: "s2", name: "B", address: "200 Second Ave", lat: 49.2, lng: -123.2 }, items: [], subtotal: 0 },
      ],
    });
    const url = generateGoogleMapsLink(plan, coords);
    expect(url).toContain(encodeURIComponent("100 First Ave"));
    expect(url).toContain(encodeURIComponent("200 Second Ave"));
  });

  it("does not produce undefined in URL for stores without coordinates or address", () => {
    const plan = makePlan({
      stores: [
        { store: { id: "s1", name: "Mystery Store", address: "94102 area" }, items: [], subtotal: 0 },
      ],
    });
    const url = generateGoogleMapsLink(plan, coords);
    expect(url).not.toContain("undefined");
    // Falls back to store name search
    expect(url).toContain(encodeURIComponent("Mystery Store"));
  });
});

describe("generateAppleMapsLink", () => {
  const coords = { lat: 49.28, lng: -123.12 };

  it("returns # when no coordinates", () => {
    expect(generateAppleMapsLink(makePlan(), null)).toBe("#");
  });

  it("returns # when no stores", () => {
    const plan = makePlan({ stores: [] });
    expect(generateAppleMapsLink(plan, coords)).toBe("#");
  });

  it("uses store address for destination", () => {
    const plan = makePlan();
    const url = generateAppleMapsLink(plan, coords);
    expect(url).toContain("saddr=49.28,-123.12");
    expect(url).toContain("daddr=" + encodeURIComponent("123 Main St"));
  });

  it("falls back to coordinates for zip placeholder address", () => {
    const plan = makePlan({
      stores: [
        { store: { id: "s1", name: "Kroger", address: "94102 area", lat: 37.77, lng: -122.42 }, items: [], subtotal: 0 },
      ],
    });
    const url = generateAppleMapsLink(plan, coords);
    expect(url).toContain("daddr=37.77,-122.42");
  });
});
