import { TripPlan, LocationCoordinates } from "./types";

export function getSemanticLabel(plan: TripPlan, allPlans: TripPlan[]): { label: string; color: string } {
  if (allPlans.length <= 1) return { label: "Best Overall", color: "text-yellow-600" };

  const bestScore = Math.max(...allPlans.map(p => p.score));
  const lowestCost = Math.min(...allPlans.map(p => p.totalCost));
  const bestCoverage = Math.max(...allPlans.map(p => p.coverage));
  const shortestTime = Math.min(...allPlans.map(p => p.totalTime));

  if (plan.score === bestScore) return { label: "Best Overall", color: "text-yellow-600" };
  if (plan.totalCost === lowestCost) return { label: "Best Price", color: "text-green-600" };
  if (plan.coverage === bestCoverage && plan.coverage > 0) return { label: "Best Coverage", color: "text-blue-600" };
  if (plan.totalTime === shortestTime) return { label: "Quickest Trip", color: "text-purple-600" };

  if (plan.score >= 80) return { label: "Great Option", color: "text-yellow-600" };
  if (plan.score >= 50) return { label: "Good Option", color: "text-muted-foreground" };
  return { label: "Alternative", color: "text-muted-foreground" };
}

export function formatTripTime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function storeMapQuery(store: { address: string; lat?: number; lng?: number; name: string }): string {
  // Prefer actual address over coordinates if address looks real (not just "94102 area")
  if (store.address && !store.address.match(/^\d{5}\s*area$/i)) {
    return encodeURIComponent(store.address);
  }
  if (store.lat && store.lng) {
    return `${store.lat},${store.lng}`;
  }
  // Last resort: search by store name
  return encodeURIComponent(store.name);
}

export function generateGoogleMapsLink(plan: TripPlan, userCoordinates: LocationCoordinates | null | undefined): string {
  if (!userCoordinates) return "#";

  const origin = `${userCoordinates.lat},${userCoordinates.lng}`;
  const waypoints = plan.stores.map(s => storeMapQuery(s.store)).join('/');

  return `https://www.google.com/maps/dir/${origin}/${waypoints}`;
}

export function generateAppleMapsLink(plan: TripPlan, userCoordinates: LocationCoordinates | null | undefined): string {
  if (!userCoordinates) return "#";

  const firstStore = plan.stores[0];
  if (!firstStore) return "#";

  const dest = storeMapQuery(firstStore.store);
  return `http://maps.apple.com/?saddr=${userCoordinates.lat},${userCoordinates.lng}&daddr=${dest}`;
}
