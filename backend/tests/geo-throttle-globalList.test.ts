import assert from "node:assert/strict";
import test from "node:test";
import { distanceKm, nearest } from "../src/lib/geo.js";
import { createThrottle, ThrottledError } from "../src/lib/throttle.js";
import { createGlobalList } from "../src/cache/globalList.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";

/* ───── geo ───── */

test("distanceKm matches known city distances", () => {
  const london = { lat: 51.5074, lng: -0.1278 };
  const paris = { lat: 48.8566, lng: 2.3522 };
  assert.ok(Math.abs(distanceKm(london, paris) - 344) < 3);
  // Across the date line: Fiji to Samoa is ~1,150 km, not ~39,000.
  assert.ok(Math.abs(distanceKm({ lat: -17.7, lng: 178.0 }, { lat: -13.8, lng: -172.1 }) - 1150) < 60);
  assert.equal(distanceKm(paris, paris), 0);
});

test("nearest adds distances, filters by radius and sorts nearest first", () => {
  const atlanta = { lat: 33.749, lng: -84.388 };
  const pads = [
    { name: "Vandenberg", lat: 34.632, lng: -120.611 },
    { name: "Cape Canaveral", lat: 28.58, lng: -80.58 },
  ];
  const close = nearest(atlanta, pads, 1000);
  assert.deepEqual(close.map((p) => p.name), ["Cape Canaveral"]);
  assert.ok(close[0].distanceKm > 600 && close[0].distanceKm < 700);
  assert.deepEqual(nearest(atlanta, pads).map((p) => p.name), ["Cape Canaveral", "Vandenberg"]);
});

/* ───── throttle ───── */

test("throttle allows `limit` requests per window, then throws with a retry time", () => {
  let now = 0;
  const throttle = createThrottle({ name: "N2YO", limit: 2, windowMs: 1000, now: () => now });
  throttle.take();
  now = 400;
  throttle.take();
  assert.equal(throttle.remaining(), 0);
  assert.throws(() => throttle.take(), (error: unknown) => {
    assert.ok(error instanceof ThrottledError);
    assert.equal(error.provider, "N2YO");
    assert.equal(error.retryAfterMs, 600, "the oldest request expires at t=1000");
    return true;
  });
});

test("throttle window slides: old requests stop counting", () => {
  let now = 0;
  const throttle = createThrottle({ name: "x", limit: 1, windowMs: 1000, now: () => now });
  throttle.take();
  now = 999;
  assert.throws(() => throttle.take(), ThrottledError);
  now = 1000;
  throttle.take();
});

/* ───── global list ───── */

test("global list: concurrent requests share one load, later ones hit the cache", async () => {
  let loads = 0;
  const list = createGlobalList({
    cache: createMemoryCache(),
    key: "list:test",
    ttlSeconds: 60,
    load: async () => { loads++; await new Promise((r) => setTimeout(r, 20)); return ["a", "b"]; },
  });
  const results = await Promise.all([list.get(), list.get(), list.get()]);
  assert.deepEqual(results, [["a", "b"], ["a", "b"], ["a", "b"]]);
  await list.get();
  assert.equal(loads, 1);
});

test("global list: reloads after the TTL, and a failed load isn't cached", async () => {
  let now = 0;
  let loads = 0;
  let fail = true;
  const list = createGlobalList({
    cache: createMemoryCache({ now: () => now }),
    key: "list:test",
    ttlSeconds: 60,
    load: async () => { loads++; if (fail) throw new Error("down"); return [loads]; },
  });
  await assert.rejects(list.get(), /down/);
  fail = false;
  assert.deepEqual(await list.get(), [2], "retried right away after a failure");
  now = 61_000;
  assert.deepEqual(await list.get(), [3], "reloaded after the TTL");
});
