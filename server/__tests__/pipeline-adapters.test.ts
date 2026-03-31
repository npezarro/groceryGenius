import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DB + storage before importing adapters (they import from ../types which is fine,
// but the normalizer imports storage)
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({
  storage: {
    getAllStores: vi.fn(),
    createStore: vi.fn(),
    findOrCreateItem: vi.fn(),
    importPrices: vi.fn(),
  },
}));

import { parseJsonLdFromHtml } from "../pipeline/adapters/jsonld";
import { normalizeUnit } from "../pipeline/normalizer";
import { BLSAdapter } from "../pipeline/adapters/bls";
import { KrogerAdapter } from "../pipeline/adapters/kroger";
import { TraderJoesAdapter } from "../pipeline/adapters/traderjoes";
import { SafewayAdapter } from "../pipeline/adapters/safeway";
import { WholeFoodsAdapter } from "../pipeline/adapters/wholefoodsmarket";

// ─── JSON-LD Parsing ───────────────────────────────────────────────

describe("JSON-LD — parseJsonLdFromHtml", () => {
  it("extracts product from standard JSON-LD markup", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Organic Bananas", "sku": "BAN-001",
         "offers": {"price": "0.69", "priceCurrency": "USD"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Organic Bananas");
    expect(products[0].price).toBe(0.69);
    expect(products[0].sourceProductId).toBe("BAN-001");
  });

  it("extracts products from @graph array", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@graph": [
          {"@type": "Product", "name": "Eggs", "offers": {"price": "3.99"}},
          {"@type": "Product", "name": "Milk", "offers": {"price": "4.50"}},
          {"@type": "WebPage", "name": "Grocery Store"}
        ]}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(2);
    expect(products[0].name).toBe("Eggs");
    expect(products[1].name).toBe("Milk");
  });

  it("handles array of JSON-LD items", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        [
          {"@type": "Product", "name": "Bread", "offers": {"price": "2.99"}},
          {"@type": "Product", "name": "Butter", "offers": {"lowPrice": "5.49"}}
        ]
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(2);
    expect(products[0].price).toBe(2.99);
    expect(products[1].price).toBe(5.49);
  });

  it("uses lowPrice when price is absent", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Cheese", "offers": {"lowPrice": "6.99"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(6.99);
  });

  it("skips products with no price", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Mystery Item", "offers": {}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(0);
  });

  it("skips products with zero or negative price", () => {
    const html = `<html><head>
      <script type="application/ld+json">[
        {"@type": "Product", "name": "Free", "offers": {"price": "0"}},
        {"@type": "Product", "name": "Negative", "offers": {"price": "-1.50"}}
      ]</script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(0);
  });

  it("skips non-Product types", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Organization", "name": "Grocery Store"}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(0);
  });

  it("handles schema.org prefixed types", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "https://schema.org/Product", "name": "Rice", "offers": {"price": "2.49"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Rice");
  });

  it("handles malformed JSON-LD gracefully", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ not valid json }</script>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Valid Item", "offers": {"price": "1.99"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Valid Item");
  });

  it("extracts image URL from string format", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Apple", "image": "https://cdn.example.com/apple.jpg",
         "offers": {"price": "1.50"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products[0].imageUrl).toBe("https://cdn.example.com/apple.jpg");
  });

  it("extracts image URL from object format", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Orange",
         "image": {"url": "https://cdn.example.com/orange.jpg"},
         "offers": {"price": "0.99"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products[0].imageUrl).toBe("https://cdn.example.com/orange.jpg");
  });

  it("extracts productID when sku is absent", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Pasta", "productID": "PASTA-42",
         "offers": {"price": "1.29"}}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products[0].sourceProductId).toBe("PASTA-42");
  });

  it("handles offers as array (picks first)", () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Coffee",
         "offers": [{"price": "8.99"}, {"price": "12.99"}]}
      </script>
    </head><body></body></html>`;

    const products = parseJsonLdFromHtml(html);
    expect(products).toHaveLength(1);
    expect(products[0].price).toBe(8.99);
  });

  it("returns empty array for HTML with no JSON-LD", () => {
    const html = `<html><body><h1>Hello</h1></body></html>`;
    expect(parseJsonLdFromHtml(html)).toHaveLength(0);
  });
});

// ─── Normalizer — normalizeUnit ────────────────────────────────────

describe("Normalizer — normalizeUnit", () => {
  it("returns null for undefined unit", () => {
    expect(normalizeUnit(undefined, 3.99)).toBeNull();
  });

  it("returns null for unknown unit", () => {
    expect(normalizeUnit("bushel", 3.99)).toBeNull();
  });

  it("normalizes lb to per_lb", () => {
    const result = normalizeUnit("lb", 3.99);
    expect(result).toEqual({ normalizedUnit: "per_lb", normalizedPricePerUnit: 3.99 });
  });

  it("normalizes lbs to per_lb", () => {
    const result = normalizeUnit("lbs", 5.00);
    expect(result).toEqual({ normalizedUnit: "per_lb", normalizedPricePerUnit: 5.00 });
  });

  it("converts oz to per_lb (16 oz per lb)", () => {
    const result = normalizeUnit("oz", 0.50);
    expect(result).not.toBeNull();
    expect(result!.normalizedUnit).toBe("per_lb");
    expect(result!.normalizedPricePerUnit).toBe(8.00);
  });

  it("converts kg to per_lb", () => {
    const result = normalizeUnit("kg", 4.41);
    expect(result).not.toBeNull();
    expect(result!.normalizedUnit).toBe("per_lb");
    expect(result!.normalizedPricePerUnit).toBe(2.00);
  });

  it("normalizes gallon to per_gal", () => {
    const result = normalizeUnit("gallon", 4.99);
    expect(result).toEqual({ normalizedUnit: "per_gal", normalizedPricePerUnit: 4.99 });
  });

  it("converts quart to per_gal (4 qt per gal)", () => {
    const result = normalizeUnit("qt", 1.50);
    expect(result).not.toBeNull();
    expect(result!.normalizedUnit).toBe("per_gal");
    expect(result!.normalizedPricePerUnit).toBe(6.00);
  });

  it("normalizes each/ct/count to per_each", () => {
    expect(normalizeUnit("each", 2.99)!.normalizedUnit).toBe("per_each");
    expect(normalizeUnit("ct", 0.99)!.normalizedUnit).toBe("per_each");
    expect(normalizeUnit("count", 1.50)!.normalizedUnit).toBe("per_each");
  });

  it("accounts for quantity in price-per-unit calculation", () => {
    // 12-pack of eggs at $3.99 → $3.99 / 12 = $0.33 per each
    const result = normalizeUnit("each", 3.99, 12);
    expect(result!.normalizedUnit).toBe("per_each");
    expect(result!.normalizedPricePerUnit).toBe(0.33);
  });

  it("handles case-insensitive unit matching", () => {
    expect(normalizeUnit("LB", 3.99)).not.toBeNull();
    expect(normalizeUnit("Gallon", 4.99)).not.toBeNull();
    expect(normalizeUnit("OZ", 0.50)).not.toBeNull();
  });

  it("trims whitespace from unit", () => {
    expect(normalizeUnit("  lb  ", 3.99)).not.toBeNull();
    expect(normalizeUnit(" gal ", 4.99)).not.toBeNull();
  });

  it("returns null for zero price-per-unit", () => {
    expect(normalizeUnit("lb", 0)).toBeNull();
  });

  it("returns null for negative price-per-unit", () => {
    expect(normalizeUnit("lb", -1)).toBeNull();
  });

  it("rounds price per unit to 2 decimal places", () => {
    // $1.00 / 3 oz * 16 = $5.333... per lb → $5.33
    const result = normalizeUnit("oz", 1.00, 3);
    expect(result!.normalizedPricePerUnit).toBe(5.33);
  });
});

// ─── Adapter Configuration ─────────────────────────────────────────

describe("Adapter — isConfigured", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("BLS is always configured (public API)", () => {
    const adapter = new BLSAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });

  it("Kroger requires client ID and secret", () => {
    delete process.env.KROGER_CLIENT_ID;
    delete process.env.KROGER_CLIENT_SECRET;
    const adapter = new KrogerAdapter();
    expect(adapter.isConfigured()).toBe(false);
  });

  it("Kroger is configured when credentials are set", () => {
    process.env.KROGER_CLIENT_ID = "test-id";
    process.env.KROGER_CLIENT_SECRET = "test-secret";
    const adapter = new KrogerAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });

  it("Trader Joe's is always configured (public site)", () => {
    const adapter = new TraderJoesAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });

  it("Safeway is always configured (public site)", () => {
    const adapter = new SafewayAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });

  it("Whole Foods is always configured (public site)", () => {
    const adapter = new WholeFoodsAdapter();
    expect(adapter.isConfigured()).toBe(true);
  });
});

// ─── Adapter Metadata ──────────────────────────────────────────────

describe("Adapter — sourceId and sourceName", () => {
  it("BLS has correct identifiers", () => {
    const adapter = new BLSAdapter();
    expect(adapter.sourceId).toBe("bls");
    expect(adapter.sourceName).toBe("BLS Average Prices");
  });

  it("Kroger has correct identifiers", () => {
    process.env.KROGER_CLIENT_ID = "test";
    process.env.KROGER_CLIENT_SECRET = "test";
    const adapter = new KrogerAdapter();
    expect(adapter.sourceId).toBe("kroger");
    expect(adapter.sourceName).toBe("Kroger");
  });

  it("Trader Joe's has correct identifiers", () => {
    const adapter = new TraderJoesAdapter();
    expect(adapter.sourceId).toBe("traderjoes");
    expect(adapter.sourceName).toBe("Trader Joe's");
  });

  it("Safeway has correct identifiers", () => {
    const adapter = new SafewayAdapter();
    expect(adapter.sourceId).toBe("safeway");
    expect(adapter.sourceName).toBe("Safeway");
  });

  it("Whole Foods has correct identifiers", () => {
    const adapter = new WholeFoodsAdapter();
    expect(adapter.sourceId).toBe("wholefoods");
    expect(adapter.sourceName).toBe("Whole Foods Market");
  });
});

// ─── BLS Adapter — Data Transformation ─────────────────────────────

describe("BLS Adapter — fetchProducts", () => {
  let adapter: BLSAdapter;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: (...args: unknown[]) => void) => {
      fn();
      return 0;
    });
    adapter = new BLSAdapter();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    vi.unstubAllGlobals();
  });

  it("transforms BLS API response into RawProduct array", async () => {
    // BLS fetches in batches of 25. First batch has 25 series, second has remaining.
    // Return data only for eggs and milk, skip others.
    vi.mocked(fetch).mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string || "{}");
      const seriesIds: string[] = body.seriesid || [];
      const series = [];

      if (seriesIds.includes("APU0000708111")) {
        series.push({
          seriesID: "APU0000708111",
          data: [
            { year: "2026", period: "M02", value: "4.150", latest: "true" },
            { year: "2026", period: "M01", value: "3.980" },
          ],
        });
      }
      if (seriesIds.includes("APU0000709112")) {
        series.push({
          seriesID: "APU0000709112",
          data: [{ year: "2026", period: "M02", value: "4.500" }],
        });
      }

      return {
        ok: true,
        json: () => Promise.resolve({
          status: "REQUEST_SUCCEEDED",
          Results: { series },
        }),
      } as Response;
    });

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(2);

    // Eggs — most recent data point
    expect(products[0].name).toBe("Eggs, grade A, large");
    expect(products[0].price).toBe(4.15);
    expect(products[0].unit).toBe("dozen");
    expect(products[0].category).toBe("Dairy & Eggs");
    expect(products[0].sourceProductId).toBe("APU0000708111");

    // Milk
    expect(products[1].name).toBe("Milk, fresh, whole, fortified");
    expect(products[1].price).toBe(4.50);
    expect(products[1].unit).toBe("gal");
  });

  it("skips series with no data points", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: "REQUEST_SUCCEEDED",
        Results: {
          series: [
            { seriesID: "APU0000708111", data: [] },
          ],
        },
      }),
    } as Response);

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });

  it("skips series with zero price", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: "REQUEST_SUCCEEDED",
        Results: {
          series: [
            { seriesID: "APU0000708111", data: [{ year: "2026", period: "M02", value: "0" }] },
          ],
        },
      }),
    } as Response);

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });

  it("handles API failure gracefully", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });

  it("handles REQUEST_NOT_SUCCEEDED status", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "REQUEST_NOT_SUCCEEDED" }),
    } as Response);

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });

  it("handles network errors gracefully", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });

  it("skips unrecognized series IDs", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: "REQUEST_SUCCEEDED",
        Results: {
          series: [
            { seriesID: "UNKNOWN_SERIES_123", data: [{ year: "2026", period: "M02", value: "9.99" }] },
          ],
        },
      }),
    } as Response);

    const products = await adapter.fetchProducts("any", "94102");
    expect(products).toHaveLength(0);
  });
});

// ─── Kroger Adapter — Data Transformation ──────────────────────────

describe("Kroger Adapter — fetchProducts", () => {
  let adapter: KrogerAdapter;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: (...args: unknown[]) => void) => {
      fn();
      return 0;
    });
    process.env.KROGER_CLIENT_ID = "test-id";
    process.env.KROGER_CLIENT_SECRET = "test-secret";
    adapter = new KrogerAdapter();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    vi.unstubAllGlobals();
    delete process.env.KROGER_CLIENT_ID;
    delete process.env.KROGER_CLIENT_SECRET;
  });

  function mockTokenResponse() {
    return {
      ok: true,
      json: () => Promise.resolve({ access_token: "test-token", expires_in: 1800 }),
    } as Response;
  }

  function mockLocationResponse(locationId: string) {
    return {
      ok: true,
      json: () => Promise.resolve({
        data: [{
          locationId,
          chain: "Kroger",
          name: "Kroger Store",
          address: { addressLine1: "123 Main St", city: "SF", state: "CA", zipCode: "94102" },
          geolocation: { latitude: 37.77, longitude: -122.42 },
        }],
      }),
    } as Response;
  }

  it("transforms Kroger API response into RawProduct array", async () => {
    const calls: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      calls.push(urlStr);

      if (urlStr.includes("oauth2/token")) return mockTokenResponse();
      if (urlStr.includes("locations")) return mockLocationResponse("01400376");
      if (urlStr.includes("products")) {
        return {
          ok: true,
          json: () => Promise.resolve({
            data: [
              {
                productId: "0001111041700",
                description: "Kroger 2% Milk, Gallon",
                items: [{ price: { regular: 3.99, promo: 2.99 }, size: "1 gal" }],
                categories: ["Dairy"],
                images: [{ perspective: "front", sizes: [{ url: "https://img.kroger.com/milk.jpg" }] }],
              },
              {
                productId: "0001111089000",
                description: "Large Eggs, 12 ct",
                items: [{ price: { regular: 4.29 }, size: "12 ct" }],
                categories: ["Dairy"],
              },
              {
                productId: "NO_PRICE",
                description: "No Price Item",
                items: [{ size: "1 lb" }],
              },
            ],
          }),
        } as Response;
      }
      return { ok: true, json: () => Promise.resolve({ data: [] }) } as Response;
    });

    const products = await adapter.fetchProducts("auto", "94102");

    // Should have products from the search — at least milk + eggs from first search term
    const milk = products.find(p => p.name.includes("Kroger 2% Milk"));
    expect(milk).toBeDefined();
    expect(milk!.price).toBe(2.99); // promo price used
    expect(milk!.isPromotion).toBe(true);
    expect(milk!.originalPrice).toBe(3.99);
    expect(milk!.unit).toBe("1 gal");
    expect(milk!.sourceProductId).toBe("0001111041700");
    expect(milk!.imageUrl).toBe("https://img.kroger.com/milk.jpg");

    const eggs = products.find(p => p.name.includes("Large Eggs"));
    expect(eggs).toBeDefined();
    expect(eggs!.price).toBe(4.29);
    expect(eggs!.isPromotion).toBe(false);
    expect(eggs!.originalPrice).toBeUndefined();

    // "No Price Item" should be excluded
    const noPrice = products.find(p => p.name === "No Price Item");
    expect(noPrice).toBeUndefined();
  });

  it("throws when not configured", async () => {
    delete process.env.KROGER_CLIENT_ID;
    delete process.env.KROGER_CLIENT_SECRET;
    const unconfigured = new KrogerAdapter();
    await expect(unconfigured.fetchProducts("auto", "94102")).rejects.toThrow("not configured");
  });

  it("throws when no location found", async () => {
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("oauth2/token")) return mockTokenResponse();
      if (urlStr.includes("locations")) {
        return { ok: true, json: () => Promise.resolve({ data: [] }) } as Response;
      }
      return { ok: false, status: 500 } as Response;
    });

    await expect(adapter.fetchProducts("auto", "00000")).rejects.toThrow("No Kroger location");
  });
});

// ─── Trader Joe's Adapter — Data Transformation ────────────────────

describe("Trader Joe's Adapter — fetchProducts", () => {
  let adapter: TraderJoesAdapter;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    realSetTimeout = globalThis.setTimeout;
    // Override setTimeout to fire immediately (skip rate-limit delays in tests)
    vi.stubGlobal("setTimeout", (fn: (...args: unknown[]) => void) => {
      fn();
      return 0;
    });
    adapter = new TraderJoesAdapter();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    vi.unstubAllGlobals();
  });

  it("transforms GraphQL response into RawProduct array", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          products: {
            items: [
              {
                sku: "TJ-001",
                item_title: "Organic Bananas",
                sales_size: "1 bunch",
                sales_uom_description: "bunch",
                retail_price: 0.29,
                fun_tags: ["Organic"],
                category_hierarchy: [{ name: "Produce" }],
                primary_image: "bananas.jpg",
                primary_image_meta: { url: "https://cdn.traderjoes.com/bananas.jpg" },
              },
              {
                sku: "TJ-002",
                item_title: "Dark Chocolate Bar 3.5 oz",
                sales_size: "3.5 oz",
                sales_uom_description: "",
                retail_price: 1.99,
                fun_tags: [],
                category_hierarchy: [{ name: "Snacks" }],
                primary_image: "chocolate.jpg",
                primary_image_meta: { url: "https://cdn.traderjoes.com/chocolate.jpg" },
              },
              {
                sku: "TJ-003",
                item_title: "Zero Price Item",
                sales_size: "",
                sales_uom_description: "",
                retail_price: 0,
                fun_tags: [],
                category_hierarchy: [],
                primary_image: "",
                primary_image_meta: { url: "" },
              },
            ],
            total_count: 3,
            page_info: { current_page: 1, page_size: 50, total_pages: 1 },
          },
        },
      }),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");

    // Should skip zero-price item and empty imageUrl
    const bananas = products.find(p => p.name === "Organic Bananas");
    expect(bananas).toBeDefined();
    expect(bananas!.price).toBe(0.29);
    expect(bananas!.unit).toBe("bunch");
    expect(bananas!.quantity).toBe(1);
    expect(bananas!.category).toBe("Produce");
    expect(bananas!.sourceProductId).toBe("TJ-001");
    expect(bananas!.imageUrl).toBe("https://cdn.traderjoes.com/bananas.jpg");

    const chocolate = products.find(p => p.name.includes("Dark Chocolate"));
    expect(chocolate).toBeDefined();
    expect(chocolate!.price).toBe(1.99);
    expect(chocolate!.quantity).toBe(3.5);

    const zeroPriced = products.find(p => p.name === "Zero Price Item");
    expect(zeroPriced).toBeUndefined();
  });

  it("handles 403 from CloudFront gracefully", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

    const products = await adapter.fetchProducts("any", "any");
    expect(products).toHaveLength(0);
  });

  it("handles empty response data", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { products: null } }),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    expect(products).toHaveLength(0);
  });

  it("uses category name from hierarchy, falls back to static category", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          products: {
            items: [
              {
                sku: "TJ-X",
                item_title: "Item Without Category",
                sales_size: "",
                sales_uom_description: "",
                retail_price: 2.99,
                fun_tags: [],
                category_hierarchy: [],
                primary_image: "",
                primary_image_meta: { url: "" },
              },
            ],
            total_count: 1,
            page_info: { total_pages: 1 },
          },
        },
      }),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    // Should fall back to the static category name (e.g., "Produce" for category id "8")
    expect(products[0].category).toBeDefined();
  });
});

// ─── Safeway Adapter — HTML Parsing ────────────────────────────────

describe("Safeway Adapter — fetchProducts", () => {
  let adapter: SafewayAdapter;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: (...args: unknown[]) => void) => {
      fn();
      return 0;
    });
    adapter = new SafewayAdapter();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    vi.unstubAllGlobals();
  });

  it("extracts products from JSON-LD in HTML", async () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Organic Whole Milk 1 Gallon", "sku": "SW-001",
         "category": "Dairy", "image": "https://cdn.safeway.com/milk.jpg",
         "offers": {"price": "5.99"}}
      </script>
    </head><body></body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("store-1", "94102");

    const milk = products.find(p => p.name.includes("Organic Whole Milk"));
    expect(milk).toBeDefined();
    expect(milk!.price).toBe(5.99);
    expect(milk!.unit).toBe("gallon");
    expect(milk!.sourceProductId).toBe("SW-001");
    expect(milk!.imageUrl).toBe("https://cdn.safeway.com/milk.jpg");
  });

  it("falls back to product card parsing when no JSON-LD", async () => {
    const html = `<html><body>
      <div data-testid="product-card">
        <div data-testid="product-title">Fresh Bananas</div>
        <div data-testid="product-price">$0.69</div>
      </div>
      <div data-testid="product-card">
        <div data-testid="product-title">Eggs Large 12 ct</div>
        <div data-testid="product-price">$3.99</div>
        <div class="member-price">$2.99</div>
      </div>
    </body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("store-1", "94102");

    const bananas = products.find(p => p.name === "Fresh Bananas");
    expect(bananas).toBeDefined();
    expect(bananas!.price).toBe(0.69);

    const eggs = products.find(p => p.name.includes("Eggs Large"));
    expect(eggs).toBeDefined();
    expect(eggs!.price).toBe(2.99); // member price takes priority
    expect(eggs!.isPromotion).toBe(true);
    expect(eggs!.originalPrice).toBe(3.99);
    expect(eggs!.loyaltyRequired).toBe(true);
  });

  it("handles non-200 responses", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

    const products = await adapter.fetchProducts("store-1", "94102");
    expect(products).toHaveLength(0);
  });

  it("handles fetch errors gracefully", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Connection reset"));

    const products = await adapter.fetchProducts("store-1", "94102");
    expect(products).toHaveLength(0);
  });

  it("parses '2 for $5' pricing pattern", async () => {
    const html = `<html><body>
      <div data-testid="product-card">
        <div data-testid="product-title">Yogurt Cups</div>
        <div data-testid="product-price">2 for $5</div>
      </div>
    </body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("store-1", "94102");
    const yogurt = products.find(p => p.name === "Yogurt Cups");
    expect(yogurt).toBeDefined();
    expect(yogurt!.price).toBe(2.50);
  });
});

// ─── Whole Foods Adapter — HTML Parsing ────────────────────────────

describe("Whole Foods Adapter — fetchProducts", () => {
  let adapter: WholeFoodsAdapter;
  let realSetTimeout: typeof setTimeout;

  beforeEach(() => {
    realSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", (fn: (...args: unknown[]) => void) => {
      fn();
      return 0;
    });
    adapter = new WholeFoodsAdapter();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    globalThis.setTimeout = realSetTimeout;
    vi.unstubAllGlobals();
  });

  it("extracts products from JSON-LD in HTML", async () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Organic Avocados 16 oz",
         "sku": "WF-AVO-001",
         "offers": {"price": "3.49"}}
      </script>
    </head><body></body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    const avocados = products.find(p => p.name.includes("Avocados"));
    expect(avocados).toBeDefined();
    expect(avocados!.price).toBe(3.49);
    expect(avocados!.unit).toBe("oz");
    expect(avocados!.sourceProductId).toBe("WF-AVO-001");
  });

  it("extracts products from Amazon-style product cards", async () => {
    const html = `<html><body>
      <div data-component-type="s-search-result" data-asin="B0ABC123">
        <h2><a><span>Organic Chicken Breast 1 lb</span></a></h2>
        <span class="a-price-whole">8</span>
        <span class="a-price-fraction">99</span>
      </div>
    </body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    const chicken = products.find(p => p.name.includes("Chicken Breast"));
    expect(chicken).toBeDefined();
    expect(chicken!.price).toBe(8.99);
    expect(chicken!.unit).toBe("lb");
    expect(chicken!.sourceProductId).toBe("B0ABC123");
  });

  it("extracts price from a-offscreen when price parts are missing", async () => {
    const html = `<html><body>
      <div data-component-type="s-search-result" data-asin="B0DEF456">
        <h2><a><span>Wild Salmon 12 oz</span></a></h2>
        <span class="a-offscreen">$12.99</span>
      </div>
    </body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    const salmon = products.find(p => p.name.includes("Salmon"));
    expect(salmon).toBeDefined();
    expect(salmon!.price).toBe(12.99);
  });

  it("handles 404 responses gracefully", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const products = await adapter.fetchProducts("any", "any");
    expect(products).toHaveLength(0);
  });

  it("derives category from URL path", async () => {
    const html = `<html><head>
      <script type="application/ld+json">
        {"@type": "Product", "name": "Strawberries",
         "offers": {"price": "4.99"}}
      </script>
    </head><body></body></html>`;

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(html),
    } as Response);

    const products = await adapter.fetchProducts("any", "any");
    // Category should be derived from the browse path
    const strawberries = products.find(p => p.name === "Strawberries");
    expect(strawberries).toBeDefined();
    expect(strawberries!.category).toBeDefined();
  });
});
