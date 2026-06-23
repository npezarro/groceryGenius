/**
 * AI feature logic for Grocery Genius. Each function builds a prompt, calls the
 * alt-account bridge, and validates the parsed result. DB access is done by the
 * caller (routes) and passed in, so these stay unit-testable and grounded: the
 * model structures/judges real data, it does not invent prices.
 */

import { callBridgeJson, type BridgeModel } from "./ai-bridge";

// ── 1. Meal plan / free text → structured shopping list ──

export interface ParsedListItem {
  name: string;
  quantity?: number;
  unit?: string;
  category?: string;
}

const GROCERY_CATEGORIES = [
  "Produce", "Dairy", "Meat & Seafood", "Bakery", "Pantry", "Frozen",
  "Beverages", "Snacks", "Household", "Other",
];

/**
 * Turn free text (a meal plan, list of recipes, "dinners for the week", or a
 * messy list) into a deduped structured shopping list.
 */
export async function mealPlanToList(input: string): Promise<ParsedListItem[]> {
  const prompt = `You are a grocery shopping assistant. Convert the user's request into a consolidated shopping list.

User request:
"""
${input.slice(0, 8000)}
"""

Rules:
- Output every distinct grocery ITEM needed, consolidated (combine duplicates, sum quantities).
- Use common grocery names a store would list (e.g. "whole milk", "boneless chicken breast", "yellow onion").
- Estimate a reasonable quantity and unit when implied by recipes; omit if unknown.
- Assign each item one category from: ${GROCERY_CATEGORIES.join(", ")}.
- Do NOT include pantry staples the user clearly already has unless explicitly requested.

Respond with ONLY a JSON array, each element:
{"name": string, "quantity": number|null, "unit": string|null, "category": string}`;

  const raw = await callBridgeJson<unknown>(prompt, "haiku");
  return normalizeList(raw);
}

function normalizeList(raw: unknown): ParsedListItem[] {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] })?.items)
      ? (raw as { items: unknown[] }).items
      : [];
  const out: ParsedListItem[] = [];
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    const qtyNum = Number(o.quantity);
    out.push({
      name,
      quantity: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : undefined,
      unit: o.unit ? String(o.unit).trim() : undefined,
      category: o.category ? String(o.category).trim() : undefined,
    });
  }
  return out;
}

// ── 2. Semantic item matching for the trip planner ──

/**
 * Map each user list item to the best-matching catalog item name (or null).
 * The deterministic substring matcher misses semantic matches like
 * "whole milk" vs "Milk, Whole, 1 Gallon"; this fills that gap.
 *
 * @param userItems  names the user typed
 * @param catalog    catalog item names to match against (caller should cap size)
 * @returns map of userItem -> matched catalog name (exact string from catalog) or null
 */
export async function matchItemsAI(
  userItems: string[],
  catalog: string[],
): Promise<Record<string, string | null>> {
  if (userItems.length === 0 || catalog.length === 0) return {};
  const prompt = `Match each shopping-list item to the single closest product from the catalog.

Shopping list items:
${userItems.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Catalog (choose names EXACTLY as written, or null if nothing is a reasonable match):
${catalog.slice(0, 1200).map((n) => `- ${n}`).join("\n")}

Respond with ONLY a JSON object mapping each shopping-list item (verbatim) to a catalog name or null:
{"item name": "Exact Catalog Name" | null, ...}`;

  const raw = await callBridgeJson<Record<string, unknown>>(prompt, "haiku");
  const catalogSet = new Set(catalog);
  const out: Record<string, string | null> = {};
  for (const userItem of userItems) {
    const v = raw?.[userItem];
    out[userItem] = typeof v === "string" && catalogSet.has(v) ? v : null;
  }
  return out;
}

// ── 3. Substitutions ──

export interface SubstitutionCandidate {
  itemId: string;
  name: string;
  price: number;
  storeName: string;
}

export interface SubstitutionSuggestion {
  name: string;
  reason: string;
  estimatedSavings?: number;
}

/**
 * Given a target item and real cheaper candidates from the same category,
 * have the model pick which are sensible substitutes and explain why.
 * Candidates come from the DB so suggestions are grounded in real prices.
 */
export async function suggestSubstitutions(
  target: { name: string; price: number },
  candidates: SubstitutionCandidate[],
): Promise<SubstitutionSuggestion[]> {
  if (candidates.length === 0) return [];
  const prompt = `A shopper wants "${target.name}" (about $${target.price.toFixed(2)}).
From these REAL cheaper products available nearby, pick up to 3 that are sensible substitutes (similar use, reasonable swap). Ignore unrelated products.

Candidates:
${candidates
  .slice(0, 40)
  .map((c) => `- ${c.name} — $${c.price.toFixed(2)} at ${c.storeName}`)
  .join("\n")}

Respond with ONLY a JSON array (may be empty), each element:
{"name": "<exact candidate name>", "reason": "<short why it's a good swap>", "estimatedSavings": <number dollars>}`;

  const raw = await callBridgeJson<unknown>(prompt, "haiku");
  const arr = Array.isArray(raw) ? raw : [];
  const candNames = new Set(candidates.map((c) => c.name));
  const out: SubstitutionSuggestion[] = [];
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name || !candNames.has(name)) continue;
    const sav = Number(o.estimatedSavings);
    out.push({
      name,
      reason: String(o.reason ?? "").slice(0, 200),
      estimatedSavings: Number.isFinite(sav) ? sav : undefined,
    });
  }
  return out;
}

// ── 4. Receipt OCR text → structured items ──

export interface ParsedReceipt {
  storeName?: string;
  purchaseDate?: string; // ISO yyyy-mm-dd
  total?: number;
  items: Array<{ name: string; price: number; quantity?: number; unit?: string }>;
}

/**
 * Parse raw OCR text from a grocery receipt into structured items + prices.
 * Vision is done upstream (OCR); this turns noisy text into clean records.
 */
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt> {
  const prompt = `Parse this grocery receipt OCR text into structured data. OCR is noisy; infer sensible product names.

Receipt text:
"""
${ocrText.slice(0, 6000)}
"""

Rules:
- Expand abbreviated product names to readable grocery names when confident.
- price is the per-line price paid in dollars.
- Skip non-item lines (subtotal, tax, total, payment, change, loyalty).
- Capture the store name and purchase date if present.

Respond with ONLY JSON:
{"storeName": string|null, "purchaseDate": "YYYY-MM-DD"|null, "total": number|null,
 "items": [{"name": string, "price": number, "quantity": number|null, "unit": string|null}]}`;

  const raw = await callBridgeJson<Record<string, unknown>>(prompt, "haiku");
  const itemsRaw = Array.isArray(raw?.items) ? (raw.items as unknown[]) : [];
  const items: ParsedReceipt["items"] = [];
  for (const el of itemsRaw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const price = Number(o.price);
    if (!name || !Number.isFinite(price) || price <= 0) continue;
    const qty = Number(o.quantity);
    items.push({
      name,
      price,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      unit: o.unit ? String(o.unit).trim() : undefined,
    });
  }
  const total = Number(raw?.total);
  return {
    storeName: raw?.storeName ? String(raw.storeName).slice(0, 120) : undefined,
    purchaseDate: typeof raw?.purchaseDate === "string" ? raw.purchaseDate.slice(0, 10) : undefined,
    total: Number.isFinite(total) ? total : undefined,
    items,
  };
}

export const _internal = { normalizeList, GROCERY_CATEGORIES, type: null as unknown as BridgeModel };
