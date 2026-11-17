import assert from "node:assert/strict";
import test from "node:test";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";
import { combineSources, PARTIAL_FAILURE_TTL_SECONDS, type SubSource } from "../src/aggregator/subSources.js";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";

const context: LocationContext = {
  query: { lat: 33.8, lng: -84.4 },
  cell: { key: "0.25:495:382", lat: 33.875, lng: -84.375, sizeDeg: 0.25 },
  countryCode: "US",
  signal: new AbortController().signal,
};
const silent = { logError: () => {} };

const ok = (key: string, data: unknown): SubSource => ({ key, source: key.toUpperCase(), label: key, fetch: async () => ({ status: "ok", source: key.toUpperCase(), data }) });
const na = (key: string, reason: string): SubSource => ({ key, source: key.toUpperCase(), label: key, fetch: async () => ({ status: "not_applicable", reason }) });
const fails = (key: string): SubSource => ({ key, source: key.toUpperCase(), label: `${key} data`, fetch: async () => { throw new Error(`${key} exploded at /secret/path`); } });

test("every sub-source ok: card is ok and lists each source", async () => {
  const outcome = await combineSources([ok("alerts", [1]), ok("quakes", [2])], context, { notApplicableReason: "none", ...silent });
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.status === "ok" && outcome.source, "ALERTS, QUAKES");
  assert.deepEqual(outcome.status === "ok" && outcome.data, {
    alerts: { status: "ok", source: "ALERTS", data: [1] },
    quakes: { status: "ok", source: "QUAKES", data: [2] },
  });
  assert.equal(outcome.ttlSeconds, undefined, "no shortened cache time when nothing failed");
});

test("one sub-source fails: card still ok, the failed one is a safe error row, cached briefly", async () => {
  const logged: unknown[] = [];
  const outcome = await combineSources([ok("alerts", []), fails("quakes")], context, {
    notApplicableReason: "none",
    logError: (_m, e) => logged.push(e),
  });
  assert.equal(outcome.status, "ok");
  if (outcome.status !== "ok") return;
  assert.deepEqual(outcome.data.quakes, { status: "error", source: "QUAKES", message: "Couldn't load quakes data right now." });
  assert.doesNotMatch(JSON.stringify(outcome.data), /secret/);
  assert.equal(outcome.ttlSeconds, PARTIAL_FAILURE_TTL_SECONDS);
  assert.equal(logged.length, 1, "the real error is logged server-side");
});

test("every sub-source fails: throws so the aggregator reports the card as an error", async () => {
  await assert.rejects(combineSources([fails("a"), fails("b")], context, { notApplicableReason: "none", ...silent }), /a exploded/);
});

test("every sub-source not applicable: card is not_applicable", async () => {
  const one = await combineSources([na("alerts", "NWS alerts are US-only in Vantage.")], context, { notApplicableReason: "generic", ...silent });
  assert.deepEqual(one, { status: "not_applicable", source: "ALERTS", reason: "NWS alerts are US-only in Vantage." }, "a single source keeps its own reason");

  const two = await combineSources([na("a", "x"), na("b", "y")], context, { notApplicableReason: "generic", ...silent });
  assert.equal(two.status === "not_applicable" && two.reason, "generic");
});

test("aggregator caches a partly failed card only for the shortened time", async () => {
  let clock = 0;
  let calls = 0;
  const aggregate = createAggregator({
    cache: createMemoryCache({ now: () => clock }),
    logError: () => {},
    modules: [{
      id: "hazards",
      label: "Hazards",
      scope: "cell",
      ttlSeconds: 300,
      fetch: (ctx) => { calls++; return combineSources([ok("alerts", []), fails("quakes")], ctx, { notApplicableReason: "none", ...silent }); },
    }],
  });

  await aggregate({ lat: 33.8, lng: -84.4 });
  clock += (PARTIAL_FAILURE_TTL_SECONDS - 1) * 1000;
  await aggregate({ lat: 33.8, lng: -84.4 });
  assert.equal(calls, 1, "still cached just before the short TTL");
  clock += 2000;
  await aggregate({ lat: 33.8, lng: -84.4 });
  assert.equal(calls, 2, "retried after the short TTL instead of waiting the full 5 minutes");
});
