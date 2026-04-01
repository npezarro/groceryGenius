import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeWithNominatim, geocodeAddress } from "../lib/geocoding";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  delete process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.MAPBOX_TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── geocodeWithNominatim ──

describe("geocodeWithNominatim", () => {
  it("returns coordinates from Nominatim response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "37.7749", lon: "-122.4194" }],
    });
    const result = await geocodeWithNominatim("San Francisco, CA");
    expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
  });

  it("returns null when Nominatim returns empty array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    const result = await geocodeWithNominatim("nonexistent-place-xyz");
    expect(result).toBeNull();
  });

  it("returns null when Nominatim responds with non-OK status", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await geocodeWithNominatim("test address");
    expect(result).toBeNull();
  });

  it("encodes the address for URL safety", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    await geocodeWithNominatim("123 Main St #4, San José");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("123%20Main%20St%20%234%2C%20San%20Jos%C3%A9"),
      expect.any(Object),
    );
  });

  it("sends GroceryGenius user-agent header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    await geocodeWithNominatim("test");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { "User-Agent": "GroceryGenius/1.0" },
      }),
    );
  });

  it("parses lat/lng as floats from string values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: "49.2827", lon: "-123.1207" }],
    });
    const result = await geocodeWithNominatim("Vancouver, BC");
    expect(typeof result!.lat).toBe("number");
    expect(typeof result!.lng).toBe("number");
  });
});

// ── geocodeAddress ──

describe("geocodeAddress", () => {
  describe("without Mapbox token", () => {
    it("falls back to Nominatim", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: "40.7128", lon: "-74.0060" }],
      });
      const result = await geocodeAddress("New York, NY");
      expect(result).toEqual({ lat: 40.7128, lng: -74.006 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("nominatim.openstreetmap.org"),
        expect.any(Object),
      );
    });

    it("returns null when Nominatim returns no results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      const result = await geocodeAddress("nonexistent-place");
      expect(result).toBeNull();
    });

    it("returns null when Nominatim throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await geocodeAddress("test");
      expect(result).toBeNull();
    });
  });

  describe("with MAPBOX_ACCESS_TOKEN", () => {
    beforeEach(() => {
      process.env.MAPBOX_ACCESS_TOKEN = "pk.test-token-123";
    });

    it("uses Mapbox API when token is set", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ center: [-122.4194, 37.7749] }],
        }),
      });
      const result = await geocodeAddress("San Francisco, CA");
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("api.mapbox.com"),
      );
    });

    it("includes the access token in Mapbox URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [{ center: [0, 0] }] }),
      });
      await geocodeAddress("test");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("access_token=pk.test-token-123"),
      );
    });

    it("returns null when Mapbox returns no features", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [] }),
      });
      // Nominatim fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });
      const result = await geocodeAddress("nowhere-place");
      expect(result).toBeNull();
    });

    it("falls back to Nominatim when Mapbox returns non-OK", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: "Unauthorized",
      });
      // Nominatim fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: "51.5074", lon: "-0.1278" }],
      });
      const result = await geocodeAddress("London, UK");
      expect(result).toEqual({ lat: 51.5074, lng: -0.1278 });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("falls back to Nominatim when Mapbox throws", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Mapbox network error"));
      // Nominatim fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: "48.8566", lon: "2.3522" }],
      });
      const result = await geocodeAddress("Paris, France");
      expect(result).toEqual({ lat: 48.8566, lng: 2.3522 });
    });
  });

  describe("with MAPBOX_TOKEN (alternative env var)", () => {
    it("also accepts MAPBOX_TOKEN", async () => {
      process.env.MAPBOX_TOKEN = "pk.alt-token-456";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ center: [-73.9857, 40.7484] }],
        }),
      });
      const result = await geocodeAddress("Empire State Building");
      expect(result).toEqual({ lat: 40.7484, lng: -73.9857 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("access_token=pk.alt-token-456"),
      );
    });
  });

  describe("with both Mapbox and Nominatim failing", () => {
    it("returns null when both services fail", async () => {
      process.env.MAPBOX_ACCESS_TOKEN = "pk.test";
      // Mapbox throws
      mockFetch.mockRejectedValueOnce(new Error("Mapbox down"));
      // Nominatim throws
      mockFetch.mockRejectedValueOnce(new Error("Nominatim down"));
      const result = await geocodeAddress("anywhere");
      expect(result).toBeNull();
    });
  });
});
