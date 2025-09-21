export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
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

export interface TripPlanStore {
  store: {
    id: string;
    name: string;
    address: string;
    lat?: number;
    lng?: number;
  };
  items: Array<{
    id: string;
    name: string;
  }>;
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

export interface DataStats {
  storeCount: number;
  itemCount: number;
  priceCount: number;
  geocodedStoreCount: number;
}
