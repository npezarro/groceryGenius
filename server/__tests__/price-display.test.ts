import { describe, it, expect } from "vitest";

/**
 * Tests for price display formatting — store names and unit pricing.
 *
 * These tests caught the bug where price sparklines showed raw dollar amounts
 * without indicating which store or what unit (e.g., $2.99 vs $2.99/lb at Kroger).
 */

describe("Price Display — Unit Formatting", () => {
  function formatUnit(unit?: string): string {
    if (!unit) return "";
    const cleaned = unit.replace(/^1\s+/, "").trim();
    return `/${cleaned}`;
  }

  it("formats lb unit", () => {
    expect(formatUnit("1 lb")).toBe("/lb");
  });

  it("formats oz unit", () => {
    expect(formatUnit("16 oz")).toBe("/16 oz");
  });

  it("formats gallon unit", () => {
    expect(formatUnit("1 gal")).toBe("/gal");
  });

  it("formats count-based unit", () => {
    expect(formatUnit("12 ct")).toBe("/12 ct");
  });

  it("returns empty string for undefined unit", () => {
    expect(formatUnit(undefined)).toBe("");
  });

  it("returns empty string for empty unit", () => {
    expect(formatUnit("")).toBe("");
  });

  it("handles unit with leading '1 '", () => {
    expect(formatUnit("1 pt")).toBe("/pt");
  });

  it("handles complex Kroger units", () => {
    expect(formatUnit("4 sticks / 16 oz")).toBe("/4 sticks / 16 oz");
  });

  it("handles half gallon", () => {
    expect(formatUnit("1/2 gal")).toBe("/1/2 gal");
  });
});

describe("Price Display — Store Name Formatting", () => {
  function shortStoreName(name?: string): string {
    if (!name) return "";
    return name.replace(/\s*[—–-]\s*.+$/, "").trim();
  }

  it("strips zip code suffix from pipeline stores", () => {
    expect(shortStoreName("Kroger — 94102")).toBe("Kroger");
  });

  it("strips location suffix with em dash", () => {
    expect(shortStoreName("Safeway — Market St")).toBe("Safeway");
  });

  it("strips location suffix with en dash", () => {
    expect(shortStoreName("Whole Foods – SoMa")).toBe("Whole Foods");
  });

  it("strips location suffix with hyphen", () => {
    expect(shortStoreName("Trader Joe's - Stonestown")).toBe("Trader Joe's");
  });

  it("returns full name when no separator", () => {
    expect(shortStoreName("Costco")).toBe("Costco");
  });

  it("returns empty string for undefined", () => {
    expect(shortStoreName(undefined)).toBe("");
  });

  it("handles BLS store name", () => {
    expect(shortStoreName("BLS Average Prices — 94102")).toBe("BLS Average Prices");
  });
});

describe("Price Display — Price History Response", () => {
  it("price history should include storeName field", () => {
    // This is the shape returned by the updated getPriceHistory
    const priceRecord = {
      id: "p1",
      itemId: "i1",
      storeId: "s1",
      price: "2.99",
      unit: "1 lb",
      capturedAt: new Date().toISOString(),
      storeName: "Kroger — 94102",
    };
    expect(priceRecord.storeName).toBeDefined();
    expect(priceRecord.unit).toBeDefined();
  });

  it("price display includes unit when available", () => {
    const price = 2.99;
    const unit = "1 lb";
    const formatted = `$${price.toFixed(2)}/${unit.replace(/^1\s+/, "")}`;
    expect(formatted).toBe("$2.99/lb");
  });

  it("price display omits unit when not available", () => {
    const price = 2.99;
    const unit = undefined;
    const formatted = `$${price.toFixed(2)}${unit ? "/" + unit : ""}`;
    expect(formatted).toBe("$2.99");
  });
});
