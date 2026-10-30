import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { newDb } from "pg-mem";

const expectedDataSources = [
  { name: "Open-Meteo", category: "weather", is_enabled: true },
  { name: "USGS", category: "hazards", is_enabled: true },
  { name: "NWS", category: "alerts", is_enabled: true },
  { name: "NOAA SWPC", category: "aurora", is_enabled: true },
  { name: "N2YO", category: "satellites", is_enabled: true },
  { name: "Launch Library 2", category: "launches", is_enabled: true },
];

function createDatabase() {
  const database = newDb({ noAstCoverageCheck: true });
  const initialMigration = readFileSync(
    new URL("./migrations/001_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const seedMigration = readFileSync(
    new URL("./migrations/002_seed_data_sources.sql", import.meta.url),
    "utf8",
  );

  database.public.none(initialMigration);
  const adapter = database.adapters.createPg();

  return {
    pool: new adapter.Pool(),
    applySeed: () => {
      if (seedMigration.trim()) database.public.none(seedMigration);
    },
  };
}

test("data-source migration seeds the canonical six providers", async (t) => {
  const database = createDatabase();
  t.after(() => database.pool.end());

  database.applySeed();
  const result = await database.pool.query(
    `SELECT name, category, is_enabled
     FROM data_sources
     ORDER BY source_id`,
  );

  assert.deepEqual(result.rows, expectedDataSources);
});

test("data-source migration is a no-op when safely rerun", async (t) => {
  const database = createDatabase();
  t.after(() => database.pool.end());

  database.applySeed();
  await database.pool.query(
    `UPDATE data_sources
     SET is_enabled = FALSE, last_status = 'disabled'
     WHERE name = 'Open-Meteo'`,
  );
  database.applySeed();

  const countResult = await database.pool.query(
    "SELECT COUNT(*)::int AS count FROM data_sources",
  );
  const existingState = await database.pool.query(
    `SELECT is_enabled, last_status
     FROM data_sources
     WHERE name = 'Open-Meteo'`,
  );

  assert.equal(countResult.rows[0].count, 6);
  assert.deepEqual(existingState.rows, [
    { is_enabled: false, last_status: "disabled" },
  ]);
});
