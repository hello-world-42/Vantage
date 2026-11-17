// Offline fallback for "is this point in the United States?", used when Mapbox reverse
// geocoding isn't configured or fails. NWS alerts are the only US-only data, so the
// US is the only country this needs to recognise: it returns "US" or null (unknown).
//
// It works from the point's IANA time zone (tz-lookup, offline). Zone borders follow
// country borders, so this is right everywhere except within a few km of the border.
import tzlookup from "tz-lookup";

/** Time zones that lie entirely inside the 50 states. */
const US_ZONES = new Set([
  "America/New_York", "America/Detroit", "America/Chicago", "America/Denver", "America/Boise",
  "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "America/Juneau", "America/Sitka",
  "America/Metlakatla", "America/Yakutat", "America/Nome", "America/Adak", "America/Menominee",
  "Pacific/Honolulu",
]);
const US_ZONE_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/"];

export function countryFromTimeZone(timeZone: string | null | undefined): "US" | null {
  if (!timeZone) return null;
  return US_ZONES.has(timeZone) || US_ZONE_PREFIXES.some((prefix) => timeZone.startsWith(prefix)) ? "US" : null;
}

export function offlineCountry(lat: number, lng: number): "US" | null {
  try {
    return countryFromTimeZone(tzlookup(lat, lng));
  } catch {
    return null;
  }
}

/**
 * Uses `primary` (Mapbox) when given; if it's missing or fails, falls back to the offline check.
 * A primary answer of null (open ocean) is trusted and not second-guessed.
 */
export function withOfflineCountryFallback(
  primary: ((lat: number, lng: number) => Promise<string | null>) | undefined,
  logError: (message: string, error: unknown) => void = () => {},
): (lat: number, lng: number) => Promise<string | null> {
  return async (lat, lng) => {
    if (primary) {
      try {
        return await primary(lat, lng);
      } catch (error) {
        logError("[country] lookup failed, using the offline fallback:", error);
      }
    }
    return offlineCountry(lat, lng);
  };
}
