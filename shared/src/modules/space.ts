// Data shape inside the space card's ModuleResult (`result.data` when status is "ok").
// Times are ISO 8601 strings in UTC. Distances are kilometres.
import type { SourceResult } from "./sources";

/* ───────────────────────── Space ───────────────────────── */

export interface Launch {
  id: string;
  name: string;
  /** Best-known launch time ("no earlier than"). */
  net: string;
  /** How precise `net` is, e.g. "Second", "Day", "Month". */
  netPrecision: string | null;
  /** Short status, e.g. "Go", "TBD", "TBC", "Success", "Failure". */
  status: string;
  provider: string | null;
  rocket: string | null;
  mission: string | null;
  missionType: string | null;
  pad: { name: string; location: string; lat: number; lng: number; countryCode: string | null };
  /** Great-circle distance from the selected location to the pad. */
  distanceKm: number;
  imageUrl: string | null;
  webcastLive: boolean;
}

export interface LaunchesData {
  /** The next launches worldwide, soonest first. */
  upcoming: Launch[];
  /** Upcoming launches within `nearbyRadiusKm`, soonest first. */
  nearby: Launch[];
  nearbyRadiusKm: number;
}

export interface SatellitePass {
  satelliteId: number;
  satelliteName: string;
  start: string;
  /** Highest point of the pass. */
  max: string;
  end: string;
  maxElevationDeg: number;
  startCompass: string;
  maxCompass: string;
  endCompass: string;
  /** Brightness; lower is brighter (ISS is often around -3). null when unknown. */
  magnitude: number | null;
  durationSeconds: number;
}

/**
 * One key per space source. A key is missing when that source isn't configured
 * (satellitePasses needs N2YO_API_KEY) or isn't built yet (aurora, Mohammed).
 */
export interface SpaceData {
  launches?: SourceResult<LaunchesData>;
  satellitePasses?: SourceResult<SatellitePass[]>;
}
