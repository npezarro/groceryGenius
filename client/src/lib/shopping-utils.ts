import { ShoppingListItem } from "./types";

/** Find the database item ID by fuzzy matching on name */
export function matchItemId(
  itemName: string,
  dbItems: Array<{ id: string; name: string }> | undefined
): string | null {
  if (!dbItems) return null;
  const dbItem = dbItems.find(
    (item) =>
      item.name.toLowerCase() === itemName.toLowerCase() ||
      item.name.toLowerCase().includes(itemName.toLowerCase()) ||
      itemName.toLowerCase().includes(item.name.toLowerCase())
  );
  return dbItem?.id || null;
}

/** Parse CSV text into shopping list items (takes first column, strips quotes) */
export function parseCsvItems(csvText: string): ShoppingListItem[] {
  const lines = csvText.split("\n").filter((line) => line.trim());
  return lines
    .map((line) => ({
      id: Date.now().toString() + Math.random(),
      name: line.split(",")[0].trim().replace(/"/g, ""),
    }))
    .filter((item) => item.name);
}

/** Parse newline-separated text into shopping list items */
export function parseBulkItems(text: string): ShoppingListItem[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .map((name) => ({
      id: Date.now().toString() + Math.random(),
      name,
    }));
}
