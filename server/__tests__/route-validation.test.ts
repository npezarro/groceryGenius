import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Shopping list PATCH schema (mirrors routes.ts) ──────────────

const shoppingListPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    checked: z.boolean().optional(),
  })).max(500).optional(),
});

describe("PATCH /api/shopping-lists/:id validation", () => {
  it("accepts valid name update", () => {
    const result = shoppingListPatchSchema.parse({ name: "Groceries" });
    expect(result.name).toBe("Groceries");
  });

  it("accepts valid items array", () => {
    const result = shoppingListPatchSchema.parse({
      items: [{ name: "Milk", quantity: 2, unit: "gal" }],
    });
    expect(result.items).toHaveLength(1);
  });

  it("rejects empty name", () => {
    expect(() => shoppingListPatchSchema.parse({ name: "" })).toThrow();
  });

  it("rejects name over 200 chars", () => {
    expect(() => shoppingListPatchSchema.parse({ name: "x".repeat(201) })).toThrow();
  });

  it("rejects items with empty name", () => {
    expect(() => shoppingListPatchSchema.parse({
      items: [{ name: "" }],
    })).toThrow();
  });

  it("rejects more than 500 items", () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ name: `Item ${i}` }));
    expect(() => shoppingListPatchSchema.parse({ items })).toThrow();
  });

  it("accepts empty body (both fields optional)", () => {
    const result = shoppingListPatchSchema.parse({});
    expect(result.name).toBeUndefined();
    expect(result.items).toBeUndefined();
  });
});

// ── parseInt bounds logic (mirrors routes.ts days/limit parsing) ─

function parseDays(raw: string | undefined): number {
  const parsed = raw ? parseInt(raw, 10) : 30;
  return isNaN(parsed) || parsed < 1 ? 30 : Math.min(parsed, 365);
}

function parseLimit(raw: string | undefined): number {
  const parsed = parseInt(raw as string, 10);
  return Math.min(isNaN(parsed) || parsed < 1 ? 20 : parsed, 100);
}

describe("days parameter parsing", () => {
  it("defaults to 30 when missing", () => {
    expect(parseDays(undefined)).toBe(30);
  });

  it("parses valid integer", () => {
    expect(parseDays("7")).toBe(7);
  });

  it("defaults to 30 for NaN input", () => {
    expect(parseDays("abc")).toBe(30);
  });

  it("defaults to 30 for zero", () => {
    expect(parseDays("0")).toBe(30);
  });

  it("defaults to 30 for negative values", () => {
    expect(parseDays("-5")).toBe(30);
  });

  it("caps at 365 days", () => {
    expect(parseDays("9999")).toBe(365);
  });

  it("handles float strings (parseInt truncates)", () => {
    expect(parseDays("7.9")).toBe(7);
  });
});

describe("limit parameter parsing", () => {
  it("defaults to 20 when NaN", () => {
    expect(parseLimit("abc")).toBe(20);
  });

  it("defaults to 20 for zero", () => {
    expect(parseLimit("0")).toBe(20);
  });

  it("caps at 100", () => {
    expect(parseLimit("500")).toBe(100);
  });

  it("accepts valid limit", () => {
    expect(parseLimit("50")).toBe(50);
  });

  it("defaults to 20 for negative values", () => {
    expect(parseLimit("-10")).toBe(20);
  });
});

// ── zipCode validation (mirrors routes.ts regex) ────────────────

const zipCodeRegex = /^\d{5}(-\d{4})?$/;

describe("zipCode validation", () => {
  it("accepts 5-digit zip", () => {
    expect(zipCodeRegex.test("94102")).toBe(true);
  });

  it("accepts ZIP+4 format", () => {
    expect(zipCodeRegex.test("94102-1234")).toBe(true);
  });

  it("rejects too few digits", () => {
    expect(zipCodeRegex.test("9410")).toBe(false);
  });

  it("rejects too many digits", () => {
    expect(zipCodeRegex.test("941025")).toBe(false);
  });

  it("rejects letters", () => {
    expect(zipCodeRegex.test("abcde")).toBe(false);
  });

  it("rejects SQL injection attempt", () => {
    expect(zipCodeRegex.test("94102'; DROP TABLE--")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(zipCodeRegex.test("")).toBe(false);
  });
});

// ── Receipt schema limits ───────────────────────────────────────

const receiptSchema = z.object({
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  imageData: z.string().max(5242880).optional(),
  purchaseDate: z.string().optional(),
  totalAmount: z.number().optional(),
  parsedItems: z.array(z.object({
    name: z.string(),
    price: z.number(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
  })).max(200).optional(),
});

describe("receipt schema validation", () => {
  it("accepts valid receipt", () => {
    const result = receiptSchema.parse({
      storeName: "Safeway",
      parsedItems: [{ name: "Milk", price: 3.99 }],
    });
    expect(result.parsedItems).toHaveLength(1);
  });

  it("rejects imageData over 5MB", () => {
    expect(() => receiptSchema.parse({
      imageData: "x".repeat(5242881),
    })).toThrow();
  });

  it("rejects more than 200 parsed items", () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      name: `Item ${i}`,
      price: 1.0,
    }));
    expect(() => receiptSchema.parse({ parsedItems: items })).toThrow();
  });

  it("accepts exactly 200 parsed items", () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      name: `Item ${i}`,
      price: 1.0,
    }));
    const result = receiptSchema.parse({ parsedItems: items });
    expect(result.parsedItems).toHaveLength(200);
  });
});
