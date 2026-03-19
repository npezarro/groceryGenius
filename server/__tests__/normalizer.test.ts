import { describe, it, expect, vi } from "vitest";

// Mock storage to avoid DATABASE_URL requirement (only used by ingestProducts, not normalizeUnit)
vi.mock("../storage", () => ({ storage: {} }));

import { normalizeUnit } from "../pipeline/normalizer";

describe("normalizeUnit", () => {
  // — Weight conversions —

  it("normalizes lb to per_lb at factor 1", () => {
    const result = normalizeUnit("lb", 5.0);
    expect(result).toEqual({ normalizedUnit: "per_lb", normalizedPricePerUnit: 5.0 });
  });

  it("normalizes lbs (alias)", () => {
    const result = normalizeUnit("lbs", 5.0);
    expect(result).toEqual({ normalizedUnit: "per_lb", normalizedPricePerUnit: 5.0 });
  });

  it("normalizes pound (alias)", () => {
    const result = normalizeUnit("pound", 3.0);
    expect(result).toEqual({ normalizedUnit: "per_lb", normalizedPricePerUnit: 3.0 });
  });

  it("normalizes oz to per_lb (1/16 factor)", () => {
    // $1.00 per oz → $16.00 per lb
    const result = normalizeUnit("oz", 1.0);
    expect(result?.normalizedUnit).toBe("per_lb");
    expect(result?.normalizedPricePerUnit).toBe(16.0);
  });

  it("normalizes kg to per_lb", () => {
    // $10 per kg → $10 / 2.20462 ≈ $4.54 per lb
    const result = normalizeUnit("kg", 10.0);
    expect(result?.normalizedUnit).toBe("per_lb");
    expect(result?.normalizedPricePerUnit).toBe(4.54);
  });

  it("normalizes gram to per_lb", () => {
    // $0.01 per gram → $0.01 / 0.00220462 ≈ $4.54 per lb
    const result = normalizeUnit("gram", 0.01);
    expect(result?.normalizedUnit).toBe("per_lb");
    expect(result?.normalizedPricePerUnit).toBe(4.54);
  });

  // — Volume conversions —

  it("normalizes gal to per_gal at factor 1", () => {
    const result = normalizeUnit("gal", 3.99);
    expect(result).toEqual({ normalizedUnit: "per_gal", normalizedPricePerUnit: 3.99 });
  });

  it("normalizes quart to per_gal", () => {
    // $2 per quart → $8 per gallon
    const result = normalizeUnit("quart", 2.0);
    expect(result).toEqual({ normalizedUnit: "per_gal", normalizedPricePerUnit: 8.0 });
  });

  it("normalizes pint to per_gal", () => {
    // $1 per pint → $8 per gallon
    const result = normalizeUnit("pint", 1.0);
    expect(result).toEqual({ normalizedUnit: "per_gal", normalizedPricePerUnit: 8.0 });
  });

  it("normalizes fl oz to per_gal", () => {
    // $0.10 per fl oz → $12.80 per gallon
    const result = normalizeUnit("fl oz", 0.10);
    expect(result?.normalizedUnit).toBe("per_gal");
    expect(result?.normalizedPricePerUnit).toBe(12.8);
  });

  it("normalizes liter to per_gal", () => {
    // $1 per liter → $1 / 0.264172 ≈ $3.79 per gallon
    const result = normalizeUnit("liter", 1.0);
    expect(result?.normalizedUnit).toBe("per_gal");
    expect(result?.normalizedPricePerUnit).toBe(3.79);
  });

  it("normalizes ml to per_gal", () => {
    const result = normalizeUnit("ml", 0.005);
    expect(result?.normalizedUnit).toBe("per_gal");
    expect(result?.normalizedPricePerUnit).toBeGreaterThan(0);
  });

  // — Count conversions —

  it("normalizes each to per_each", () => {
    const result = normalizeUnit("each", 0.50);
    expect(result).toEqual({ normalizedUnit: "per_each", normalizedPricePerUnit: 0.5 });
  });

  it("normalizes ea (alias)", () => {
    const result = normalizeUnit("ea", 1.0);
    expect(result).toEqual({ normalizedUnit: "per_each", normalizedPricePerUnit: 1.0 });
  });

  it("normalizes ct (alias)", () => {
    const result = normalizeUnit("ct", 2.0);
    expect(result).toEqual({ normalizedUnit: "per_each", normalizedPricePerUnit: 2.0 });
  });

  it("normalizes bunch to per_bunch", () => {
    const result = normalizeUnit("bunch", 1.99);
    expect(result).toEqual({ normalizedUnit: "per_bunch", normalizedPricePerUnit: 1.99 });
  });

  // — Quantity handling —

  it("divides price by quantity", () => {
    // $12 for a 12-pack → $1 each
    const result = normalizeUnit("each", 12.0, 12);
    expect(result).toEqual({ normalizedUnit: "per_each", normalizedPricePerUnit: 1.0 });
  });

  it("defaults quantity to 1 when not provided", () => {
    const result = normalizeUnit("lb", 5.0);
    const resultWithQty = normalizeUnit("lb", 5.0, 1);
    expect(result).toEqual(resultWithQty);
  });

  // — Case insensitivity —

  it("handles uppercase unit strings", () => {
    const result = normalizeUnit("LB", 5.0);
    expect(result?.normalizedUnit).toBe("per_lb");
  });

  it("handles mixed case", () => {
    const result = normalizeUnit("Gallon", 3.99);
    expect(result?.normalizedUnit).toBe("per_gal");
  });

  it("trims whitespace from unit", () => {
    const result = normalizeUnit("  lb  ", 5.0);
    expect(result?.normalizedUnit).toBe("per_lb");
  });

  // — Edge cases / null returns —

  it("returns null for undefined unit", () => {
    expect(normalizeUnit(undefined, 5.0)).toBeNull();
  });

  it("returns null for unknown unit", () => {
    expect(normalizeUnit("bushel", 5.0)).toBeNull();
  });

  it("returns null when price/qty yields non-finite result", () => {
    expect(normalizeUnit("lb", 0, 1)).toBeNull();
  });

  it("returns null when quantity is zero (division by zero)", () => {
    expect(normalizeUnit("lb", 5.0, 0)).toBeNull();
  });

  // — Rounding —

  it("rounds result to cents", () => {
    // $10 / (3 * 1) = 3.3333... → 3.33
    const result = normalizeUnit("lb", 10.0, 3);
    expect(result?.normalizedPricePerUnit).toBe(3.33);
  });
});
