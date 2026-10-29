// The list of data modules the dashboard shows. Each entry says what the module is,
// how widely its data applies, how long to cache it, and how to fetch it.
//
// To add a module: write its client in backend/src/modules/<area>/, then add one entry here
// that adapts the client's output to a ProviderOutcome. The aggregator handles caching,
// timeouts, errors and the disabled check, so module code never has to.
import type { GridCell, ModuleId } from "@vantage/shared";
import { TTL_SECONDS } from "../cache/ttlPolicy.js";
import { fetchNwsAlerts, type NwsAlert } from "../modules/hazards/nwsAlerts.client.js";

/**
 * - cell:     data differs per grid cell (weather, air quality). Cached per cell.
 * - global:   one list for the whole world (launches, volcanoes). Cached under one key,
 *             filtered by distance inside the module.
 * - us-only:  only applies inside the US (NWS). Cached per cell and country.
 */
export type ModuleScope = "cell" | "global" | "us-only";

/** What every module's fetch receives. Upstream calls use the cell center, not the raw click. */
export interface LocationContext {
  query: { lat: number; lng: number };
  cell: GridCell;
  countryCode: string | null;
  /** Aborts when the aggregator's per-module timeout fires. */
  signal: AbortSignal;
}

/** What a module's fetch returns. Throwing means "error"; the aggregator converts it. */
export type ProviderOutcome<T> =
  | { status: "ok"; source: string; data: T }
  | { status: "not_applicable"; source?: string; reason: string };

export interface ModuleDefinition<T = unknown> {
  id: ModuleId;
  /** Human-readable name used in user-facing error messages, e.g. "Hazard alerts". */
  label: string;
  scope: ModuleScope;
  ttlSeconds: number;
  fetch(context: LocationContext): Promise<ProviderOutcome<T>>;
}

/** Settings the registry needs from env. Passed in so modules never read process.env. */
export interface RegistryConfig {
  nwsUserAgent?: string;
}

/* ───────────────────────── Modules ───────────────────────── */

export interface HazardsData {
  alerts: NwsAlert[];
}

/**
 * Hazards (first version: NWS severe-weather alerts only).
 * USGS quakes, FIRMS fires and GVP volcanoes join this module later.
 * NWS client: backend/src/modules/hazards/nwsAlerts.client.ts (Mohammed).
 */
function hazardsModule(config: RegistryConfig): ModuleDefinition<HazardsData> {
  return {
    id: "hazards",
    label: "Hazard alerts",
    scope: "us-only",
    ttlSeconds: TTL_SECONDS.hazards,
    async fetch({ cell, countryCode }) {
      if (!countryCode) {
        return {
          status: "not_applicable",
          source: "NWS",
          reason: "Country unknown for this location, so US severe-weather alerts can't be checked.",
        };
      }
      if (!config.nwsUserAgent) {
        throw new Error("NWS_USER_AGENT is not set in .env");
      }
      const result = await fetchNwsAlerts(
        { lat: cell.lat, lng: cell.lng, countryCode },
        { userAgent: config.nwsUserAgent },
      );
      return result.status === "ok"
        ? { status: "ok", source: result.source, data: { alerts: result.alerts } }
        : result;
    },
  };
}

/** Builds the active module list. Order here is the order modules appear in the response. */
export function createModuleRegistry(config: RegistryConfig): ModuleDefinition[] {
  return [hazardsModule(config)];
}
