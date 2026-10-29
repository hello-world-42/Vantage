// Types shared by the frontend and backend.
// Owner of the ModuleResult/LocationResponse section: Lance (see SPEC.md, Section 5).

/* ───────────────────────── Geocoding ───────────────────────── */

/** One match returned by GET /api/geocode?q=... */
export interface GeocodeResult {
  id: string;
  /** Short label, e.g. "Reykjavik" */
  name: string;
  /** Disambiguating context, e.g. "Capital Region, Iceland" */
  context?: string;
  lat: number;
  lng: number;
}

export interface GeocodeResponse {
  results: GeocodeResult[];
}

/* ─────────────────────── Data modules ─────────────────────── */

/**
 * Every dashboard section is one module. Add an id here when a new module is registered
 * in backend/src/aggregator/moduleRegistry.ts.
 */
export type ModuleId =
  | "hazards"
  | "weather"
  | "airQuality"
  | "astronomy"
  | "space"
  | "ocean"
  | "skyConditions";

/**
 * - ok:              data was fetched (or served from cache)
 * - not_applicable:  the module doesn't cover this place (e.g. NWS outside the US, marine data inland)
 * - error:           the provider failed; `message` is safe to show to users
 * - disabled:        an admin turned the provider off (data_sources table)
 */
export type ModuleStatus = "ok" | "not_applicable" | "error" | "disabled";

/** The one shape every module returns. The frontend renders a card per module based on `status`. */
export type ModuleResult<T = unknown> =
  | { status: "ok"; data: T; source: string; fetchedAt: string }
  | { status: "not_applicable"; reason: string; source?: string }
  | { status: "error"; message: string }
  | { status: "disabled" };

/* ─────────────────────── Location lookup ─────────────────────── */

/**
 * Locations are snapped to a fixed grid so nearby clicks share one cache entry.
 * Upstream APIs are called for the cell center, not the exact click.
 */
export interface GridCell {
  /** Stable cache key, e.g. "0.25:495:383" */
  key: string;
  /** Cell center latitude */
  lat: number;
  /** Cell center longitude */
  lng: number;
  /** Cell size in degrees */
  sizeDeg: number;
}

/** Response of GET /api/location?lat=..&lng=..[&country=..] */
export interface LocationResponse {
  /** The point that was requested (longitude normalized to -180..180) */
  query: { lat: number; lng: number };
  cell: GridCell;
  /** ISO 3166-1 alpha-2 code, or null when the country isn't known yet */
  countryCode: string | null;
  /** One entry per registered module */
  modules: Partial<Record<ModuleId, ModuleResult>>;
  generatedAt: string;
}
