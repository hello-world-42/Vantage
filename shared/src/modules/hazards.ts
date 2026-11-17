// Data shape inside the hazards card's ModuleResult (`result.data` when status is "ok").
// Times are ISO 8601 strings in UTC. Distances are kilometres.
import type { SourceResult } from "./sources";
import type { EarthquakeData } from "./earthquakes";

/* ───────────────────────── Hazards ───────────────────────── */

/** One active NWS alert (US only). */
export interface HazardAlert {
  id: string;
  event: string;
  headline: string | null;
  severity: string;
  urgency: string;
  certainty: string;
  areaDesc: string;
  description: string;
  instruction: string | null;
  sent: string;
  effective: string;
  onset: string | null;
  expires: string;
  ends: string | null;
}

/**
 * One key per hazard source. A key is missing when that source isn't built yet.
 * Owners add their key here when their client lands:
 *   fires (NASA FIRMS, Mohammed), volcanoes (GVP, Aamir).
 */
export interface HazardsData {
  /** NWS severe-weather alerts. not_applicable outside the US. */
  alerts?: SourceResult<HazardAlert[]>;
  /** USGS earthquakes within 500 km in the last 7 days (worldwide). */
  earthquakes?: SourceResult<EarthquakeData>;
}
