// In-process cache: a Map of values with expiry times. The default CACHE_DRIVER.
// Lost on restart, which is fine: data is simply fetched again on the next request.
import type { Cache } from "./cache.js";

interface Entry {
  value: unknown;
  expiresAt: number;
}

export interface MemoryCacheOptions {
  /** Oldest entries are evicted beyond this many. Keeps memory bounded. */
  maxEntries?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createMemoryCache(options: MemoryCacheOptions = {}): Cache {
  const maxEntries = options.maxEntries ?? 5_000;
  const now = options.now ?? Date.now;
  const store = new Map<string, Entry>();

  return {
    async get<T>(key: string) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      if (!(ttlSeconds > 0)) return;
      store.delete(key); // re-insert so Map order reflects recency
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
      }
    },
    async delete(key: string) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    },
  };
}
