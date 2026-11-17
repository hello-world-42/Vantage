// The space card: upcoming rocket launches (worldwide, nearest flagged), visible satellite
// passes over the selected cell, and the chance of aurora overhead (NOAA SWPC).
import type { AuroraData, AuroraLevel, Launch, LaunchesData, SatellitePass } from "@vantage/shared/modules/space";
import type { Cache } from "../../cache/cache.js";
import { createGlobalList } from "../../cache/globalList.js";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { combineSources, PARTIAL_FAILURE_TTL_SECONDS, type SubSource } from "../../aggregator/subSources.js";
import { distanceKm } from "../../lib/geo.js";
import { createThrottle, type Throttle } from "../../lib/throttle.js";
import { fetchUpcomingLaunches, type LaunchRecord } from "./launchLibrary.client.js";
import { DEFAULT_SATELLITES, fetchVisualPasses } from "./n2yo.client.js";
import { auroraProbabilityAt, fetchAuroraGrid, fetchLatestKp, type KpReading } from "./noaaSwpc.client.js";

const HOUR_MS = 60 * 60 * 1000;

/** Launches within this distance count as "nearby" (roughly where a launch is visible from the ground). */
export const NEARBY_RADIUS_KM = 1_000;
const UPCOMING_COUNT = 5;
const NEARBY_COUNT = 5;
const PASS_COUNT = 8;
/** Launch Library's "upcoming" list includes launches from the last day; hide ones that are long gone. */
const RECENT_GRACE_MS = 6 * HOUR_MS;
/** The aurora model updates every few minutes; the card is re-built this often so it stays current. */
const AURORA_TTL_SECONDS = 15 * 60;
/** Pass predictions cover the next two days, so a cell's passes can be reused for a few hours. */
const PASSES_TTL_SECONDS = 3 * 60 * 60;
/** Statuses that mean the launch already happened (Launch Library "abbrev" values). */
const FINISHED_STATUSES = new Set(["Success", "Failure", "Partial Failure"]);

export interface SpaceConfig {
  /** The global-list cache (app.ts listCache), not the per-cell one. */
  cache: Cache;
  /** The per-cell cache (app.ts cache). Satellite passes are kept here so N2YO isn't re-asked every 15 minutes. */
  cellCache?: Cache;
  n2yoApiKey?: string;
  now?: () => Date;
  logError?: (message: string, error: unknown) => void;
  /** Admin switch from the data_sources table; a provider that is off is left out of the card. */
  isSourceEnabled?: (source: string) => boolean | Promise<boolean>;
  /** Overridable in tests. Defaults stay under each provider's hourly quota. */
  launchLibrary?: { fetch?: typeof fetch; throttle?: Throttle };
  n2yo?: { fetch?: typeof fetch; throttle?: Throttle };
  swpc?: { fetch?: typeof fetch };
}

/** Bands for "chance of aurora overhead". Even "low" can be visible on the horizon on a dark night. */
export function auroraLevel(probability: number): AuroraLevel {
  if (probability >= 50) return "high";
  if (probability >= 20) return "moderate";
  if (probability >= 5) return "low";
  return "none";
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

/** Drops passes that already ended and keeps the next few. */
function upcomingPasses(passes: SatellitePass[], now: Date): SatellitePass[] {
  return passes.filter((pass) => Date.parse(pass.end) >= now.getTime()).slice(0, PASS_COUNT);
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
          const cacheKey = `passes:${cell.key}`;
          const cached = await config.cellCache?.get<SatellitePass[]>(cacheKey);
          if (cached) return { status: "ok", source: "N2YO", data: upcomingPasses(cached, now()) };
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
            .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
          // Some satellites missing: show what we have, but retry soon instead of keeping it for hours.
          if (failures.length > 0) {
            return { status: "ok", source: "N2YO", data: upcomingPasses(passes, now()), ttlSeconds: PARTIAL_FAILURE_TTL_SECONDS };
          }
          await config.cellCache?.set(cacheKey, passes, PASSES_TTL_SECONDS);
          return { status: "ok", source: "N2YO", data: upcomingPasses(passes, now()) };
        },
      }
    : null;

  const auroraGrid = createGlobalList({
    cache: config.cache,
    key: "list:aurora",
    ttlSeconds: 10 * 60,
    load: () => fetchAuroraGrid({ fetch: config.swpc?.fetch }),
  });
  const kpIndex = createGlobalList<KpReading | { kp: null; at: null }>({
    cache: config.cache,
    key: "list:kp",
    ttlSeconds: 30 * 60,
    load: async () => (await fetchLatestKp({ fetch: config.swpc?.fetch })) ?? { kp: null, at: null },
  });

  const aurora: SubSource<AuroraData> = {
    key: "aurora",
    source: "NOAA SWPC",
    label: "the aurora forecast",
    async fetch({ cell }) {
      // The K-index is a nice-to-have: if it fails, still show the aurora chance.
      const [grid, kp] = await Promise.all([auroraGrid.get(), kpIndex.get().catch(() => ({ kp: null, at: null }))]);
      const probability = auroraProbabilityAt(grid, cell.lat, cell.lng);
      return {
        status: "ok",
        source: "NOAA SWPC",
        ttlSeconds: AURORA_TTL_SECONDS,
        data: { probability, level: auroraLevel(probability), kp: kp.kp, kpAt: kp.at, observedAt: grid.observedAt, forecastFor: grid.forecastFor },
      };
    },
  };

  const sources: SubSource[] = satellitePasses ? [launches, satellitePasses, aurora] : [launches, aurora];

  return {
    id: "space",
    label: "Space",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.space,
    fetch: (context) =>
      combineSources(sources, context, {
        notApplicableReason: "No space data is available for this location.",
        logError: config.logError,
        isSourceEnabled: config.isSourceEnabled,
      }),
  };
}
