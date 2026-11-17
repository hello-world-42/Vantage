// The air quality card: US AQI, European AQI and the main pollutants (Open-Meteo, worldwide).
// openAq.client.ts (station measurements) stays unused; the model data covers every cell.
import type { AirQualityData, AqiCategory } from "@vantage/shared/modules/airQuality";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { fetchOpenMeteoAirQuality } from "./openMeteoAirQuality.client.js";

/** US EPA AQI bands. */
export function aqiCategory(usAqi: number): AqiCategory {
  if (usAqi <= 50) return "good";
  if (usAqi <= 100) return "moderate";
  if (usAqi <= 150) return "unhealthy_sensitive";
  if (usAqi <= 200) return "unhealthy";
  if (usAqi <= 300) return "very_unhealthy";
  return "hazardous";
}

export function createAirQualityModule(config: { fetch?: typeof fetch } = {}): ModuleDefinition<AirQualityData> {
  return {
    id: "airQuality",
    label: "Air quality",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.airQuality,
    async fetch({ cell, signal }) {
      const { current } = await fetchOpenMeteoAirQuality(cell.lat, cell.lng, { signal, fetch: config.fetch });
      const usAqi = current.us_aqi ?? null;
      const data: AirQualityData = {
        validAt: new Date(current.time * 1000).toISOString(),
        usAqi,
        category: usAqi === null ? null : aqiCategory(usAqi),
        europeanAqi: current.european_aqi ?? null,
        pm25: current.pm2_5 ?? null,
        pm10: current.pm10 ?? null,
        ozone: current.ozone ?? null,
        nitrogenDioxide: current.nitrogen_dioxide ?? null,
        sulphurDioxide: current.sulphur_dioxide ?? null,
        carbonMonoxide: current.carbon_monoxide ?? null,
        units: { concentration: "µg/m³" },
      };
      const hasAny = [data.usAqi, data.europeanAqi, data.pm25, data.pm10, data.ozone].some((v) => v !== null);
      return hasAny
        ? { status: "ok", source: "Open-Meteo", data }
        : { status: "not_applicable", source: "Open-Meteo", reason: "No air quality data for this spot." };
    },
  };
}
