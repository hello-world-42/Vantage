import assert from "node:assert/strict";
import test from "node:test";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import type { ModuleDefinition } from "../src/aggregator/moduleRegistry.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";

const quiet = () => {};
const fixedNow = () => new Date("2026-10-29T12:00:00Z");

function fakeModule(overrides: Partial<ModuleDefinition> & Pick<ModuleDefinition, "fetch">): ModuleDefinition {
  return { id: "weather", label: "Weather", scope: "cell", ttlSeconds: 600, ...overrides };
}

test("wraps provider outcomes in ModuleResult and returns the snapped cell", async () => {
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    now: fixedNow,
    modules: [fakeModule({ fetch: async () => ({ status: "ok", source: "Test", data: { tempC: 20 } }) })],
  });
  const res = await aggregate({ lat: 33.749, lng: -84.388 });
  assert.equal(res.cell.key, "0.25:494:382");
  assert.deepEqual(res.modules.weather, {
    status: "ok", data: { tempC: 20 }, source: "Test", fetchedAt: "2026-10-29T12:00:00.000Z",
  });
});

test("one failing module becomes a safe error and doesn't affect the others", async () => {
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    logError: quiet,
    modules: [
      fakeModule({ id: "weather", fetch: async () => ({ status: "ok", source: "T", data: 1 }) }),
      fakeModule({ id: "hazards", label: "Hazard alerts", fetch: async () => { throw new Error("secret upstream detail"); } }),
    ],
  });
  const res = await aggregate({ lat: 0, lng: 0 });
  assert.equal(res.modules.weather?.status, "ok");
  assert.deepEqual(res.modules.hazards, { status: "error", message: "Couldn't load hazard alerts right now." });
  assert.ok(!JSON.stringify(res).includes("secret"));
});

test("second request for the same cell is served from cache; errors are not cached", async () => {
  let okCalls = 0;
  let failCalls = 0;
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    logError: quiet,
    modules: [
      fakeModule({ id: "weather", fetch: async () => { okCalls++; return { status: "ok", source: "T", data: okCalls }; } }),
      fakeModule({ id: "hazards", fetch: async () => { failCalls++; throw new Error("down"); } }),
    ],
  });
  await aggregate({ lat: 33.74, lng: -84.4 });
  const second = await aggregate({ lat: 33.749, lng: -84.388 }); // same cell
  assert.equal(okCalls, 1);
  assert.equal(failCalls, 2);
  assert.equal(second.modules.weather?.status === "ok" && second.modules.weather.data, 1);
});

test("concurrent requests for the same cell make one upstream call", async () => {
  let calls = 0;
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    modules: [fakeModule({ fetch: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { status: "ok", source: "T", data: 1 }; } })],
  });
  await Promise.all([aggregate({ lat: 1, lng: 1 }), aggregate({ lat: 1.01, lng: 1.01 }), aggregate({ lat: 1, lng: 1 })]);
  assert.equal(calls, 1);
});

test("disabled modules are not fetched", async () => {
  let calls = 0;
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    isEnabled: (id) => id !== "weather",
    modules: [fakeModule({ fetch: async () => { calls++; return { status: "ok", source: "T", data: 1 }; } })],
  });
  const res = await aggregate({ lat: 0, lng: 0 });
  assert.deepEqual(res.modules.weather, { status: "disabled" });
  assert.equal(calls, 0);
});

test("a slow module times out without holding up the response", async () => {
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    logError: quiet,
    moduleTimeoutMs: 30,
    modules: [fakeModule({ fetch: ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) })],
  });
  const started = Date.now();
  const res = await aggregate({ lat: 0, lng: 0 });
  assert.equal(res.modules.weather?.status, "error");
  assert.ok(Date.now() - started < 1_000);
});

test("country comes from the query first, then the resolver; global modules share one cache key", async () => {
  const seen: (string | null)[] = [];
  let globalCalls = 0;
  const aggregate = createAggregator({
    cache: createMemoryCache(),
    resolveCountry: async () => "CA",
    modules: [
      fakeModule({ id: "hazards", scope: "us-only", fetch: async ({ countryCode }) => { seen.push(countryCode); return { status: "not_applicable", reason: "x" }; } }),
      fakeModule({ id: "space", scope: "global", fetch: async () => { globalCalls++; return { status: "ok", source: "LL2", data: [] }; } }),
    ],
  });
  const a = await aggregate({ lat: 10, lng: 10, country: "us" });
  await aggregate({ lat: 50, lng: 50 });
  assert.equal(a.countryCode, "US");
  assert.deepEqual(seen, ["US", "CA"]);
  assert.equal(globalCalls, 1);
});
