import { describe, it, expect } from "vitest";
import {
  mapCsvToEntities,
  mapStoreRow,
  isValidStore,
  mapItemRow,
  isValidItem,
  mapPriceRow,
  isValidPrice,
  parseStoresFromCsv,
  parseItemsFromCsv,
  parsePricesFromCsv,
} from "../lib/csv-importer";

// ── mapCsvToEntities (generic orchestrator) ──

describe("mapCsvToEntities", () => {
  it("returns empty array for empty CSV", () => {
    const result = mapCsvToEntities<{ name: string }>("", () => {}, () => true);
    expect(result).toEqual([]);
  });

  it("returns empty array for headers-only CSV", () => {
    const result = mapCsvToEntities<{ name: string }>(
      "name,value",
      () => {},
      (e) => !!e.name,
    );
    expect(result).toEqual([]);
  });

  it("strips surrounding quotes from values", () => {
    const results: string[] = [];
    mapCsvToEntities<{ name: string }>(
      'name\n"Hello"',
      (_entity, _header, value) => { results.push(value); },
      () => true,
    );
    expect(results).toEqual(["Hello"]);
  });

  it("lowercases headers before passing to mapper", () => {
    const headers: string[] = [];
    mapCsvToEntities<{ name: string }>(
      "Name,ADDRESS\nfoo,bar",
      (_entity, header) => { headers.push(header); },
      () => true,
    );
    expect(headers).toEqual(["name", "address"]);
  });

  it("filters out rows that fail isValid", () => {
    const result = mapCsvToEntities<{ name: string }>(
      "name\nAlice\n\nBob",
      (entity, header, value) => {
        if (header === "name") (entity as Record<string, string>).name = value;
      },
      (e) => !!e.name,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Alice" });
    expect(result[1]).toEqual({ name: "Bob" });
  });
});

// ── Store CSV mapping ──

describe("mapStoreRow", () => {
  it("maps name and address", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "name", "Costco");
    mapStoreRow(store, "address", "123 Main St");
    expect(store).toEqual({ name: "Costco", address: "123 Main St" });
  });

  it("maps lat/lng with numeric parsing", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "lat", "43.65");
    mapStoreRow(store, "lng", "-79.38");
    expect(store.lat).toBeCloseTo(43.65);
    expect(store.lng).toBeCloseTo(-79.38);
  });

  it("maps latitude/longitude aliases", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "latitude", "43.65");
    mapStoreRow(store, "longitude", "-79.38");
    expect(store.lat).toBeCloseTo(43.65);
    expect(store.lng).toBeCloseTo(-79.38);
  });

  it("sets lat/lng to null for empty values", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "lat", "");
    mapStoreRow(store, "lng", "");
    expect(store.lat).toBeNull();
    expect(store.lng).toBeNull();
  });

  it("parses hours_json as JSON", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "hours_json", '{"mon":"9-5"}');
    expect(store.hoursJson).toEqual({ mon: "9-5" });
  });

  it("handles hours alias", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "hours", '{"mon":"9-5"}');
    expect(store.hoursJson).toEqual({ mon: "9-5" });
  });

  it("sets hoursJson to null for invalid JSON", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "hours_json", "not-json");
    expect(store.hoursJson).toBeNull();
  });

  it("sets hoursJson to null for empty value", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "hours_json", "");
    expect(store.hoursJson).toBeNull();
  });

  it("ignores unknown headers", () => {
    const store: Record<string, unknown> = {};
    mapStoreRow(store, "unknown_col", "whatever");
    expect(Object.keys(store)).toHaveLength(0);
  });
});

describe("isValidStore", () => {
  it("returns true for store with name and address", () => {
    expect(isValidStore({ name: "Costco", address: "123 Main" })).toBe(true);
  });

  it("returns false for missing name", () => {
    expect(isValidStore({ address: "123 Main" })).toBe(false);
  });

  it("returns false for missing address", () => {
    expect(isValidStore({ name: "Costco" })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isValidStore({})).toBe(false);
  });
});

// ── Item CSV mapping ──

describe("mapItemRow", () => {
  it("maps name", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "name", "Bananas");
    expect(item.name).toBe("Bananas");
  });

  it("maps descriptor as null when empty", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "descriptor", "");
    expect(item.descriptor).toBeNull();
  });

  it("maps descriptor with value", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "descriptor", "Organic");
    expect(item.descriptor).toBe("Organic");
  });

  it("maps unit", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "unit", "kg");
    expect(item.unit).toBe("kg");
  });

  it("maps organic_conventional", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "organic_conventional", "organic");
    expect(item.organicConventional).toBe("organic");
  });

  it("maps bunch_flag true", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "bunch_flag", "true");
    expect(item.bunchFlag).toBe(true);
  });

  it("maps bunch_flag True (case-insensitive)", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "bunch_flag", "True");
    expect(item.bunchFlag).toBe(true);
  });

  it("maps bunch_flag false for other values", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "bunch_flag", "no");
    expect(item.bunchFlag).toBe(false);
  });

  it("ignores unknown headers", () => {
    const item: Record<string, unknown> = {};
    mapItemRow(item, "color", "yellow");
    expect(Object.keys(item)).toHaveLength(0);
  });
});

describe("isValidItem", () => {
  it("returns true for item with name", () => {
    expect(isValidItem({ name: "Bananas" })).toBe(true);
  });

  it("returns false for missing name", () => {
    expect(isValidItem({ unit: "kg" })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isValidItem({})).toBe(false);
  });
});

// ── Price CSV mapping ──

describe("mapPriceRow", () => {
  it("maps item_id and store_id", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "item_id", "i-1");
    mapPriceRow(price, "store_id", "s-1");
    expect(price).toMatchObject({ itemId: "i-1", storeId: "s-1" });
  });

  it("maps price as string", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "price", "4.99");
    expect(price.price).toBe("4.99");
  });

  it("maps price_type as null when empty", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "price_type", "");
    expect(price.priceType).toBeNull();
  });

  it("maps quantity, unit, notes", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "quantity", "2");
    mapPriceRow(price, "unit", "lb");
    mapPriceRow(price, "notes", "On sale");
    expect(price).toMatchObject({ quantity: "2", unit: "lb", notes: "On sale" });
  });

  it("maps empty optional fields to null", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "quantity", "");
    mapPriceRow(price, "unit", "");
    mapPriceRow(price, "notes", "");
    expect(price).toMatchObject({ quantity: null, unit: null, notes: null });
  });

  it("ignores unknown headers", () => {
    const price: Record<string, unknown> = {};
    mapPriceRow(price, "discount", "10%");
    expect(Object.keys(price)).toHaveLength(0);
  });
});

describe("isValidPrice", () => {
  it("returns true for price with itemId, storeId, and price", () => {
    expect(isValidPrice({ itemId: "i-1", storeId: "s-1", price: "4.99" })).toBe(true);
  });

  it("returns false for missing itemId", () => {
    expect(isValidPrice({ storeId: "s-1", price: "4.99" })).toBe(false);
  });

  it("returns false for missing storeId", () => {
    expect(isValidPrice({ itemId: "i-1", price: "4.99" })).toBe(false);
  });

  it("returns false for missing price", () => {
    expect(isValidPrice({ itemId: "i-1", storeId: "s-1" })).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isValidPrice({})).toBe(false);
  });
});

// ── End-to-end convenience functions ──

describe("parseStoresFromCsv", () => {
  it("parses a complete stores CSV", () => {
    const csv = `name,address,lat,lng
Costco,123 Main St,43.65,-79.38
NoFrills,456 Oak Ave,43.70,-79.40`;
    const result = parseStoresFromCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "Costco", address: "123 Main St" });
    expect(result[0].lat).toBeCloseTo(43.65);
    expect(result[1]).toMatchObject({ name: "NoFrills", address: "456 Oak Ave" });
  });

  it("filters out rows missing required fields", () => {
    const csv = `name,address
Costco,123 Main
,No Name Store
Walmart,`;
    const result = parseStoresFromCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Costco");
  });

  it("handles quoted values", () => {
    const csv = `name,address
"Metro","789 Queen St"`;
    const result = parseStoresFromCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Metro", address: "789 Queen St" });
  });

  it("sets hoursJson to null when JSON is invalid after CSV quote stripping", () => {
    // parseCSV strips all double-quote chars (they're CSV delimiters),
    // so JSON with quotes becomes invalid — this matches original behavior
    const csv = 'name,address,hours_json\nCostco,123 Main,{"mon":"9-5"}';
    const result = parseStoresFromCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].hoursJson).toBeNull();
  });

  it("returns empty for empty CSV", () => {
    expect(parseStoresFromCsv("")).toEqual([]);
  });
});

describe("parseItemsFromCsv", () => {
  it("parses a complete items CSV", () => {
    const csv = `name,descriptor,unit,organic_conventional,bunch_flag
Bananas,Cavendish,lb,conventional,false
Kale,,bunch,organic,true`;
    const result = parseItemsFromCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "Bananas",
      descriptor: "Cavendish",
      unit: "lb",
      organicConventional: "conventional",
      bunchFlag: false,
    });
    expect(result[1]).toMatchObject({
      name: "Kale",
      descriptor: null,
      unit: "bunch",
      organicConventional: "organic",
      bunchFlag: true,
    });
  });

  it("filters out rows without name", () => {
    const csv = `name,unit
Apples,lb
,kg`;
    const result = parseItemsFromCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Apples");
  });

  it("returns empty for empty CSV", () => {
    expect(parseItemsFromCsv("")).toEqual([]);
  });
});

describe("parsePricesFromCsv", () => {
  it("parses a complete prices CSV", () => {
    const csv = `item_id,store_id,price,price_type,quantity,unit,notes
i-1,s-1,4.99,regular,1,lb,Fresh
i-2,s-1,2.49,sale,,each,`;
    const result = parsePricesFromCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      itemId: "i-1",
      storeId: "s-1",
      price: "4.99",
      priceType: "regular",
      quantity: "1",
      unit: "lb",
      notes: "Fresh",
    });
    expect(result[1]).toMatchObject({
      itemId: "i-2",
      storeId: "s-1",
      price: "2.49",
      priceType: "sale",
      quantity: null,
      unit: "each",
      notes: null,
    });
  });

  it("filters out rows missing required fields", () => {
    const csv = `item_id,store_id,price
i-1,s-1,4.99
i-2,,3.99
,s-2,2.99
i-3,s-3,`;
    const result = parsePricesFromCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ itemId: "i-1", storeId: "s-1", price: "4.99" });
  });

  it("returns empty for empty CSV", () => {
    expect(parsePricesFromCsv("")).toEqual([]);
  });
});
