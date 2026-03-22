import { describe, it, expect } from "vitest";
import { matchItemId, parseCsvItems, parseBulkItems } from "../lib/shopping-utils";

describe("matchItemId", () => {
  const dbItems = [
    { id: "1", name: "Organic Bananas" },
    { id: "2", name: "Whole Milk" },
    { id: "3", name: "Bread" },
  ];

  it("returns null when dbItems is undefined", () => {
    expect(matchItemId("Bananas", undefined)).toBeNull();
  });

  it("matches exact name (case-insensitive)", () => {
    expect(matchItemId("organic bananas", dbItems)).toBe("1");
    expect(matchItemId("WHOLE MILK", dbItems)).toBe("2");
  });

  it("matches when db name contains search term", () => {
    expect(matchItemId("Bananas", dbItems)).toBe("1");
    expect(matchItemId("Milk", dbItems)).toBe("2");
  });

  it("matches when search term contains db name", () => {
    expect(matchItemId("Fresh Bread Loaf", dbItems)).toBe("3");
  });

  it("returns null for no match", () => {
    expect(matchItemId("Cheese", dbItems)).toBeNull();
  });

  it("returns null for empty dbItems array", () => {
    expect(matchItemId("Milk", [])).toBeNull();
  });

  it("returns first match when multiple partial matches exist", () => {
    const items = [
      { id: "10", name: "Milk" },
      { id: "11", name: "Milk Chocolate" },
    ];
    expect(matchItemId("Milk", items)).toBe("10");
  });
});

describe("parseCsvItems", () => {
  it("parses simple CSV lines", () => {
    const items = parseCsvItems("Apples\nBananas\nMilk");
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe("Apples");
    expect(items[1].name).toBe("Bananas");
    expect(items[2].name).toBe("Milk");
  });

  it("takes only the first column", () => {
    const items = parseCsvItems("Apples,2,organic\nBananas,1,regular");
    expect(items[0].name).toBe("Apples");
    expect(items[1].name).toBe("Bananas");
  });

  it("strips quotes from values", () => {
    const items = parseCsvItems('"Red Apples",2\n"Whole Milk",1');
    expect(items[0].name).toBe("Red Apples");
    expect(items[1].name).toBe("Whole Milk");
  });

  it("skips empty lines", () => {
    const items = parseCsvItems("Apples\n\n\nBananas\n");
    expect(items).toHaveLength(2);
  });

  it("filters out items with empty names", () => {
    const items = parseCsvItems(",2\nBananas,1");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bananas");
  });

  it("trims whitespace", () => {
    const items = parseCsvItems("  Apples  \n  Bananas  ");
    expect(items[0].name).toBe("Apples");
    expect(items[1].name).toBe("Bananas");
  });

  it("generates unique IDs", () => {
    const items = parseCsvItems("A\nB\nC");
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(3);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsvItems("")).toHaveLength(0);
    expect(parseCsvItems("   ")).toHaveLength(0);
  });
});

describe("parseBulkItems", () => {
  it("parses newline-separated items", () => {
    const items = parseBulkItems("Apples\nBananas\nMilk");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.name)).toEqual(["Apples", "Bananas", "Milk"]);
  });

  it("trims whitespace from each line", () => {
    const items = parseBulkItems("  Apples  \n  Bananas  ");
    expect(items[0].name).toBe("Apples");
  });

  it("skips empty lines", () => {
    const items = parseBulkItems("Apples\n\n\nBananas");
    expect(items).toHaveLength(2);
  });

  it("generates unique IDs", () => {
    const items = parseBulkItems("A\nB\nC");
    const ids = new Set(items.map((i) => i.id));
    expect(ids.size).toBe(3);
  });

  it("returns empty array for empty input", () => {
    expect(parseBulkItems("")).toHaveLength(0);
  });
});
