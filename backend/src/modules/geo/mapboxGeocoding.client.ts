export interface GeocodingResult {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
}

interface MapboxFeature {
  id: string;
  geometry: {
    coordinates: [number, number];
  };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
  };
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

const MAPBOX_FORWARD_GEOCODING_URL =
  "https://api.mapbox.com/search/geocode/v6/forward";

export async function forwardGeocode(
  query: string,
  accessToken: string,
): Promise<GeocodingResult[]> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    throw new Error("A location search is required.");
  }

  if (!accessToken.trim()) {
    throw new Error("A Mapbox access token is required.");
  }

  const url = new URL(MAPBOX_FORWARD_GEOCODING_URL);
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("limit", "5");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Mapbox geocoding request failed with status ${response.status}.`,
    );
  }

  const data = (await response.json()) as MapboxGeocodingResponse;

  return (data.features ?? []).map((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;

    const name =
      feature.properties?.full_address ||
      [feature.properties?.name, feature.properties?.place_formatted]
        .filter(Boolean)
        .join(", ") ||
      feature.id;

    return {
      id: feature.id,
      name,
      longitude,
      latitude,
    };
  });
}
