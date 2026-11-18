import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createGeocodeRouter, type GeocodeRouterOptions } from "../src/routes/geocode.js";
import { forwardGeocode, GeocodingError } from "../src/modules/geo/mapboxGeocoding.client.js";
import { geocode as frontendGeocode } from "../../frontend/src/api/client.js";

const token = "dummy-mapbox-token-for-tests";
const results = [{ id: "place.atlanta", name: "Atlanta", context: "Georgia, United States", lat: 33.75, lng: -84.39 }];
function app(options: Partial<GeocodeRouterOptions> = {}) {
  const server = express();
  server.use("/api/geocode", createGeocodeRouter({ getAccessToken: () => token, geocode: async () => results, ...options }));
  return server;
}

test("mounted route trims the query and returns the shared response envelope", async () => {
  const server = app({ geocode: async (query, accessToken) => {
    assert.equal(query, "Atlanta"); assert.equal(accessToken, token); return results;
  } });
  const response = await request(server).get("/api/geocode").query({ q: " Atlanta " }).expect(200);
  assert.deepEqual(response.body, { results });
  assert.ok(!response.text.includes(token));
});

test("rejects missing, whitespace, repeated, nested and oversized queries before reading configuration", async () => {
  const server = app({ getAccessToken: () => assert.fail("Must not read configuration") });
  for (const path of ["/api/geocode", "/api/geocode?q=%20%20", "/api/geocode?q=a&q=b", "/api/geocode?q[x]=Atlanta", `/api/geocode?q=${"x".repeat(201)}`]) {
    await request(server).get(path).expect(400);
  }
});

test("accepts one and 200 character queries consistently with the shared schema", async () => {
  for (const q of ["A", "x".repeat(200)]) await request(app()).get("/api/geocode").query({ q }).expect(200);
});

test("missing configured token produces 503 without calling the provider", async () => {
  for (const value of [undefined, "", "  "]) {
    const response = await request(app({ getAccessToken: () => value, geocode: async () => assert.fail("Must not fetch") }))
      .get("/api/geocode?q=Atlanta").expect(503);
    assert.deepEqual(response.body, { error: "Location search is not configured." });
  }
});

test("no matches produces 200 with an empty results array", async () => {
  const response = await request(app({ geocode: async () => [] })).get("/api/geocode?q=Unknown").expect(200);
  assert.deepEqual(response.body, { results: [] });
});

test("upstream HTTP/network/payload failures produce sanitized 502 responses", async () => {
  for (const error of [new GeocodingError("http", token, 401), new GeocodingError("network", token),
    new GeocodingError("invalid_response", token), new Error(token)]) {
    const response = await request(app({ geocode: async () => { throw error; } })).get("/api/geocode?q=Atlanta").expect(502);
    assert.deepEqual(response.body, { error: "Location search is unavailable right now." });
    assert.ok(!response.text.includes(token));
  }
});

test("timeout produces a sanitized 504 and configuration failure produces 503", async () => {
  for (const [code, status] of [["timeout", 504], ["configuration", 503]] as const) {
    const response = await request(app({ geocode: async () => { throw new GeocodingError(code, token); } }))
      .get("/api/geocode?q=Atlanta").expect(status);
    assert.ok(!response.text.includes(token));
  }
});

test("frontend API client consumes the route's normalized Mapbox response without adaptation", async () => {
  // Entire chain uses dummy credentials and mocked provider data; no app/server/env imports.
  const fetchMock: typeof fetch = async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [{
    id: "place.atlanta", geometry: { type: "Point", coordinates: [-84.39, 33.75] },
    properties: { name: "Atlanta", place_formatted: "Georgia, United States" },
  }] }));
  const server = app({ geocode: (query, accessToken) => forwardGeocode(query, accessToken, { fetch: fetchMock }) });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      assert.equal(String(input), "/api/geocode?q=Atlanta");
      const response = await request(server).get(String(input));
      return new Response(JSON.stringify(response.body), { status: response.status });
    };
    assert.deepEqual(await frontendGeocode("Atlanta"), results);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
