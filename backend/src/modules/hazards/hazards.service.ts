// The hazards card: one module that combines every hazard provider.
//
// Add a provider by writing its client in this folder and adding one SubSource to
// createHazardsModule() at the bottom. Its key must match a key in HazardsData
// (shared/src/modules/hazards.ts). Sources so far:
//   alerts      → nwsAlerts.client.ts  (NWS, US only)
//   earthquakes → usgsQuakes.client.ts (USGS, worldwide) via fetchEarthquakes() below
// Planned:
//   fires       → nasaFirms.client.ts  (Mohammed)
//   volcanoes   → gvpVolcano.client.ts (Aamir; a global list, see cache/globalList.ts)
import type { HazardAlert } from "@vantage/shared/modules/hazards";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { combineSources, type SubSource } from "../../aggregator/subSources.js";
import { fetchNwsAlerts } from "./nwsAlerts.client.js";
import type { EarthquakeData } from "@vantage/shared/modules/earthquakes";
import { fetchUsgsQuakes, type EarthquakeClientOptions } from "./usgsQuakes.client.js";

/** Great-circle distance, in km; works at the poles and across the antimeridian. */
function distanceKm(lat: number, lng: number, eventLat: number, eventLng: number): number {
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(eventLat - lat) / 2) ** 2
    + Math.cos(radians(lat)) * Math.cos(radians(eventLat)) * Math.sin(radians(eventLng - lng) / 2) ** 2;
  return Math.round(6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a)))) * 10) / 10;
}

/**
 * USGS part of the hazards module, applicable worldwide. Keep NWS alerts independent:
 * the integration owner composes these providers without making USGS US-only.
 */
export async function fetchEarthquakes(
  lat: number,
  lng: number,
  options: EarthquakeClientOptions = {},
): Promise<{ status: "ok"; source: "USGS"; data: EarthquakeData }> {
  const response = await fetchUsgsQuakes(lat, lng, options);
  const earthquakes = [...response.features].sort((a, b) => b.properties.time - a.properties.time).map((feature) => {
    const [eventLng, eventLat, depthKm] = feature.geometry.coordinates;
    return {
      id: feature.id, magnitude: feature.properties.mag, place: feature.properties.place,
      occurredAt: new Date(feature.properties.time).toISOString(),
      updatedAt: feature.properties.updated == null ? null : new Date(feature.properties.updated).toISOString(),
      lat: eventLat, lng: eventLng, depthKm, distanceKm: distanceKm(lat, lng, eventLat, eventLng),
      url: feature.properties.url ?? null,
    };
  });
  return { status: "ok", source: "USGS", data: {
    query: response.query, earthquakes, possiblyTruncated: earthquakes.length >= response.query.limit,
    attribution: { text: "Earthquake data by USGS", url: "https://earthquake.usgs.gov/" },
  } };
}

/* ─────────────── The hazards card (Lance: combines the providers) ─────────────── */

export interface HazardsConfig {
  nwsUserAgent?: string;
  /** Injected in tests (NWS and USGS). */
  fetch?: typeof fetch;
  logError?: (message: string, error: unknown) => void;
  /** Admin switch from the data_sources table; a provider that is off is left out of the card. */
  isSourceEnabled?: (source: string) => boolean | Promise<boolean>;
}

/** NWS severe-weather alerts. US-only; needs NWS_USER_AGENT. */
export function nwsAlertsSource(userAgent: string | undefined, transport: typeof fetch = fetch): SubSource<HazardAlert[]> {
  return {
    key: "alerts",
    source: "NWS",
    label: "severe-weather alerts",
    async fetch({ cell, countryCode, signal }) {
      if (!countryCode) {
        return {
          status: "not_applicable",
          source: "NWS",
          reason: "Country unknown for this location, so US severe-weather alerts can't be checked.",
        };
      }
      if (!userAgent) throw new Error("NWS_USER_AGENT is not set in .env");
      const result = await fetchNwsAlerts(
        { lat: cell.lat, lng: cell.lng, countryCode },
        // Stops early if the aggregator gives up on the hazards card.
        { userAgent, fetch: (input, init) => transport(input, { ...init, signal: anySignal(init?.signal, signal) }) },
      );
      return result.status === "ok" ? { status: "ok", source: "NWS", data: result.alerts } : result;
    },
  };
}

function anySignal(a: AbortSignal | null | undefined, b: AbortSignal): AbortSignal {
  return a ? AbortSignal.any([a, b]) : b;
}

/** USGS earthquakes near the cell, worldwide (Mohammed's fetchEarthquakes above). */
export function earthquakesSource(transport?: typeof fetch): SubSource<EarthquakeData> {
  return {
    key: "earthquakes",
    source: "USGS",
    label: "earthquakes",
    fetch: ({ cell, signal }) => fetchEarthquakes(cell.lat, cell.lng, { signal, fetch: transport }),
  };
}

export function createHazardsModule(config: HazardsConfig): ModuleDefinition {
  const sources: SubSource[] = [
    nwsAlertsSource(config.nwsUserAgent, config.fetch),
    earthquakesSource(config.fetch),
  ];

  return {
    id: "hazards",
    label: "Hazard alerts",
    // NWS answers depend on the country, so the cache key includes it.
    scope: "cell-and-country",
    ttlSeconds: TTL_SECONDS.hazards,
    fetch: (context) =>
      combineSources(sources, context, {
        notApplicableReason: "No hazard data source covers this location yet.",
        logError: config.logError,
        isSourceEnabled: config.isSourceEnabled,
      }),
  };
}
