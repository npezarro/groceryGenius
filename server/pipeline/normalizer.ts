/**
 * Normalizes raw product data into the existing GroceryGenius schema.
 * Handles unit normalization where unambiguous conversions exist.
 */

import type { RawProduct } from "./types";
import type { InsertPrice } from "@shared/schema";
import { storage } from "../storage";

/** Known unit conversions to a base unit */
const UNIT_CONVERSIONS: Record<string, { base: string; factor: number }> = {
  // Weight
  "lb": { base: "lb", factor: 1 },
  "lbs": { base: "lb", factor: 1 },
  "pound": { base: "lb", factor: 1 },
  "pounds": { base: "lb", factor: 1 },
  "oz": { base: "lb", factor: 1 / 16 },
  "ounce": { base: "lb", factor: 1 / 16 },
  "ounces": { base: "lb", factor: 1 / 16 },
  "kg": { base: "lb", factor: 2.20462 },
  "kilogram": { base: "lb", factor: 2.20462 },
  "g": { base: "lb", factor: 0.00220462 },
  "gram": { base: "lb", factor: 0.00220462 },
  "grams": { base: "lb", factor: 0.00220462 },
  // Volume
  "gal": { base: "gal", factor: 1 },
  "gallon": { base: "gal", factor: 1 },
  "qt": { base: "gal", factor: 0.25 },
  "quart": { base: "gal", factor: 0.25 },
  "pt": { base: "gal", factor: 0.125 },
  "pint": { base: "gal", factor: 0.125 },
  "fl oz": { base: "gal", factor: 1 / 128 },
  "floz": { base: "gal", factor: 1 / 128 },
  "l": { base: "gal", factor: 0.264172 },
  "liter": { base: "gal", factor: 0.264172 },
  "ml": { base: "gal", factor: 0.000264172 },
  // Count
  "each": { base: "each", factor: 1 },
  "ea": { base: "each", factor: 1 },
  "ct": { base: "each", factor: 1 },
  "count": { base: "each", factor: 1 },
  "pk": { base: "each", factor: 1 },
  "pack": { base: "each", factor: 1 },
  "bunch": { base: "bunch", factor: 1 },
};

interface NormalizedUnit {
  normalizedUnit: string;
  normalizedPricePerUnit: number;
}

/** Try to normalize a unit and compute price-per-base-unit */
export function normalizeUnit(unit: string | undefined, price: number, quantity?: number): NormalizedUnit | null {
  if (!unit) return null;

  const key = unit.toLowerCase().trim();
  const conversion = UNIT_CONVERSIONS[key];
  if (!conversion) return null;

  const qty = quantity ?? 1;
  // price per base unit = price / (quantity * conversion factor)
  const pricePerBaseUnit = price / (qty * conversion.factor);

  if (!isFinite(pricePerBaseUnit) || pricePerBaseUnit <= 0) return null;

  return {
    normalizedUnit: `per_${conversion.base}`,
    normalizedPricePerUnit: Math.round(pricePerBaseUnit * 100) / 100,
  };
}

/** Ingest validated products into the database for a given store */
export async function ingestProducts(
  products: RawProduct[],
  storeId: string,
  source: string,
): Promise<{ itemsCreated: number; pricesCreated: number }> {
  const itemsCreated = 0;
  let pricesCreated = 0;

  // Process in batches of 25 to avoid overwhelming the DB
  const batchSize = 25;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const priceRecords: InsertPrice[] = [];

    for (const product of batch) {
      // Find or create the item
      const item = await storage.findOrCreateItem(product.name, product.unit);
      if (!item) continue;

      // Build price record
      const priceRecord: InsertPrice = {
        itemId: item.id,
        storeId,
        price: String(product.price),
        unit: product.unit,
        quantity: product.quantity != null ? String(product.quantity) : undefined,
        notes: source,
        isPromotion: product.isPromotion ?? false,
        originalPrice: product.originalPrice != null ? String(product.originalPrice) : undefined,
        promotionText: product.promotionText,
        memberPrice: product.memberPrice != null ? String(product.memberPrice) : undefined,
        loyaltyRequired: product.loyaltyRequired ?? false,
      };

      priceRecords.push(priceRecord);
    }

    if (priceRecords.length > 0) {
      await storage.importPrices(priceRecords);
      pricesCreated += priceRecords.length;
    }
  }

  return { itemsCreated, pricesCreated };
}
