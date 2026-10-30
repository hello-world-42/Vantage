import { z } from "zod";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  countryCode: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()),
});

const alertSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  headline: z.string().nullable().optional().default(null),
  severity: z.string().min(1),
  urgency: z.string().min(1),
  certainty: z.string().min(1),
  areaDesc: z.string(),
  description: z.string(),
  instruction: z.string().nullable().optional().default(null),
  sent: z.string().min(1),
  effective: z.string().min(1),
  onset: z.string().nullable().optional().default(null),
  expires: z.string().min(1),
  ends: z.string().nullable().optional().default(null),
});

const responseSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.object({
    type: z.literal("Feature"),
    properties: alertSchema,
  })),
});

export type NwsAlert = z.infer<typeof alertSchema>;

export interface NwsLocation {
  lat: number;
  lng: number;
  /** ISO country code supplied by the caller's geolocation service, not a bounding-box guess. */
  countryCode: string;
}

export interface NwsClientOptions {
  /** Pass the configured NWS_USER_AGENT explicitly. This client never reads env files or process.env. */
  userAgent: string;
  /** Covers the request and response body; defaults to five seconds. */
  timeoutMs?: number;
  /** Optional transport injection for tests. Defaults to the native Node fetch. */
  fetch?: typeof fetch;
}

/** Provider result only. The integration owner wraps this in the shared ModuleResult. */
export type NwsAlertsResult =
  | { status: "ok"; source: "NWS"; alerts: NwsAlert[] }
  | { status: "not_applicable"; source: "NWS"; reason: string };

export type NwsClientErrorCode =
  | "invalid_input" | "configuration" | "http" | "timeout" | "network" | "invalid_response";

export class NwsClientError extends Error {
  constructor(
    public readonly code: NwsClientErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "NwsClientError";
  }
}

/**
 * Fetch active alerts for an exact point, including county- and zone-based products.
 * https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf
 *
 * US-only under the current Vantage scope. Non-US locations make no network request.
 * Empty US results mean `ok` with no alerts, never `not_applicable`.
 * Errors are thrown for the integration owner to map into its shared error envelope.
 * No routes, cache, retries, registry, or aggregator are configured here.
 */
export async function fetchNwsAlerts(
  location: NwsLocation,
  options: NwsClientOptions,
): Promise<NwsAlertsResult> {
  const parsed = locationSchema.safeParse(location);
  if (!parsed.success) {
    throw new NwsClientError("invalid_input", "Provide valid coordinates and a two-letter country code.");
  }
  const { lat, lng, countryCode } = parsed.data;
  if (countryCode !== "US") {
    return { status: "not_applicable", source: "NWS", reason: "NWS alerts are US-only in Vantage." };
  }

  const userAgent = options.userAgent?.trim();
  if (!userAgent || /[^\x20-\x7e]/.test(userAgent)) {
    throw new NwsClientError("configuration", "Provide a valid NWS User-Agent identifying the application.");
  }
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new NwsClientError("configuration", "NWS timeout must be an integer between 1 and 60000 milliseconds.");
  }

  const url = new URL("https://api.weather.gov/alerts/active");
  url.searchParams.set("point", `${lat},${lng}`);
  const signal = AbortSignal.timeout(timeoutMs);
  const transport = options.fetch ?? fetch;

  try {
    const response = await transport(url, {
      headers: { "User-Agent": userAgent, Accept: "application/geo+json" },
      signal,
    });
    if (!response.ok) {
      throw new NwsClientError("http", `NWS alerts request failed (HTTP ${response.status}).`, response.status);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (signal.aborted) throw new NwsClientError("timeout", "NWS alerts request timed out.");
      throw new NwsClientError("invalid_response", "NWS returned an unreadable JSON response.");
    }
    const data = responseSchema.safeParse(body);
    if (!data.success) {
      throw new NwsClientError("invalid_response", "NWS returned an unexpected alerts response.");
    }
    return { status: "ok", source: "NWS", alerts: data.data.features.map(({ properties }) => properties) };
  } catch (error) {
    if (error instanceof NwsClientError) throw error;
    if (signal.aborted) throw new NwsClientError("timeout", "NWS alerts request timed out.");
    // Do not propagate upstream errors, headers, or response bodies containing caller details.
    throw new NwsClientError("network", "Could not reach the NWS alerts service.");
  }
}
