import assert from "node:assert/strict";
import test from "node:test";
import { forwardGeocode, GeocodingError } from "../src/modules/geo/mapboxGeocoding.client.js";

const token = "dummy-mapbox-token-for-tests";
const feature = {
  id: "place.atlanta", geometry: { type: "Point", coordinates: [-84.389855, 33.750801] },
  properties: { name: "Atlanta", place_formatted: "Georgia, United States", full_address: "Atlanta, Georgia, United States" },
};
const collection = (features: unknown[] = []) => ({ type: "FeatureCollection", features });
const transport = (body: unknown, status = 200): typeof fetch => async () =>
  new Response(JSON.stringify(body), { status });
const isError = (code: string) => (error: unknown) => error instanceof GeocodingError && error.code === code;

test("normalizes Mapbox longitude/latitude to shared lat/lng and splits label/context", async () => {
  assert.deepEqual(await forwardGeocode("Atlanta", token, { fetch: transport(collection([feature])) }), [{
    id: "place.atlanta", name: "Atlanta", context: "Georgia, United States", lat: 33.750801, lng: -84.389855,
  }]);
});

test("encodes and trims Unicode/special-character queries and limits results to five", async () => {
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.mapbox.com/search/geocode/v6/forward");
    assert.equal(url.searchParams.get("q"), "São Paulo & coast?");
    assert.equal(url.searchParams.get("access_token"), token);
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal([...url.searchParams.keys()].length, 3);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(collection()));
  };
  assert.deepEqual(await forwardGeocode("  São Paulo & coast?  ", token, { fetch: fetchMock }), []);
});

test("uses preferred names, full-address and ID fallbacks without duplicating context", async () => {
  const features = [
    { ...feature, properties: { name: "Old name", name_preferred: " Preferred ", place_formatted: " Region " } },
    { ...feature, properties: { name: "  ", full_address: "Full address" } },
    { ...feature, properties: {} },
    { id: feature.id, geometry: feature.geometry },
    { ...feature, properties: { name: "Atlanta", place_formatted: "Atlanta" } },
  ];
  const results = await forwardGeocode("Atlanta", token, { fetch: transport(collection(features)) });
  assert.deepEqual(results.map(({ name, context }) => ({ name, context })), [
    { name: "Preferred", context: "Region" }, { name: "Full address", context: undefined },
    { name: feature.id, context: undefined }, { name: feature.id, context: undefined },
    { name: "Atlanta", context: undefined },
  ]);
  assert.equal("latitude" in results[0], false);
  assert.equal("longitude" in results[0], false);
});

test("an empty feature collection returns an empty result list", async () => {
  assert.deepEqual(await forwardGeocode("Unknown", token, { fetch: transport(collection()) }), []);
});

test("rejects blank/oversized queries before any request", async () => {
  for (const query of ["", "   ", "x".repeat(201)]) {
    await assert.rejects(forwardGeocode(query, token, { fetch: async () => assert.fail("Must not fetch") }), isError("invalid_input"));
  }
});

test("accepts shared-schema query boundaries of one and 200 characters", async () => {
  for (const query of ["A", "x".repeat(200)]) {
    assert.deepEqual(await forwardGeocode(query, token, { fetch: transport(collection()) }), []);
  }
});

test("missing tokens and invalid timeouts fail without reaching upstream", async () => {
  for (const accessToken of ["", "   "]) {
    await assert.rejects(forwardGeocode("Atlanta", accessToken), isError("configuration"));
  }
  for (const timeoutMs of [0, -1, 1.5, Infinity, 60_001]) {
    await assert.rejects(forwardGeocode("Atlanta", token, { timeoutMs }), isError("configuration"));
  }
});

test("preserves upstream status but never exposes its body or token", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(forwardGeocode("Atlanta", token, { fetch: transport({ message: token }, status) }), (error: unknown) => {
      assert.ok(error instanceof GeocodingError);
      assert.equal(error.code, "http");
      assert.equal(error.status, status);
      assert.ok(!String(error).includes(token));
      return true;
    });
  }
});

test("rejects broken JSON, missing features, invalid geometry and out-of-range coordinates", async () => {
  await assert.rejects(forwardGeocode("Atlanta", token, {
    fetch: async () => new Response("broken JSON"),
  }), isError("invalid_response"));
  for (const body of [null, {}, { type: "FeatureCollection" }, collection([{}]),
    collection([{ ...feature, geometry: null }]),
    collection([{ ...feature, geometry: { type: "Point", coordinates: [181, 33] } }]),
    collection([{ ...feature, geometry: { type: "Point", coordinates: [-84, -91] } }]),
  ]) {
    await assert.rejects(forwardGeocode("Atlanta", token, { fetch: transport(body) }), isError("invalid_response"));
  }
});

test("network errors are sanitized", async () => {
  await assert.rejects(forwardGeocode("Atlanta", token, { fetch: async () => { throw new Error(`URL contains ${token}`); } }), (error: unknown) => {
    assert.ok(isError("network")(error));
    assert.ok(!String(error).includes(token));
    return true;
  });
});

test("aborts slow requests", async () => {
  const slow: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error("No abort received")), 1000);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(keepAlive); reject(init.signal?.reason);
    }, { once: true });
  });
  await assert.rejects(forwardGeocode("Atlanta", token, { fetch: slow, timeoutMs: 10 }), isError("timeout"));
});

test("timeout covers a stalled response body too", async () => {
  const slow: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      const keepAlive = setTimeout(() => controller.error(new Error("No body abort received")), 1000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive); controller.error(init.signal?.reason);
      }, { once: true });
    },
  }));
  await assert.rejects(forwardGeocode("Atlanta", token, { fetch: slow, timeoutMs: 10 }), isError("timeout"));
});
