// Caches country and place-name lookups. Country: one per grid cell, so Mapbox reverse geocoding runs once per cell
// instead of on every /api/location request. Borders don't move, so the cache is long.
//
// The aggregator always calls resolveCountry with the cell CENTER, so the coordinates
// themselves make a stable key. "No country" (open ocean) is cached too; a failed
// lookup is not, so it's retried on the next request.
import type { Cache } from "../cache/cache.js";
import { createSingleflight } from "../lib/singleflight.js";

export type CountryResolver = (lat: number, lng: number) => Promise<string | null>;

export const COUNTRY_TTL_SECONDS = 30 * 24 * 60 * 60;
const NONE = "-";

export type PlaceResolver = (lat: number, lng: number) => Promise<{ name: string; context?: string } | null>;

/**
 * Caches place names by the point rounded to 0.02° (about 2 km), so clicks in the same
 * neighbourhood share one Mapbox call but two towns in one grid cell keep their own names.
 */
export function cachedPlaceResolver(resolve: PlaceResolver, cache: Cache, ttlSeconds = COUNTRY_TTL_SECONDS): PlaceResolver {
  const flight = createSingleflight();
  const snap = (value: number) => Math.round(value / 0.02) * 0.02;
  return async (lat, lng) => {
    const key = `place:${snap(lat).toFixed(2)},${snap(lng).toFixed(2)}`;
    const cached = await cache.get<{ name: string; context?: string } | typeof NONE>(key);
    if (cached !== undefined && cached !== null) return cached === NONE ? null : cached;
    return flight.run(key, async () => {
      const place = await resolve(lat, lng);
      await cache.set(key, place ?? NONE, ttlSeconds);
      return place;
    });
  };
}

export function cachedCountryResolver(resolve: CountryResolver, cache: Cache, ttlSeconds = COUNTRY_TTL_SECONDS): CountryResolver {
  const flight = createSingleflight();
  return async (lat, lng) => {
    const key = `country:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = await cache.get<string>(key);
    if (cached !== undefined && cached !== null) return cached === NONE ? null : cached;
    return flight.run(key, async () => {
      const country = await resolve(lat, lng);
      await cache.set(key, country ?? NONE, ttlSeconds);
      return country;
    });
  };
}
