/**
 * CSV import row mappers — extracted from routes.ts for testability.
 *
 * Each mapper converts a CSV row (keyed by header) into a partial entity
 * object. The generic `mapCsvToEntities` orchestrator handles parsing,
 * header extraction, quote stripping, and filtering.
 */

import { parseCSV } from "./trip-planner";
import type { InsertStore, InsertItem, InsertPrice } from "@shared/schema";

/** Strip surrounding double-quotes from a CSV cell value. */
function stripQuotes(value: string | undefined): string {
  return value?.replace(/^"|"$/g, '') ?? '';
}

/**
 * Generic CSV-to-entity mapper. Parses CSV text, maps each data row
 * using a column mapper, and filters out invalid rows.
 *
 * @param csvData  Raw CSV string (first row = headers)
 * @param mapRow   Called for each data row with (entity, header, value) to populate fields
 * @param isValid  Predicate — rows that fail are excluded from the result
 * @returns Array of mapped entities
 */
export function mapCsvToEntities<T>(
  csvData: string,
  mapRow: (entity: Partial<T>, header: string, value: string) => void,
  isValid: (entity: Partial<T>) => boolean,
): Partial<T>[] {
  const rows = parseCSV(csvData);
  if (rows.length === 0) return [];

  const headers = rows[0];
  const dataRows = rows.slice(1);

  return dataRows
    .map(row => {
      const entity: Partial<T> = {};
      headers.forEach((header, index) => {
        const value = stripQuotes(row[index]);
        mapRow(entity, header.toLowerCase(), value);
      });
      return entity;
    })
    .filter(isValid);
}

/** Map a CSV row to a store entity. */
export function mapStoreRow(store: Partial<InsertStore>, header: string, value: string): void {
  switch (header) {
    case 'name':
      store.name = value;
      break;
    case 'address':
      store.address = value;
      break;
    case 'lat':
    case 'latitude':
      store.lat = value ? parseFloat(value) : null;
      break;
    case 'lng':
    case 'longitude':
      store.lng = value ? parseFloat(value) : null;
      break;
    case 'hours':
    case 'hours_json':
      try {
        store.hoursJson = value ? JSON.parse(value) : null;
      } catch {
        store.hoursJson = null;
      }
      break;
  }
}

/** A store row is valid if it has both name and address. */
export function isValidStore(store: Partial<InsertStore>): boolean {
  return !!(store.name && store.address);
}

/** Map a CSV row to an item entity. */
export function mapItemRow(item: Partial<InsertItem>, header: string, value: string): void {
  switch (header) {
    case 'name':
      item.name = value;
      break;
    case 'descriptor':
      item.descriptor = value || null;
      break;
    case 'unit':
      item.unit = value || null;
      break;
    case 'organic_conventional':
      item.organicConventional = value || null;
      break;
    case 'bunch_flag':
      item.bunchFlag = value?.toLowerCase() === 'true';
      break;
  }
}

/** An item row is valid if it has a name. */
export function isValidItem(item: Partial<InsertItem>): boolean {
  return !!item.name;
}

/** Map a CSV row to a price entity. */
export function mapPriceRow(price: Partial<InsertPrice>, header: string, value: string): void {
  switch (header) {
    case 'item_id':
      price.itemId = value;
      break;
    case 'store_id':
      price.storeId = value;
      break;
    case 'price_type':
      price.priceType = value || null;
      break;
    case 'price':
      price.price = value;
      break;
    case 'quantity':
      price.quantity = value || null;
      break;
    case 'unit':
      price.unit = value || null;
      break;
    case 'notes':
      price.notes = value || null;
      break;
  }
}

/** A price row is valid if it has itemId, storeId, and price. */
export function isValidPrice(price: Partial<InsertPrice>): boolean {
  return !!(price.itemId && price.storeId && price.price);
}

/** Parse CSV and return store entities. */
export function parseStoresFromCsv(csvData: string): Partial<InsertStore>[] {
  return mapCsvToEntities<InsertStore>(csvData, mapStoreRow, isValidStore);
}

/** Parse CSV and return item entities. */
export function parseItemsFromCsv(csvData: string): Partial<InsertItem>[] {
  return mapCsvToEntities<InsertItem>(csvData, mapItemRow, isValidItem);
}

/** Parse CSV and return price entities. */
export function parsePricesFromCsv(csvData: string): Partial<InsertPrice>[] {
  return mapCsvToEntities<InsertPrice>(csvData, mapPriceRow, isValidPrice);
}
