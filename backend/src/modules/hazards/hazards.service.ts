import type { EarthquakeData } from "@vantage/shared/modules/earthquakes";
import { fetchUsgsQuakes, type EarthquakeClientOptions } from "./usgsQuakes.client.js";

/** Great-circle distance, in km; works at the poles and across the antimeridian. */
function distanceKm(lat: number, lng: number, eventLat: number, eventLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(eventLat - lat) / 2) ** 2
    + Math.cos(radians(lat)) * Math.cos(radians(eventLat)) * Math.sin(radians(eventLng - lng) / 2) ** 2;
  return Math.round(6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a)))) * 10) / 10;
}

/**
 * USGS part of the hazards module, applicable worldwide. Keep NWS alerts independent:
 * the integration owner composes these providers without making USGS US-only.
 */
export async function fetchEarthquakes(
  lat: number,
  lng: number,
  options: EarthquakeClientOptions = {},
): Promise<{ status: "ok"; source: "USGS"; data: EarthquakeData }> {
  const response = await fetchUsgsQuakes(lat, lng, options);
  const earthquakes = [...response.features].sort((a, b) => b.properties.time - a.properties.time).map((feature) => {
    const [eventLng, eventLat, depthKm] = feature.geometry.coordinates;
    return {
      id: feature.id, magnitude: feature.properties.mag, place: feature.properties.place,
      occurredAt: new Date(feature.properties.time).toISOString(),
      updatedAt: feature.properties.updated == null ? null : new Date(feature.properties.updated).toISOString(),
      lat: eventLat, lng: eventLng, depthKm, distanceKm: distanceKm(lat, lng, eventLat, eventLng),
      url: feature.properties.url ?? null,
    };
  });
  return { status: "ok", source: "USGS", data: {
    query: response.query, earthquakes, possiblyTruncated: earthquakes.length >= response.query.limit,
    attribution: { text: "Earthquake data by USGS", url: "https://earthquake.usgs.gov/" },
  } };
}
