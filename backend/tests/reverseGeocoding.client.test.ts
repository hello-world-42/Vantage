import assert from "node:assert/strict";
import test from "node:test";
import { reverseGeocode } from "../src/modules/geo/mapboxReverseGeocoding.client.js";
import { GeocodingError } from "../src/modules/geo/mapboxGeocoding.client.js";

const token = "dummy-mapbox-token-for-tests";
const country = (countryCode: unknown) => ({
  type: "Feature", properties: { feature_type: "country", context: { country: { country_code: countryCode } } },
});
const collection = (features: unknown[] = []) => ({ type: "FeatureCollection", features });
const transport = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });
const isError = (code: string) => (error: unknown) => error instanceof GeocodingError && error.code === code;

test("requests the country layer with correctly ordered coordinates and explicit dummy token", async () => {
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.mapbox.com/search/geocode/v6/reverse");
    assert.equal(url.searchParams.get("latitude"), "33.75");
    assert.equal(url.searchParams.get("longitude"), "-84.39");
    assert.equal(url.searchParams.get("types"), "country");
    assert.equal(url.searchParams.get("limit"), "1");
    assert.equal(url.searchParams.get("access_token"), token);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(collection([country("US")])));
  };
  assert.equal(await reverseGeocode(33.75, -84.39, token, { fetch: fetchMock }), "US");
});

test("normalizes country codes and preserves international results", async () => {
  for (const [lat, lng, value, expected] of [
    [33.75, -84.39, "us", "US"], [51.5, -0.12, " gb ", "GB"],
    [43.65, -79.38, "CA", "CA"], [35.68, 139.69, "JP", "JP"],
  ] as const) {
    assert.equal(await reverseGeocode(lat, lng, token, { fetch: transport(collection([country(value)])) }), expected);
  }
});

test("returns null for an empty country result instead of guessing ocean ownership", async () => {
  assert.equal(await reverseGeocode(0, -140, token, { fetch: transport(collection()) }), null);
});

test("returns null when a valid feature has no available country code", async () => {
  for (const properties of [
    { feature_type: "country" }, { feature_type: "country", context: null },
    { feature_type: "country", context: {} },
    { feature_type: "country", context: { country: null } },
    { feature_type: "country", context: { country: {} } },
    { feature_type: "country", context: { country: { country_code: null } } },
  ]) {
    assert.equal(await reverseGeocode(0, 0, token, {
      fetch: transport(collection([{ type: "Feature", properties }])),
    }), null);
  }
});

test("invalid coordinates fail before any upstream request", async () => {
  for (const [lat, lng] of [[NaN, 0], [Infinity, 0], [91, 0], [-91, 0], [0, 181], [0, -181]]) {
    await assert.rejects(reverseGeocode(lat, lng, token, { fetch: async () => assert.fail("Must not fetch") }), isError("invalid_input"));
  }
});

test("accepts valid coordinate boundaries without changing them", async () => {
  for (const [lat, lng] of [[-90, -180], [90, 180]]) {
    assert.equal(await reverseGeocode(lat, lng, token, { fetch: transport(collection()) }), null);
  }
});

test("missing credentials and invalid timeout settings fail before networking", async () => {
  for (const value of ["", "   "]) await assert.rejects(reverseGeocode(0, 0, value), isError("configuration"));
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 60_001]) {
    await assert.rejects(reverseGeocode(0, 0, token, { timeoutMs }), isError("configuration"));
  }
});

test("upstream HTTP failures retain status without exposing response bodies or token", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(reverseGeocode(0, 0, token, { fetch: transport({ message: token }, status) }), (error: unknown) => {
      assert.ok(error instanceof GeocodingError);
      assert.equal(error.code, "http"); assert.equal(error.status, status);
      assert.ok(!String(error).includes(token)); return true;
    });
  }
});

test("rejects malformed JSON, unexpected features and invalid country codes", async () => {
  await assert.rejects(reverseGeocode(0, 0, token, { fetch: async () => new Response("broken JSON") }), isError("invalid_response"));
  for (const body of [null, {}, { type: "FeatureCollection", features: null }, collection([{}]),
    collection([{ type: "Feature", properties: { feature_type: "address" } }]),
    collection([country("USA")]), collection([country("12")]), collection([country(42)]),
  ]) {
    await assert.rejects(reverseGeocode(0, 0, token, { fetch: transport(body) }), isError("invalid_response"));
  }
});

test("network errors do not expose token-bearing URLs", async () => {
  await assert.rejects(reverseGeocode(0, 0, token, {
    fetch: async () => { throw new Error(`https://api.mapbox.com/?access_token=${token}`); },
  }), (error: unknown) => {
    assert.ok(isError("network")(error)); assert.ok(!String(error).includes(token)); return true;
  });
});

test("aborts a stalled request", async () => {
  const slow: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Abort did not occur")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
  });
  await assert.rejects(reverseGeocode(0, 0, token, { fetch: slow, timeoutMs: 10 }), isError("timeout"));
});

test("timeout also aborts a stalled response body", async () => {
  const slow: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      const timer = setTimeout(() => controller.error(new Error("Body abort did not occur")), 1000);
      init?.signal?.addEventListener("abort", () => { clearTimeout(timer); controller.error(init.signal?.reason); }, { once: true });
    },
  }));
  await assert.rejects(reverseGeocode(0, 0, token, { fetch: slow, timeoutMs: 10 }), isError("timeout"));
});
