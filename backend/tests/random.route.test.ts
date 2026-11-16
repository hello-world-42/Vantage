import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createRandomRouter } from "../src/routes/random.js";
import { isLand } from "../src/modules/geo/landMask.js";
import { getRandomLocation as frontendRandom } from "../../frontend/src/api/client.js";
import type { RandomLocation } from "../src/modules/geo/randomLocation.service.js";

function app(generate?: () => RandomLocation | Promise<RandomLocation>) {
  const server = express(); server.use("/api/random", createRandomRouter(generate)); return server;
}

test("route returns the frontend response contract and disables caching", async () => {
  const response = await request(app(() => ({ lat: 33.75, lng: -84.39 }))).get("/api/random").expect(200);
  assert.deepEqual(response.body, { lat: 33.75, lng: -84.39 });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("default route selects land offline without authentication", async () => {
  const response = await request(app()).get("/api/random").expect(200);
  assert.equal(isLand(response.body.lat, response.body.lng), true);
});

test("each request calls the generator instead of returning a cached selection", async () => {
  let calls = 0;
  const server = app(() => ({ lat: 33.75 + calls++, lng: -84.39 }));
  const first = await request(server).get("/api/random").expect(200);
  const second = await request(server).get("/api/random").expect(200);
  assert.notDeepEqual(first.body, second.body); assert.equal(calls, 2);
});

test("async provider failure returns sanitized 503", async () => {
  const response = await request(app(async () => { throw new Error("Internal generator details"); })).get("/api/random").expect(503);
  assert.deepEqual(response.body, { error: "Random location is unavailable right now." });
  assert.equal(response.headers["cache-control"], "no-store");
});

test("invalid provider output cannot reach the browser", async () => {
  const response = await request(app(() => ({ lat: NaN, lng: 200 }))).get("/api/random").expect(503);
  assert.deepEqual(response.body, { error: "Random location is unavailable right now." });
});

test("existing frontend API consumer accepts the real offline route response", async () => {
  const server = app(); const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      assert.equal(String(input), "/api/random");
      const response = await request(server).get(String(input));
      return new Response(JSON.stringify(response.body), { status: response.status });
    };
    const result = await frontendRandom();
    assert.equal(isLand(result.lat, result.lng), true);
  } finally { globalThis.fetch = original; }
});
