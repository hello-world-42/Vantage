import assert from "node:assert/strict";
import test from "node:test";
import { fetchNwsAlerts, NwsClientError } from "../src/modules/hazards/nwsAlerts.client.js";

const us = { lat: 33.75, lng: -84.39, countryCode: "US" };
const userAgent = "Vantage-unit-tests";
const alert = {
  id: "urn:oid:test-alert", event: "Flood Warning", headline: "Test flood warning",
  severity: "Severe", urgency: "Immediate", certainty: "Observed",
  areaDesc: "Test County", description: "Flooding is occurring.", instruction: "Avoid flooded roads.",
  sent: "2026-10-29T12:00:00-04:00", effective: "2026-10-29T12:00:00-04:00",
  onset: null, expires: "2026-10-29T16:00:00-04:00", ends: null,
};
const collection = (properties: unknown[] = []) => ({
  type: "FeatureCollection", features: properties.map((properties) => ({ type: "Feature", geometry: null, properties })),
});
const jsonTransport = (body: unknown, status = 200): typeof fetch => async () =>
  new Response(JSON.stringify(body), { status });
const rejectsWith = (code: string, status?: number) => (error: unknown) => {
  assert.ok(error instanceof NwsClientError);
  assert.equal(error.code, code);
  if (status !== undefined) assert.equal(error.status, status);
  return true;
};

test("requests exact-point GeoJSON alerts with an explicit User-Agent and timeout signal", async () => {
  const transport: typeof fetch = async (url, init) => {
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.origin, "https://api.weather.gov");
    assert.equal(requestUrl.pathname, "/alerts/active");
    assert.equal(requestUrl.searchParams.get("point"), "33.75,-84.39");
    assert.deepEqual(init?.headers, { "User-Agent": userAgent, Accept: "application/geo+json" });
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(collection([alert])));
  };
  assert.deepEqual(await fetchNwsAlerts(us, { userAgent, fetch: transport }), {
    status: "ok", source: "NWS", alerts: [alert],
  });
});

test("no active alerts is an applicable success, not an error", async () => {
  assert.deepEqual(await fetchNwsAlerts(us, { userAgent, fetch: jsonTransport(collection()) }), {
    status: "ok", source: "NWS", alerts: [],
  });
});

test("non-US locations skip the network, including Canadian points near the border", async () => {
  for (const location of [
    { lat: 51.5, lng: -0.12, countryCode: "GB" },
    { lat: 43.65, lng: -79.38, countryCode: " ca " },
  ]) {
    const result = await fetchNwsAlerts(location, { userAgent: "", fetch: async () => assert.fail("Must not fetch") });
    assert.equal(result.status, "not_applicable");
  }
});

test("rejects malformed coordinates/country before calling NWS", async () => {
  for (const location of [
    { ...us, lat: NaN }, { ...us, lat: Infinity }, { ...us, lat: 91 },
    { ...us, lat: -91 }, { ...us, lng: 181 }, { ...us, lng: -181 },
    { ...us, countryCode: "" }, { ...us, countryCode: "USA" },
  ]) {
    await assert.rejects(fetchNwsAlerts(location, { userAgent, fetch: async () => assert.fail("Must not fetch") }), rejectsWith("invalid_input"));
  }
});

test("accepts coordinate boundaries and normalized US country code", async () => {
  for (const location of [
    { lat: -90, lng: -180, countryCode: " us " },
    { lat: 90, lng: 180, countryCode: "US" },
  ]) {
    assert.equal((await fetchNwsAlerts(location, { userAgent, fetch: jsonTransport(collection()) })).status, "ok");
  }
});

test("rejects missing/header-injection User-Agents and invalid timeouts", async () => {
  for (const value of ["", "   ", "Vantage\r\nX-Test: injected"]) {
    await assert.rejects(fetchNwsAlerts(us, { userAgent: value }), rejectsWith("configuration"));
  }
  for (const timeoutMs of [0, -1, 1.5, Infinity, 60_001]) {
    await assert.rejects(fetchNwsAlerts(us, { userAgent, timeoutMs }), rejectsWith("configuration"));
  }
});

test("preserves HTTP error status without exposing upstream body or User-Agent", async () => {
  for (const status of [400, 403, 404, 429, 503]) {
    await assert.rejects(fetchNwsAlerts(us, {
      userAgent: "private-contact-value", fetch: jsonTransport({ detail: "private-contact-value" }, status),
    }), (error: unknown) => {
      rejectsWith("http", status)(error);
      assert.ok(!String(error).includes("private-contact-value"));
      return true;
    });
  }
});

test("rejects broken JSON and malformed payloads instead of hiding them as no alerts", async () => {
  const brokenJson: typeof fetch = async () => new Response("not JSON");
  await assert.rejects(fetchNwsAlerts(us, { userAgent, fetch: brokenJson }), rejectsWith("invalid_response"));
  for (const body of [null, {}, { type: "FeatureCollection", features: null }, collection([{}]), collection([{ ...alert, event: 42 }])]) {
    await assert.rejects(fetchNwsAlerts(us, { userAgent, fetch: jsonTransport(body) }), rejectsWith("invalid_response"));
  }
});

test("normalizes omitted optional fields to null and ignores unrelated GeoJSON fields", async () => {
  const { headline, instruction, onset, ends, ...required } = alert;
  const result = await fetchNwsAlerts(us, { userAgent, fetch: jsonTransport(collection([required])) });
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.deepEqual(result.alerts[0], { ...required, headline: null, instruction: null, onset: null, ends: null });
  }
});

test("network failure produces a safe typed error", async () => {
  await assert.rejects(fetchNwsAlerts(us, {
    userAgent, fetch: async () => { throw new Error("private transport details"); },
  }), (error: unknown) => {
    rejectsWith("network")(error);
    assert.ok(!String(error).includes("private transport details"));
    return true;
  });
});

test("aborts slow requests", async () => {
  const slowTransport: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error("Timeout did not abort")), 1000);
    init?.signal?.addEventListener("abort", () => {
      clearTimeout(keepAlive);
      reject(init.signal?.reason);
    }, { once: true });
  });
  await assert.rejects(fetchNwsAlerts(us, { userAgent, timeoutMs: 10, fetch: slowTransport }), rejectsWith("timeout"));
});

test("timeout also covers a stalled response body", async () => {
  const slowBody: typeof fetch = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      const keepAlive = setTimeout(() => controller.error(new Error("Body timeout did not abort")), 1000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        controller.error(init.signal?.reason);
      }, { once: true });
    },
  }));
  await assert.rejects(fetchNwsAlerts(us, { userAgent, timeoutMs: 10, fetch: slowBody }), rejectsWith("timeout"));
});
