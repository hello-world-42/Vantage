// Snap coordinates to a fixed grid so nearby clicks share one cache entry,
// and upstream APIs are called once per cell (at its center) instead of once per click.
import type { GridCell } from "@vantage/shared";

/** 0.25° ≈ 28 km north-south. Change here only. */
export const DEFAULT_CELL_SIZE_DEG = 0.25;

/** Wrap any longitude into [-180, 180). 190 → -170, -540 → -180. */
export function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Clamp latitude into [-90, 90]. */
export function clampLat(lat: number): number {
  return Math.min(90, Math.max(-90, lat));
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function snapToCell(lat: number, lng: number, sizeDeg = DEFAULT_CELL_SIZE_DEG): GridCell {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new RangeError("Latitude and longitude must be finite numbers.");
  }
  if (!(sizeDeg > 0) || 180 % sizeDeg !== 0) {
    throw new RangeError("Cell size must divide 180 evenly (e.g. 0.25, 0.5, 1).");
  }
  const rows = 180 / sizeDeg;
  const cols = 360 / sizeDeg;
  // min() keeps lat = 90 inside the last row instead of creating a row past the pole.
  const row = Math.min(Math.floor((clampLat(lat) + 90) / sizeDeg), rows - 1);
  const col = Math.min(Math.floor((normalizeLng(lng) + 180) / sizeDeg), cols - 1);
  return {
    key: `${sizeDeg}:${row}:${col}`,
    lat: round6(-90 + (row + 0.5) * sizeDeg),
    lng: round6(-180 + (col + 0.5) * sizeDeg),
    sizeDeg,
  };
}
