import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp, type AppOptions } from "../src/app.js";
import type { AggregateLocation } from "../src/aggregator/aggregateLocation.js";

const fakeAggregate: AggregateLocation = async ({ lat, lng }) => ({
  query: { lat, lng },
  cell: { key: "k", lat, lng, sizeDeg: 0.25 },
  countryCode: null,
  modules: {},
  generatedAt: "now",
});

async function withApp(options: AppOptions, fn: (base: string) => Promise<void>) {
  const server = createApp({ aggregateLocation: fakeAggregate, logError: () => {}, ...options }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

const location = (base: string) => fetch(`${base}/api/location?lat=1&lng=2`);

test("API limit: requests past the limit get a JSON 429 with standard headers", async () => {
  await withApp({ rateLimits: { api: { limit: 3, windowMs: 60_000 }, auth: false } }, async (base) => {
    for (let i = 0; i < 3; i++) assert.equal((await location(base)).status, 200);
    const blocked = await location(base);
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: "Too many requests. Try again in 1 minute." });
    assert.ok(blocked.headers.get("retry-after"), "Retry-After header");
    assert.ok(blocked.headers.get("ratelimit-policy"), "RateLimit-Policy header");
  });
});

test("API limit: /api/health never counts, so uptime checks can't lock anyone out", async () => {
  await withApp({ rateLimits: { api: { limit: 1, windowMs: 60_000 }, auth: false } }, async (base) => {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await location(base)).status, 200);
    assert.equal((await location(base)).status, 429);
  });
});

test("auth limit: failed sign-in attempts are capped", async () => {
  await withApp({ rateLimits: { api: false, auth: { limit: 2, windowMs: 15 * 60_000 } } }, async (base) => {
    // Bad JSON fails with 400 before touching the database, so this needs no DATABASE_URL.
    const attempt = () => fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
    assert.equal((await attempt()).status, 400);
    assert.equal((await attempt()).status, 400);
    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: "Too many sign-in attempts. Try again in 15 minutes." });
    // Other routes aren't affected by the sign-in limit.
    assert.equal((await location(base)).status, 200);
  });
});
