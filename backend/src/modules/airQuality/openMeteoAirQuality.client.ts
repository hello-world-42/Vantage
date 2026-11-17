// Current air quality for a point from Open-Meteo's Air Quality API (CAMS models). Keyless.
// https://open-meteo.com/en/docs/air-quality-api
import { z } from "zod";
import { fetchJson, type HttpOptions } from "../../lib/http.js";

export const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const FIELDS = ["us_aqi", "european_aqi", "pm2_5", "pm10", "ozone", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide"] as const;

const value = z.number().nullable().optional();
const responseSchema = z.object({
  current: z.object({
    time: z.number(),
    us_aqi: value,
    european_aqi: value,
    pm2_5: value,
    pm10: value,
    ozone: value,
    nitrogen_dioxide: value,
    sulphur_dioxide: value,
    carbon_monoxide: value,
  }),
});
export type AirQualityResponse = z.infer<typeof responseSchema>;

export async function fetchOpenMeteoAirQuality(
  lat: number,
  lng: number,
  options: Pick<HttpOptions, "fetch" | "signal" | "timeoutMs"> = {},
): Promise<AirQualityResponse> {
  const url = new URL(AIR_QUALITY_URL);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("current", FIELDS.join(","));
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "UTC");
  return responseSchema.parse(await fetchJson(url, { ...options, service: "Open-Meteo Air Quality" }));
}
