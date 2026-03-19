import { describe, it, expect } from "vitest";
import { validateProduct, validateProducts } from "../pipeline/validator";
import type { RawProduct } from "../pipeline/types";

/** Minimal valid product for tests to extend */
const base: RawProduct = { name: "Organic Bananas", price: 1.99 };

// ── validateProduct ──────────────────────────────────────────────

describe("validateProduct", () => {
  // — Name validation —

  it("returns null when name is missing", () => {
    expect(validateProduct({ ...base, name: "" })).toBeNull();
  });

  it("returns null when name is too short after stripping", () => {
    expect(validateProduct({ ...base, name: "A" })).toBeNull();
  });

  it("strips HTML from name", () => {
    const result = validateProduct({ ...base, name: "<b>Apples</b>" });
    expect(result?.name).toBe("Apples");
  });

  it("strips script tags and keeps text content", () => {
    // After stripping HTML, "alert(1)" is clean text — validator keeps it
    const result = validateProduct({ ...base, name: "<script>alert(1)</script>" });
    expect(result?.name).toBe("alert(1)");
  });

  it("truncates name to 200 characters", () => {
    const longName = "A".repeat(300);
    const result = validateProduct({ ...base, name: longName });
    expect(result?.name.length).toBe(200);
  });

  it("returns null for non-string name", () => {
    expect(validateProduct({ ...base, name: 123 as unknown as string })).toBeNull();
  });

  // — Price validation —

  it("returns null for zero price", () => {
    expect(validateProduct({ ...base, price: 0 })).toBeNull();
  });

  it("returns null for negative price", () => {
    expect(validateProduct({ ...base, price: -5 })).toBeNull();
  });

  it("returns null for NaN price", () => {
    expect(validateProduct({ ...base, price: NaN })).toBeNull();
  });

  it("returns null for Infinity price", () => {
    expect(validateProduct({ ...base, price: Infinity })).toBeNull();
  });

  it("returns null for price above 9999", () => {
    expect(validateProduct({ ...base, price: 10000 })).toBeNull();
  });

  it("rounds price to cents", () => {
    const result = validateProduct({ ...base, price: 3.999 });
    expect(result?.price).toBe(4.0);
  });

  it("accepts price at the 9999 boundary", () => {
    const result = validateProduct({ ...base, price: 9999 });
    expect(result?.price).toBe(9999);
  });

  // — Optional text fields —

  it("strips HTML from unit", () => {
    const result = validateProduct({ ...base, unit: "<em>lb</em>" });
    expect(result?.unit).toBe("lb");
  });

  it("truncates unit to 20 chars", () => {
    const result = validateProduct({ ...base, unit: "x".repeat(50) });
    expect(result?.unit?.length).toBe(20);
  });

  it("strips HTML from promotionText", () => {
    const result = validateProduct({ ...base, promotionText: "<b>Sale!</b>" });
    expect(result?.promotionText).toBe("Sale!");
  });

  it("strips HTML from category", () => {
    const result = validateProduct({ ...base, category: "<div>Produce</div>" });
    expect(result?.category).toBe("Produce");
  });

  it("truncates category to 100 chars", () => {
    const result = validateProduct({ ...base, category: "C".repeat(150) });
    expect(result?.category?.length).toBe(100);
  });

  // — Image URL validation —

  it("accepts valid https image URL", () => {
    const result = validateProduct({ ...base, imageUrl: "https://cdn.example.com/img.jpg" });
    expect(result?.imageUrl).toBe("https://cdn.example.com/img.jpg");
  });

  it("strips non-http protocol image URLs", () => {
    const result = validateProduct({ ...base, imageUrl: "javascript:alert(1)" });
    expect(result?.imageUrl).toBeUndefined();
  });

  it("strips malformed image URLs", () => {
    const result = validateProduct({ ...base, imageUrl: "not a url at all" });
    expect(result?.imageUrl).toBeUndefined();
  });

  // — Numeric optional fields —

  it("keeps valid quantity", () => {
    const result = validateProduct({ ...base, quantity: 6 });
    expect(result?.quantity).toBe(6);
  });

  it("strips non-finite quantity", () => {
    const result = validateProduct({ ...base, quantity: Infinity });
    expect(result?.quantity).toBeUndefined();
  });

  it("strips zero quantity", () => {
    const result = validateProduct({ ...base, quantity: 0 });
    expect(result?.quantity).toBeUndefined();
  });

  it("keeps valid originalPrice", () => {
    const result = validateProduct({ ...base, originalPrice: 5.99 });
    expect(result?.originalPrice).toBe(5.99);
  });

  it("strips negative originalPrice", () => {
    const result = validateProduct({ ...base, originalPrice: -1 });
    expect(result?.originalPrice).toBeUndefined();
  });

  it("keeps valid memberPrice", () => {
    const result = validateProduct({ ...base, memberPrice: 2.49 });
    expect(result?.memberPrice).toBe(2.49);
  });

  // — Boolean defaults —

  it("defaults isPromotion to false", () => {
    const result = validateProduct(base);
    expect(result?.isPromotion).toBe(false);
  });

  it("defaults loyaltyRequired to false", () => {
    const result = validateProduct(base);
    expect(result?.loyaltyRequired).toBe(false);
  });

  it("preserves isPromotion when true", () => {
    const result = validateProduct({ ...base, isPromotion: true });
    expect(result?.isPromotion).toBe(true);
  });

  // — sourceProductId —

  it("converts sourceProductId to string", () => {
    const result = validateProduct({ ...base, sourceProductId: "SKU-12345" });
    expect(result?.sourceProductId).toBe("SKU-12345");
  });

  it("truncates sourceProductId to 100 chars", () => {
    const result = validateProduct({ ...base, sourceProductId: "X".repeat(200) });
    expect(result?.sourceProductId?.length).toBe(100);
  });

  // — Full valid product —

  it("returns complete sanitized product for valid input", () => {
    const input: RawProduct = {
      name: "Whole Milk",
      price: 4.495,
      unit: "gal",
      quantity: 1,
      isPromotion: true,
      originalPrice: 5.99,
      promotionText: "Weekly Special",
      memberPrice: 3.99,
      loyaltyRequired: true,
      category: "Dairy",
      imageUrl: "https://cdn.store.com/milk.jpg",
      sourceProductId: "MILK-001",
    };
    const result = validateProduct(input);
    expect(result).toEqual({
      name: "Whole Milk",
      price: 4.5,
      unit: "gal",
      quantity: 1,
      isPromotion: true,
      originalPrice: 5.99,
      promotionText: "Weekly Special",
      memberPrice: 3.99,
      loyaltyRequired: true,
      category: "Dairy",
      imageUrl: "https://cdn.store.com/milk.jpg",
      sourceProductId: "MILK-001",
    });
  });
});

// ── validateProducts (batch) ─────────────────────────────────────

describe("validateProducts", () => {
  it("filters out invalid products and counts rejections", () => {
    const products: RawProduct[] = [
      { name: "Good Product", price: 2.99 },
      { name: "", price: 1.0 },         // invalid: empty name
      { name: "Another Good", price: 5 },
      { name: "Bad Price", price: -1 },  // invalid: negative price
    ];
    const { valid, rejected } = validateProducts(products);
    expect(valid).toHaveLength(2);
    expect(rejected).toBe(2);
    expect(valid[0].name).toBe("Good Product");
    expect(valid[1].name).toBe("Another Good");
  });

  it("returns empty array for all-invalid input", () => {
    const { valid, rejected } = validateProducts([
      { name: "", price: 0 },
      { name: "X", price: -1 },
    ]);
    expect(valid).toHaveLength(0);
    expect(rejected).toBe(2);
  });

  it("handles empty array", () => {
    const { valid, rejected } = validateProducts([]);
    expect(valid).toHaveLength(0);
    expect(rejected).toBe(0);
  });
});
