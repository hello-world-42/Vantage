// Types shared by the frontend and backend.
// (ModuleResult<T>, LocationResponse and module IDs will live here too.)

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
