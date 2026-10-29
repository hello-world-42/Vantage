import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { createSingleflight } from "../src/lib/singleflight.js";

test("memory cache returns values until their TTL expires", async () => {
  let clock = 0;
  const cache = createMemoryCache({ now: () => clock });
  await cache.set("k", { v: 1 }, 10);
  assert.deepEqual(await cache.get("k"), { v: 1 });
  clock = 9_999;
  assert.deepEqual(await cache.get("k"), { v: 1 });
  clock = 10_000;
  assert.equal(await cache.get("k"), undefined);
});

test("memory cache evicts the oldest entries past maxEntries", async () => {
  const cache = createMemoryCache({ maxEntries: 2 });
  await cache.set("a", 1, 60);
  await cache.set("b", 2, 60);
  await cache.set("c", 3, 60);
  assert.equal(await cache.get("a"), undefined);
  assert.equal(await cache.get("c"), 3);
});

test("singleflight shares one in-flight call per key and cleans up", async () => {
  const flight = createSingleflight();
  let calls = 0;
  const work = () => new Promise<number>((resolve) => setTimeout(() => resolve(++calls), 10));
  const [a, b] = await Promise.all([flight.run("x", work), flight.run("x", work)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(flight.size, 0);
  await flight.run("x", work);
  assert.equal(calls, 2);
});

test("singleflight releases the key after a failure", async () => {
  const flight = createSingleflight();
  await assert.rejects(flight.run("y", async () => { throw new Error("boom"); }));
  assert.equal(await flight.run("y", async () => 42), 42);
});
