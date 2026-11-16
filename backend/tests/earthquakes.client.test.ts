import assert from "node:assert/strict";
import test from "node:test";
import { fetchUsgsQuakes, EarthquakeClientError } from "../src/modules/hazards/usgsQuakes.client.js";
import { earthquakeNow, earthquakeFeature, earthquakeCollection, quakeTransport } from "./fixtures/earthquakes.js";
const isError = (code: string) => (error: unknown) => error instanceof EarthquakeClientError && error.code === code;

test("sends a bounded seven-day radius query with correct coordinates and no credentials", async () => {
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://earthquake.usgs.gov/fdsnws/event/1/query");
    for (const [key, value] of Object.entries({ latitude: "37.8", longitude: "-122.4", format: "geojson", maxradiuskm: "500",
      minmagnitude: "2.5", limit: "100", starttime: "2026-11-08T12:00:00.000Z", endtime: "2026-11-15T12:00:00.000Z",
      orderby: "time", eventtype: "earthquake", nodata: "204" })) assert.equal(url.searchParams.get(key), value);
    assert.equal([...url.searchParams.keys()].length, 11);
    assert.deepEqual(init?.headers, { Accept: "application/json" }); assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(earthquakeCollection()));
  };
  assert.equal((await fetchUsgsQuakes(37.8, -122.4, { fetch: transport, now: earthquakeNow })).features.length, 1);
});

test("supports both 204 and empty GeoJSON as no events", async () => {
  for (const status of [200, 204]) {
    assert.deepEqual((await fetchUsgsQuakes(0, 0, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection([]), status) })).features, []);
  }
});

test("invalid coordinates fail before networking", async () => {
  for (const [lat, lng] of [[NaN, 0], [Infinity, 0], [-91, 0], [91, 0], [0, 181], [0, -181]]) {
    await assert.rejects(fetchUsgsQuakes(lat, lng, { fetch: async () => assert.fail("Must not fetch") }), isError("invalid_input"));
  }
});

test("accepts poles, longitude boundaries and international coordinates", async () => {
  for (const [lat, lng] of [[90, 180], [-90, -180], [35.7, 139.7]]) {
    await fetchUsgsQuakes(lat, lng, { now: earthquakeNow, fetch: quakeTransport(earthquakeCollection([])) });
  }
});

test("invalid timeout and clock settings are rejected", async () => {
  for (const timeoutMs of [0, -1, 1.5, Infinity, 60_001]) {
    await assert.rejects(fetchUsgsQuakes(0, 0, { timeoutMs }), isError("configuration"));
  }
  for (const date of [new Date(NaN), new Date(0)]) {
    await assert.rejects(fetchUsgsQuakes(0, 0, { now: () => date }), isError("configuration"));
  }
});

test("HTTP failures are typed and sanitized; 404 is not mistaken for no events", async () => {
  for (const status of [400, 404, 429, 500, 503]) {
    await assert.rejects(fetchUsgsQuakes(0, 0, { fetch: quakeTransport({ reason: "Internal details" }, status) }), (error: unknown) => {
      assert.ok(error instanceof EarthquakeClientError); assert.equal(error.code, "http"); assert.equal(error.status, status);
      assert.ok(!String(error).includes("Internal details")); return true;
    });
  }
});

test("rejects broken JSON, malformed geometry, invalid times/URLs and non-earthquakes", async () => {
  await assert.rejects(fetchUsgsQuakes(0, 0, { fetch: async () => new Response("not json") }), isError("invalid_response"));
  const feature = earthquakeFeature();
  for (const body of [null, {}, earthquakeCollection([{}]),
    earthquakeCollection([{ ...feature, geometry: { type: "Point", coordinates: [181, 0, 1] } }]),
    earthquakeCollection([{ ...feature, geometry: { type: "Point", coordinates: [0, 0] } }]),
    earthquakeCollection([{ ...feature, properties: { ...feature.properties, time: "bad" } }]),
    earthquakeCollection([{ ...feature, properties: { ...feature.properties, type: "quarry blast" } }]),
    earthquakeCollection([{ ...feature, properties: { ...feature.properties, url: "javascript:alert(1)" } }]),
  ]) await assert.rejects(fetchUsgsQuakes(0, 0, { fetch: quakeTransport(body) }), isError("invalid_response"));
});

test("network failures do not expose transport details", async () => {
  await assert.rejects(fetchUsgsQuakes(0, 0, { fetch: async () => { throw new Error("Internal details"); } }), (error: unknown) => {
    assert.ok(isError("network")(error)); assert.ok(!String(error).includes("Internal details")); return true;
  });
});

test("times out stalled requests and bodies", async () => {
  const stalled: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No abort")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
  });
  const stalledBody: typeof fetch = async (_input, init) => new Response(new ReadableStream({ start(controller) {
    const timer = setTimeout(() => controller.error(new Error("No abort")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); controller.error(init.signal?.reason); }, { once: true });
  } }));
  for (const fetch of [stalled, stalledBody]) await assert.rejects(fetchUsgsQuakes(0, 0, { fetch, timeoutMs: 10 }), isError("timeout"));
});

test("honors caller cancellation before and during a request", async () => {
  await assert.rejects(fetchUsgsQuakes(0, 0, { signal: AbortSignal.abort(), fetch: async () => assert.fail("Must not fetch") }), isError("aborted"));
  const controller = new AbortController();
  await assert.rejects(fetchUsgsQuakes(0, 0, { signal: controller.signal, fetch: async () => {
    controller.abort(); throw new Error("Cancelled");
  } }), isError("aborted"));
});
