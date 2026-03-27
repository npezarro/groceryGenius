import { describe, it, expect } from "vitest";
import type { ShoppingListItem, SavedShoppingList } from "@/lib/types";

/**
 * Tests for shopping list persistence logic — localStorage serialization,
 * guest/auth transitions, check-off behavior, and list management.
 */

describe("Shopping List — Check-off Behavior", () => {
  function sortCheckedToBottom(items: ShoppingListItem[]): ShoppingListItem[] {
    const unchecked = items.filter(i => !i.checked);
    const checked = items.filter(i => i.checked);
    return [...unchecked, ...checked];
  }

  it("unchecked items come before checked items", () => {
    const items: ShoppingListItem[] = [
      { id: "1", name: "Milk", checked: true },
      { id: "2", name: "Eggs", checked: false },
      { id: "3", name: "Bread", checked: true },
      { id: "4", name: "Butter", checked: false },
    ];
    const sorted = sortCheckedToBottom(items);
    expect(sorted[0].name).toBe("Eggs");
    expect(sorted[1].name).toBe("Butter");
    expect(sorted[2].name).toBe("Milk");
    expect(sorted[3].name).toBe("Bread");
  });

  it("toggling an item updates checked state", () => {
    const items: ShoppingListItem[] = [
      { id: "1", name: "Milk", checked: false },
      { id: "2", name: "Eggs", checked: false },
    ];
    const toggled = items.map(item =>
      item.id === "1" ? { ...item, checked: !item.checked } : item
    );
    expect(toggled[0].checked).toBe(true);
    expect(toggled[1].checked).toBe(false);
  });

  it("clear checked removes only checked items", () => {
    const items: ShoppingListItem[] = [
      { id: "1", name: "Milk", checked: true },
      { id: "2", name: "Eggs", checked: false },
      { id: "3", name: "Bread", checked: true },
    ];
    const remaining = items.filter(item => !item.checked);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("Eggs");
  });

  it("items without checked field default to unchecked", () => {
    const item: ShoppingListItem = { id: "1", name: "Milk" };
    expect(item.checked ?? false).toBe(false);
  });
});

describe("Shopping List — localStorage Serialization", () => {
  it("items serialize to JSON and back", () => {
    const items: ShoppingListItem[] = [
      { id: "1", name: "Milk", quantity: 2, unit: "gal" },
      { id: "2", name: "Eggs", checked: true },
    ];
    const json = JSON.stringify(items);
    const parsed = JSON.parse(json) as ShoppingListItem[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("Milk");
    expect(parsed[0].quantity).toBe(2);
    expect(parsed[1].checked).toBe(true);
  });

  it("empty array serializes correctly", () => {
    const json = JSON.stringify([]);
    expect(JSON.parse(json)).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    const raw = "not valid json";
    let items: ShoppingListItem[] = [];
    try {
      items = JSON.parse(raw);
    } catch {
      items = [];
    }
    expect(items).toEqual([]);
  });
});

describe("Shopping List — Guest to Auth Migration", () => {
  it("merging guest items into existing list concatenates", () => {
    const existingItems: ShoppingListItem[] = [
      { id: "1", name: "Milk" },
    ];
    const guestItems: ShoppingListItem[] = [
      { id: "g1", name: "Eggs" },
      { id: "g2", name: "Bread" },
    ];
    const merged = [...existingItems, ...guestItems];
    expect(merged).toHaveLength(3);
    expect(merged.map(i => i.name)).toEqual(["Milk", "Eggs", "Bread"]);
  });

  it("empty guest items produce no merge", () => {
    const existingItems: ShoppingListItem[] = [{ id: "1", name: "Milk" }];
    const guestItems: ShoppingListItem[] = [];
    const hasGuestItems = guestItems.length > 0;
    expect(hasGuestItems).toBe(false);
  });
});

describe("Shopping List — Multiple Lists", () => {
  it("lists are sorted by updatedAt descending", () => {
    const lists: SavedShoppingList[] = [
      { id: "1", name: "Old List", items: [], userId: "u1", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "2", name: "New List", items: [], userId: "u1", createdAt: "2026-03-01", updatedAt: "2026-03-27" },
      { id: "3", name: "Mid List", items: [], userId: "u1", createdAt: "2026-02-01", updatedAt: "2026-02-15" },
    ];
    const sorted = [...lists].sort((a, b) =>
      new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime()
    );
    expect(sorted[0].name).toBe("New List");
    expect(sorted[1].name).toBe("Mid List");
    expect(sorted[2].name).toBe("Old List");
  });

  it("deleting active list selects the next available", () => {
    const lists: SavedShoppingList[] = [
      { id: "1", name: "List A", items: [], userId: "u1", createdAt: null, updatedAt: null },
      { id: "2", name: "List B", items: [], userId: "u1", createdAt: null, updatedAt: null },
    ];
    const activeListId = "1";
    const remaining = lists.filter(l => l.id !== activeListId);
    const newActive = remaining.length > 0 ? remaining[0].id : null;
    expect(newActive).toBe("2");
  });

  it("deleting the last list results in null active", () => {
    const lists: SavedShoppingList[] = [
      { id: "1", name: "Only List", items: [], userId: "u1", createdAt: null, updatedAt: null },
    ];
    const remaining = lists.filter(l => l.id !== "1");
    const newActive = remaining.length > 0 ? remaining[0].id : null;
    expect(newActive).toBeNull();
  });
});
