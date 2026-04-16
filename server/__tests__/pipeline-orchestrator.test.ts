import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Adapter mock fns (declared before vi.mock hoisting) ────────────

const mockBlsConfigured = vi.fn(() => true);
const mockBlsFetch = vi.fn(async () => [] as unknown[]);
let mockBlsResolve: undefined | ReturnType<typeof vi.fn> = undefined;

const mockKrogerConfigured = vi.fn(() => true);
const mockKrogerFetch = vi.fn(async () => [] as unknown[]);
let mockKrogerResolve: undefined | ReturnType<typeof vi.fn> = undefined;

const mockTjConfigured = vi.fn(() => false);
const mockSafewayConfigured = vi.fn(() => false);
const mockWfConfigured = vi.fn(() => false);

vi.mock("../pipeline/adapters/bls", () => {
  return { BLSAdapter: class {
    sourceId = "bls"; sourceName = "BLS Average Prices";
    isConfigured(...a: unknown[]) { return mockBlsConfigured(...a); }
    fetchProducts(...a: unknown[]) { return mockBlsFetch(...a); }
    get resolveStoreDetails() { return mockBlsResolve; }
  }};
});
vi.mock("../pipeline/adapters/kroger", () => {
  return { KrogerAdapter: class {
    sourceId = "kroger"; sourceName = "Kroger";
    isConfigured(...a: unknown[]) { return mockKrogerConfigured(...a); }
    fetchProducts(...a: unknown[]) { return mockKrogerFetch(...a); }
    get resolveStoreDetails() { return mockKrogerResolve; }
  }};
});
vi.mock("../pipeline/adapters/traderjoes", () => {
  return { TraderJoesAdapter: class {
    sourceId = "traderjoes"; sourceName = "Trader Joe's";
    isConfigured(...a: unknown[]) { return mockTjConfigured(...a); }
    fetchProducts() { return Promise.resolve([]); }
  }};
});
vi.mock("../pipeline/adapters/safeway", () => {
  return { SafewayAdapter: class {
    sourceId = "safeway"; sourceName = "Safeway";
    isConfigured(...a: unknown[]) { return mockSafewayConfigured(...a); }
    fetchProducts() { return Promise.resolve([]); }
  }};
});
vi.mock("../pipeline/adapters/wholefoodsmarket", () => {
  return { WholeFoodsAdapter: class {
    sourceId = "wholefoods"; sourceName = "Whole Foods";
    isConfigured(...a: unknown[]) { return mockWfConfigured(...a); }
    fetchProducts() { return Promise.resolve([]); }
  }};
});

// ── DB mock fns ────────────────────────────────────────────────────

const mockReturning = vi.fn(async () => [{ id: "run-1" }]);
const mockValues = vi.fn(() => ({ returning: (...a: unknown[]) => mockReturning(...a) }));
const mockInsert = vi.fn(() => ({ values: (...a: unknown[]) => mockValues(...a) }));

const mockSetWhere = vi.fn(() => ({ returning: vi.fn(async () => [{}]) }));
const mockSet = vi.fn(() => ({ where: (...a: unknown[]) => mockSetWhere(...a) }));
const mockUpdate = vi.fn(() => ({ set: (...a: unknown[]) => mockSet(...a) }));

const mockLimit = vi.fn(async () => []);
const mockOrderBy = vi.fn(() => ({ limit: (...a: unknown[]) => mockLimit(...a) }));
const mockSelectWhere = vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })) }));
const mockSelectFrom = vi.fn(() => ({
  orderBy: (...a: unknown[]) => mockOrderBy(...a),
  where: (...a: unknown[]) => mockSelectWhere(...a),
}));
const mockSelect = vi.fn(() => ({ from: (...a: unknown[]) => mockSelectFrom(...a) }));

vi.mock("../db", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

// ── Storage mock fns ───────────────────────────────────────────────

const mockGetAllStores = vi.fn(async () => [] as unknown[]);
const mockCreateStore = vi.fn(async (s: Record<string, unknown>) => ({ id: "new-store-1", ...s }));
const mockUpdateCoords = vi.fn(async () => ({}));

vi.mock("../storage", () => ({
  storage: {
    getAllStores: (...a: unknown[]) => mockGetAllStores(...a),
    createStore: (...a: unknown[]) => mockCreateStore(...a),
    updateStoreCoordinates: (...a: unknown[]) => mockUpdateCoords(...a),
  },
}));

// ── Validator / normalizer mock fns ────────────────────────────────

const mockValidateProducts = vi.fn((products: unknown[]) => ({
  valid: products,
  rejected: 0,
}));
vi.mock("../pipeline/validator", () => ({
  validateProducts: (...args: unknown[]) => mockValidateProducts(...args),
}));

const mockIngestProducts = vi.fn(async () => ({ pricesCreated: 5 }));
vi.mock("../pipeline/normalizer", () => ({
  ingestProducts: (...args: unknown[]) => mockIngestProducts(...args),
}));

// ── Schema table references ────────────────────────────────────────

vi.mock("@shared/schema", () => ({
  scrapeRuns: { id: "scrapeRuns.id", source: "scrapeRuns.source", status: "scrapeRuns.status", startedAt: "scrapeRuns.startedAt", completedAt: "scrapeRuns.completedAt" },
  stores: { id: "stores.id", name: "stores.name" },
}));

// ── Mock global fetch for geocodeZip ───────────────────────────────

const mockFetch = vi.fn(async () => ({ ok: false }) as Response);
vi.stubGlobal("fetch", mockFetch);

// ── Import after all mocks ─────────────────────────────────────────

import {
  getAdapters,
  getAdapter,
  runAdapter,
  runAllAdapters,
  getRecentRuns,
  getLastSuccessfulRun,
  isSourceStale,
} from "../pipeline/index";

// ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Reset adapter defaults
  mockBlsConfigured.mockReturnValue(true);
  mockKrogerConfigured.mockReturnValue(true);
  mockTjConfigured.mockReturnValue(false);
  mockSafewayConfigured.mockReturnValue(false);
  mockWfConfigured.mockReturnValue(false);
  mockBlsFetch.mockResolvedValue([]);
  mockKrogerFetch.mockResolvedValue([]);
  mockBlsResolve = undefined;
  mockKrogerResolve = undefined;

  // DB defaults
  mockReturning.mockResolvedValue([{ id: "run-1" }]);

  mockValidateProducts.mockImplementation((products: unknown[]) => ({
    valid: products,
    rejected: 0,
  }));
  mockIngestProducts.mockResolvedValue({ pricesCreated: 5 });
  mockGetAllStores.mockResolvedValue([]);
  mockCreateStore.mockResolvedValue({ id: "new-store-1", name: "Test Store" });
  mockFetch.mockResolvedValue({ ok: false } as Response);
});

// ── getAdapters ────────────────────────────────────────────────────

describe("getAdapters", () => {
  it("returns all 5 registered adapters", () => {
    expect(getAdapters()).toHaveLength(5);
  });

  it("includes sourceId, sourceName, configured for each", () => {
    for (const a of getAdapters()) {
      expect(a).toHaveProperty("sourceId");
      expect(a).toHaveProperty("sourceName");
      expect(a).toHaveProperty("configured");
    }
  });

  it("reflects adapter configuration status", () => {
    mockKrogerConfigured.mockReturnValue(false);
    const kroger = getAdapters().find(a => a.sourceId === "kroger");
    expect(kroger?.configured).toBe(false);
  });

  it("includes all known source IDs", () => {
    const ids = getAdapters().map(a => a.sourceId);
    expect(ids).toEqual(expect.arrayContaining(["bls", "kroger", "traderjoes", "safeway", "wholefoods"]));
  });
});

// ── getAdapter ─────────────────────────────────────────────────────

describe("getAdapter", () => {
  it("finds adapter by sourceId", () => {
    expect(getAdapter("kroger")?.sourceId).toBe("kroger");
  });

  it("returns undefined for unknown sourceId", () => {
    expect(getAdapter("walmart")).toBeUndefined();
  });

  it("returns correct adapter object", () => {
    expect(getAdapter("bls")?.sourceName).toBe("BLS Average Prices");
  });
});

// ── runAdapter ─────────────────────────────────────────────────────

describe("runAdapter", () => {
  it("returns error for unknown source", async () => {
    const result = await runAdapter("walmart", "store-1", "94102");
    expect(result.errors).toContain("Unknown source: walmart");
    expect(result.itemsIngested).toBe(0);
    expect(result.pricesCreated).toBe(0);
  });

  it("returns error for unconfigured adapter", async () => {
    mockBlsConfigured.mockReturnValue(false);
    const result = await runAdapter("bls", "store-1", "94102");
    expect(result.errors[0]).toContain("not configured");
    expect(result.itemsIngested).toBe(0);
  });

  it("does not create scrape run for unknown source", async () => {
    await runAdapter("walmart", "store-1", "94102");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("does not create scrape run for unconfigured adapter", async () => {
    mockBlsConfigured.mockReturnValue(false);
    await runAdapter("bls", "store-1", "94102");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates a scrape run record on start", async () => {
    await runAdapter("bls", "store-1", "94102");
    expect(mockInsert).toHaveBeenCalled();
  });

  it("calls fetchProducts on the adapter", async () => {
    await runAdapter("bls", "store-1", "94102");
    expect(mockBlsFetch).toHaveBeenCalledWith("store-1", "94102");
  });

  it("validates fetched products", async () => {
    const products = [{ name: "Milk", price: 3.99 }];
    mockBlsFetch.mockResolvedValue(products);
    await runAdapter("bls", "store-1", "94102");
    expect(mockValidateProducts).toHaveBeenCalledWith(products);
  });

  it("ingests valid products into the database", async () => {
    const products = [{ name: "Milk", price: 3.99 }];
    mockBlsFetch.mockResolvedValue(products);
    await runAdapter("bls", "store-1", "94102");
    expect(mockIngestProducts).toHaveBeenCalledWith(products, "store-1", "bls");
  });

  it("returns correct counts on success", async () => {
    mockBlsFetch.mockResolvedValue([{ name: "A", price: 1 }, { name: "B", price: 2 }]);
    mockIngestProducts.mockResolvedValue({ pricesCreated: 2 });
    const result = await runAdapter("bls", "store-1", "94102");
    expect(result.itemsIngested).toBe(2);
    expect(result.pricesCreated).toBe(2);
    expect(result.source).toBe("bls");
    expect(result.storeId).toBe("store-1");
  });

  it("includes rejected count in errors", async () => {
    mockBlsFetch.mockResolvedValue([{ name: "A", price: 1 }]);
    mockValidateProducts.mockReturnValue({ valid: [], rejected: 3 });
    const result = await runAdapter("bls", "store-1", "94102");
    expect(result.errors[0]).toContain("3 products failed validation");
  });

  it("records durationMs", async () => {
    const result = await runAdapter("bls", "store-1", "94102");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles fetchProducts failure gracefully", async () => {
    mockBlsFetch.mockRejectedValue(new Error("Network error"));
    const result = await runAdapter("bls", "store-1", "94102");
    expect(result.errors).toContain("Network error");
    expect(result.itemsIngested).toBe(0);
    expect(result.pricesCreated).toBe(0);
  });

  it("updates scrape run to failed on error", async () => {
    mockBlsFetch.mockRejectedValue(new Error("fail"));
    await runAdapter("bls", "store-1", "94102");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorSummary: "fail" })
    );
  });

  it("truncates long error messages to 500 chars", async () => {
    const longMsg = "x".repeat(600);
    mockBlsFetch.mockRejectedValue(new Error(longMsg));
    await runAdapter("bls", "store-1", "94102");
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ errorSummary: "x".repeat(500) })
    );
  });

  // ── Auto store resolution ────────────────────────────────────────

  describe("auto store resolution", () => {
    it("finds existing store by name", async () => {
      mockGetAllStores.mockResolvedValue([
        { id: "existing-1", name: "BLS Average Prices", lat: 37.7, lng: -122.4, address: "SF" },
      ]);
      await runAdapter("bls", "auto", "94102");
      expect(mockCreateStore).not.toHaveBeenCalled();
      expect(mockIngestProducts).toHaveBeenCalledWith(expect.anything(), "existing-1", "bls");
    });

    it("creates a new store when none exists", async () => {
      mockGetAllStores.mockResolvedValue([]);
      mockCreateStore.mockResolvedValue({ id: "new-1", name: "BLS Average Prices — 94102" });
      await runAdapter("bls", "auto", "94102");
      expect(mockCreateStore).toHaveBeenCalled();
      expect(mockIngestProducts).toHaveBeenCalledWith(expect.anything(), "new-1", "bls");
    });

    it("backfills coordinates on existing store with no lat/lng", async () => {
      mockGetAllStores.mockResolvedValue([
        { id: "existing-1", name: "BLS Average Prices", lat: null, lng: null, address: "94102 area" },
      ]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "37.78", lon: "-122.41" }],
      } as unknown as Response);
      await runAdapter("bls", "auto", "94102");
      expect(mockUpdateCoords).toHaveBeenCalledWith("existing-1", 37.78, -122.41);
    });

    it("uses resolveStoreDetails when available", async () => {
      mockKrogerResolve = vi.fn(async () => ({
        name: "Kroger #1234",
        address: "123 Main St",
        lat: 37.78,
        lng: -122.41,
      }));
      mockGetAllStores.mockResolvedValue([]);
      mockCreateStore.mockResolvedValue({ id: "new-2", name: "Kroger #1234" });
      await runAdapter("kroger", "auto", "94102");
      expect(mockCreateStore).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Kroger #1234", address: "123 Main St" })
      );
    });

    it("falls back to geocode when resolveStoreDetails is undefined", async () => {
      mockBlsResolve = undefined;
      mockGetAllStores.mockResolvedValue([]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "37.78", lon: "-122.41" }],
      } as unknown as Response);
      await runAdapter("bls", "auto", "94102");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("nominatim"),
        expect.anything()
      );
    });

    it("handles geocode failure gracefully — store still created", async () => {
      mockGetAllStores.mockResolvedValue([]);
      mockFetch.mockResolvedValue({ ok: false } as Response);
      const result = await runAdapter("bls", "auto", "94102");
      expect(result.errors).toHaveLength(0);
      expect(mockCreateStore).toHaveBeenCalledWith(
        expect.objectContaining({ lat: null, lng: null })
      );
    });

    it("handles geocode network error gracefully", async () => {
      mockGetAllStores.mockResolvedValue([]);
      mockFetch.mockRejectedValue(new Error("DNS failure"));
      const result = await runAdapter("bls", "auto", "94102");
      expect(result.errors).toHaveLength(0);
    });

    it("skips coordinate backfill when store already has lat/lng", async () => {
      mockGetAllStores.mockResolvedValue([
        { id: "existing-1", name: "BLS Average Prices", lat: 37.7, lng: -122.4, address: "123 Main" },
      ]);
      await runAdapter("bls", "auto", "94102");
      expect(mockUpdateCoords).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

// ── runAllAdapters ─────────────────────────────────────────────────

describe("runAllAdapters", () => {
  it("skips unconfigured adapters", async () => {
    mockBlsConfigured.mockReturnValue(false);
    mockKrogerConfigured.mockReturnValue(false);
    const results = await runAllAdapters("94102");
    expect(results).toHaveLength(0);
  });

  it("runs configured adapters", async () => {
    // Only BLS configured (kroger too by default in beforeEach)
    mockKrogerConfigured.mockReturnValue(false);
    const results = await runAllAdapters("94102");
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("bls");
  });

  it("catches fatal adapter errors without stopping others", async () => {
    mockKrogerConfigured.mockReturnValue(false);
    mockBlsFetch.mockRejectedValue(new Error("fatal"));
    const results = await runAllAdapters();
    expect(results).toHaveLength(1);
    expect(results[0].errors[0]).toBe("fatal");
  });

  it("uses default zipCode 94102", async () => {
    mockKrogerConfigured.mockReturnValue(false);
    await runAllAdapters();
    expect(mockBlsFetch).toHaveBeenCalledWith("auto", "94102");
  });

  it("runs multiple configured adapters sequentially", async () => {
    const results = await runAllAdapters("90210");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.map(r => r.source)).toContain("bls");
    expect(results.map(r => r.source)).toContain("kroger");
  });
});

// ── getRecentRuns ──────────────────────────────────────────────────

describe("getRecentRuns", () => {
  it("delegates to database query", async () => {
    await getRecentRuns();
    expect(mockSelect).toHaveBeenCalled();
  });

  it("passes limit parameter", async () => {
    await getRecentRuns(10);
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it("uses default limit of 20", async () => {
    await getRecentRuns();
    expect(mockLimit).toHaveBeenCalledWith(20);
  });
});

// ── getLastSuccessfulRun ───────────────────────────────────────────

describe("getLastSuccessfulRun", () => {
  it("returns null when no runs exist", async () => {
    // mockSelectWhere returns chain ending in empty array
    const mockInnerLimit = vi.fn(async () => []);
    const mockInnerOrderBy = vi.fn(() => ({ limit: mockInnerLimit }));
    mockSelectWhere.mockReturnValueOnce({ orderBy: mockInnerOrderBy });
    const result = await getLastSuccessfulRun("bls");
    expect(result).toBeNull();
  });

  it("returns the run when found", async () => {
    const mockRun = { id: "run-1", source: "bls", status: "completed", completedAt: new Date() };
    const mockInnerLimit = vi.fn(async () => [mockRun]);
    const mockInnerOrderBy = vi.fn(() => ({ limit: mockInnerLimit }));
    mockSelectWhere.mockReturnValueOnce({ orderBy: mockInnerOrderBy });
    const result = await getLastSuccessfulRun("bls");
    expect(result).toEqual(mockRun);
  });
});

// ── isSourceStale ──────────────────────────────────────────────────

describe("isSourceStale", () => {
  function mockLastRun(completedAt: Date | null) {
    const mockInnerLimit = vi.fn(async () => completedAt !== undefined ? [{ id: "run-1", completedAt }] : []);
    const mockInnerOrderBy = vi.fn(() => ({ limit: mockInnerLimit }));
    mockSelectWhere.mockReturnValueOnce({ orderBy: mockInnerOrderBy });
  }

  it("returns true when no successful run exists", async () => {
    const mockInnerLimit = vi.fn(async () => []);
    const mockInnerOrderBy = vi.fn(() => ({ limit: mockInnerLimit }));
    mockSelectWhere.mockReturnValueOnce({ orderBy: mockInnerOrderBy });
    expect(await isSourceStale("bls")).toBe(true);
  });

  it("returns true when last run is older than maxAgeHours", async () => {
    mockLastRun(new Date(Date.now() - 72 * 60 * 60 * 1000));
    expect(await isSourceStale("bls", 48)).toBe(true);
  });

  it("returns false when last run is within maxAgeHours", async () => {
    mockLastRun(new Date(Date.now() - 1 * 60 * 60 * 1000));
    expect(await isSourceStale("bls", 48)).toBe(false);
  });

  it("treats null completedAt as stale", async () => {
    mockLastRun(null);
    expect(await isSourceStale("bls")).toBe(true);
  });

  it("uses default maxAgeHours of 48", async () => {
    mockLastRun(new Date(Date.now() - 47 * 60 * 60 * 1000));
    expect(await isSourceStale("bls")).toBe(false);
  });
});
