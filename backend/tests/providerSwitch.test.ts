import assert from "node:assert/strict";
import test from "node:test";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { createProviderSwitch } from "../src/aggregator/providerSwitch.js";
import { combineSources, type SubSource } from "../src/aggregator/subSources.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";

const context: LocationContext = {
  query: { lat: 1, lng: 2 }, cell: { key: "k", lat: 1, lng: 2, sizeDeg: 0.25 }, countryCode: "US", signal: new AbortController().signal,
};
const source = (key: string, name: string): SubSource => ({ key, source: name, label: key, fetch: async () => ({ status: "ok", source: name, data: key }) });

test("a switched-off provider turns off the cards it alone feeds, and only its row in combined cards", async () => {
  const providers = createProviderSwitch({ loadDisabled: async () => ["Open-Meteo", "USGS"] });
  assert.equal(await providers.isModuleEnabled("weather"), false);
  assert.equal(await providers.isModuleEnabled("airQuality"), false);
  assert.equal(await providers.isModuleEnabled("hazards"), true, "NWS is still on");
  assert.equal(await providers.isModuleEnabled("astronomy"), true, "nothing to switch off");
  assert.equal(await providers.isProviderEnabled("USGS"), false);
  assert.equal(await providers.isProviderEnabled("Some new provider"), true, "unknown providers are on");

  const outcome = await combineSources([source("alerts", "NWS"), source("earthquakes", "USGS")], context, {
    notApplicableReason: "none", isSourceEnabled: providers.isProviderEnabled,
  });
  assert.deepEqual(Object.keys(outcome.status === "ok" ? outcome.data : {}), ["alerts"]);
});

test("the table is read at most once a minute, and again right after an admin change", async () => {
  let now = 0;
  let reads = 0;
  let disabled: string[] = [];
  const providers = createProviderSwitch({ now: () => now, loadDisabled: async () => { reads++; return disabled; } });
  await Promise.all([providers.isProviderEnabled("NWS"), providers.isModuleEnabled("space"), providers.isProviderEnabled("USGS")]);
  assert.equal(reads, 1, "concurrent checks share one query");
  now = 59_000;
  await providers.isProviderEnabled("NWS");
  assert.equal(reads, 1);
  now = 61_000;
  await providers.isProviderEnabled("NWS");
  assert.equal(reads, 2);

  disabled = ["NWS"];
  assert.equal(await providers.isProviderEnabled("NWS"), true, "still the cached answer");
  providers.invalidate();
  assert.equal(await providers.isProviderEnabled("NWS"), false);
});

test("a database failure leaves every provider on instead of breaking the dashboard", async () => {
  const logged: unknown[] = [];
  const providers = createProviderSwitch({ loadDisabled: async () => { throw new Error("db down"); }, logError: (_m, e) => logged.push(e) });
  assert.equal(await providers.isModuleEnabled("weather"), true);
  assert.equal(logged.length, 1);
});

test("the aggregator reports a switched-off module as disabled without calling it", async () => {
  let calls = 0;
  const providers = createProviderSwitch({ loadDisabled: async () => ["Open-Meteo"] });
  const aggregate = createAggregator({
    cache: createMemoryCache(), isEnabled: providers.isModuleEnabled,
    modules: [{ id: "weather", label: "Weather", scope: "cell", ttlSeconds: 60, fetch: async () => { calls++; return { status: "ok", source: "Open-Meteo", data: 1 }; } }],
  });
  const response = await aggregate({ lat: 1, lng: 2 });
  assert.deepEqual(response.modules.weather, { status: "disabled" });
  assert.equal(calls, 0);
});
