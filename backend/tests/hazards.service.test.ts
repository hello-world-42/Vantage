import assert from "node:assert/strict";
import test from "node:test";
import type { HazardsData } from "@vantage/shared/modules/hazards";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";
import { createHazardsModule } from "../src/modules/hazards/hazards.service.js";
import { earthquakeCollection } from "./fixtures/earthquakes.js";

const context = (countryCode: string | null): LocationContext => ({
  query: { lat: 33.8, lng: -84.4 },
  cell: { key: "0.25:495:382", lat: 33.875, lng: -84.375, sizeDeg: 0.25 },
  countryCode,
  signal: new AbortController().signal,
});

const alert = {
  id: "urn:1", event: "Tornado Warning", headline: "Tornado Warning issued", severity: "Extreme",
  urgency: "Immediate", certainty: "Observed", areaDesc: "Fulton, GA", description: "Take cover.",
  instruction: null, sent: "2026-11-15T20:00:00Z", effective: "2026-11-15T20:00:00Z", onset: null,
  expires: "2026-11-15T21:00:00Z", ends: null,
};

/** Answers NWS and USGS requests separately, like the real internet would. */
function providers(options: { nws?: unknown[]; usgsStatus?: number } = {}) {
  const hosts: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    hosts.push(url.host);
    if (url.host === "api.weather.gov") {
      return new Response(JSON.stringify({ type: "FeatureCollection", features: (options.nws ?? []).map((p) => ({ type: "Feature", properties: p })) }));
    }
    if (url.host === "earthquake.usgs.gov") {
      const status = options.usgsStatus ?? 200;
      return new Response(status === 200 ? JSON.stringify(earthquakeCollection()) : "down", { status });
    }
    throw new Error(`unexpected host ${url.host}`);
  }) as typeof fetch;
  return { fn, hosts };
}

const dataOf = (outcome: Awaited<ReturnType<ReturnType<typeof createHazardsModule>["fetch"]>>) =>
  (outcome.status === "ok" ? outcome.data : {}) as HazardsData;

test("hazards uses the country in its cache key", () => {
  assert.equal(createHazardsModule({}).scope, "cell-and-country");
});

test("in the US: NWS alerts and USGS earthquakes, each in its own row", async () => {
  const { fn, hosts } = providers({ nws: [alert] });
  const outcome = await createHazardsModule({ nwsUserAgent: "Vantage test (t@example.com)", fetch: fn }).fetch(context("US"));
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.status === "ok" && outcome.source, "NWS, USGS");
  const data = dataOf(outcome);
  assert.deepEqual(data.alerts, { status: "ok", source: "NWS", data: [alert] });
  assert.equal(data.earthquakes?.status, "ok");
  assert.equal(data.earthquakes?.status === "ok" && data.earthquakes.data.earthquakes[0].id, "test-quake");
  assert.deepEqual(hosts.sort(), ["api.weather.gov", "earthquake.usgs.gov"]);
});

test("outside the US: earthquakes still show, alerts say why they don't apply", async () => {
  const { fn, hosts } = providers();
  const outcome = await createHazardsModule({ nwsUserAgent: "x", fetch: fn }).fetch(context("FR"));
  assert.equal(outcome.status, "ok");
  const data = dataOf(outcome);
  assert.equal(data.alerts?.status, "not_applicable");
  assert.match(data.alerts?.status === "not_applicable" ? data.alerts.reason : "", /US-only/);
  assert.equal(data.earthquakes?.status, "ok");
  assert.deepEqual(hosts, ["earthquake.usgs.gov"], "no NWS request outside the US");
});

test("unknown country: alerts not applicable, earthquakes unaffected", async () => {
  const data = dataOf(await createHazardsModule({ nwsUserAgent: "x", fetch: providers().fn }).fetch(context(null)));
  assert.equal(data.alerts?.status, "not_applicable");
  assert.equal(data.earthquakes?.status, "ok");
});

test("USGS down: the card still shows alerts, with a safe error row for earthquakes", async () => {
  const outcome = await createHazardsModule({ nwsUserAgent: "x", fetch: providers({ nws: [alert], usgsStatus: 503 }).fn, logError: () => {} }).fetch(context("US"));
  const data = dataOf(outcome);
  assert.equal(data.alerts?.status, "ok");
  assert.deepEqual(data.earthquakes, { status: "error", source: "USGS", message: "Couldn't load earthquakes right now." });
  assert.equal(outcome.ttlSeconds, 60, "retried in a minute instead of cached for 5");
});

test("a missing NWS_USER_AGENT shows as an error row in the US, not a silent empty list", async () => {
  const data = dataOf(await createHazardsModule({ fetch: providers().fn, logError: () => {} }).fetch(context("US")));
  assert.equal(data.alerts?.status, "error");
  assert.equal(data.earthquakes?.status, "ok");
});
