import type { GeocodingOptions } from "./mapboxGeocoding.client.js";
import { reverseGeocode } from "./mapboxReverseGeocoding.client.js";

/**
 * Builds the existing aggregator's resolveCountry(lat, lng) callback.
 * The integration owner supplies the configured token and wires this callback in app.ts.
 * Factory creation performs no requests; failures remain typed GeocodingErrors for the
 * aggregator's existing error isolation. Caching and integration stay with that owner.
 */
export function createCountryResolver(
  accessToken: string,
  options: GeocodingOptions = {},
): (lat: number, lng: number) => Promise<string | null> {
  return (lat, lng) => reverseGeocode(lat, lng, accessToken, options);
}
