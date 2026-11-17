// Aurora from NOAA's Space Weather Prediction Center. Keyless, public domain.
//   • OVATION model: chance of aurora overhead for every 1° of the globe (updated every ~5 min).
//   • Planetary K-index: how disturbed Earth's magnetic field is (0–9).
// Both are worldwide lists: fetch once, cache under one key, look values up per location.
import { z } from "zod";
import { fetchJson, type HttpOptions } from "../../lib/http.js";

export const OVATION_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
export const KP_URL = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

const ovationSchema = z.object({
  "Observation Time": z.string(),
  "Forecast Time": z.string(),
  // [longitude 0–359, latitude -90–90, probability 0–100]
  coordinates: z.array(z.tuple([z.number(), z.number(), z.number()])),
});

/** The OVATION grid packed small: one byte per 1° cell, so it's cheap to keep in the cache. */
export interface AuroraGrid {
  observedAt: string;
  forecastFor: string;
  /** probability[(lat + 90) * 360 + lng], lng 0–359 east. */
  probability: number[];
}

type ClientOptions = Pick<HttpOptions, "fetch" | "timeoutMs">;

export async function fetchAuroraGrid(options: ClientOptions = {}): Promise<AuroraGrid> {
  const body = ovationSchema.parse(
    await fetchJson(OVATION_URL, { service: "NOAA SWPC", timeoutMs: options.timeoutMs ?? 8_000, fetch: options.fetch }),
  );
  const probability = new Array<number>(181 * 360).fill(0);
  for (const [lng, lat, value] of body.coordinates) {
    if (Number.isInteger(lng) && Number.isInteger(lat) && lng >= 0 && lng < 360 && lat >= -90 && lat <= 90) {
      probability[(lat + 90) * 360 + lng] = Math.max(0, Math.min(100, Math.round(value)));
    }
  }
  return { observedAt: toIso(body["Observation Time"]), forecastFor: toIso(body["Forecast Time"]), probability };
}

/** Chance of aurora overhead at a point, from the nearest 1° grid cell. */
export function auroraProbabilityAt(grid: AuroraGrid, lat: number, lng: number): number {
  const row = Math.min(180, Math.max(0, Math.round(lat) + 90));
  const col = ((Math.round(lng) % 360) + 360) % 360;
  return grid.probability[row * 360 + col] ?? 0;
}

// NOAA has published this file both as objects and as rows under a header row; accept both.
const kpObject = z.object({ time_tag: z.string(), Kp: z.coerce.number() });
const kpRow = z.tuple([z.string(), z.coerce.number()]).rest(z.unknown());

export interface KpReading {
  kp: number;
  at: string;
}

export async function fetchLatestKp(options: ClientOptions = {}): Promise<KpReading | null> {
  const body = z.array(z.unknown()).parse(await fetchJson(KP_URL, { service: "NOAA SWPC", fetch: options.fetch, timeoutMs: options.timeoutMs }));
  for (let i = body.length - 1; i >= 0; i--) {
    const asObject = kpObject.safeParse(body[i]);
    if (asObject.success && Number.isFinite(asObject.data.Kp)) return { kp: asObject.data.Kp, at: toIso(asObject.data.time_tag) };
    const asRow = kpRow.safeParse(body[i]);
    if (asRow.success && Number.isFinite(asRow.data[1])) return { kp: asRow.data[1], at: toIso(asRow.data[0]) };
  }
  return null;
}

/** NOAA timestamps are UTC but often lack the "Z". */
function toIso(time: string): string {
  const normalized = /Z|[+-]\d\d:?\d\d$/.test(time) ? time : `${time.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? time : date.toISOString();
}
