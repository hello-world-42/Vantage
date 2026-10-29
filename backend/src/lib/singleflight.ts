// If a fetch for key X is already running, later callers for X share that same promise
// instead of starting another upstream request. Protects low-quota APIs from bursts.

export interface Singleflight {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Number of in-flight keys (useful in tests). */
  readonly size: number;
}

export function createSingleflight(): Singleflight {
  const inFlight = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<T>;
      const promise = (async () => fn())().finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
    get size() {
      return inFlight.size;
    },
  };
}
