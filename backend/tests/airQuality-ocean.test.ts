import assert from "node:assert/strict";
import test from "node:test";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";
import { aqiCategory, createAirQualityModule } from "../src/modules/airQuality/airQuality.service.js";
import { createOceanModule } from "../src/modules/ocean/ocean.service.js";
import { fetchLatestKp } from "../src/modules/space/noaaSwpc.client.js";

const at = (lat: number, lng: number): LocationContext => ({
  query: { lat, lng },
  cell: { key: "k", lat, lng, sizeDeg: 0.25 },
  countryCode: null,
  signal: new AbortController().signal,
});

function replying(body: unknown, status = 200) {
  const urls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, urls };
}

// Real response shapes from Open-Meteo (2026-11-17), trimmed to the fields we request.
const airQualityBody = {
  current: { time: 1794888000, interval: 3600, us_aqi: 65, european_aqi: 29, pm2_5: 8.2, pm10: 8.5, ozone: 45.0, nitrogen_dioxide: 16.9, sulphur_dioxide: 1.1, carbon_monoxide: 196.0 },
};
const marineBody = {
  current: { time: 1794888900, interval: 900, wave_height: 2.16, wave_direction: 271, wave_period: 9.95, swell_wave_height: 1.46, swell_wave_period: 10.95, sea_surface_temperature: 23.7, ocean_current_velocity: 0.4, ocean_current_direction: 333 },
};
const inlandBody = {
  current: { time: 1794888900, interval: 900, wave_height: null, wave_direction: null, wave_period: null, swell_wave_height: null, swell_wave_period: null, sea_surface_temperature: null, ocean_current_velocity: null, ocean_current_direction: null },
};

test("AQI categories follow the US EPA bands", () => {
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory), [
    "good", "good", "moderate", "moderate", "unhealthy_sensitive", "unhealthy_sensitive",
    "unhealthy", "unhealthy", "very_unhealthy", "very_unhealthy", "hazardous",
  ]);
});

test("air quality: maps Open-Meteo's response and asks for the cell center", async () => {
  const { fn, urls } = replying(airQualityBody);
  const outcome = await createAirQualityModule({ fetch: fn }).fetch(at(33.875, -84.375));
  assert.deepEqual(outcome, {
    status: "ok", source: "Open-Meteo",
    data: {
      validAt: "2026-11-17T04:00:00.000Z", usAqi: 65, category: "moderate", europeanAqi: 29,
      pm25: 8.2, pm10: 8.5, ozone: 45, nitrogenDioxide: 16.9, sulphurDioxide: 1.1, carbonMonoxide: 196,
      units: { concentration: "µg/m³" },
    },
  });
  const url = new URL(urls[0]);
  assert.equal(url.host, "air-quality-api.open-meteo.com");
  assert.equal(url.searchParams.get("latitude"), "33.8750");
  assert.equal(url.searchParams.get("longitude"), "-84.3750");
});

test("air quality: all-null values are not applicable; a provider failure throws", async () => {
  const empty = { current: { time: 1794888000 } };
  const none = await createAirQualityModule({ fetch: replying(empty).fn }).fetch(at(0, 0));
  assert.equal(none.status, "not_applicable");
  await assert.rejects(createAirQualityModule({ fetch: replying({}, 500).fn }).fetch(at(0, 0)), /Open-Meteo Air Quality responded with HTTP 500/);
});

test("ocean: sea state off the coast", async () => {
  const outcome = await createOceanModule({ fetch: replying(marineBody).fn }).fetch(at(33.875, -118.625));
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.equal(outcome.data.waveHeight, 2.16);
  assert.equal(outcome.data.seaSurfaceTemperature, 23.7);
  assert.equal(outcome.data.currentDirection, 333);
  assert.equal(outcome.data.validAt, "2026-11-17T04:15:00.000Z");
});

test("ocean: an inland point is not applicable, not an error", async () => {
  const outcome = await createOceanModule({ fetch: replying(inlandBody).fn }).fetch(at(39.125, -98.375));
  assert.deepEqual(outcome, { status: "not_applicable", source: "Open-Meteo", reason: "No ocean here: this spot is inland." });
});

test("Kp index: reads NOAA's object format and the older header-row format", async () => {
  const objects = [{ time_tag: "2026-11-10T00:00:00", Kp: 3.0 }, { time_tag: "2026-11-10T03:00:00", Kp: 2.33 }];
  assert.deepEqual(await fetchLatestKp({ fetch: replying(objects).fn }), { kp: 2.33, at: "2026-11-10T03:00:00.000Z" });
  const rows = [["time_tag", "Kp", "a_running", "station_count"], ["2026-11-10 00:00:00.000", "3.00", "15", "8"], ["2026-11-10 03:00:00.000", "5.67", "67", "8"]];
  assert.deepEqual(await fetchLatestKp({ fetch: replying(rows).fn }), { kp: 5.67, at: "2026-11-10T03:00:00.000Z" });
  assert.equal(await fetchLatestKp({ fetch: replying([]).fn }), null);
});
