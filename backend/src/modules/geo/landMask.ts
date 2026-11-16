import { z } from "zod";
import data from "./data/land.json" with { type: "json" };

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const ringSchema = z.array(position).min(4).refine((ring) =>
  ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1], "Land rings must be closed");
const polygons = z.object({ polygons: z.array(z.array(ringSchema).min(1)).min(1) }).parse(data).polygons;
export type LandPolygon = [number, number][][];

/** 0 outside, 1 inside, 2 on boundary. GeoJSON rings are [longitude, latitude]. */
function ringContains(lat: number, lng: number, ring: [number, number][]): 0 | 1 | 2 {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = (lng - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-10 && lng >= Math.min(xi, xj) && lng <= Math.max(xi, xj)
      && lat >= Math.min(yi, yj) && lat <= Math.max(yi, yj)) return 2;
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside ? 1 : 0;
}

/** Excludes coast boundaries and polygon holes, independent of ring winding. */
export function containsLandPoint(lat: number, lng: number, polygon: LandPolygon): boolean {
  if (!polygon.length || ringContains(lat, lng, polygon[0]) !== 1) return false;
  return !polygon.slice(1).some((hole) => ringContains(lat, lng, hole) !== 0);
}

const indexed = polygons.map((polygon) => {
  const outer = polygon[0];
  return { polygon, minLng: Math.min(...outer.map(([x]) => x)), maxLng: Math.max(...outer.map(([x]) => x)),
    minLat: Math.min(...outer.map(([, y]) => y)), maxLat: Math.max(...outer.map(([, y]) => y)) };
});

export function isLand(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return indexed.some(({ polygon, minLng, maxLng, minLat, maxLat }) =>
    lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat && containsLandPoint(lat, lng, polygon));
}
