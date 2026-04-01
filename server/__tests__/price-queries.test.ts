import { describe, it, expect } from "vitest";
import { deduplicateLatestByStore, parseDaysParam } from "../lib/price-queries";

// ---------- deduplicateLatestByStore ----------

describe("deduplicateLatestByStore", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateLatestByStore([])).toEqual([]);
  });

  it("keeps first occurrence per store (newest when pre-sorted desc by date)", () => {
    const rows = [
      { storeId: "s1", price: "3.99", capturedAt: "2026-04-01" },
      { storeId: "s1", price: "4.50", capturedAt: "2026-03-25" },
      { storeId: "s2", price: "2.50", capturedAt: "2026-04-01" },
    ];
    const result = deduplicateLatestByStore(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.storeId)).toEqual(["s2", "s1"]);
    expect(result[0].price).toBe("2.50");
    expect(result[1].price).toBe("3.99");
  });

  it("sorts results by price ascending", () => {
    const rows = [
      { storeId: "expensive", price: "10.00" },
      { storeId: "cheap", price: "1.50" },
      { storeId: "mid", price: "5.00" },
    ];
    const result = deduplicateLatestByStore(rows);
    expect(result.map((r) => r.price)).toEqual(["1.50", "5.00", "10.00"]);
  });

  it("handles single store with multiple entries", () => {
    const rows = [
      { storeId: "s1", price: "3.00" },
      { storeId: "s1", price: "4.00" },
      { storeId: "s1", price: "2.00" },
    ];
    const result = deduplicateLatestByStore(rows);
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe("3.00"); // first occurrence kept
  });

  it("handles unparseable price strings gracefully (treats as 0)", () => {
    const rows = [
      { storeId: "s1", price: "N/A" },
      { storeId: "s2", price: "2.50" },
    ];
    const result = deduplicateLatestByStore(rows);
    expect(result[0].price).toBe("N/A"); // 0 sorts first
    expect(result[1].price).toBe("2.50");
  });

  it("preserves all fields on each row", () => {
    const rows = [
      {
        storeId: "s1",
        price: "5.99",
        storeName: "Market A",
        unit: "lb",
        isPromotion: false,
      },
    ];
    const result = deduplicateLatestByStore(rows);
    expect(result[0]).toEqual(rows[0]);
  });

  it("handles many stores correctly", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      storeId: `s${i}`,
      price: `${(20 - i).toFixed(2)}`,
    }));
    const result = deduplicateLatestByStore(rows);
    expect(result).toHaveLength(20);
    // Should be sorted ascending by price: 1.00, 2.00, ... 20.00
    expect(parseFloat(result[0].price)).toBe(1);
    expect(parseFloat(result[19].price)).toBe(20);
  });
});

// ---------- parseDaysParam ----------

describe("parseDaysParam", () => {
  it("returns default when input is undefined", () => {
    expect(parseDaysParam(undefined)).toBe(30);
  });

  it("returns default when input is empty string", () => {
    expect(parseDaysParam("")).toBe(30);
  });

  it("parses valid integer string", () => {
    expect(parseDaysParam("7")).toBe(7);
    expect(parseDaysParam("90")).toBe(90);
    expect(parseDaysParam("365")).toBe(365);
  });

  it("clamps to maxDays", () => {
    expect(parseDaysParam("500")).toBe(365);
    expect(parseDaysParam("9999")).toBe(365);
  });

  it("returns default for NaN input", () => {
    expect(parseDaysParam("abc")).toBe(30);
    expect(parseDaysParam("twelve")).toBe(30);
  });

  it("returns default for zero", () => {
    expect(parseDaysParam("0")).toBe(30);
  });

  it("returns default for negative numbers", () => {
    expect(parseDaysParam("-5")).toBe(30);
    expect(parseDaysParam("-1")).toBe(30);
  });

  it("accepts custom default and max", () => {
    expect(parseDaysParam(undefined, 14, 90)).toBe(14);
    expect(parseDaysParam("100", 14, 90)).toBe(90);
    expect(parseDaysParam("50", 14, 90)).toBe(50);
  });

  it("handles float strings (parseInt truncates)", () => {
    expect(parseDaysParam("7.9")).toBe(7);
    expect(parseDaysParam("30.5")).toBe(30);
  });

  it("handles string with trailing non-numeric chars", () => {
    // parseInt("10abc") returns 10
    expect(parseDaysParam("10abc")).toBe(10);
  });

  it("returns 1 for input of '1' (minimum valid)", () => {
    expect(parseDaysParam("1")).toBe(1);
  });
});
