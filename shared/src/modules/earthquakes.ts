export interface Earthquake {
  id: string;
  magnitude: number | null;
  place: string | null;
  occurredAt: string;
  updatedAt: string | null;
  lat: number;
  lng: number;
  depthKm: number;
  distanceKm: number;
  url: string | null;
}

/** Recent catalog records, with explicit query limits; not a prediction or alert subscription. */
export interface EarthquakeData {
  query: { lat: number; lng: number; radiusKm: number; minMagnitude: number; startTime: string; endTime: string; limit: number };
  earthquakes: Earthquake[];
  /** True when the returned count reaches the cap; further matches may exist. */
  possiblyTruncated: boolean;
  attribution: { text: string; url: string };
}
