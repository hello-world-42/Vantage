// Data shape inside the sky conditions card's ModuleResult (`result.data` when status is "ok").
// Times are ISO 8601 strings in UTC. Distances are kilometres.

/* ───────────────────────── Sky conditions ───────────────────────── */

export type LightPollutionLevel = "very_dark" | "rural" | "suburban" | "urban" | "city_center";

export interface SkyConditionsData {
  /** Missing when that grid file hasn't been generated (see scripts/preprocess-static). */
  lightPollution?: {
    /** Average night-time radiance over the grid cell, nW/cm²/sr (VIIRS annual composite). */
    radiance: number;
    level: LightPollutionLevel;
    /** Year of the source data. */
    year: number | null;
  };
  population?: {
    /** Average people per km² over the grid cell (SEDAC GPW). */
    densityPerKm2: number;
    year: number | null;
  };
}
