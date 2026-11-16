import assert from "node:assert/strict";
import test from "node:test";
import { createCountryResolver } from "../src/modules/geo/geo.service.js";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { GeocodingError } from "../src/modules/geo/mapboxGeocoding.client.js";

const token = "dummy-mapbox-token-for-tests";
const countryResponse = (code: string) => ({ type: "FeatureCollection", features: [{
  type: "Feature", properties: { feature_type: "country", context: { country: { country_code: code } } },
}] });

test("country resolver is lazy and implements the existing (lat, lng) callback", async () => {
  let calls = 0;
  const resolveCountry = createCountryResolver(token, { fetch: async () => {
    calls++; return new Response(JSON.stringify(countryResponse("us")));
  } });
  assert.equal(calls, 0);
  assert.equal(await resolveCountry(33.75, -84.39), "US");
  assert.equal(calls, 1);
});

test("resolver plugs into the existing aggregator without changing its implementation", async () => {
  let requestedPoint: string[] = [];
  const resolveCountry = createCountryResolver(token, { fetch: async (input) => {
    const url = new URL(String(input));
    requestedPoint = [url.searchParams.get("latitude")!, url.searchParams.get("longitude")!];
    return new Response(JSON.stringify(countryResponse("US")));
  } });
  const aggregate = createAggregator({
    resolveCountry, cache: createMemoryCache(), modules: [{
      id: "hazards", label: "Test hazards", scope: "us-only", ttlSeconds: 60,
      fetch: async ({ countryCode }) => ({ status: "ok", source: "test", data: { countryCode } }),
    }],
  });
  const result = await aggregate({ lat: 33.75, lng: -84.39 });
  assert.equal(result.countryCode, "US");
  assert.deepEqual(requestedPoint, [String(result.cell.lat), String(result.cell.lng)]);
  assert.equal(result.modules.hazards?.status, "ok");
  if (result.modules.hazards?.status === "ok") assert.deepEqual(result.modules.hazards.data, { countryCode: "US" });
});

test("a caller-supplied country bypasses reverse lookup", async () => {
  const aggregate = createAggregator({
    cache: createMemoryCache(), modules: [],
    resolveCountry: createCountryResolver(token, { fetch: async () => assert.fail("Must not fetch") }),
  });
  assert.equal((await aggregate({ lat: 51.5, lng: -0.12, country: "gb" })).countryCode, "GB");
});

test("unknown country remains null and lookup failures use existing aggregator isolation", async () => {
  const unknown = createCountryResolver(token, { fetch: async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [] })) });
  assert.equal(await unknown(0, -140), null);
  const unavailable = createCountryResolver(token, { fetch: async () => { throw new Error("Simulated outage"); } });
  await assert.rejects(unavailable(33.75, -84.39), (error: unknown) => error instanceof GeocodingError && error.code === "network");
  const aggregate = createAggregator({ cache: createMemoryCache(), modules: [], resolveCountry: unavailable, logError: () => {} });
  const result = await aggregate({ lat: 33.75, lng: -84.39 });
  assert.equal(result.countryCode, null);
  assert.deepEqual(result.modules, {});
});
