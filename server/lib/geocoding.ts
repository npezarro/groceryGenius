/**
 * Geocoding utilities — Mapbox primary, Nominatim (OpenStreetMap) fallback.
 */

export async function geocodeWithNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  const encodedAddress = encodeURIComponent(address);
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1`,
    { headers: { "User-Agent": "GroceryGenius/1.0" } }
  );
  if (!response.ok) return null;
  const data = await response.json();
  if (data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_TOKEN;

  if (mapboxToken) {
    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1`
      );
      if (!response.ok) throw new Error(`Mapbox API error: ${response.statusText}`);
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        return { lat, lng };
      }
      return null;
    } catch (error) {
      console.error("Mapbox geocoding error, falling back to Nominatim:", error);
    }
  }

  // Fallback to Nominatim (no API key required)
  try {
    return await geocodeWithNominatim(address);
  } catch (error) {
    console.error("Nominatim geocoding error:", error);
    return null;
  }
}
