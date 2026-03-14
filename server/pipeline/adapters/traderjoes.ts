/**
 * Trader Joe's product data adapter.
 *
 * Trader Joe's website uses a GraphQL API backed by their product catalog.
 * This adapter queries that API with browser-like headers to fetch
 * product data by category.
 *
 * TJ's has consistent nationwide pricing (no per-store variation),
 * so storeId and zipCode are not used for pricing — just for
 * the scrape run record.
 */

import type { SourceAdapter, RawProduct } from "../types";

const GRAPHQL_URL = "https://www.traderjoes.com/api/graphql";

/** Product categories to fetch */
const CATEGORIES = [
  { id: "8", name: "Produce" },
  { id: "9", name: "Meat & Seafood" },
  { id: "10", name: "Dairy & Eggs" },
  { id: "11", name: "Bakery & Desserts" },
  { id: "12", name: "Beverages" },
  { id: "7", name: "Snacks & Sweets" },
  { id: "6", name: "Pantry" },
  { id: "13", name: "Frozen" },
];

const PRODUCT_SEARCH_QUERY = `
  query SearchProducts($categoryId: String!, $currentPage: Int!, $pageSize: Int!) {
    products(
      storeCode: "TJ"
      published: "1"
      categoryId: $categoryId
      currentPage: $currentPage
      pageSize: $pageSize
    ) {
      items {
        sku
        item_title
        sales_size
        sales_uom_description
        retail_price
        fun_tags
        category_hierarchy {
          name
        }
        primary_image
        primary_image_meta {
          url
        }
      }
      total_count
      page_info {
        current_page
        page_size
        total_pages
      }
    }
  }
`;

/** Browser-like headers needed to avoid 403 from TJ's CloudFront */
const BROWSER_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.traderjoes.com",
  "Referer": "https://www.traderjoes.com/home/products/category/food-702",
};

export class TraderJoesAdapter implements SourceAdapter {
  readonly sourceId = "traderjoes";
  readonly sourceName = "Trader Joe's";

  isConfigured(): boolean {
    return true;
  }

  async fetchProducts(_storeId: string, _zipCode: string): Promise<RawProduct[]> {
    const allProducts: RawProduct[] = [];

    for (const category of CATEGORIES) {
      try {
        const response = await fetch(GRAPHQL_URL, {
          method: "POST",
          headers: BROWSER_HEADERS,
          body: JSON.stringify({
            operationName: "SearchProducts",
            query: PRODUCT_SEARCH_QUERY,
            variables: {
              categoryId: category.id,
              currentPage: 1,
              pageSize: 50,
            },
          }),
        });

        if (!response.ok) {
          const status = response.status;
          console.warn(`[traderjoes] Category ${category.name} returned ${status}`);
          // If 403, the API might be blocking us — log and continue
          if (status === 403) {
            console.warn("[traderjoes] 403 from API — CloudFront may be blocking. Consider rotating user-agent.");
          }
          continue;
        }

        const data = await response.json() as {
          data?: {
            products?: {
              items?: Array<{
                sku: string;
                item_title: string;
                sales_size: string;
                sales_uom_description: string;
                retail_price: number;
                fun_tags: string[];
                category_hierarchy: Array<{ name: string }>;
                primary_image: string;
                primary_image_meta: { url: string };
              }>;
              total_count: number;
              page_info: { total_pages: number };
            };
          };
        };

        const items = data?.data?.products?.items;
        if (!items) {
          console.warn(`[traderjoes] No items in response for ${category.name}`);
          continue;
        }

        for (const item of items) {
          if (!item.retail_price || item.retail_price <= 0) continue;

          const raw: RawProduct = {
            name: item.item_title,
            price: item.retail_price,
            unit: item.sales_uom_description || item.sales_size || undefined,
            quantity: parseSize(item.sales_size),
            category: item.category_hierarchy?.[0]?.name || category.name,
            sourceProductId: item.sku,
            imageUrl: item.primary_image_meta?.url || undefined,
          };

          allProducts.push(raw);
        }

        console.log(`[traderjoes] ${category.name}: ${items.length} products`);
        // Rate limit: 1 second between requests
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[traderjoes] ${category.name} error:`, err);
      }
    }

    return allProducts;
  }
}

function parseSize(size: string | undefined): number | undefined {
  if (!size) return undefined;
  const match = size.match(/^(\d+(?:\.\d+)?)\s*/);
  return match ? parseFloat(match[1]) : undefined;
}
