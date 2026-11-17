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

export type AuroraLevel = "none" | "low" | "moderate" | "high";

export interface AuroraData {
  /** Chance (0–100) of aurora directly overhead in the next ~30–90 minutes (NOAA OVATION model). */
  probability: number;
  level: AuroraLevel;
  /** Latest planetary K-index, 0–9. 5 or more is a geomagnetic storm. null when unavailable. */
  kp: number | null;
  kpAt: string | null;
  observedAt: string;
  forecastFor: string;
}

/**
 * One key per space source. satellitePasses is missing when N2YO_API_KEY isn't set.
 */
export interface SpaceData {
  launches?: SourceResult<LaunchesData>;
  satellitePasses?: SourceResult<SatellitePass[]>;
  aurora?: SourceResult<AuroraData>;
}
