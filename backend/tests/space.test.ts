import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { SpaceData } from "@vantage/shared/modules/space";
import type { LocationContext } from "../src/aggregator/moduleRegistry.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { createThrottle, ThrottledError } from "../src/lib/throttle.js";
import { fetchUpcomingLaunches } from "../src/modules/space/launchLibrary.client.js";
import { fetchVisualPasses } from "../src/modules/space/n2yo.client.js";
import { createSpaceModule, pickLaunches, NEARBY_RADIUS_KM } from "../src/modules/space/space.service.js";

// Trimmed from a real Launch Library 2.3 response (2026-11-15), plus one malformed entry.
const launchFixture = readFileSync(new URL("./fixtures/launchLibrary-upcoming.json", import.meta.url), "utf8");
// The example response from N2YO's API documentation (https://www.n2yo.com/api/).
const n2yoExample = {
  info: { satid: 25544, satname: "SPACE STATION", transactionscount: 4, passescount: 1 },
  passes: [{
    startAz: 307.21, startAzCompass: "NW", startEl: 13.08, startUTC: 1521368025,
    maxAz: 225.45, maxAzCompass: "SW", maxEl: 78.27, maxUTC: 1521368345,
    endAz: 132.82, endAzCompass: "SE", endEl: 0, endUTC: 1521368660, mag: -2.4, duration: 485,
  }],
};

function recordingFetch(body: string | object, status = 200) {
  const urls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fn, urls };
}

const atlanta: LocationContext = {
  query: { lat: 33.75, lng: -84.39 },
  cell: { key: "0.25:495:382", lat: 33.875, lng: -84.375, sizeDeg: 0.25 },
  countryCode: "US",
  signal: new AbortController().signal,
};
const NOW = new Date("2026-11-16T04:00:00Z");

/* ───── Launch Library client ───── */

test("Launch Library: parses the real response and skips malformed entries", async () => {
  const { fn, urls } = recordingFetch(launchFixture);
  const launches = await fetchUpcomingLaunches({ fetch: fn });
  assert.equal(launches.length, 6, "6 valid launches; the broken one is dropped");
  const vulcan = launches[0];
  assert.equal(vulcan.name, "Vulcan VC6L | Amazon Leo (LV-01)");
  assert.equal(vulcan.status, "Failure");
  assert.equal(vulcan.provider, "United Launch Alliance");
  assert.deepEqual(vulcan.pad, { name: "Space Launch Complex 41", location: "Cape Canaveral SFS, FL, USA", lat: 28.58341025, lng: -80.58303644, countryCode: "US" });
  const url = new URL(urls[0]);
  assert.equal(url.host, "ll.thespacedevs.com");
  assert.equal(url.searchParams.get("mode"), "normal");
});

test("Launch Library: spends one request from its throttle and stops when it's used up", async () => {
  const throttle = createThrottle({ name: "Launch Library", limit: 1, windowMs: 3_600_000 });
  const { fn, urls } = recordingFetch(launchFixture);
  await fetchUpcomingLaunches({ fetch: fn, throttle });
  await assert.rejects(fetchUpcomingLaunches({ fetch: fn, throttle }), ThrottledError);
  assert.equal(urls.length, 1, "no request is sent once the budget is gone");
});

test("pickLaunches: soonest first, hides long-past launches, flags nearby pads", async () => {
  const launches = await fetchUpcomingLaunches({ fetch: recordingFetch(launchFixture).fn });
  const picked = pickLaunches(launches, atlanta.cell, NOW);
  // The Vulcan launch was ~10 hours before NOW, past the 6-hour grace period.
  assert.ok(!picked.upcoming.some((l) => l.name.startsWith("Vulcan")));
  const times = picked.upcoming.map((l) => Date.parse(l.net));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(picked.nearbyRadiusKm, NEARBY_RADIUS_KM);
  // From Atlanta, only Cape Canaveral (~640 km) is within 1,000 km.
  assert.deepEqual(picked.nearby.map((l) => l.pad.location), ["Cape Canaveral SFS, FL, USA"]);
  assert.ok(picked.nearby[0].distanceKm > 600 && picked.nearby[0].distanceKm < 700);
});

/* ───── N2YO client ───── */

test("N2YO: maps the documented response and builds the documented URL", async () => {
  const { fn, urls } = recordingFetch(n2yoExample);
  const passes = await fetchVisualPasses({ satelliteId: 25544, displayName: "ISS", lat: 41.702, lng: -76.014 }, { apiKey: "KEY-123", fetch: fn });
  assert.equal(urls[0], "https://api.n2yo.com/rest/v1/satellite/visualpasses/25544/41.7020/-76.0140/0/2/120/&apiKey=KEY-123");
  assert.deepEqual(passes, [{
    satelliteId: 25544, satelliteName: "ISS",
    start: "2018-03-18T10:13:45.000Z", max: "2018-03-18T10:19:05.000Z", end: "2018-03-18T10:24:20.000Z",
    maxElevationDeg: 78.27, startCompass: "NW", maxCompass: "SW", endCompass: "SE",
    magnitude: -2.4, durationSeconds: 485,
  }]);
});

test("N2YO: no passes, unknown brightness, and errors that don't leak the key", async () => {
  const none = await fetchVisualPasses({ satelliteId: 1, lat: 0, lng: 0 }, { apiKey: "k", fetch: recordingFetch({ info: { satid: 1, satname: "X" } }).fn });
  assert.deepEqual(none, []);

  const dim = { ...n2yoExample, passes: [{ ...n2yoExample.passes[0], mag: 100000 }] };
  const [pass] = await fetchVisualPasses({ satelliteId: 25544, lat: 0, lng: 0 }, { apiKey: "k", fetch: recordingFetch(dim).fn });
  assert.equal(pass.magnitude, null);

  await assert.rejects(
    fetchVisualPasses({ satelliteId: 1, lat: 0, lng: 0 }, { apiKey: "SECRET-KEY", fetch: recordingFetch({}, 403).fn }),
    (error: Error) => !error.message.includes("SECRET-KEY"),
  );
});

/* ───── Space module ───── */

test("space card: launches plus satellite passes for the cell", async () => {
  const space = createSpaceModule({
    cache: createMemoryCache(),
    n2yoApiKey: "k",
    now: () => NOW,
    launchLibrary: { fetch: recordingFetch(launchFixture).fn },
    n2yo: { fetch: recordingFetch(n2yoExample).fn },
  });
  const outcome = await space.fetch(atlanta);
  assert.equal(outcome.status, "ok");
  const data = (outcome.status === "ok" ? outcome.data : {}) as SpaceData;
  assert.equal(data.launches?.status, "ok");
  assert.equal(data.satellitePasses?.status, "ok");
  assert.equal(data.satellitePasses?.status === "ok" && data.satellitePasses.data.length, 3, "one pass per default satellite");
});

test("space card: without N2YO_API_KEY there's no satellite section at all", async () => {
  const space = createSpaceModule({ cache: createMemoryCache(), now: () => NOW, launchLibrary: { fetch: recordingFetch(launchFixture).fn } });
  const outcome = await space.fetch(atlanta);
  assert.equal(outcome.status, "ok");
  assert.deepEqual(Object.keys(outcome.status === "ok" ? (outcome.data as object) : {}), ["launches"]);
});

test("space card: the launch list is fetched once for all cells", async () => {
  const ll = recordingFetch(launchFixture);
  const space = createSpaceModule({ cache: createMemoryCache(), now: () => NOW, launchLibrary: { fetch: ll.fn } });
  await space.fetch(atlanta);
  await space.fetch({ ...atlanta, cell: { key: "other", lat: -33.9, lng: 151.2, sizeDeg: 0.25 } });
  assert.equal(ll.urls.length, 1);
});

test("space card: when N2YO's budget is used up, passes show an error row and launches still show", async () => {
  const space = createSpaceModule({
    cache: createMemoryCache(),
    n2yoApiKey: "k",
    now: () => NOW,
    logError: () => {},
    launchLibrary: { fetch: recordingFetch(launchFixture).fn },
    n2yo: { fetch: recordingFetch(n2yoExample).fn, throttle: createThrottle({ name: "N2YO", limit: 1, windowMs: 3_600_000 }) },
  });
  // First cell spends the budget on its first satellite; the other two calls are refused but one succeeded.
  const first = await space.fetch(atlanta);
  assert.equal(first.status === "ok" && (first.data as SpaceData).satellitePasses?.status, "ok");
  const second = await space.fetch({ ...atlanta, cell: { key: "b", lat: 10, lng: 10, sizeDeg: 0.25 } });
  const data = (second.status === "ok" ? second.data : {}) as SpaceData;
  assert.equal(data.launches?.status, "ok");
  assert.deepEqual(data.satellitePasses, { status: "error", source: "N2YO", message: "Couldn't load satellite passes right now." });
  assert.equal(second.ttlSeconds, 60, "retried soon rather than cached for an hour");
});

test("space card: if one satellite's lookup fails, the others show, it's logged, and it retries soon", async () => {
  const logged: unknown[] = [];
  let call = 0;
  const flaky = (async () => (++call === 1 ? new Response("down", { status: 500 }) : new Response(JSON.stringify(n2yoExample)))) as typeof fetch;
  const space = createSpaceModule({
    cache: createMemoryCache(),
    n2yoApiKey: "k",
    now: () => NOW,
    logError: (_m, e) => logged.push(e),
    launchLibrary: { fetch: recordingFetch(launchFixture).fn },
    n2yo: { fetch: flaky },
  });
  const outcome = await space.fetch(atlanta);
  const data = (outcome.status === "ok" ? outcome.data : {}) as SpaceData;
  assert.equal(data.satellitePasses?.status === "ok" && data.satellitePasses.data.length, 2);
  assert.equal(logged.length, 1);
  assert.equal(outcome.ttlSeconds, 60);
});

test("pickLaunches: a launch that already succeeded or failed isn't listed as upcoming", async () => {
  const launches = await fetchUpcomingLaunches({ fetch: recordingFetch(launchFixture).fn });
  // One hour after the Vulcan launch: inside the 6-hour grace window, but its status is "Failure".
  const picked = pickLaunches(launches, atlanta.cell, new Date("2026-11-15T18:40:00Z"));
  assert.ok(!picked.upcoming.some((l) => l.status === "Failure"));
  assert.ok(!picked.nearby.some((l) => l.name.startsWith("Vulcan")));
});
