// Combines several providers into one dashboard card (hazards, space).
//
// Each sub-source runs in parallel and is reported on its own, so the card still
// shows earthquakes when the NWS is down. The card as a whole:
//   • is "ok" when at least one sub-source answered (ok or not_applicable) and one is ok,
//   • is "not_applicable" when every sub-source said it doesn't cover this place,
//   • throws (becomes the module's "error") when every sub-source failed.
// When any sub-source failed, the card asks to be cached briefly so it retries soon.
import type { SourceResult } from "@vantage/shared/modules/sources";
import type { LocationContext, ProviderOutcome } from "./moduleRegistry.js";

export interface SubSource<T = unknown> {
  /** Key in the card's data, e.g. "alerts" or "earthquakes". */
  key: string;
  /** Provider name shown to users, e.g. "NWS". */
  source: string;
  /** Used in the safe error message, e.g. "severe-weather alerts". */
  label: string;
  fetch(context: LocationContext): Promise<ProviderOutcome<T>>;
}

/** How long a card with a failed sub-source stays cached before it is retried. */
export const PARTIAL_FAILURE_TTL_SECONDS = 60;

export interface CombineOptions {
  /** Reason used when every sub-source is not_applicable. */
  notApplicableReason: string;
  logError?: (message: string, error: unknown) => void;
  /** Admin switch: a sub-source whose provider is off is left out of the card. Defaults to all on. */
  isSourceEnabled?: (source: string) => boolean | Promise<boolean>;
}

export async function combineSources(
  allSources: SubSource[],
  context: LocationContext,
  options: CombineOptions,
): Promise<ProviderOutcome<Record<string, SourceResult<unknown>>>> {
  const isEnabled = options.isSourceEnabled;
  const sources = isEnabled
    ? (await Promise.all(allSources.map(async (sub) => ((await isEnabled(sub.source)) ? sub : null)))).filter((sub): sub is SubSource => sub !== null)
    : allSources;
  const logError = options.logError ?? ((message, error) => console.error(message, error));
  const settled = await Promise.allSettled(sources.map((sub) => sub.fetch(context)));

  const data: Record<string, SourceResult<unknown>> = {};
  let ok = 0;
  let failed = 0;
  let firstError: unknown;
  // A sub-source can ask for a shorter cache time too (e.g. some of its own calls failed).
  let shortestTtl: number | undefined;

  sources.forEach((sub, i) => {
    const outcome = settled[i];
    if (outcome.status === "rejected") {
      failed++;
      firstError ??= outcome.reason;
      logError(`[${sub.key}] ${sub.source} failed:`, outcome.reason);
      data[sub.key] = { status: "error", source: sub.source, message: `Couldn't load ${sub.label} right now.` };
    } else if (outcome.value.status === "ok") {
      ok++;
      if (outcome.value.ttlSeconds !== undefined) shortestTtl = Math.min(shortestTtl ?? Infinity, outcome.value.ttlSeconds);
      data[sub.key] = { status: "ok", source: outcome.value.source, data: outcome.value.data };
    } else {
      data[sub.key] = { status: "not_applicable", source: outcome.value.source ?? sub.source, reason: outcome.value.reason };
    }
  });

  if (sources.length > 0 && failed === sources.length) {
    // Nothing to show: let the aggregator turn this into the card's error (not cached).
    throw firstError instanceof Error ? firstError : new Error("Every sub-source failed");
  }
  if (ok === 0 && failed === 0) {
    // With one sub-source, its own reason ("NWS alerts are US-only") says more than the generic one.
    const only = sources.length === 1 ? data[sources[0].key] : undefined;
    const reason = only?.status === "not_applicable" ? only.reason : options.notApplicableReason;
    return { status: "not_applicable", source: sources.map((sub) => sub.source).join(", "), reason };
  }

  const okSources = sources.filter((sub) => data[sub.key]?.status === "ok").map((sub) => sub.source);
  return {
    status: "ok",
    // ok === 0 here means some failed and the rest didn't apply: still show the card with its error rows.
    source: okSources.length > 0 ? okSources.join(", ") : sources.map((sub) => sub.source).join(", "),
    data,
    ...(failed > 0 || shortestTtl !== undefined
      ? { ttlSeconds: Math.min(failed > 0 ? PARTIAL_FAILURE_TTL_SECONDS : Infinity, shortestTtl ?? Infinity) }
      : {}),
  };
}
