// server/mock-data.ts
import type { InsertStore, InsertItem } from "@shared/schema";

// 3 SF stores with coordinates so distance/radius logic works out of the box
export const mockStores: InsertStore[] = [
  {
    name: "Trader Joe's — Stonestown",
    address: "501 Buckingham Way, San Francisco, CA 94132",
    lat: 37.7289,
    lng: -122.4769,
    hoursJson: { mon_fri: "8am–9pm", sat_sun: "8am–9pm" }
  },
  {
    name: "Safeway — Market St",
    address: "2020 Market St, San Francisco, CA 94114",
    lat: 37.7693,
    lng: -122.4280,
    hoursJson: { daily: "6am–11pm" }
  },
  {
    name: "Whole Foods — SoMa",
    address: "399 4th St, San Francisco, CA 94107",
    lat: 37.7806,
    lng: -122.4007,
    hoursJson: { daily: "8am–10pm" }
  }
];

export const mockItems: InsertItem[] = [
  { name: "Milk", descriptor: "1 gallon", unit: "gallon" },
  { name: "Eggs", descriptor: "12 count", unit: "dozen" },
  { name: "Bread", descriptor: "loaf", unit: "loaf" },
  { name: "Bananas", descriptor: "per lb", unit: "lb", organicConventional: "conventional" },
  { name: "Chicken breast", descriptor: "per lb", unit: "lb" },
  { name: "Rice", descriptor: "2 lb bag", unit: "lb" },
  { name: "Pasta", descriptor: "1 lb", unit: "lb" },
  { name: "Tomatoes", descriptor: "per lb", unit: "lb" },
  { name: "Cheddar cheese", descriptor: "8 oz", unit: "oz" },
  { name: "Coffee", descriptor: "12 oz beans", unit: "oz" }
];

// A compact shape so we can map by names after insert
export type MockPriceRow = {
  storeName: string;
  itemName: string;
  price: number;
  unit?: string;
  quantity?: number;
  priceType?: string;
  isPromotion?: boolean;
  originalPrice?: number;
  promotionText?: string;
  promotionStartDate?: Date;
  promotionEndDate?: Date;
  memberPrice?: number;
  loyaltyRequired?: boolean;
};

const now = new Date();
const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

export const mockPricesByStore: MockPriceRow[] = [
  // Trader Joe's — budget baseline
  { storeName: "Trader Joe's — Stonestown", itemName: "Milk", price: 4.49, unit: "gallon" },
  { storeName: "Trader Joe's — Stonestown", itemName: "Eggs", price: 2.99, unit: "dozen" },
  { storeName: "Trader Joe's — Stonestown", itemName: "Bread", price: 2.99, unit: "loaf" },
  { storeName: "Trader Joe's — Stonestown", itemName: "Bananas", price: 0.69, unit: "lb", quantity: 1 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Chicken breast", price: 4.99, unit: "lb", quantity: 1 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Rice", price: 1.49, unit: "lb", quantity: 2 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Pasta", price: 1.29, unit: "lb", quantity: 1 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Tomatoes", price: 1.99, unit: "lb", quantity: 1 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Cheddar cheese", price: 3.49, unit: "oz", quantity: 8 },
  { storeName: "Trader Joe's — Stonestown", itemName: "Coffee", price: 8.99, unit: "oz", quantity: 12 },

  // Safeway — promo + club/member pricing
  { storeName: "Safeway — Market St", itemName: "Milk", price: 5.49, unit: "gallon" },
  { storeName: "Safeway — Market St", itemName: "Eggs", price: 2.99, unit: "dozen", isPromotion: true, originalPrice: 4.49, promotionText: "Club Price", promotionStartDate: now, promotionEndDate: inTwoWeeks, loyaltyRequired: true },
  { storeName: "Safeway — Market St", itemName: "Bread", price: 3.99, unit: "loaf" },
  { storeName: "Safeway — Market St", itemName: "Bananas", price: 0.79, unit: "lb", quantity: 1 },
  { storeName: "Safeway — Market St", itemName: "Chicken breast", price: 5.99, unit: "lb", quantity: 1 },
  { storeName: "Safeway — Market St", itemName: "Rice", price: 1.29, unit: "lb", quantity: 2 },
  { storeName: "Safeway — Market St", itemName: "Pasta", price: 1.49, unit: "lb", quantity: 1 },
  { storeName: "Safeway — Market St", itemName: "Tomatoes", price: 2.49, unit: "lb", quantity: 1 },
  { storeName: "Safeway — Market St", itemName: "Cheddar cheese", price: 3.99, unit: "oz", quantity: 8, memberPrice: 3.49, loyaltyRequired: true },
  { storeName: "Safeway — Market St", itemName: "Coffee", price: 9.99, unit: "oz", quantity: 12 },

  // Whole Foods — member price (Prime) scenario
  { storeName: "Whole Foods — SoMa", itemName: "Milk", price: 5.99, unit: "gallon", memberPrice: 4.99, loyaltyRequired: true },
  { storeName: "Whole Foods — SoMa", itemName: "Eggs", price: 4.99, unit: "dozen" },
  { storeName: "Whole Foods — SoMa", itemName: "Bread", price: 4.49, unit: "loaf" },
  { storeName: "Whole Foods — SoMa", itemName: "Bananas", price: 0.69, unit: "lb", quantity: 1 },
  { storeName: "Whole Foods — SoMa", itemName: "Chicken breast", price: 6.99, unit: "lb", quantity: 1 },
  { storeName: "Whole Foods — SoMa", itemName: "Rice", price: 1.79, unit: "lb", quantity: 2 },
  { storeName: "Whole Foods — SoMa", itemName: "Pasta", price: 1.79, unit: "lb", quantity: 1 },
  { storeName: "Whole Foods — SoMa", itemName: "Tomatoes", price: 2.99, unit: "lb", quantity: 1 },
  { storeName: "Whole Foods — SoMa", itemName: "Cheddar cheese", price: 4.49, unit: "oz", quantity: 8 },
  { storeName: "Whole Foods — SoMa", itemName: "Coffee", price: 12.49, unit: "oz", quantity: 12 }
];