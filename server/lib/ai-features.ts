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

// ── 1b. Organize an existing list by store aisle (no prices needed) ──

export interface AisleGroup {
  aisle: string;
  items: string[];
}

/**
 * Group a list of item names into store aisles in a sensible shopping order.
 * Pure-AI, needs no price data — makes the list useful even with zero pricing.
 */
export async function organizeListByAisle(names: string[]): Promise<AisleGroup[]> {
  if (names.length === 0) return [];
  const prompt = `Group this shopping list into store aisles, ordered for an efficient shopping walk (produce first, frozen/refrigerated last).

Items:
${names.map((n) => `- ${n}`).join("\n")}

Use aisles from: ${GROCERY_CATEGORIES.join(", ")}.
Every input item must appear exactly once, under one aisle, with its name unchanged.

Respond with ONLY a JSON array ordered by shopping sequence:
[{"aisle": string, "items": [string, ...]}]`;

  const raw = await callBridgeJson<unknown>(prompt, "haiku");
  const arr = Array.isArray(raw) ? raw : [];
  const inputSet = new Set(names.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const groups: AisleGroup[] = [];
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const aisle = String(o.aisle ?? "Other").trim();
    const items = Array.isArray(o.items) ? o.items.map((x) => String(x).trim()) : [];
    const kept = items.filter((n) => inputSet.has(n.toLowerCase()) && !seen.has(n.toLowerCase()));
    kept.forEach((n) => seen.add(n.toLowerCase()));
    if (kept.length) groups.push({ aisle, items: kept });
  }
  // Anything the model dropped goes under "Other" so nothing is lost.
  const missing = names.filter((n) => !seen.has(n.toLowerCase()));
  if (missing.length) groups.push({ aisle: "Other", items: missing });
  return groups;
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

export interface ParsedReceiptItem {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
  /** Pre-discount price if the receipt shows a markdown/sale on this line. */
  originalPrice?: number;
  /** Dollar discount applied to this line, if shown. */
  discount?: number;
}

export interface ParsedReceipt {
  storeName?: string;
  /** Street/city/area printed on the receipt (for the store directory). */
  storeLocation?: string;
  purchaseDate?: string; // ISO yyyy-mm-dd
  total?: number;
  items: ParsedReceiptItem[];
}

/**
 * Parse raw OCR text from a grocery receipt into structured items + prices.
 * Vision is done upstream (OCR); this turns noisy text into clean records.
 * Captures per-line discounts and the store location for the store directory.
 */
export async function parseReceiptText(ocrText: string): Promise<ParsedReceipt> {
  const prompt = `Parse this grocery receipt OCR text into structured data. OCR is noisy; infer sensible product names.

Receipt text:
"""
${ocrText.slice(0, 6000)}
"""

Rules:
- Expand abbreviated product names to readable grocery names when confident.
- price is the per-line price actually paid in dollars (after any discount).
- If a line shows a sale/markdown/coupon, set originalPrice (pre-discount) and discount (dollars off).
- Skip non-item lines (subtotal, tax, total, payment, change, loyalty balance).
- Capture the store name, the store street/city location, and the purchase date if present.

Respond with ONLY JSON:
{"storeName": string|null, "storeLocation": string|null, "purchaseDate": "YYYY-MM-DD"|null, "total": number|null,
 "items": [{"name": string, "price": number, "quantity": number|null, "unit": string|null, "originalPrice": number|null, "discount": number|null}]}`;

  const raw = await callBridgeJson<Record<string, unknown>>(prompt, "haiku");
  const itemsRaw = Array.isArray(raw?.items) ? (raw.items as unknown[]) : [];
  const items: ParsedReceiptItem[] = [];
  for (const el of itemsRaw) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const price = Number(o.price);
    if (!name || !Number.isFinite(price) || price <= 0) continue;
    const qty = Number(o.quantity);
    const orig = Number(o.originalPrice);
    const disc = Number(o.discount);
    items.push({
      name,
      price,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      unit: o.unit ? String(o.unit).trim() : undefined,
      originalPrice: Number.isFinite(orig) && orig > price ? orig : undefined,
      discount: Number.isFinite(disc) && disc > 0 ? disc : undefined,
    });
  }
  const total = Number(raw?.total);
  return {
    storeName: raw?.storeName ? String(raw.storeName).slice(0, 120) : undefined,
    storeLocation: raw?.storeLocation ? String(raw.storeLocation).slice(0, 160) : undefined,
    purchaseDate: typeof raw?.purchaseDate === "string" ? raw.purchaseDate.slice(0, 10) : undefined,
    total: Number.isFinite(total) ? total : undefined,
    items,
  };
}

export const _internal = { normalizeList, GROCERY_CATEGORIES, type: null as unknown as BridgeModel };
