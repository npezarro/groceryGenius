export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked?: boolean;
}

export interface SavedShoppingList {
  id: string;
  name: string;
  items: ShoppingListItem[];
  userId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface TripWeights {
  price: number;
  time: number;
  distance: number;
}

export interface TripPlanItem {
  itemId: string;
  itemName: string;
  price: number;
  unit?: string | null;
  quantity?: string | null;
}

export interface TripPlanStore {
  store: {
    id: string;
    name: string;
    address: string;
    lat?: number;
    lng?: number;
  };
  items: TripPlanItem[];
  subtotal: number;
}

export interface TripPlan {
  stores: TripPlanStore[];
  totalCost: number;
  totalTime: number;
  totalDistance: number;
  score: number;
  coverage: number;
}

export interface NearbyStore {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  hoursJson?: unknown;
  createdAt?: string;
}

export interface DataStats {
  storeCount: number;
  itemCount: number;
  priceCount: number;
  geocodedStoreCount: number;
}
