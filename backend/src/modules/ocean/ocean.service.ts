// The ocean card: waves, swell, sea temperature and current (Open-Meteo Marine).
// Inland points are "not applicable", not an error.
import type { OceanData } from "@vantage/shared/modules/ocean";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { fetchOpenMeteoMarine } from "./openMeteoMarine.client.js";

export function createOceanModule(config: { fetch?: typeof fetch } = {}): ModuleDefinition<OceanData> {
  return {
    id: "ocean",
    label: "Ocean conditions",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.ocean,
    async fetch({ cell, signal }) {
      const { current } = await fetchOpenMeteoMarine(cell.lat, cell.lng, { signal, fetch: config.fetch });
      const data: OceanData = {
        validAt: new Date(current.time * 1000).toISOString(),
        waveHeight: current.wave_height ?? null,
        waveDirection: current.wave_direction ?? null,
        wavePeriod: current.wave_period ?? null,
        swellHeight: current.swell_wave_height ?? null,
        swellPeriod: current.swell_wave_period ?? null,
        seaSurfaceTemperature: current.sea_surface_temperature ?? null,
        currentSpeed: current.ocean_current_velocity ?? null,
        currentDirection: current.ocean_current_direction ?? null,
        units: { height: "m", period: "s", temperature: "°C", speed: "km/h", direction: "°" },
      };
      const hasAny = [data.waveHeight, data.seaSurfaceTemperature, data.swellHeight, data.currentSpeed].some((v) => v !== null);
      return hasAny
        ? { status: "ok", source: "Open-Meteo", data }
        : { status: "not_applicable", source: "Open-Meteo", reason: "No ocean here: this spot is inland." };
    },
  };
}
