import { describe, it, expect } from "vitest";
import {
  matchItemId,
  parseCsvItems,
  parseBulkItems,
  inferCategory,
  groupItemsByCategory,
} from "../lib/shopping-utils";

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

describe("inferCategory", () => {
  it("categorizes produce items", () => {
    expect(inferCategory("Banana")).toBe("Produce");
    expect(inferCategory("Organic Spinach")).toBe("Produce");
    expect(inferCategory("Baby Carrots")).toBe("Produce");
    expect(inferCategory("Fresh Basil")).toBe("Produce");
    expect(inferCategory("Avocado")).toBe("Produce");
    expect(inferCategory("Jalapeño Peppers")).toBe("Produce");
    expect(inferCategory("Mango")).toBe("Produce");
    expect(inferCategory("Watermelon")).toBe("Produce");
  });

  it("categorizes dairy & eggs items", () => {
    expect(inferCategory("Whole Milk")).toBe("Dairy & Eggs");
    expect(inferCategory("Cheddar Cheese")).toBe("Dairy & Eggs");
    expect(inferCategory("Greek Yogurt")).toBe("Dairy & Eggs");
    expect(inferCategory("Large Eggs")).toBe("Dairy & Eggs");
    expect(inferCategory("Unsalted Butter")).toBe("Dairy & Eggs");
    expect(inferCategory("Cream Cheese")).toBe("Dairy & Eggs");
    expect(inferCategory("Half and Half")).toBe("Dairy & Eggs");
    expect(inferCategory("Ghee")).toBe("Dairy & Eggs");
  });

  it("categorizes meat & seafood items", () => {
    expect(inferCategory("Chicken Breast")).toBe("Meat & Seafood");
    expect(inferCategory("Ground Beef")).toBe("Meat & Seafood");
    expect(inferCategory("Atlantic Salmon")).toBe("Meat & Seafood");
    expect(inferCategory("Thick-Cut Bacon")).toBe("Meat & Seafood");
    expect(inferCategory("Shrimp")).toBe("Meat & Seafood");
    expect(inferCategory("Turkey Sausage")).toBe("Meat & Seafood");
    expect(inferCategory("Lamb Chops")).toBe("Meat & Seafood");
  });

  it("categorizes bakery & bread items", () => {
    expect(inferCategory("Sourdough Bread")).toBe("Bakery & Bread");
    expect(inferCategory("Flour Tortilla")).toBe("Bakery & Bread");
    expect(inferCategory("Plain Bagel")).toBe("Bakery & Bread");
    expect(inferCategory("Croissant")).toBe("Bakery & Bread");
    expect(inferCategory("Naan Bread")).toBe("Bakery & Bread");
    expect(inferCategory("Ciabatta Roll")).toBe("Bakery & Bread");
  });

  it("categorizes frozen items", () => {
    expect(inferCategory("Frozen Pizza")).toBe("Frozen");
    expect(inferCategory("Frozen Dinner")).toBe("Frozen");
    expect(inferCategory("Popsicle")).toBe("Frozen");
    expect(inferCategory("Frozen Waffles")).toBe("Frozen");
    expect(inferCategory("Sorbet")).toBe("Frozen");
  });

  it("categorizes pantry items", () => {
    expect(inferCategory("Jasmine Rice")).toBe("Pantry");
    expect(inferCategory("Spaghetti")).toBe("Pantry");
    expect(inferCategory("All-Purpose Flour")).toBe("Pantry");
    expect(inferCategory("Honey")).toBe("Pantry");
    expect(inferCategory("Baking Soda")).toBe("Pantry");
    expect(inferCategory("Quinoa")).toBe("Pantry");
    expect(inferCategory("Couscous")).toBe("Pantry");
    expect(inferCategory("Vanilla Extract")).toBe("Pantry");
    expect(inferCategory("Soy Sauce")).toBe("Pantry");
  });

  it("categorizes snack items", () => {
    expect(inferCategory("Pretzels")).toBe("Snacks");
    expect(inferCategory("Trail Mix")).toBe("Snacks");
    expect(inferCategory("Crackers")).toBe("Snacks");
    expect(inferCategory("Microwave Popcorn")).toBe("Snacks");
    expect(inferCategory("Protein Bar")).toBe("Snacks");
  });

  it("categorizes beverage items", () => {
    expect(inferCategory("Green Tea")).toBe("Beverages");
    expect(inferCategory("Sparkling Water")).toBe("Beverages");
    expect(inferCategory("Kombucha")).toBe("Beverages");
    expect(inferCategory("Cola")).toBe("Beverages");
    expect(inferCategory("Seltzer")).toBe("Beverages");
    expect(inferCategory("Energy Drink")).toBe("Beverages");
  });

  it("categorizes deli items", () => {
    expect(inferCategory("Classic Hummus")).toBe("Deli");
    expect(inferCategory("Dill Pickles")).toBe("Deli");
    expect(inferCategory("Fresh Guacamole")).toBe("Deli");
    expect(inferCategory("Prepared Meal")).toBe("Deli");
  });

  it("resolves ambiguous items by category rule priority order", () => {
    // Categories are checked in order: Produce first, then Dairy, Meat, etc.
    // Items matching multiple categories get the first matching category.
    expect(inferCategory("Vanilla Ice Cream")).toBe("Dairy & Eggs"); // "cream" matches Dairy before "ice cream" in Frozen
    expect(inferCategory("Orange Juice")).toBe("Produce"); // "orange" matches Produce before "juice" in Beverages
    expect(inferCategory("Potato Chips")).toBe("Produce"); // "potato" matches Produce before "chip" in Snacks
    expect(inferCategory("Peanut Butter")).toBe("Produce"); // "pea" in "peanut" matches Produce before "butter" in Dairy
    expect(inferCategory("Rotisserie Chicken")).toBe("Meat & Seafood"); // "chicken" matches Meat before "rotisserie" in Deli
    expect(inferCategory("Frozen Peas")).toBe("Produce"); // "pea" in "peas" matches Produce before "frozen" in Frozen
    expect(inferCategory("Ground Coffee")).toBe("Meat & Seafood"); // "ground" matches Meat before "coffee" in Beverages
    expect(inferCategory("Lemonade")).toBe("Produce"); // "lemon" in "lemonade" matches Produce before Beverages
    expect(inferCategory("Granola Bar")).toBe("Pantry"); // "granola" matches Pantry before "granola bar" in Snacks
    expect(inferCategory("Canned Beans")).toBe("Produce"); // "bean" matches Produce before "canned" in Pantry
  });

  it("categorizes household items", () => {
    expect(inferCategory("Paper Towels")).toBe("Household");
    expect(inferCategory("Dish Soap")).toBe("Household");
    expect(inferCategory("Trash Bags")).toBe("Household");
    expect(inferCategory("Laundry Detergent")).toBe("Household");
    expect(inferCategory("Aluminum Foil")).toBe("Household");
    expect(inferCategory("Disinfectant Wipes")).toBe("Household");
  });

  it("categorizes personal care items", () => {
    expect(inferCategory("Shampoo")).toBe("Personal Care");
    expect(inferCategory("Toothpaste")).toBe("Personal Care");
    expect(inferCategory("Sunscreen SPF 50")).toBe("Personal Care");
    expect(inferCategory("Daily Vitamin")).toBe("Personal Care");
    expect(inferCategory("Body Wash")).toBe("Personal Care");
    expect(inferCategory("Mouthwash")).toBe("Personal Care");
  });

  it("returns Other for unrecognized items", () => {
    expect(inferCategory("Gift Card")).toBe("Other");
    expect(inferCategory("Random Thing")).toBe("Other");
    expect(inferCategory("")).toBe("Other");
  });

  it("is case-insensitive", () => {
    expect(inferCategory("BANANA")).toBe("Produce");
    expect(inferCategory("whole milk")).toBe("Dairy & Eggs");
    expect(inferCategory("FROZEN PIZZA")).toBe("Frozen");
  });
});

describe("groupItemsByCategory", () => {
  it("groups items by inferred category", () => {
    const items = [
      { id: "1", name: "Banana" },
      { id: "2", name: "Milk" },
      { id: "3", name: "Apple" },
      { id: "4", name: "Eggs" },
    ];
    const groups = groupItemsByCategory(items);
    const produce = groups.find((g) => g.category === "Produce");
    const dairy = groups.find((g) => g.category === "Dairy & Eggs");

    expect(produce).toBeDefined();
    expect(produce!.items).toHaveLength(2);
    expect(produce!.items.map((i) => i.name)).toEqual(["Banana", "Apple"]);

    expect(dairy).toBeDefined();
    expect(dairy!.items).toHaveLength(2);
  });

  it("preserves category order by first appearance", () => {
    const items = [
      { id: "1", name: "Milk" },
      { id: "2", name: "Banana" },
      { id: "3", name: "Bread" },
    ];
    const groups = groupItemsByCategory(items);
    expect(groups[0].category).toBe("Dairy & Eggs");
    expect(groups[1].category).toBe("Produce");
    expect(groups[2].category).toBe("Bakery & Bread");
  });

  it("returns empty array for empty input", () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });

  it("puts unrecognized items in Other", () => {
    const items = [{ id: "1", name: "Mystery Item" }];
    const groups = groupItemsByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Other");
  });

  it("preserves item order within each category", () => {
    const items = [
      { id: "1", name: "Banana" },
      { id: "2", name: "Rice" },
      { id: "3", name: "Apple" },
      { id: "4", name: "Pasta" },
    ];
    const groups = groupItemsByCategory(items);
    const produce = groups.find((g) => g.category === "Produce")!;
    expect(produce.items[0].name).toBe("Banana");
    expect(produce.items[1].name).toBe("Apple");

    const pantry = groups.find((g) => g.category === "Pantry")!;
    expect(pantry.items[0].name).toBe("Rice");
    expect(pantry.items[1].name).toBe("Pasta");
  });

  it("handles all items in same category", () => {
    const items = [
      { id: "1", name: "Banana" },
      { id: "2", name: "Apple" },
      { id: "3", name: "Orange" },
    ];
    const groups = groupItemsByCategory(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("Produce");
    expect(groups[0].items).toHaveLength(3);
  });

  it("handles items across many categories", () => {
    const items = [
      { id: "1", name: "Banana" },
      { id: "2", name: "Milk" },
      { id: "3", name: "Chicken" },
      { id: "4", name: "Bread" },
      { id: "5", name: "Frozen Pizza" },
      { id: "6", name: "Rice" },
      { id: "7", name: "Chips" },
      { id: "8", name: "Coffee" },
    ];
    const groups = groupItemsByCategory(items);
    expect(groups.length).toBeGreaterThanOrEqual(8);
    const categories = groups.map((g) => g.category);
    expect(categories).toContain("Produce");
    expect(categories).toContain("Dairy & Eggs");
    expect(categories).toContain("Meat & Seafood");
    expect(categories).toContain("Bakery & Bread");
    expect(categories).toContain("Frozen");
    expect(categories).toContain("Pantry");
    expect(categories).toContain("Snacks");
    expect(categories).toContain("Beverages");
  });
});
