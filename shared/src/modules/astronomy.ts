// Data shape inside the astronomy card's ModuleResult (`result.data` when status is "ok").
// Times are ISO 8601 strings in UTC. Distances are kilometres.

/* ───────────────────────── Astronomy ───────────────────────── */

export type DaylightState = "day" | "civil_twilight" | "nautical_twilight" | "astronomical_twilight" | "night";

export type MoonPhaseName =
  | "New moon"
  | "Waxing crescent"
  | "First quarter"
  | "Waxing gibbous"
  | "Full moon"
  | "Waning gibbous"
  | "Last quarter"
  | "Waning crescent";

export interface AstronomyData {
  /** The moment these values describe. */
  at: string;
  sun: {
    /** Degrees above the horizon (negative = below). */
    altitudeDeg: number;
    /** Compass bearing in degrees, 0 = north, 90 = east. */
    azimuthDeg: number;
    daylight: DaylightState;
    /** Times for the current solar day at this spot. null when the event doesn't happen (polar day/night). */
    sunrise: string | null;
    sunset: string | null;
    solarNoon: string;
    /** Civil twilight start/end. */
    dawn: string | null;
    dusk: string | null;
    /** Astronomical darkness starts / ends. */
    nightStart: string | null;
    nightEnd: string | null;
    /** Evening golden hour starts. */
    goldenHour: string | null;
    /** "up" = midnight sun, "down" = polar night, null = normal day. */
    polar: "up" | "down" | null;
  };
  moon: {
    phaseName: MoonPhaseName;
    /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter. */
    phase: number;
    /** Fraction of the disc that is lit, 0 to 1. */
    illumination: number;
    altitudeDeg: number;
    azimuthDeg: number;
    /** Next moonrise / moonset within 24 hours, or null if it doesn't happen in that window. */
    nextRise: string | null;
    nextSet: string | null;
  };
}
