// Names the place at a point ("Atlanta", "Georgia, United States") for the dashboard header.
// Mapbox reverse geocoding v6: https://docs.mapbox.com/api/search/geocoding/#reverse-geocoding
//
// A nice-to-have: any failure or unexpected response returns null and the dashboard
// falls back to "Dropped pin". The country used for data (NWS) still comes from
// mapboxReverseGeocoding.client.ts.
import { z } from "zod";
import { fetchJson, type HttpOptions } from "../../lib/http.js";

export interface PlaceName {
  /** Most specific name available: town/city, else region, else country. */
  name: string;
  /** The rest, e.g. "Georgia, United States". */
  context?: string;
}

const responseSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        name: z.string().nullish(),
        name_preferred: z.string().nullish(),
        place_formatted: z.string().nullish(),
      }),
    }),
  ),
});

export async function fetchPlaceName(
  lat: number,
  lng: number,
  accessToken: string,
  options: Pick<HttpOptions, "fetch" | "signal" | "timeoutMs"> = {},
): Promise<PlaceName | null> {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/reverse");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  // One feature per type comes back, most specific first.
  url.searchParams.set("types", "place,region,country");
  url.searchParams.set("access_token", accessToken.trim());

  const parsed = responseSchema.safeParse(await fetchJson(url, { ...options, service: "Mapbox" }));
  if (!parsed.success) return null;
  for (const feature of parsed.data.features) {
    const name = (feature.properties.name_preferred ?? feature.properties.name)?.trim();
    if (name) {
      const context = feature.properties.place_formatted?.trim();
      return context ? { name, context } : { name };
    }
  }
  return null; // open ocean, Antarctica
}
