import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";
import { createSkyConditionsModule, DEFAULT_STATIC_DIR, gridFromValues, lightPollutionLevel, loadGrid, resolveStaticDir, type GridMeta } from "../src/modules/staticData/staticData.service.js";
import { createModuleRegistry } from "../src/aggregator/moduleRegistry.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";

// A tiny 10° grid (18 rows × 36 cols) in the same layout preprocess.py writes: row 0 = southernmost.
const SIZE = 10;
const ROWS = 18;
const COLS = 36;
const meta = (): GridMeta => ({ format: "vantage-grid-v1", sizeDeg: SIZE, rows: ROWS, cols: COLS, dtype: "float32-le", rowOrder: "south-to-north", year: 2024 });
const index = (lat: number, lng: number) => Math.floor((lat + 90) / SIZE) * COLS + Math.floor((lng + 180) / SIZE);

function sampleValues() {
  const values = new Float32Array(ROWS * COLS).fill(Number.NaN);
  values[index(33.8, -84.4)] = 42; // Atlanta's 10° cell: bright
  values[index(-25, 135)] = 0.1; // central Australia: dark
  return values;
}

const at = (lat: number, lng: number): LocationContext => ({
  query: { lat, lng },
  cell: { key: "k", lat, lng, sizeDeg: 0.25 },
  countryCode: null,
  signal: new AbortController().signal,
});

test("grid lookup uses south-first rows, wraps longitude, and treats NaN as no data", () => {
  const grid = gridFromValues(sampleValues(), meta());
  assert.equal(grid.valueAt(33.8, -84.4), 42);
  assert.equal(grid.valueAt(33.8, -84.4 + 360), 42, "longitude past 180 wraps");
  assert.equal(grid.valueAt(-25, 135), Math.fround(0.1), "stored as float32");
  assert.equal(grid.valueAt(0, -30), null, "open ocean has no data");
  assert.equal(grid.valueAt(90, 179.99), null, "lat 90 maps to the top row instead of past the end");
});

test("a grid with the wrong number of values is rejected", () => {
  assert.throws(() => gridFromValues(new Float32Array(10), meta()), /expected 18 x 36/);
});

test("loadGrid reads the .bin/.json pair written by the preprocessing script, and is null when missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "vantage-grid-"));
  try {
    const values = sampleValues();
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
    writeFileSync(join(dir, "light_pollution.bin"), bytes);
    writeFileSync(join(dir, "light_pollution.json"), JSON.stringify(meta()));

    const grid = loadGrid(dir, "light_pollution");
    assert.ok(grid);
    assert.equal(grid.valueAt(33.8, -84.4), 42);
    assert.equal(grid.year, 2024);
    assert.equal(loadGrid(dir, "population_density"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("light pollution levels go from very dark to city center", () => {
  assert.deepEqual([0.1, 0.5, 2, 10, 50].map(lightPollutionLevel), ["very_dark", "rural", "suburban", "urban", "city_center"]);
});

test("sky conditions: values for land, not_applicable for open ocean, absent grids left out", async () => {
  const module = createSkyConditionsModule({ grids: { lightPollution: gridFromValues(sampleValues(), meta()), population: null } });
  assert.ok(module);
  const city = await module.fetch(at(33.8, -84.4));
  assert.deepEqual(city, { status: "ok", source: "VIIRS", data: { lightPollution: { radiance: 42, level: "city_center", year: 2024 } } });
  const ocean = await module.fetch(at(0, -30));
  assert.equal(ocean.status, "not_applicable");
});

test("sky conditions isn't registered until a grid file exists", () => {
  assert.equal(createSkyConditionsModule({ grids: { lightPollution: null, population: null } }), null);
  const ids = createModuleRegistry({ listCache: createMemoryCache(), staticDataDir: join(tmpdir(), "no-such-folder") }).map((m) => m.id);
  assert.deepEqual(ids, ["weather", "airQuality", "hazards", "astronomy", "space", "ocean"]);
});

test("STATIC_DATA_DIR: relative paths are read from the repo root, like the .env", () => {
  assert.equal(resolveStaticDir(undefined), DEFAULT_STATIC_DIR);
  assert.equal(resolveStaticDir("data/static"), DEFAULT_STATIC_DIR, "same folder whether the server runs from backend/ or the root");
  const absolute = join(tmpdir(), "grids");
  assert.equal(resolveStaticDir(absolute), absolute);
});
