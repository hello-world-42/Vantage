import { z } from "zod";
import { GeocodingError, type GeocodingOptions } from "./mapboxGeocoding.client.js";

const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const countryCodeSchema = z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase());
const responseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    type: z.literal("Feature"),
    properties: z.object({
      feature_type: z.literal("country"),
      context: z.object({
        country: z.object({
          country_code: countryCodeSchema.nullish(),
        }).nullish(),
      }).nullish(),
    }),
  })),
});

/**
 * Resolve coordinates to an uppercase ISO alpha-2 country code, or null if unavailable.
 * Requests only the country layer; never guesses from labels or rectangular bounds.
 * Credentials are passed explicitly; no environment values or files are read here.
 * https://docs.mapbox.com/api/search/geocoding/#reverse-geocoding
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  accessToken: string,
  options: GeocodingOptions = {},
): Promise<string | null> {
  if (!coordinatesSchema.safeParse({ lat, lng }).success) {
    throw new GeocodingError("invalid_input", "Provide valid latitude and longitude coordinates.");
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new GeocodingError("configuration", "Country lookup is not configured.");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new GeocodingError("configuration", "Geocoding timeout must be between 1 and 60000 milliseconds.");
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("types", "country");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", accessToken.trim());
  const signal = AbortSignal.timeout(timeoutMs);
  const transport = options.fetch ?? fetch;

  try {
    const response = await transport(url, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) {
      throw new GeocodingError("http", `Mapbox country lookup failed (HTTP ${response.status}).`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) throw new GeocodingError("timeout", "Country lookup timed out.");
      throw new GeocodingError("invalid_response", "Mapbox returned unreadable country data.");
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new GeocodingError("invalid_response", "Mapbox returned unexpected country data.");
    }
    return parsed.data.features[0]?.properties.context?.country?.country_code ?? null;
  } catch (error) {
    if (error instanceof GeocodingError) throw error;
    if (signal.aborted) throw new GeocodingError("timeout", "Country lookup timed out.");
    // Native fetch errors can contain request URLs. Do not expose or log them.
    throw new GeocodingError("network", "Could not reach the country lookup service.");
  }
}
