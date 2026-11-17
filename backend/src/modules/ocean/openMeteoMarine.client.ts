// Current sea state for a point from Open-Meteo's Marine API. Keyless.
// Inland points come back with every value null; the service turns that into not_applicable.
// https://open-meteo.com/en/docs/marine-weather-api
import { z } from "zod";
import { fetchJson, type HttpOptions } from "../../lib/http.js";

export const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
const FIELDS = [
  "wave_height", "wave_direction", "wave_period", "swell_wave_height", "swell_wave_period",
  "sea_surface_temperature", "ocean_current_velocity", "ocean_current_direction",
] as const;

const value = z.number().nullable().optional();
const responseSchema = z.object({
  current: z.object({
    time: z.number(),
    wave_height: value,
    wave_direction: value,
    wave_period: value,
    swell_wave_height: value,
    swell_wave_period: value,
    sea_surface_temperature: value,
    ocean_current_velocity: value,
    ocean_current_direction: value,
  }),
});
export type MarineResponse = z.infer<typeof responseSchema>;

export async function fetchOpenMeteoMarine(
  lat: number,
  lng: number,
  options: Pick<HttpOptions, "fetch" | "signal" | "timeoutMs"> = {},
): Promise<MarineResponse> {
  const url = new URL(MARINE_URL);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("current", FIELDS.join(","));
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "UTC");
  return responseSchema.parse(await fetchJson(url, { ...options, service: "Open-Meteo Marine" }));
}
