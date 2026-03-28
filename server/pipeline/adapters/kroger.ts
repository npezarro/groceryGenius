/**
 * Kroger Product API adapter.
 *
 * Kroger's public API (developer.kroger.com) provides access to product search
 * and pricing across all Kroger-owned banners. Requires KROGER_CLIENT_ID and
 * KROGER_CLIENT_SECRET environment variables.
 *
 * API flow:
 * 1. OAuth2 client_credentials grant for access token
 * 2. Search products by term at a specific location
 * 3. Extract pricing from product data
 */

import type { SourceAdapter, RawProduct, StoreDetails } from "../types";

const TOKEN_URL = "https://api.kroger.com/v1/connect/oauth2/token";
const PRODUCTS_URL = "https://api.kroger.com/v1/products";
const LOCATIONS_URL = "https://api.kroger.com/v1/locations";

/** Common grocery search terms to query for price data */
const SEARCH_TERMS = [
  "milk", "eggs", "bread", "butter", "cheese", "yogurt",
  "chicken", "beef", "pork", "salmon", "shrimp",
  "rice", "pasta", "flour", "sugar", "oil",
  "bananas", "apples", "oranges", "strawberries", "avocado",
  "tomatoes", "onions", "potatoes", "lettuce", "broccoli",
  "cereal", "coffee", "tea", "juice", "water",
];

export class KrogerAdapter implements SourceAdapter {
  readonly sourceId = "kroger";
  readonly sourceName = "Kroger";

  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = process.env.KROGER_CLIENT_ID || "";
    this.clientSecret = process.env.KROGER_CLIENT_SECRET || "";
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=product.compact",
    });

    if (!response.ok) {
      throw new Error(`Kroger auth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    // Expire 60s early to avoid edge cases
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /** Find the nearest Kroger location to a zip code */
  async findLocation(zipCode: string): Promise<string | null> {
    const details = await this.findLocationDetails(zipCode);
    return details?.locationId ?? null;
  }

  /** Find nearest Kroger location with full details (name, address, coordinates) */
  async findLocationDetails(zipCode: string): Promise<{
    locationId: string;
    chain: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `${LOCATIONS_URL}?filter.zipCode.near=${zipCode}&filter.limit=1`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );

    if (!response.ok) return null;
    const data = await response.json() as {
      data?: Array<{
        locationId: string;
        chain: string;
        name: string;
        address: { addressLine1: string; city: string; state: string; zipCode: string };
        geolocation: { latitude: number; longitude: number };
      }>;
    };
    const loc = data.data?.[0];
    if (!loc) return null;

    return {
      locationId: loc.locationId,
      chain: loc.chain,
      name: loc.name,
      address: `${loc.address.addressLine1}, ${loc.address.city}, ${loc.address.state} ${loc.address.zipCode}`,
      lat: loc.geolocation.latitude,
      lng: loc.geolocation.longitude,
    };
  }

  async fetchProducts(storeId: string, zipCode: string): Promise<RawProduct[]> {
    if (!this.isConfigured()) {
      throw new Error("Kroger API not configured. Set KROGER_CLIENT_ID and KROGER_CLIENT_SECRET.");
    }

    const token = await this.getAccessToken();
    // If storeId is "auto", find the nearest location
    const locationId = storeId === "auto" ? await this.findLocation(zipCode) : storeId;
    if (!locationId) {
      throw new Error(`No Kroger location found near ${zipCode}`);
    }

    const allProducts: RawProduct[] = [];

    for (const term of SEARCH_TERMS) {
      try {
        const url = `${PRODUCTS_URL}?filter.term=${encodeURIComponent(term)}&filter.locationId=${locationId}&filter.limit=20`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (!response.ok) {
          console.warn(`Kroger search for "${term}" failed: ${response.status}`);
          continue;
        }

        const data = await response.json() as {
          data?: Array<{
            productId: string;
            description: string;
            items?: Array<{
              price?: { regular: number; promo?: number };
              size?: string;
            }>;
            categories?: string[];
            images?: Array<{ perspective: string; sizes: Array<{ url: string }> }>;
          }>;
        };

        if (!data.data) continue;

        for (const product of data.data) {
          const item = product.items?.[0];
          if (!item?.price?.regular) continue;

          const raw: RawProduct = {
            name: product.description,
            price: item.price.promo ?? item.price.regular,
            unit: item.size || undefined,
            isPromotion: item.price.promo != null && item.price.promo < item.price.regular,
            originalPrice: item.price.promo != null ? item.price.regular : undefined,
            category: product.categories?.[0],
            sourceProductId: product.productId,
            imageUrl: product.images?.[0]?.sizes?.[0]?.url,
          };

          allProducts.push(raw);
        }

        // Rate limit: 10 requests per second max
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        console.error(`Kroger search error for "${term}":`, err);
      }
    }

    return allProducts;
  }

  async resolveStoreDetails(zipCode: string): Promise<StoreDetails | null> {
    if (!this.isConfigured()) return null;
    const details = await this.findLocationDetails(zipCode);
    if (!details) return null;
    return {
      name: details.name,
      address: details.address,
      lat: details.lat,
      lng: details.lng,
    };
  }
}
