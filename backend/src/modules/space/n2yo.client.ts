// Visible satellite passes over a point from N2YO.
// https://www.n2yo.com/api/ · needs N2YO_API_KEY · 100 "visualpasses" calls per hour.
//
// One call per satellite, so keep the satellite list short and cache per cell.
import { z } from "zod";
import type { SatellitePass } from "@vantage/shared/modules/space";
import { fetchJson, type HttpOptions } from "../../lib/http.js";
import type { Throttle } from "../../lib/throttle.js";

export const N2YO_BASE_URL = "https://api.n2yo.com/rest/v1/satellite";

/** Bright, well-known satellites worth looking up. NORAD catalog ids. */
export const DEFAULT_SATELLITES = [
  { id: 25544, name: "ISS" },
  { id: 48274, name: "Tiangong" },
  { id: 20580, name: "Hubble" },
] as const;

const passSchema = z.object({
  startAzCompass: z.string(),
  startUTC: z.number(),
  maxAzCompass: z.string(),
  maxEl: z.number(),
  maxUTC: z.number(),
  endAzCompass: z.string(),
  endUTC: z.number(),
  mag: z.number().nullish(),
  duration: z.number().nullish(),
});

const responseSchema = z.object({
  info: z.object({ satid: z.number(), satname: z.string(), passescount: z.number().optional() }),
  // N2YO leaves `passes` out when there are none.
  passes: z.array(passSchema).optional().default([]),
});

export interface VisualPassesRequest {
  satelliteId: number;
  /** Shown instead of N2YO's upper-case name, e.g. "ISS" instead of "SPACE STATION". */
  displayName?: string;
  lat: number;
  lng: number;
  /** Days ahead to search, 1–10. */
  days?: number;
  /** Only passes visible at least this many seconds. */
  minVisibleSeconds?: number;
}

export interface N2yoOptions extends Pick<HttpOptions, "fetch" | "signal" | "timeoutMs"> {
  apiKey: string;
  throttle?: Throttle;
}

const iso = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString();

export async function fetchVisualPasses(request: VisualPassesRequest, options: N2yoOptions): Promise<SatellitePass[]> {
  if (!options.apiKey) throw new Error("N2YO_API_KEY is not set in .env");
  options.throttle?.take();

  const days = Math.min(10, Math.max(1, Math.round(request.days ?? 2)));
  const minVisible = Math.max(1, Math.round(request.minVisibleSeconds ?? 120));
  const lat = request.lat.toFixed(4);
  const lng = request.lng.toFixed(4);
  // Observer altitude 0 m: the grid cell is ~28 km wide, so elevation detail doesn't matter here.
  const url = `${N2YO_BASE_URL}/visualpasses/${request.satelliteId}/${lat}/${lng}/0/${days}/${minVisible}/&apiKey=${encodeURIComponent(options.apiKey)}`;

  const body = responseSchema.parse(await fetchJson(url, { ...options, service: "N2YO" }));
  return body.passes.map((pass) => ({
    satelliteId: body.info.satid,
    satelliteName: request.displayName ?? body.info.satname,
    start: iso(pass.startUTC),
    max: iso(pass.maxUTC),
    end: iso(pass.endUTC),
    maxElevationDeg: pass.maxEl,
    startCompass: pass.startAzCompass,
    maxCompass: pass.maxAzCompass,
    endCompass: pass.endAzCompass,
    // N2YO sends 100000 when it doesn't know the brightness.
    magnitude: pass.mag == null || pass.mag >= 99_999 ? null : pass.mag,
    durationSeconds: pass.duration ?? pass.endUTC - pass.startUTC,
  }));
}
