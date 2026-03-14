/**
 * Validates and sanitizes raw product data from external sources.
 * Strips HTML, rejects malformed entries, and normalizes text fields.
 */

import type { RawProduct } from "./types";

/** Strip HTML tags from text */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/** Check if a string looks like it contains injected HTML/script */
function containsHtml(text: string): boolean {
  return /<[a-z/][\s\S]*>/i.test(text);
}

/** Validate a single raw product, returning null if invalid */
export function validateProduct(product: RawProduct): RawProduct | null {
  // Name is required and must be non-empty after sanitization
  if (!product.name || typeof product.name !== "string") return null;
  const name = stripHtml(product.name).slice(0, 200);
  if (name.length < 2) return null;

  // Price must be a positive finite number
  if (typeof product.price !== "number" || !isFinite(product.price) || product.price <= 0) return null;
  if (product.price > 9999) return null; // sanity cap

  // Sanitize optional text fields
  const unit = product.unit ? stripHtml(product.unit).slice(0, 20) : undefined;
  const promotionText = product.promotionText ? stripHtml(product.promotionText).slice(0, 200) : undefined;
  const category = product.category ? stripHtml(product.category).slice(0, 100) : undefined;

  // Validate image URL if present — only allow known CDN patterns
  let imageUrl = product.imageUrl;
  if (imageUrl) {
    try {
      const url = new URL(imageUrl);
      if (!["https:", "http:"].includes(url.protocol)) imageUrl = undefined;
    } catch {
      imageUrl = undefined;
    }
  }

  // Reject if sanitized name still contains suspicious content
  if (containsHtml(name)) return null;

  // Validate numeric fields
  const quantity = product.quantity != null && isFinite(product.quantity) && product.quantity > 0
    ? product.quantity : undefined;
  const originalPrice = product.originalPrice != null && isFinite(product.originalPrice) && product.originalPrice > 0
    ? product.originalPrice : undefined;
  const memberPrice = product.memberPrice != null && isFinite(product.memberPrice) && product.memberPrice > 0
    ? product.memberPrice : undefined;

  return {
    name,
    price: Math.round(product.price * 100) / 100, // round to cents
    unit,
    quantity,
    isPromotion: product.isPromotion ?? false,
    originalPrice,
    promotionText,
    memberPrice,
    loyaltyRequired: product.loyaltyRequired ?? false,
    category,
    imageUrl,
    sourceProductId: product.sourceProductId ? String(product.sourceProductId).slice(0, 100) : undefined,
  };
}

/** Validate a batch of products, filtering out invalid entries */
export function validateProducts(products: RawProduct[]): { valid: RawProduct[]; rejected: number } {
  const valid: RawProduct[] = [];
  let rejected = 0;

  for (const product of products) {
    const validated = validateProduct(product);
    if (validated) {
      valid.push(validated);
    } else {
      rejected++;
    }
  }

  return { valid, rejected };
}
