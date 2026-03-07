/**
 * Generic JSON-LD / schema.org Product extractor.
 *
 * Many grocery store websites embed structured data for SEO purposes.
 * This adapter extracts schema.org/Product markup from any URL,
 * making it usable as a general-purpose adapter for stores that publish
 * their pricing as structured data.
 */

import * as cheerio from "cheerio";
import type { RawProduct } from "../types";

interface JsonLdProduct {
  "@type": string;
  name?: string;
  sku?: string;
  productID?: string;
  category?: string;
  image?: string | { url: string };
  offers?: JsonLdOffer | JsonLdOffer[];
  offer?: JsonLdOffer;
}

interface JsonLdOffer {
  "@type"?: string;
  price?: string | number;
  lowPrice?: string | number;
  priceCurrency?: string;
  availability?: string;
}

/** Extract all schema.org/Product entries from an HTML page */
export async function extractJsonLdProducts(url: string): Promise<RawProduct[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "GroceryGenius/1.0 (structured-data-consumer)",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  return parseJsonLdFromHtml(html);
}

/** Parse JSON-LD product data from raw HTML */
export function parseJsonLdFromHtml(html: string): RawProduct[] {
  const $ = cheerio.load(html);
  const products: RawProduct[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || "");
      const items = flattenJsonLd(json);

      for (const item of items) {
        if (!isProductType(item["@type"])) continue;

        const product = item as JsonLdProduct;
        const offer = normalizeOffer(product);
        if (!offer) continue;

        const price = parseFloat(String(offer.price || offer.lowPrice));
        if (!price || price <= 0 || !isFinite(price)) continue;

        products.push({
          name: product.name || "Unknown",
          price,
          sourceProductId: product.sku || product.productID,
          category: product.category,
          imageUrl: typeof product.image === "string" ? product.image : product.image?.url,
        });
      }
    } catch {
      // Skip malformed JSON-LD blocks
    }
  });

  return products;
}

/** Flatten nested JSON-LD (handles @graph arrays, nested types) */
function flattenJsonLd(json: any): any[] {
  if (Array.isArray(json)) {
    return json.flatMap(flattenJsonLd);
  }
  if (json?.["@graph"]) {
    return flattenJsonLd(json["@graph"]);
  }
  return [json];
}

/** Check if a @type is a Product variant */
function isProductType(type: string | string[] | undefined): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some(t =>
    t === "Product" || t === "schema:Product" || t === "https://schema.org/Product",
  );
}

/** Normalize offer from different JSON-LD patterns */
function normalizeOffer(product: JsonLdProduct): JsonLdOffer | null {
  const offer = product.offers || product.offer;
  if (!offer) return null;

  // AggregateOffer or array of offers — take the first/lowest
  if (Array.isArray(offer)) {
    return offer[0] || null;
  }

  return offer;
}
