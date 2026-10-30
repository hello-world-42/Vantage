// Given a point, runs every registered module in parallel and returns one LocationResponse.
// Responsibilities that modules don't have to think about:
//   • grid snapping            • disabled-provider check     • caching (per module TTL)
//   • singleflight             • per-module timeout          • turning throws into "error"
import type { LocationResponse, ModuleId, ModuleResult } from "@vantage/shared";
import type { Cache } from "../cache/cache.js";
import { normalizeLng, snapToCell } from "../lib/grid.js";
import { createSingleflight } from "../lib/singleflight.js";
import type { LocationContext, ModuleDefinition } from "./moduleRegistry.js";

export interface AggregatorDeps {
  modules: ModuleDefinition[];
  cache: Cache;
  /** Admin on/off switch. Later backed by the data_sources table; defaults to "all enabled". */
  isEnabled?: (id: ModuleId) => boolean | Promise<boolean>;
  /** Looks up the country for a point. Later backed by Mapbox reverse geocoding. */
  resolveCountry?: (lat: number, lng: number) => Promise<string | null>;
  /** Safety net so one slow provider can't hold up the whole response. */
  moduleTimeoutMs?: number;
  /** Where real error details go (never to the client). */
  logError?: (message: string, error: unknown) => void;
  now?: () => Date;
}

export interface LocationInput {
  lat: number;
  lng: number;
  /** ISO code when the caller already knows it; skips resolveCountry. */
  country?: string;
}

export type AggregateLocation = (input: LocationInput) => Promise<LocationResponse>;

class ModuleTimeoutError extends Error {
  constructor(id: string, ms: number) {
    super(`Module "${id}" timed out after ${ms} ms`);
    this.name = "ModuleTimeoutError";
  }
}

export function createAggregator(deps: AggregatorDeps): AggregateLocation {
  const flight = createSingleflight();
  const timeoutMs = deps.moduleTimeoutMs ?? 8_000;
  const isEnabled = deps.isEnabled ?? (() => true);
  const logError = deps.logError ?? ((message, error) => console.error(message, error));
  const now = deps.now ?? (() => new Date());

  function cacheKey(module: ModuleDefinition, context: Omit<LocationContext, "signal">): string {
    switch (module.scope) {
      case "global":
        return `module:${module.id}`;
      case "us-only":
        return `module:${module.id}:${context.cell.key}:${context.countryCode ?? "unknown"}`;
      case "cell":
        return `module:${module.id}:${context.cell.key}`;
    }
  }

  /** Fetch with a hard timeout, then convert the provider outcome into a ModuleResult. */
  async function fetchModule(
    module: ModuleDefinition,
    base: Omit<LocationContext, "signal">,
  ): Promise<ModuleResult> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ModuleTimeoutError(module.id, timeoutMs));
      }, timeoutMs);
    });
    try {
      const outcome = await Promise.race([module.fetch({ ...base, signal: controller.signal }), timeout]);
      if (outcome.status === "ok") {
        return { status: "ok", data: outcome.data, source: outcome.source, fetchedAt: now().toISOString() };
      }
      return outcome.source
        ? { status: "not_applicable", reason: outcome.reason, source: outcome.source }
        : { status: "not_applicable", reason: outcome.reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async function runModule(
    module: ModuleDefinition,
    base: Omit<LocationContext, "signal">,
  ): Promise<ModuleResult> {
    if (!(await isEnabled(module.id))) return { status: "disabled" };

    const key = cacheKey(module, base);
    const cached = await deps.cache.get<ModuleResult>(key);
    if (cached) return cached;

    try {
      return await flight.run(key, async () => {
        const result = await fetchModule(module, base);
        // Only successful answers are cached; errors are retried on the next request.
        await deps.cache.set(key, result, module.ttlSeconds);
        return result;
      });
    } catch (error) {
      logError(`[aggregator] ${module.id} failed for ${key}:`, error);
      return { status: "error", message: `Couldn't load ${module.label.toLowerCase()} right now.` };
    }
  }

  return async function aggregateLocation(input) {
    const lng = normalizeLng(input.lng);
    const cell = snapToCell(input.lat, lng);

    let countryCode: string | null = input.country?.toUpperCase() ?? null;
    if (!countryCode && deps.resolveCountry) {
      try {
        countryCode = await deps.resolveCountry(cell.lat, cell.lng);
      } catch (error) {
        logError("[aggregator] country lookup failed:", error);
      }
    }

    const base = { query: { lat: input.lat, lng }, cell, countryCode };
    const settled = await Promise.allSettled(deps.modules.map((module) => runModule(module, base)));

    const modules: LocationResponse["modules"] = {};
    deps.modules.forEach((module, i) => {
      const outcome = settled[i];
      modules[module.id] =
        outcome.status === "fulfilled"
          ? outcome.value
          : { status: "error", message: `Couldn't load ${module.label.toLowerCase()} right now.` };
    });

    return { query: base.query, cell, countryCode, modules, generatedAt: now().toISOString() };
  };
}
