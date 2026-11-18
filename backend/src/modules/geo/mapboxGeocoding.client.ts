import { z } from "zod";
import type { GeocodeResult } from "@vantage/shared";
import { geocodeQuerySchema } from "@vantage/shared/schemas";

const responseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    id: z.string().trim().min(1),
    geometry: z.object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    }),
    properties: z.object({
      name: z.string().nullable().optional(),
      name_preferred: z.string().nullable().optional(),
      full_address: z.string().nullable().optional(),
      place_formatted: z.string().nullable().optional(),
    }).optional(),
  })),
});

export type GeocodingErrorCode =
  | "invalid_input" | "configuration" | "http" | "timeout" | "network" | "invalid_response";

export class GeocodingError extends Error {
  constructor(
    public readonly code: GeocodingErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GeocodingError";
  }
}

export interface GeocodingOptions {
  /** Defaults to five seconds, covering both headers and response body. */
  timeoutMs?: number;
  /** Inject a transport for tests without making real Mapbox requests. */
  fetch?: typeof fetch;
}

/**
 * Mapbox v6 forward geocoding, normalized directly to the shared frontend contract.
 * GeoJSON coordinates are [longitude, latitude]; output uses named lat/lng fields.
 * Credentials are supplied by the caller. This client does not read environment values.
 * https://docs.mapbox.com/api/search/geocoding/
 */
export async function forwardGeocode(
  query: string,
  accessToken: string,
  options: GeocodingOptions = {},
): Promise<GeocodeResult[]> {
  const parsed = geocodeQuerySchema.safeParse({ q: query });
  if (!parsed.success) {
    throw new GeocodingError("invalid_input", "Provide a location query between 1 and 200 characters.");
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new GeocodingError("configuration", "Location search is not configured.");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new GeocodingError("configuration", "Geocoding timeout must be between 1 and 60000 milliseconds.");
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", parsed.data.q);
  url.searchParams.set("access_token", accessToken.trim());
  url.searchParams.set("limit", "5");
  const signal = AbortSignal.timeout(timeoutMs);
  const transport = options.fetch ?? fetch;

  try {
    const response = await transport(url, { headers: { Accept: "application/json" }, signal });
    if (!response.ok) {
      throw new GeocodingError("http", `Mapbox geocoding failed (HTTP ${response.status}).`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) throw new GeocodingError("timeout", "Location search timed out.");
      throw new GeocodingError("invalid_response", "Mapbox returned unreadable geocoding data.");
    }
    const data = responseSchema.safeParse(body);
    if (!data.success) {
      throw new GeocodingError("invalid_response", "Mapbox returned unexpected geocoding data.");
    }
    return data.data.features.map(({ id, geometry, properties }) => {
      const [lng, lat] = geometry.coordinates;
      const name = properties?.name_preferred?.trim() || properties?.name?.trim()
        || properties?.full_address?.trim() || id;
      const context = properties?.place_formatted?.trim();
      return { id, name, ...(context && context !== name ? { context } : {}), lat, lng };
    });
  } catch (error) {
    if (error instanceof GeocodingError) throw error;
    if (signal.aborted) throw new GeocodingError("timeout", "Location search timed out.");
    // Never log/propagate fetch errors or bodies: they may include a token-bearing URL.
    throw new GeocodingError("network", "Could not reach the location search service.");
  }
}
