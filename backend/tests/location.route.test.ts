import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import type { AggregateLocation } from "../src/aggregator/aggregateLocation.js";

async function withServer(aggregate: AggregateLocation, fn: (base: string) => Promise<void>) {
  const server = createApp({ aggregateLocation: aggregate }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

const fake: AggregateLocation = async ({ lat, lng, country }) => ({
  query: { lat, lng },
  cell: { key: "k", lat, lng, sizeDeg: 0.25 },
  countryCode: country ?? null,
  modules: {},
  generatedAt: "now",
});

test("GET /api/location validates and passes coerced numbers and country", async () => {
  await withServer(fake, async (base) => {
    const res = await fetch(`${base}/api/location?lat=33.75&lng=-84.39&country=us`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.query, { lat: 33.75, lng: -84.39 });
    assert.equal(body.countryCode, "US");
  });
});

test("GET /api/location rejects bad input with 400", async () => {
  await withServer(fake, async (base) => {
    for (const qs of ["", "lat=91&lng=0", "lat=abc&lng=0", "lat=0&lng=0&country=USA"]) {
      const res = await fetch(`${base}/api/location?${qs}`);
      assert.equal(res.status, 400, qs);
    }
  });
});
