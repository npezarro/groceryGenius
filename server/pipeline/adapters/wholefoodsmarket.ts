/**
 * Whole Foods Market product data adapter.
 *
 * Whole Foods pages are served through Amazon's infrastructure as a
 * client-side rendered SPA. Product listing pages include Amazon
 * product tiles with some pricing data in the server-rendered HTML.
 *
 * This adapter extracts what's available from the server-rendered
 * Amazon product cards (product names, Prime pricing, categories).
 * Full regular pricing requires JavaScript execution (Playwright).
 *
 * For complete price coverage, configure the Amazon Product
 * Advertising API credentials (future enhancement).
 */

import * as cheerio from "cheerio";
import type { SourceAdapter, RawProduct } from "../types";

const BASE_URL = "https://www.wholefoodsmarket.com";

const BROWSE_PATHS = [
  "/products/produce",
  "/products/dairy-eggs",
  "/products/meat",
  "/products/bakery",
  "/products/pantry-essentials",
];

export class WholeFoodsAdapter implements SourceAdapter {
  readonly sourceId = "wholefoods";
  readonly sourceName = "Whole Foods Market";

  isConfigured(): boolean {
    return true;
  }

  async fetchProducts(_storeId: string, _zipCode: string): Promise<RawProduct[]> {
    const allProducts: RawProduct[] = [];

    for (const path of BROWSE_PATHS) {
      try {
        const url = `${BASE_URL}${path}`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
          redirect: "follow",
        });

        if (!response.ok) {
          console.warn(`[wholefoods] ${path} returned ${response.status}`);
          continue;
        }

        const html = await response.text();
        const products = this.extractProducts(html, path);
        allProducts.push(...products);
        console.log(`[wholefoods] ${path}: extracted ${products.length} products`);

        // Rate limit: 2 seconds between pages
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[wholefoods] ${path} error:`, err);
      }
    }

    return allProducts;
  }

  private extractProducts(html: string, categoryPath: string): RawProduct[] {
    const $ = cheerio.load(html);
    const products: RawProduct[] = [];
    const category = categoryPath.split("/").pop()?.replace(/-/g, " ") || "General";

    // Extract from JSON-LD (if any embedded product schema)
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
            category,
            sourceProductId: item.sku || item.productID,
            imageUrl: typeof item.image === "string" ? item.image : item.image?.url,
          });
        }
      } catch { /* skip malformed JSON-LD */ }
    });

    // Amazon-style product result items
    $("[data-component-type='s-search-result'], .s-result-item").each((_, el) => {
      const $el = $(el);
      const name = $el.find("h2 a span, .a-text-normal").first().text().trim();

      // Amazon price pattern: whole + fraction spans
      const wholePart = $el.find(".a-price-whole").first().text().replace(",", "").trim();
      const fractionPart = $el.find(".a-price-fraction").first().text().trim();
      const offscreen = $el.find(".a-offscreen").first().text().trim();

      let price: number | null = null;
      if (wholePart && fractionPart) {
        price = parseFloat(`${wholePart}.${fractionPart}`);
      } else if (offscreen) {
        const match = offscreen.match(/\$?([\d,]+\.?\d*)/);
        if (match) price = parseFloat(match[1].replace(",", ""));
      }

      if (!name || !price || price <= 0) return;

      // Check for Prime member pricing
      const primeText = $el.find("[id*='prime-upsell']").text();
      const primePriceMatch = primeText.match(/\$([\d.]+)/);
      const memberPrice = primePriceMatch ? parseFloat(primePriceMatch[1]) : undefined;

      products.push({
        name,
        price,
        unit: extractUnit(name),
        category,
        memberPrice,
        loyaltyRequired: memberPrice != null,
        sourceProductId: $el.attr("data-asin") || undefined,
      });
    });

    return products;
  }
}

function parsePrice(text: string): number | null {
  if (!text) return null;
  const match = text.match(/\$?([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

function extractUnit(name: string): string | undefined {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(oz|fl\s*oz|lb|lbs|gal|gallon|qt|pt|ml|l|kg|g|ct|count|pack|pk)\b/i);
  return match ? match[2].toLowerCase() : undefined;
}
