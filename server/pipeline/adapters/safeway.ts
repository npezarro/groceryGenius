/**
 * Safeway/Albertsons structured data extractor.
 *
 * Extracts product pricing from Safeway's publicly accessible product pages.
 * Uses fetch + cheerio to parse HTML and extract JSON-LD product markup
 * and structured pricing data.
 *
 * Note: Safeway product pages embed schema.org/Product JSON-LD for SEO,
 * which contains current pricing. This is machine-readable data explicitly
 * published for search engine consumption.
 */

import * as cheerio from "cheerio";
import type { SourceAdapter, RawProduct } from "../types";

const BASE_URL = "https://www.safeway.com";

/** Common product search terms for building a price database */
const SEARCH_TERMS = [
  "milk", "eggs", "bread", "butter", "cheese",
  "chicken breast", "ground beef", "salmon",
  "rice", "pasta", "flour", "sugar",
  "bananas", "apples", "oranges", "avocado",
  "tomatoes", "onions", "potatoes", "lettuce",
  "cereal", "coffee", "orange juice",
  "yogurt", "sour cream", "cream cheese",
];

export class SafewayAdapter implements SourceAdapter {
  readonly sourceId = "safeway";
  readonly sourceName = "Safeway";

  isConfigured(): boolean {
    return true;
  }

  async fetchProducts(storeId: string, zipCode: string): Promise<RawProduct[]> {
    const allProducts: RawProduct[] = [];

    for (const term of SEARCH_TERMS) {
      try {
        const products = await this.searchProducts(term, storeId, zipCode);
        allProducts.push(...products);
        // Rate limit: 1 request per second
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Safeway search for "${term}" failed:`, err);
      }
    }

    return allProducts;
  }

  private async searchProducts(query: string, _storeId: string, _zipCode: string): Promise<RawProduct[]> {
    const url = `${BASE_URL}/shop/search-results.html?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`Safeway search returned ${response.status} for "${query}"`);
      return [];
    }

    const html = await response.text();
    return this.extractFromHtml(html);
  }

  /** Extract product data from JSON-LD and structured HTML */
  private extractFromHtml(html: string): RawProduct[] {
    const $ = cheerio.load(html);
    const products: RawProduct[] = [];

    // Try JSON-LD first (most reliable)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || "");
        const items = Array.isArray(json) ? json : json["@graph"] || [json];

        for (const item of items) {
          if (item["@type"] !== "Product") continue;
          const offer = item.offers || item.offer;
          if (!offer) continue;

          const price = parseFloat(offer.price || offer.lowPrice);
          if (!price || price <= 0) continue;

          products.push({
            name: item.name,
            price,
            unit: extractUnit(item.name),
            category: item.category,
            sourceProductId: item.sku || item.productID,
            imageUrl: typeof item.image === "string" ? item.image : item.image?.url,
          });
        }
      } catch {
        // Skip invalid JSON-LD blocks
      }
    });

    // Fallback: parse product cards from HTML
    if (products.length === 0) {
      $('[data-testid="product-card"], .product-card, .product-item').each((_, el) => {
        const $el = $(el);
        const name = $el.find('[data-testid="product-title"], .product-title, .product-name').text().trim();
        const priceText = $el.find('[data-testid="product-price"], .product-price, .price').text().trim();

        const price = parsePrice(priceText);
        if (!name || !price) return;

        const memberPriceText = $el.find('.member-price, .club-price, [data-testid="member-price"]').text().trim();
        const memberPrice = parsePrice(memberPriceText);

        products.push({
          name,
          price: memberPrice || price,
          unit: extractUnit(name),
          isPromotion: memberPrice != null && memberPrice < price,
          originalPrice: memberPrice != null ? price : undefined,
          memberPrice: memberPrice || undefined,
          loyaltyRequired: memberPrice != null,
        });
      });
    }

    return products;
  }
}

/** Extract price from text like "$3.99", "$3.99/lb", "2 for $5" */
function parsePrice(text: string): number | null {
  if (!text) return null;
  // Handle "2 for $X" pattern
  const multiMatch = text.match(/(\d+)\s*for\s*\$?([\d.]+)/i);
  if (multiMatch) {
    return Math.round(parseFloat(multiMatch[2]) / parseInt(multiMatch[1]) * 100) / 100;
  }
  // Standard price
  const match = text.match(/\$?([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

/** Try to extract unit from product name, e.g. "Milk, 1 Gallon" -> "gallon" */
function extractUnit(name: string): string | undefined {
  const unitPatterns = [
    /(\d+(?:\.\d+)?)\s*(oz|fl\s*oz|lb|lbs|gal|gallon|qt|pt|ml|l|kg|g|ct|count|pack|pk)\b/i,
  ];
  for (const pattern of unitPatterns) {
    const match = name.match(pattern);
    if (match) return match[2].toLowerCase();
  }
  return undefined;
}
