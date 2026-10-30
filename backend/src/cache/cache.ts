// The cache interface every implementation follows (memoryCache now, redisCache later).
// Async so a network-backed cache (Upstash Redis) can drop in without changing callers.

export interface Cache {
  /** Returns the stored value, or undefined if missing or expired. */
  get<T>(key: string): Promise<T | undefined>;
  /** Stores a value for ttlSeconds. */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
