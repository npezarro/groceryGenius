import { describe, it, expect } from "vitest";
import { normalizeWeights, computeGeocodingProgress } from "../lib/preference-utils";

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 1.0", () => {
    const result = normalizeWeights(
      { price: 0.5, time: 0.3, distance: 0.2 },
      { price: 0.8 }
    );
    const total = result.price + result.time + result.distance;
    expect(total).toBeCloseTo(1.0);
  });

  it("preserves ratios of unchanged weights", () => {
    const result = normalizeWeights(
      { price: 0.5, time: 0.3, distance: 0.2 },
      { price: 0.8 }
    );
    // time and distance should maintain their relative ratio
    expect(result.time / result.distance).toBeCloseTo(0.3 / 0.2);
  });

  it("handles updating a single weight", () => {
    const current = { price: 0.33, time: 0.33, distance: 0.34 };
    const result = normalizeWeights(current, { price: 1.0 });
    expect(result.price).toBeGreaterThan(result.time);
    expect(result.price).toBeGreaterThan(result.distance);
  });

  it("returns current weights when total is 0", () => {
    const current = { price: 0.5, time: 0.3, distance: 0.2 };
    const result = normalizeWeights(current, {
      price: 0,
      time: 0,
      distance: 0,
    });
    expect(result).toEqual(current);
  });

  it("handles all weights being equal", () => {
    const result = normalizeWeights(
      { price: 0.33, time: 0.33, distance: 0.34 },
      { price: 0.5, time: 0.5, distance: 0.5 }
    );
    expect(result.price).toBeCloseTo(1 / 3);
    expect(result.time).toBeCloseTo(1 / 3);
    expect(result.distance).toBeCloseTo(1 / 3);
  });

  it("handles one weight dominating", () => {
    const result = normalizeWeights(
      { price: 0.33, time: 0.33, distance: 0.34 },
      { price: 100, time: 0, distance: 0 }
    );
    expect(result.price).toBe(1);
    expect(result.time).toBe(0);
    expect(result.distance).toBe(0);
  });

  it("does not mutate the original weights", () => {
    const current = { price: 0.5, time: 0.3, distance: 0.2 };
    const copy = { ...current };
    normalizeWeights(current, { price: 0.8 });
    expect(current).toEqual(copy);
  });
});

describe("computeGeocodingProgress", () => {
  it("returns 100% when all stores geocoded", () => {
    expect(computeGeocodingProgress(10, 10)).toBe(100);
  });

  it("returns 50% for half geocoded", () => {
    expect(computeGeocodingProgress(5, 10)).toBe(50);
  });

  it("returns 0% when none geocoded", () => {
    expect(computeGeocodingProgress(0, 10)).toBe(0);
  });

  it("handles 0 total stores (division by zero)", () => {
    expect(computeGeocodingProgress(0, 0)).toBe(0);
  });

  it("returns correct fraction", () => {
    expect(computeGeocodingProgress(3, 7)).toBeCloseTo((3 / 7) * 100);
  });
});
