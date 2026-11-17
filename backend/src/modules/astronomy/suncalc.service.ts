// Sun and moon for a point, computed locally with suncalc (no API key, no quota).
import SunCalc from "suncalc";
import type { AstronomyData, DaylightState, MoonPhaseName } from "@vantage/shared/modules/astronomy";

const DEG = 180 / Math.PI;

/** suncalc measures azimuth from south, positive toward west. Convert to a 0–360° compass bearing. */
function compassDeg(azimuthRad: number): number {
  return round1((((azimuthRad * DEG + 180) % 360) + 360) % 360);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** null for suncalc's "Invalid Date" (the event doesn't happen today, e.g. polar night). */
function iso(date: Date | undefined): string | null {
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** Sun altitude thresholds (degrees) used for the standard twilight definitions. */
export function daylightFor(sunAltitudeDeg: number): DaylightState {
  if (sunAltitudeDeg > -0.833) return "day";
  if (sunAltitudeDeg > -6) return "civil_twilight";
  if (sunAltitudeDeg > -12) return "nautical_twilight";
  if (sunAltitudeDeg > -18) return "astronomical_twilight";
  return "night";
}

/** Each named phase covers ±1 day around its exact point (29.53-day cycle), the rest are the in-betweens. */
export function moonPhaseName(phase: number): MoonPhaseName {
  const p = ((phase % 1) + 1) % 1;
  const exact = 1 / 29.53;
  if (p < exact || p > 1 - exact) return "New moon";
  if (Math.abs(p - 0.25) < exact) return "First quarter";
  if (Math.abs(p - 0.5) < exact) return "Full moon";
  if (Math.abs(p - 0.75) < exact) return "Last quarter";
  if (p < 0.25) return "Waxing crescent";
  if (p < 0.5) return "Waxing gibbous";
  if (p < 0.75) return "Waning gibbous";
  return "Waning crescent";
}

/** Moonrise/moonset happen when the moon's center crosses +0.133° (suncalc's own threshold). */
const MOON_HORIZON_DEG = 0.133;
const STEP_MINUTES = 10;

/**
 * Next moonrise and moonset in the 24 hours after `from`, found by stepping through the
 * moon's altitude. Unlike suncalc.getMoonTimes this doesn't depend on the server's time zone.
 */
export function nextMoonEvents(from: Date, lat: number, lng: number) {
  const altitudeAt = (t: number) => SunCalc.getMoonPosition(new Date(t), lat, lng).altitude * DEG - MOON_HORIZON_DEG;
  const stepMs = STEP_MINUTES * 60_000;
  let nextRise: string | null = null;
  let nextSet: string | null = null;

  let t0 = from.getTime();
  let h0 = altitudeAt(t0);
  for (let i = 1; i <= (24 * 60) / STEP_MINUTES && (!nextRise || !nextSet); i++) {
    const t1 = t0 + stepMs;
    const h1 = altitudeAt(t1);
    if ((h0 < 0) !== (h1 < 0)) {
      // Linear interpolation inside the 10-minute step is accurate to about a minute.
      const crossing = new Date(t0 + (stepMs * h0) / (h0 - h1)).toISOString();
      if (h1 >= 0) nextRise ??= crossing;
      else nextSet ??= crossing;
    }
    t0 = t1;
    h0 = h1;
  }
  return { nextRise, nextSet };
}

export function computeAstronomy(lat: number, lng: number, at: Date): AstronomyData {
  const times = SunCalc.getTimes(at, lat, lng);
  const sun = SunCalc.getPosition(at, lat, lng);
  const moon = SunCalc.getMoonPosition(at, lat, lng);
  const illumination = SunCalc.getMoonIllumination(at);

  const sunrise = iso(times.sunrise);
  const sunset = iso(times.sunset);
  let polar: AstronomyData["sun"]["polar"] = null;
  if (!sunrise && !sunset) {
    // No sunrise or sunset today: the sun is either up all day or down all day.
    polar = SunCalc.getPosition(times.solarNoon, lat, lng).altitude > 0 ? "up" : "down";
  }

  const sunAltitudeDeg = sun.altitude * DEG;
  return {
    at: at.toISOString(),
    sun: {
      altitudeDeg: round1(sunAltitudeDeg),
      azimuthDeg: compassDeg(sun.azimuth),
      daylight: daylightFor(sunAltitudeDeg),
      sunrise,
      sunset,
      solarNoon: times.solarNoon.toISOString(),
      dawn: iso(times.dawn),
      dusk: iso(times.dusk),
      nightStart: iso(times.night),
      nightEnd: iso(times.nightEnd),
      goldenHour: iso(times.goldenHour),
      polar,
    },
    moon: {
      phaseName: moonPhaseName(illumination.phase),
      phase: round3(illumination.phase),
      illumination: round3(illumination.fraction),
      altitudeDeg: round1(moon.altitude * DEG),
      azimuthDeg: compassDeg(moon.azimuth),
      ...nextMoonEvents(at, lat, lng),
    },
  };
}
