// The space card: upcoming rocket launches (worldwide, nearest flagged) and visible
// satellite passes over the selected cell. Aurora (NOAA SWPC, Mohammed) joins as another
// SubSource; add its key to SpaceData in shared/src/modules.ts.
import type { Launch, LaunchesData, SatellitePass } from "@vantage/shared/modules/space";
import type { Cache } from "../../cache/cache.js";
import { createGlobalList } from "../../cache/globalList.js";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { combineSources, PARTIAL_FAILURE_TTL_SECONDS, type SubSource } from "../../aggregator/subSources.js";
import { distanceKm } from "../../lib/geo.js";
import { createThrottle, type Throttle } from "../../lib/throttle.js";
import { fetchUpcomingLaunches, type LaunchRecord } from "./launchLibrary.client.js";
import { DEFAULT_SATELLITES, fetchVisualPasses } from "./n2yo.client.js";

const HOUR_MS = 60 * 60 * 1000;

/** Launches within this distance count as "nearby" (roughly where a launch is visible from the ground). */
export const NEARBY_RADIUS_KM = 1_000;
const UPCOMING_COUNT = 5;
const NEARBY_COUNT = 5;
const PASS_COUNT = 8;
/** Launch Library's "upcoming" list includes launches from the last day; hide ones that are long gone. */
const RECENT_GRACE_MS = 6 * HOUR_MS;
/** Statuses that mean the launch already happened (Launch Library "abbrev" values). */
const FINISHED_STATUSES = new Set(["Success", "Failure", "Partial Failure"]);

export interface SpaceConfig {
  /** The global-list cache (app.ts listCache), not the per-cell one. */
  cache: Cache;
  n2yoApiKey?: string;
  now?: () => Date;
  logError?: (message: string, error: unknown) => void;
  /** Overridable in tests. Defaults stay under each provider's hourly quota. */
  launchLibrary?: { fetch?: typeof fetch; throttle?: Throttle };
  n2yo?: { fetch?: typeof fetch; throttle?: Throttle };
}

/** Pure: picks the next launches worldwide and the ones near `origin`. */
export function pickLaunches(all: LaunchRecord[], origin: { lat: number; lng: number }, now: Date): LaunchesData {
  const withDistance: Launch[] = all
    .filter((launch) => !FINISHED_STATUSES.has(launch.status) && Date.parse(launch.net) >= now.getTime() - RECENT_GRACE_MS)
    .map((launch) => ({ ...launch, distanceKm: Math.round(distanceKm(origin, launch.pad)) }))
    .sort((a, b) => Date.parse(a.net) - Date.parse(b.net));
  return {
    upcoming: withDistance.slice(0, UPCOMING_COUNT),
    nearby: withDistance.filter((launch) => launch.distanceKm <= NEARBY_RADIUS_KM).slice(0, NEARBY_COUNT),
    nearbyRadiusKm: NEARBY_RADIUS_KM,
  };
}

export function createSpaceModule(config: SpaceConfig): ModuleDefinition {
  const now = config.now ?? (() => new Date());
  // Free tier is 15/hour; leave room for retries and other team members testing with the same IP.
  const llThrottle = config.launchLibrary?.throttle ?? createThrottle({ name: "Launch Library", limit: 10, windowMs: HOUR_MS });
  // 100 visualpasses calls/hour; each cell uses one per satellite.
  const n2yoThrottle = config.n2yo?.throttle ?? createThrottle({ name: "N2YO", limit: 90, windowMs: HOUR_MS });

  const launchList = createGlobalList({
    cache: config.cache,
    key: "list:launches",
    ttlSeconds: TTL_SECONDS.space,
    load: () => fetchUpcomingLaunches({ throttle: llThrottle, fetch: config.launchLibrary?.fetch }),
  });

  const launches: SubSource<LaunchesData> = {
    key: "launches",
    source: "Launch Library 2",
    label: "rocket launches",
    async fetch({ cell }) {
      return { status: "ok", source: "Launch Library 2", data: pickLaunches(await launchList.get(), cell, now()) };
    },
  };

  const apiKey = config.n2yoApiKey;
  const satellitePasses: SubSource<SatellitePass[]> | null = apiKey
    ? {
        key: "satellitePasses",
        source: "N2YO",
        label: "satellite passes",
        async fetch({ cell, signal }) {
          const settled = await Promise.allSettled(
            DEFAULT_SATELLITES.map((sat) =>
              fetchVisualPasses(
                { satelliteId: sat.id, displayName: sat.name, lat: cell.lat, lng: cell.lng },
                { apiKey, signal, throttle: n2yoThrottle, fetch: config.n2yo?.fetch },
              ),
            ),
          );
          const failures = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected");
          if (failures.length === settled.length) throw failures[0].reason;
          const logError = config.logError ?? ((message, error) => console.error(message, error));
          failures.forEach((f) => logError("[satellitePasses] N2YO failed for one satellite:", f.reason));
          const passes = settled
            .flatMap((s) => (s.status === "fulfilled" ? s.value : []))
            .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
            .slice(0, PASS_COUNT);
          // Some satellites missing: show what we have, but retry soon instead of caching for an hour.
          return failures.length > 0
            ? { status: "ok", source: "N2YO", data: passes, ttlSeconds: PARTIAL_FAILURE_TTL_SECONDS }
            : { status: "ok", source: "N2YO", data: passes };
        },
      }
    : null;

  const sources: SubSource[] = satellitePasses ? [launches, satellitePasses] : [launches];

  return {
    id: "space",
    label: "Space",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.space,
    fetch: (context) =>
      combineSources(sources, context, {
        notApplicableReason: "No space data is available for this location.",
        logError: config.logError,
      }),
  };
}
