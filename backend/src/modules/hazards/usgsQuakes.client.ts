import { z } from "zod";

export const EARTHQUAKE_QUERY = Object.freeze({ radiusKm: 500, lookbackDays: 7, minMagnitude: 2.5, limit: 100 });
const timestamp = z.number().int().min(0).max(253402300799999);
const responseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    type: z.literal("Feature"), id: z.string().min(1),
    geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([
      z.number().min(-180).max(180), z.number().min(-90).max(90), z.number().min(-100).max(1000),
    ]) }),
    properties: z.object({
      type: z.literal("earthquake"), mag: z.number().nullable(), place: z.string().nullable(),
      time: timestamp, updated: timestamp.nullish(),
      url: z.string().url().startsWith("https://earthquake.usgs.gov/").nullish(),
    }),
  })).max(EARTHQUAKE_QUERY.limit),
});

export type UsgsFeature = z.infer<typeof responseSchema>["features"][number];
export interface EarthquakeClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Clock injection for deterministic query-window tests. */
  now?: () => Date;
}
export class EarthquakeClientError extends Error {
  constructor(
    public readonly code: "invalid_input" | "configuration" | "http" | "timeout" | "aborted" | "network" | "invalid_response",
    message: string,
    public readonly status?: number,
  ) {
    super(message); this.name = "EarthquakeClientError";
  }
}

/** Public, keyless radius query. No env reads, retries, cache, or integration wiring. */
export async function fetchUsgsQuakes(lat: number, lng: number, options: EarthquakeClientOptions = {}) {
  if (!z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse({ lat, lng }).success) {
    throw new EarthquakeClientError("invalid_input", "Provide valid earthquake query coordinates.");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new EarthquakeClientError("configuration", "Earthquake timeout must be between 1 and 60000 milliseconds.");
  }
  const now = (options.now ?? (() => new Date()))().getTime();
  const start = now - EARTHQUAKE_QUERY.lookbackDays * 86_400_000;
  if (!Number.isFinite(now) || start < 0 || now > 253402300799999) {
    throw new EarthquakeClientError("configuration", "Provide a valid earthquake query clock.");
  }
  const query = {
    lat, lng, radiusKm: EARTHQUAKE_QUERY.radiusKm, minMagnitude: EARTHQUAKE_QUERY.minMagnitude,
    startTime: new Date(start).toISOString(), endTime: new Date(now).toISOString(), limit: EARTHQUAKE_QUERY.limit,
  };
  if (options.signal?.aborted) throw new EarthquakeClientError("aborted", "Earthquake request was cancelled.");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const abortError = () => timeout.aborted
    ? new EarthquakeClientError("timeout", "Earthquake request timed out.")
    : new EarthquakeClientError("aborted", "Earthquake request was cancelled.");
  const url = new URL("https://earthquake.usgs.gov/fdsnws/event/1/query");
  for (const [key, value] of Object.entries({ format: "geojson", latitude: String(lat), longitude: String(lng),
    maxradiuskm: String(query.radiusKm), minmagnitude: String(query.minMagnitude),
    starttime: query.startTime, endtime: query.endTime, limit: String(query.limit), orderby: "time", eventtype: "earthquake", nodata: "204",
  })) url.searchParams.set(key, value);

  try {
    const response = await (options.fetch ?? fetch)(url, { headers: { Accept: "application/json" }, signal });
    // The catalog uses HTTP 204, without a JSON body, when no events match.
    if (response.status === 204) return { query, features: [] as UsgsFeature[] };
    if (!response.ok) throw new EarthquakeClientError("http", `USGS request failed (HTTP ${response.status}).`, response.status);
    let body: unknown;
    try { body = await response.json(); } catch {
      if (signal.aborted) throw abortError();
      throw new EarthquakeClientError("invalid_response", "USGS returned unreadable earthquake data.");
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new EarthquakeClientError("invalid_response", "USGS returned unexpected earthquake data.");
    return { query, features: parsed.data.features };
  } catch (error) {
    if (error instanceof EarthquakeClientError) throw error;
    if (signal.aborted) throw abortError();
    throw new EarthquakeClientError("network", "Could not reach the earthquake service.");
  }
}
