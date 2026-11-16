import assert from "node:assert/strict";
import test from "node:test";
import { fetchEarthquakes } from "../src/modules/hazards/hazards.service.js";
import { EarthquakeClientError } from "../src/modules/hazards/usgsQuakes.client.js";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { earthquakeNow, earthquakeFeature, earthquakeCollection, quakeTransport } from "./fixtures/earthquakes.js";

test("normalizes GeoJSON coordinates, milliseconds, depth, distance and query metadata", async () => {
  const result = await fetchEarthquakes(37.8, -122.4, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection()) });
  assert.equal(result.status, "ok"); assert.equal(result.source, "USGS");
  assert.deepEqual(result.data.earthquakes[0], {
    id: "test-quake", magnitude: 3.1, place: "Test location", occurredAt: "2026-11-15T10:00:00.000Z",
    updatedAt: "2026-11-15T11:00:00.000Z", lat: 37.8, lng: -122.4, depthKm: 8.5, distanceKm: 0,
    url: "https://earthquake.usgs.gov/earthquakes/eventpage/test-quake",
  });
  assert.equal(result.data.query.radiusKm, 500); assert.equal(result.data.query.minMagnitude, 2.5);
  assert.equal(result.data.possiblyTruncated, false); assert.equal(result.data.attribution.text, "Earthquake data by USGS");
});

test("no events remains a successful worldwide result", async () => {
  const result = await fetchEarthquakes(35.7, 139.7, { now: earthquakeNow, fetch: quakeTransport(null, 204) });
  assert.equal(result.status, "ok"); assert.deepEqual(result.data.earthquakes, []);
});

test("retains null fields and negative depth; sorts newest first", async () => {
  const feature = earthquakeFeature();
  const newer = { ...feature, id: "newer", geometry: { type: "Point", coordinates: [-122.4, 37.8, -1] },
    properties: { ...feature.properties, time: Date.parse("2026-11-15T11:30:00Z"), mag: null, place: null, updated: null, url: null } };
  const result = await fetchEarthquakes(37.8, -122.4, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection([feature, newer])) });
  const first = result.data.earthquakes[0];
  assert.equal(first.id, "newer"); assert.equal(first.magnitude, null); assert.equal(first.place, null);
  assert.equal(first.updatedAt, null); assert.equal(first.url, null); assert.equal(first.depthKm, -1);
});

test("computes short distances across the antimeridian and preserves zero magnitude", async () => {
  const feature = earthquakeFeature();
  const result = await fetchEarthquakes(0, 179.9, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection([{
    ...feature, geometry: { type: "Point", coordinates: [-179.9, 0, 0] }, properties: { ...feature.properties, mag: 0 },
  }])) });
  assert.equal(result.data.earthquakes[0].distanceKm, 22.2);
  assert.equal(result.data.earthquakes[0].magnitude, 0);
});

test("flags possibly truncated results at the declared cap", async () => {
  const features = Array.from({ length: 100 }, (_, index) => ({ ...earthquakeFeature(), id: `quake-${index}` }));
  const result = await fetchEarthquakes(37.8, -122.4, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection(features)) });
  assert.equal(result.data.earthquakes.length, 100); assert.equal(result.data.possiblyTruncated, true);
});

test("throws typed failures instead of reporting no events", async () => {
  await assert.rejects(fetchEarthquakes(0, 0, { fetch: quakeTransport({}, 503) }),
    (error: unknown) => error instanceof EarthquakeClientError && error.code === "http");
});

test("fits the existing provider contract and caches globally applicable data per cell", async () => {
  let calls = 0;
  const transport: typeof fetch = async (input) => {
    calls++; const url = new URL(String(input)); assert.notEqual(url.searchParams.get("latitude"), "35.7");
    return new Response(JSON.stringify(earthquakeCollection([])));
  };
  const aggregate = createAggregator({ cache: createMemoryCache(), modules: [{
    id: "hazards", label: "Earthquakes", scope: "cell", ttlSeconds: 300,
    fetch: ({ cell, signal }) => fetchEarthquakes(cell.lat, cell.lng, { fetch: transport, now: earthquakeNow, signal }),
  }] });
  const first = await aggregate({ lat: 35.7, lng: 139.7, country: "JP" });
  const second = await aggregate({ lat: 35.7, lng: 139.7, country: "JP" });
  assert.equal(first.modules.hazards?.status, "ok"); assert.deepEqual(first.modules.hazards, second.modules.hazards);
  assert.equal(calls, 1);
});
