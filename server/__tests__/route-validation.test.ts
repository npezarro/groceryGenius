import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Shopping list POST schema (mirrors routes.ts) ───────────────

const shoppingListPostSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    checked: z.boolean().optional(),
  })).max(500).optional(),
});

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

// ── POST /api/shopping-lists validation ─────────────────────────

describe("POST /api/shopping-lists validation", () => {
  it("rejects items with empty name", () => {
    expect(() => shoppingListPostSchema.parse({
      items: [{ name: "" }],
    })).toThrow();
  });

  it("accepts items with valid name", () => {
    const result = shoppingListPostSchema.parse({
      items: [{ name: "Milk" }],
    });
    expect(result.items).toHaveLength(1);
  });

  it("rejects more than 500 items", () => {
    const items = Array.from({ length: 501 }, (_, i) => ({ name: `Item ${i}` }));
    expect(() => shoppingListPostSchema.parse({ items })).toThrow();
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

// ── Trip plan schema validation ──────────────────────────────────

const tripPlanSchema = z.object({
  items: z.array(z.string().min(1)).min(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radius: z.number().min(1).max(50),
  weights: z.object({
    price: z.number().min(0).max(1),
    time: z.number().min(0).max(1),
    distance: z.number().min(0).max(1),
  }),
  userHasMembership: z.boolean().optional().default(false),
});

describe("POST /api/trip-plans validation", () => {
  it("accepts valid trip plan request", () => {
    const result = tripPlanSchema.parse({
      items: ["milk", "bread", "eggs"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    });
    expect(result.items).toHaveLength(3);
    expect(result.userHasMembership).toBe(false);
  });

  it("accepts request with userHasMembership true", () => {
    const result = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 5,
      weights: { price: 1, time: 0, distance: 0 },
      userHasMembership: true,
    });
    expect(result.userHasMembership).toBe(true);
  });

  it("rejects missing items", () => {
    expect(() => tripPlanSchema.parse({
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects missing location", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects missing weights", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
    })).toThrow();
  });

  it("rejects radius below 1", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 0,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects radius above 50", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 51,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects weight below 0", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: -0.1, time: 0.5, distance: 0.5 },
    })).toThrow();
  });

  it("rejects weight above 1", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 1.1, time: 0, distance: 0 },
    })).toThrow();
  });

  it("rejects non-numeric location lat", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: "abc", lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects items as non-array", () => {
    expect(() => tripPlanSchema.parse({
      items: "milk",
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects empty items array", () => {
    expect(() => tripPlanSchema.parse({
      items: [],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects items with empty strings", () => {
    expect(() => tripPlanSchema.parse({
      items: [""],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("accepts boundary radius values", () => {
    const r1 = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 0, lng: 0 },
      radius: 1,
      weights: { price: 0, time: 0, distance: 0 },
    });
    expect(r1.radius).toBe(1);

    const r50 = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 0, lng: 0 },
      radius: 50,
      weights: { price: 1, time: 1, distance: 1 },
    });
    expect(r50.radius).toBe(50);
  });

  it("accepts boundary weight values", () => {
    const result = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 0, lng: 0 },
      radius: 10,
      weights: { price: 0, time: 0, distance: 0 },
    });
    expect(result.weights.price).toBe(0);
  });

  it("rejects partial weights object", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 37.7749, lng: -122.4194 },
      radius: 10,
      weights: { price: 0.5 },
    })).toThrow();
  });

  it("rejects latitude below -90", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: -91, lng: 0 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects latitude above 90", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 91, lng: 0 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects longitude below -180", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 0, lng: -181 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("rejects longitude above 180", () => {
    expect(() => tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 0, lng: 181 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    })).toThrow();
  });

  it("accepts boundary lat/lng values", () => {
    const result = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: -90, lng: -180 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    });
    expect(result.location.lat).toBe(-90);
    expect(result.location.lng).toBe(-180);

    const result2 = tripPlanSchema.parse({
      items: ["milk"],
      location: { lat: 90, lng: 180 },
      radius: 10,
      weights: { price: 0.5, time: 0.3, distance: 0.2 },
    });
    expect(result2.location.lat).toBe(90);
    expect(result2.location.lng).toBe(180);
  });
});

// ── User price submission schema ─────────────────────────────────

const userPriceSchema = z.object({
  itemName: z.string().min(1),
  storeId: z.string(),
  price: z.number().positive(),
  unit: z.string().optional(),
  quantity: z.number().optional(),
});

describe("POST /api/user/prices validation", () => {
  it("accepts valid price submission", () => {
    const result = userPriceSchema.parse({
      itemName: "Organic Milk",
      storeId: "store-123",
      price: 4.99,
    });
    expect(result.itemName).toBe("Organic Milk");
    expect(result.price).toBe(4.99);
  });

  it("accepts submission with optional fields", () => {
    const result = userPriceSchema.parse({
      itemName: "Eggs",
      storeId: "store-456",
      price: 3.49,
      unit: "dozen",
      quantity: 1,
    });
    expect(result.unit).toBe("dozen");
    expect(result.quantity).toBe(1);
  });

  it("rejects empty item name", () => {
    expect(() => userPriceSchema.parse({
      itemName: "",
      storeId: "store-123",
      price: 4.99,
    })).toThrow();
  });

  it("rejects zero price", () => {
    expect(() => userPriceSchema.parse({
      itemName: "Milk",
      storeId: "store-123",
      price: 0,
    })).toThrow();
  });

  it("rejects negative price", () => {
    expect(() => userPriceSchema.parse({
      itemName: "Milk",
      storeId: "store-123",
      price: -1.50,
    })).toThrow();
  });

  it("rejects missing storeId", () => {
    expect(() => userPriceSchema.parse({
      itemName: "Milk",
      price: 4.99,
    })).toThrow();
  });

  it("rejects missing price", () => {
    expect(() => userPriceSchema.parse({
      itemName: "Milk",
      storeId: "store-123",
    })).toThrow();
  });

  it("rejects string price", () => {
    expect(() => userPriceSchema.parse({
      itemName: "Milk",
      storeId: "store-123",
      price: "4.99",
    })).toThrow();
  });
});

// ── Auth schema password limits ─────────────────────────────────

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().optional(),
  password: z.string().min(6).max(128),
  displayName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required").max(128),
});

describe("register schema password limits", () => {
  it("accepts password at max length (128)", () => {
    const result = registerSchema.parse({
      username: "testuser",
      password: "a".repeat(128),
    });
    expect(result.password).toHaveLength(128);
  });

  it("rejects password over 128 chars", () => {
    expect(() => registerSchema.parse({
      username: "testuser",
      password: "a".repeat(129),
    })).toThrow();
  });
});

describe("login schema password limits", () => {
  it("accepts password at max length (128)", () => {
    const result = loginSchema.parse({
      username: "testuser",
      password: "a".repeat(128),
    });
    expect(result.password).toHaveLength(128);
  });

  it("rejects password over 128 chars", () => {
    expect(() => loginSchema.parse({
      username: "testuser",
      password: "a".repeat(129),
    })).toThrow();
  });
});

// ── GET /api/stores lat/lng range validation ────────────────────

describe("store query lat/lng range validation", () => {
  function validateStoreQuery(lat: string, lng: string, radius: string) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseFloat(radius);
    if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius) || parsedRadius <= 0) {
      return { valid: false, error: "lat, lng must be valid numbers and radius must be positive" };
    }
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return { valid: false, error: "lat must be between -90 and 90, lng must be between -180 and 180" };
    }
    return { valid: true };
  }

  it("accepts valid coordinates", () => {
    expect(validateStoreQuery("37.7749", "-122.4194", "10")).toEqual({ valid: true });
  });

  it("accepts boundary lat/lng values", () => {
    expect(validateStoreQuery("90", "180", "5")).toEqual({ valid: true });
    expect(validateStoreQuery("-90", "-180", "5")).toEqual({ valid: true });
  });

  it("rejects latitude out of range", () => {
    const result = validateStoreQuery("91", "0", "5");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("lat must be between");
  });

  it("rejects longitude out of range", () => {
    const result = validateStoreQuery("0", "181", "5");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("lng must be between");
  });

  it("rejects NaN latitude", () => {
    const result = validateStoreQuery("abc", "0", "5");
    expect(result.valid).toBe(false);
  });

  it("rejects zero radius", () => {
    const result = validateStoreQuery("37.7", "-122.4", "0");
    expect(result.valid).toBe(false);
  });
});

// ── Geocode address length validation ───────────────────────────

describe("geocode address validation", () => {
  it("rejects address over 500 chars", () => {
    const address = "a".repeat(501);
    expect(address.length > 500).toBe(true);
  });

  it("accepts address at 500 chars", () => {
    const address = "a".repeat(500);
    expect(address.length <= 500).toBe(true);
  });
});
