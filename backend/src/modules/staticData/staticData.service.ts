// Reads the coarse grids made by scripts/preprocess-static/preprocess.py
// (light pollution and population) and looks values up by grid cell.
//
// The files live in data/static/ at the repo root. A grid that hasn't been generated
// yet is simply missing: the sky-conditions card then leaves that field out.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LightPollutionLevel, SkyConditionsData } from "@vantage/shared/modules/skyConditions";
import { TTL_SECONDS } from "../../cache/ttlPolicy.js";
import type { ModuleDefinition } from "../../aggregator/moduleRegistry.js";
import { normalizeLng } from "../../lib/grid.js";

/** The repo root, from src/ (dev) or dist/ (build). */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const DEFAULT_STATIC_DIR = join(REPO_ROOT, "data", "static");

/** STATIC_DATA_DIR may be relative; like the .env itself, it's read from the repo root. */
export function resolveStaticDir(dir: string | undefined): string {
  if (!dir) return DEFAULT_STATIC_DIR;
  return isAbsolute(dir) ? dir : resolve(REPO_ROOT, dir);
}

const metaSchema = z.object({
  format: z.literal("vantage-grid-v1"),
  sizeDeg: z.number().positive(),
  rows: z.number().int().positive(),
  cols: z.number().int().positive(),
  dtype: z.literal("float32-le"),
  rowOrder: z.literal("south-to-north"),
  year: z.number().int().nullable().optional(),
});

export type GridMeta = z.infer<typeof metaSchema>;

export interface Grid {
  sizeDeg: number;
  year: number | null;
  /** The value of the cell that contains (lat, lng), or null for no data. */
  valueAt(lat: number, lng: number): number | null;
}

export function gridFromValues(values: Float32Array, meta: GridMeta): Grid {
  if (values.length !== meta.rows * meta.cols) {
    throw new Error(`Grid has ${values.length} values; expected ${meta.rows} x ${meta.cols}.`);
  }
  return {
    sizeDeg: meta.sizeDeg,
    year: meta.year ?? null,
    valueAt(lat, lng) {
      // Same indexing as lib/grid.ts snapToCell, but with the file's own cell size.
      const row = Math.min(Math.floor((Math.min(90, Math.max(-90, lat)) + 90) / meta.sizeDeg), meta.rows - 1);
      const col = Math.min(Math.floor((normalizeLng(lng) + 180) / meta.sizeDeg), meta.cols - 1);
      const value = values[row * meta.cols + col];
      return Number.isFinite(value) ? value : null;
    },
  };
}

/** Loads `<name>.json` + `<name>.bin` from `dir`, or returns null if the grid isn't there. */
export function loadGrid(dir: string, name: string): Grid | null {
  const metaPath = join(dir, `${name}.json`);
  const binPath = join(dir, `${name}.bin`);
  if (!existsSync(metaPath) || !existsSync(binPath)) return null;

  const meta = metaSchema.parse(JSON.parse(readFileSync(metaPath, "utf8")));
  const bytes = readFileSync(binPath);
  // Copy into an aligned buffer, then read little-endian floats regardless of the machine.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float32Array(bytes.byteLength / 4);
  for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(i * 4, true);
  return gridFromValues(values, meta);
}

/**
 * Rough sky-brightness bands for a 0.25° cell's AVERAGE radiance (nW/cm²/sr).
 * Approximate on purpose: averaging over ~700 km² dilutes city centers, so treat these
 * as "what the area is like", not a measured Bortle class.
 */
export function lightPollutionLevel(radiance: number): LightPollutionLevel {
  if (radiance < 0.25) return "very_dark";
  if (radiance < 1) return "rural";
  if (radiance < 5) return "suburban";
  if (radiance < 20) return "urban";
  return "city_center";
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export interface SkyConditionsConfig {
  /** Folder with the grid files; relative paths are from the repo root. Defaults to data/static. */
  dir?: string;
  /** Injected in tests instead of reading files. */
  grids?: { lightPollution: Grid | null; population: Grid | null };
}

/**
 * The sky-conditions card (light pollution + population density).
 * Returns null when neither grid file exists, so the card isn't registered at all
 * instead of showing an error on every click.
 */
export function createSkyConditionsModule(config: SkyConditionsConfig = {}): ModuleDefinition<SkyConditionsData> | null {
  const dir = resolveStaticDir(config.dir);
  const grids = config.grids ?? {
    lightPollution: loadGrid(dir, "light_pollution"),
    population: loadGrid(dir, "population_density"),
  };
  if (!grids.lightPollution && !grids.population) return null;

  const sources = [grids.lightPollution && "VIIRS", grids.population && "SEDAC GPW"].filter(Boolean).join(", ");

  return {
    id: "skyConditions",
    label: "Sky conditions",
    scope: "cell",
    ttlSeconds: TTL_SECONDS.skyConditions,
    async fetch({ cell }) {
      const data: SkyConditionsData = {};
      const radiance = grids.lightPollution?.valueAt(cell.lat, cell.lng) ?? null;
      if (grids.lightPollution && radiance !== null) {
        data.lightPollution = { radiance: round(radiance, 2), level: lightPollutionLevel(radiance), year: grids.lightPollution.year };
      }
      const density = grids.population?.valueAt(cell.lat, cell.lng) ?? null;
      if (grids.population && density !== null) {
        data.population = { densityPerKm2: round(density, 1), year: grids.population.year };
      }
      if (!data.lightPollution && !data.population) {
        return { status: "not_applicable", source: sources, reason: "No light-pollution or population data for this spot (often open ocean)." };
      }
      return { status: "ok", source: sources, data };
    },
  };
}
