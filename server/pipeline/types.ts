/**
 * Core types for the grocery price data pipeline.
 * Each source adapter produces RawProduct[] which are normalized,
 * validated, and ingested into the existing prices/items/stores tables.
 */

export interface RawProduct {
  /** Product name as scraped/fetched from source */
  name: string;
  /** Price in dollars (e.g. 3.99) */
  price: number;
  /** Unit as listed by source (lb, oz, each, gallon, etc.) */
  unit?: string;
  /** Quantity if specified (e.g. 12 for a 12-pack) */
  quantity?: number;
  /** Whether this is a promotional/sale price */
  isPromotion?: boolean;
  /** Regular (non-sale) price if currently on promotion */
  originalPrice?: number;
  /** Promotion text (e.g. "Club Card Price", "Weekly Deal") */
  promotionText?: string;
  /** Member/loyalty price if different from regular */
  memberPrice?: number;
  /** Whether loyalty card is required for the listed price */
  loyaltyRequired?: boolean;
  /** Product category from source (e.g. "Produce", "Dairy") */
  category?: string;
  /** Product image URL */
  imageUrl?: string;
  /** Source-specific product ID for deduplication */
  sourceProductId?: string;
}

export interface SourceAdapter {
  /** Unique identifier for this source (e.g. "kroger", "traderjoes") */
  readonly sourceId: string;
  /** Human-readable name */
  readonly sourceName: string;
  /** Fetch products from a specific store location */
  fetchProducts(storeId: string, zipCode: string): Promise<RawProduct[]>;
  /** Whether this adapter is configured and ready to use */
  isConfigured(): boolean;
}

export interface ScrapeRun {
  id: string;
  source: string;
  storeId: string;
  status: "running" | "completed" | "failed";
  itemCount: number;
  errorSummary: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PipelineResult {
  source: string;
  storeId: string;
  itemsIngested: number;
  pricesCreated: number;
  errors: string[];
  durationMs: number;
}
