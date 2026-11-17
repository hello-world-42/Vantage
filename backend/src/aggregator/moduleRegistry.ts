// The list of data modules the dashboard shows. Each entry says what the module is,
// how widely its data applies, how long to cache it, and how to fetch it.
//
// To add a module: write its client in backend/src/modules/<area>/, wrap it in a
// create<Name>Module() in <area>.service.ts, then add one line to createModuleRegistry() below.
// The aggregator handles caching, timeouts, errors and the disabled check, so module code never has to.
import type { GridCell, ModuleId } from "@vantage/shared";
import type { WeatherData } from "@vantage/shared/modules/weather";
import type { Cache } from "../cache/cache.js";
import { TTL_SECONDS } from "../cache/ttlPolicy.js";
import { fetchWeather } from "../modules/weather/weather.service.js";
import { createHazardsModule } from "../modules/hazards/hazards.service.js";
import { createAstronomyModule } from "../modules/astronomy/astronomy.service.js";
import { createSpaceModule } from "../modules/space/space.service.js";
import { createSkyConditionsModule } from "../modules/staticData/staticData.service.js";

/**
 * - cell:     data differs per grid cell (weather, air quality). Cached per cell.
 * - global:   one list for the whole world (launches, volcanoes). Cached under one key,
 *             filtered by distance inside the module.
 * - cell-and-country: data depends on the cell and on the country (hazards: NWS is US-only).
 *             Cached per cell and country.
 * - us-only:  older name for cell-and-country; caches the same way.
 */
export type ModuleScope = "cell" | "global" | "cell-and-country" | "us-only";

/** What every module's fetch receives. Upstream calls use the cell center, not the raw click. */
export interface LocationContext {
  query: { lat: number; lng: number };
  cell: GridCell;
  countryCode: string | null;
  /** Aborts when the aggregator's per-module timeout fires. */
  signal: AbortSignal;
}

/** What a module's fetch returns. Throwing means "error"; the aggregator converts it. */
export type ProviderOutcome<T> = (
  | { status: "ok"; source: string; data: T }
  | { status: "not_applicable"; source?: string; reason: string }
) & {
  /** Cache this answer for less than the module's TTL (never more). */
  ttlSeconds?: number;
};

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
  /** Satellite passes are left out of the space card when this is missing. */
  n2yoApiKey?: string;
  /**
   * Where global lists (launches, later volcanoes) are cached, one key each. Keep it separate
   * from the per-cell cache so thousands of cell entries can't push a list out.
   */
  listCache: Cache;
  /** Folder with the preprocessed grids (data/static). */
  staticDataDir?: string;
  logError?: (message: string, error: unknown) => void;
}

/* ───────────────────────── Modules ───────────────────────── */
// Each module lives in backend/src/modules/<area>/<area>.service.ts.

/** Weather from Open-Meteo (Mohammed's weather.service.ts). Keyless. */
export function weatherModule(): ModuleDefinition<WeatherData> {
  return {
    id: "weather",
    label: "Weather",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.weather,
    fetch: ({ cell, signal }) => fetchWeather(cell.lat, cell.lng, { signal }),
  };
}

/** Builds the active module list. Order here is the order modules appear in the response. */
export function createModuleRegistry(config: RegistryConfig): ModuleDefinition[] {
  const modules: Array<ModuleDefinition | null> = [
    weatherModule(),
    createHazardsModule({ nwsUserAgent: config.nwsUserAgent, logError: config.logError }),
    createAstronomyModule(),
    createSpaceModule({ cache: config.listCache, n2yoApiKey: config.n2yoApiKey, logError: config.logError }),
    // null until scripts/preprocess-static has generated data/static/*.bin
    createSkyConditionsModule({ dir: config.staticDataDir }),
  ];
  return modules.filter((module): module is ModuleDefinition => module !== null);
}
