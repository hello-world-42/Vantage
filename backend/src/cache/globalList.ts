// One cached copy of a worldwide list (Launch Library launches, GVP volcanoes).
//
// These providers return the same list no matter where the user clicked, so the list is
// fetched once, cached under ONE key, and each module filters it by distance itself.
// Never cache these per grid cell: that would multiply calls to providers with tiny quotas.
//
//   const launches = createGlobalList({ cache, key: "list:launches", ttlSeconds: HOUR, load });
//   const all = await launches.get();
import type { Cache } from "./cache.js";
import { createSingleflight } from "../lib/singleflight.js";

export interface GlobalListOptions<T> {
  cache: Cache;
  /** Cache key, e.g. "list:launches". Must be unique per list. */
  key: string;
  ttlSeconds: number;
  /**
   * Fetches the whole list from the provider. It gets no caller signal on purpose:
   * the load is shared by every waiting request, so one request giving up shouldn't
   * cancel it for the rest. Use fetchJson's own timeout instead.
   */
  load(): Promise<T>;
}

export interface GlobalList<T> {
  get(): Promise<T>;
}

export function createGlobalList<T>(options: GlobalListOptions<T>): GlobalList<T> {
  const flight = createSingleflight();
  return {
    async get() {
      const cached = await options.cache.get<T>(options.key);
      if (cached !== undefined && cached !== null) return cached;
      // Many cells asking at once share one upstream call.
      return flight.run(options.key, async () => {
        const list = await options.load();
        await options.cache.set(options.key, list, options.ttlSeconds);
        return list;
      });
    },
  };
}
