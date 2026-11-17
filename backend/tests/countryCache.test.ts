import assert from "node:assert/strict";
import test from "node:test";
import { cachedCountryResolver } from "../src/aggregator/countryCache.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";

test("each cell's country is looked up once, including 'no country' over the ocean", async () => {
  const calls: string[] = [];
  const resolve = cachedCountryResolver(async (lat, lng) => {
    calls.push(`${lat},${lng}`);
    return lat > 0 ? "US" : null;
  }, createMemoryCache());

  assert.equal(await resolve(33.875, -84.375), "US");
  assert.equal(await resolve(33.875, -84.375), "US");
  assert.equal(await resolve(-30.125, -20.125), null);
  assert.equal(await resolve(-30.125, -20.125), null);
  assert.equal(calls.length, 2);
});

test("a failed lookup isn't cached, so it's retried", async () => {
  let fail = true;
  let calls = 0;
  const resolve = cachedCountryResolver(async () => { calls++; if (fail) throw new Error("Mapbox down"); return "FR"; }, createMemoryCache());
  await assert.rejects(resolve(48.875, 2.375), /Mapbox down/);
  fail = false;
  assert.equal(await resolve(48.875, 2.375), "FR");
  assert.equal(calls, 2);
});

test("the aggregator passes the cached country to modules, and nearby clicks share it", async () => {
  let lookups = 0;
  const seen: Array<string | null> = [];
  const cache = createMemoryCache();
  const aggregate = createAggregator({
    cache,
    resolveCountry: cachedCountryResolver(async () => { lookups++; return "US"; }, cache),
    modules: [{
      id: "hazards", label: "Hazards", scope: "cell-and-country", ttlSeconds: 1,
      fetch: async ({ countryCode }) => { seen.push(countryCode); return { status: "ok", source: "t", data: null }; },
    }],
  });
  const first = await aggregate({ lat: 33.80, lng: -84.40 });
  await aggregate({ lat: 33.81, lng: -84.39 }); // same 0.25° cell
  assert.equal(first.countryCode, "US");
  assert.equal(lookups, 1);
  assert.deepEqual(seen, ["US"], "second click served from the module cache too");
});
