// Distance math for modules that filter a global list by distance (launches, volcanoes).

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres (haversine). Accurate to ~0.5% anywhere on Earth. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Adds `distanceKm` from `origin` to every item, keeps those within `radiusKm`
 * (all of them when radiusKm is Infinity), nearest first.
 */
export function nearest<T extends Point>(
  origin: Point,
  items: readonly T[],
  radiusKm = Infinity,
): Array<T & { distanceKm: number }> {
  return items
    .map((item) => ({ ...item, distanceKm: Math.round(distanceKm(origin, item)) }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((x, y) => x.distanceKm - y.distanceKm);
}
