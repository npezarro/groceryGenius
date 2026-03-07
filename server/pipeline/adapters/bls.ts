/**
 * Bureau of Labor Statistics (BLS) Average Price adapter.
 *
 * The BLS publishes monthly average retail food prices for US cities
 * through their public API. This provides real, government-collected
 * price data for common grocery items.
 *
 * API: https://api.bls.gov/publicAPI/v2/timeseries/data/
 * No API key required for v2 (limited to 25 series per query, 500/day).
 *
 * Series IDs follow the pattern APU0000[item_code]:
 * - APU0000 = US city average (0000 = all urban areas)
 * - Followed by the item code from the CPI survey
 *
 * The SF-Oakland-Hayward area code is "0400" but most food price
 * series only exist for "0000" (national average). We use national
 * averages as reasonable estimates for SF pricing.
 */

import type { SourceAdapter, RawProduct } from "../types";

const BLS_API = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

/** BLS series IDs for common grocery items with their human-readable names */
const FOOD_SERIES: Array<{ seriesId: string; name: string; unit: string; category: string }> = [
  // Dairy & Eggs
  { seriesId: "APU0000708111", name: "Eggs, grade A, large", unit: "dozen", category: "Dairy & Eggs" },
  { seriesId: "APU0000709112", name: "Milk, fresh, whole, fortified", unit: "gal", category: "Dairy & Eggs" },
  { seriesId: "APU0000710211", name: "Butter, salted, grade AA, stick", unit: "lb", category: "Dairy & Eggs" },
  { seriesId: "APU0000710212", name: "American processed cheese", unit: "lb", category: "Dairy & Eggs" },
  { seriesId: "APU0000710411", name: "Cheddar cheese, natural", unit: "lb", category: "Dairy & Eggs" },
  { seriesId: "APU0000709211", name: "Milk, fresh, low fat", unit: "gal", category: "Dairy & Eggs" },
  // Bread & Bakery
  { seriesId: "APU0000702111", name: "White bread", unit: "lb", category: "Bakery" },
  { seriesId: "APU0000702212", name: "Bread, whole wheat", unit: "lb", category: "Bakery" },
  // Meat & Poultry
  { seriesId: "APU0000703111", name: "Ground chuck, 100% beef", unit: "lb", category: "Meat" },
  { seriesId: "APU0000703112", name: "Ground beef, 100% beef", unit: "lb", category: "Meat" },
  { seriesId: "APU0000703211", name: "Chuck roast, USDA Choice, boneless", unit: "lb", category: "Meat" },
  { seriesId: "APU0000703311", name: "Round steak, USDA Choice, boneless", unit: "lb", category: "Meat" },
  { seriesId: "APU0000704111", name: "Bacon, sliced", unit: "lb", category: "Meat" },
  { seriesId: "APU0000704211", name: "Chops, center cut, bone-in", unit: "lb", category: "Meat" },
  { seriesId: "APU0000705111", name: "Chicken breast, bone-in", unit: "lb", category: "Meat" },
  { seriesId: "APU0000706111", name: "Tuna, light, chunk", unit: "each", category: "Seafood" },
  // Produce
  { seriesId: "APU0000711111", name: "Bananas", unit: "lb", category: "Produce" },
  { seriesId: "APU0000711211", name: "Apples, Red Delicious", unit: "lb", category: "Produce" },
  { seriesId: "APU0000711311", name: "Oranges, Navel", unit: "lb", category: "Produce" },
  { seriesId: "APU0000712112", name: "Strawberries, dry pint", unit: "each", category: "Produce" },
  { seriesId: "APU0000712211", name: "Potatoes, white", unit: "lb", category: "Produce" },
  { seriesId: "APU0000712311", name: "Lettuce, iceberg", unit: "each", category: "Produce" },
  { seriesId: "APU0000712411", name: "Tomatoes, field grown", unit: "lb", category: "Produce" },
  // Pantry
  { seriesId: "APU0000701111", name: "Flour, white, all purpose", unit: "lb", category: "Pantry" },
  { seriesId: "APU0000701211", name: "Rice, white, long grain, uncooked", unit: "lb", category: "Pantry" },
  { seriesId: "APU0000701312", name: "Spaghetti and macaroni", unit: "lb", category: "Pantry" },
  { seriesId: "APU0000715211", name: "Sugar, white, all sizes", unit: "lb", category: "Pantry" },
  // Beverages
  { seriesId: "APU0000717311", name: "Coffee, 100%, ground roast", unit: "lb", category: "Beverages" },
  { seriesId: "APU0000713111", name: "Orange juice, frozen concentrate", unit: "each", category: "Beverages" },
];

export class BLSAdapter implements SourceAdapter {
  readonly sourceId = "bls";
  readonly sourceName = "BLS Average Prices";

  private apiKey: string;

  constructor() {
    // Optional: BLS_API_KEY for higher rate limits (v2 registration key)
    this.apiKey = process.env.BLS_API_KEY || "";
  }

  isConfigured(): boolean {
    // Works without an API key (v2 public access)
    return true;
  }

  async fetchProducts(_storeId: string, _zipCode: string): Promise<RawProduct[]> {
    const allProducts: RawProduct[] = [];

    // BLS API allows up to 25 series per request
    const batchSize = 25;
    for (let i = 0; i < FOOD_SERIES.length; i += batchSize) {
      const batch = FOOD_SERIES.slice(i, i + batchSize);
      const seriesIds = batch.map(s => s.seriesId);

      try {
        const currentYear = new Date().getFullYear();
        const body: any = {
          seriesid: seriesIds,
          startyear: String(currentYear - 1),
          endyear: String(currentYear),
        };
        if (this.apiKey) {
          body.registrationkey = this.apiKey;
        }

        const response = await fetch(BLS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          console.warn(`[bls] API returned ${response.status}`);
          continue;
        }

        const data = await response.json() as {
          status: string;
          Results?: {
            series: Array<{
              seriesID: string;
              data: Array<{
                year: string;
                period: string;
                value: string;
                latest?: string;
              }>;
            }>;
          };
        };

        if (data.status !== "REQUEST_SUCCEEDED" || !data.Results?.series) {
          console.warn("[bls] API request did not succeed:", data.status);
          continue;
        }

        for (const series of data.Results.series) {
          const meta = FOOD_SERIES.find(s => s.seriesId === series.seriesID);
          if (!meta) continue;

          // Get the most recent data point
          const latest = series.data[0]; // BLS returns most recent first
          if (!latest) continue;

          const price = parseFloat(latest.value);
          if (!price || price <= 0) continue;

          allProducts.push({
            name: meta.name,
            price,
            unit: meta.unit,
            category: meta.category,
            sourceProductId: series.seriesID,
          });
        }

        console.log(`[bls] Batch ${Math.floor(i / batchSize) + 1}: fetched ${batch.length} series`);
        // Rate limit: 1 second between batch requests
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error("[bls] API error:", err);
      }
    }

    return allProducts;
  }
}
