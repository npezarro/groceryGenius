/**
 * Whole Foods Market product data adapter.
 *
 * STATUS: DISABLED — Whole Foods pages are fully client-side rendered SPAs
 * (React on Amazon infrastructure). There is no server-rendered product data
 * in the HTML, so cheerio-based scraping returns 0 items. A headless browser
 * (Playwright/Puppeteer) or the Amazon Product Advertising API would be
 * required for actual data extraction.
 *
 * This adapter currently logs a warning and returns an empty array rather
 * than making futile HTTP requests that will never yield products.
 */

import type { SourceAdapter, RawProduct } from "../types";

export class WholeFoodsAdapter implements SourceAdapter {
  readonly sourceId = "wholefoods";
  readonly sourceName = "Whole Foods Market";

  isConfigured(): boolean {
    return true;
  }

  async fetchProducts(_storeId: string, _zipCode: string): Promise<RawProduct[]> {
    console.warn(
      "[wholefoods] SKIPPED — Whole Foods pages are client-side rendered SPAs. " +
      "No product data is available in server-rendered HTML. " +
      "A headless browser or Amazon Product Advertising API integration is needed. " +
      "Returning 0 products."
    );
    return [];
  }
}
