import assert from "node:assert/strict";
import test from "node:test";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { cachedPlaceResolver } from "../src/aggregator/countryCache.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { fetchPlaceName } from "../src/modules/geo/mapboxPlace.client.js";

const reply = (body: unknown, status = 200) => {
  const urls: string[] = [];
  const fn = (async (input: string | URL | Request) => { urls.push(String(input)); return new Response(JSON.stringify(body), { status }); }) as typeof fetch;
  return { fn, urls };
};

// Shape of a Mapbox Geocoding v6 reverse response (one feature per requested type, most specific first).
const mapboxBody = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { feature_type: "place", name: "Atlanta", place_formatted: "Georgia, United States" } },
    { type: "Feature", properties: { feature_type: "region", name: "Georgia", place_formatted: "United States" } },
    { type: "Feature", properties: { feature_type: "country", name: "United States" } },
  ],
};

test("place name: takes the most specific feature and never puts the token in an error", async () => {
  const { fn, urls } = reply(mapboxBody);
  assert.deepEqual(await fetchPlaceName(33.75, -84.39, "pk.TOKEN", { fetch: fn }), { name: "Atlanta", context: "Georgia, United States" });
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get("types"), "place,region,country");

  await assert.rejects(fetchPlaceName(0, 0, "pk.SECRET", { fetch: reply({}, 401).fn }), (error: Error) => !error.message.includes("pk.SECRET"));
});

test("place name: open ocean or an unexpected response is null, not an error", async () => {
  assert.equal(await fetchPlaceName(0, -30, "t", { fetch: reply({ type: "FeatureCollection", features: [] }).fn }), null);
  assert.equal(await fetchPlaceName(0, -30, "t", { fetch: reply({ surprise: true }).fn }), null);
});

test("place cache: clicks about a kilometre apart share one lookup; far apart don't", async () => {
  let calls = 0;
  const resolve = cachedPlaceResolver(async () => { calls++; return { name: "Atlanta" }; }, createMemoryCache());
  await resolve(33.761, -84.401);
  await resolve(33.765, -84.398);
  assert.equal(calls, 1);
  await resolve(33.95, -84.39);
  assert.equal(calls, 2);
});

test("aggregator: response carries the time zone and place; a failed place lookup is just null", async () => {
  const ok = createAggregator({ cache: createMemoryCache(), modules: [], resolvePlace: async () => ({ name: "Tokyo", context: "Japan" }) });
  const tokyo = await ok({ lat: 35.68, lng: 139.69 });
  assert.equal(tokyo.timeZone, "Asia/Tokyo");
  assert.deepEqual(tokyo.place, { name: "Tokyo", context: "Japan" });

  const failing = createAggregator({ cache: createMemoryCache(), modules: [], logError: () => {}, resolvePlace: async () => { throw new Error("Mapbox down"); } });
  const atlanta = await failing({ lat: 33.75, lng: -84.39 });
  assert.equal(atlanta.place, null);
  assert.equal(atlanta.timeZone, "America/New_York");
});
