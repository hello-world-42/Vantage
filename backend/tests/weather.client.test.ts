import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpenMeteoWeather, WeatherClientError } from "../src/modules/weather/openMeteo.client.js";
import { weatherFixture, weatherTransport } from "./fixtures/weather.js";

const isError = (code: string) => (error: unknown) => error instanceof WeatherClientError && error.code === code;

test("requests current weather, one UTC day of UV, explicit units and no credential parameter", async () => {
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.open-meteo.com/v1/forecast");
    for (const [key, value] of Object.entries({ latitude: "33.75", longitude: "-84.39", timezone: "GMT", timeformat: "unixtime",
      daily: "uv_index_max", forecast_days: "1", temperature_unit: "celsius", wind_speed_unit: "kmh", precipitation_unit: "mm", cell_selection: "nearest" })) {
      assert.equal(url.searchParams.get(key), value);
    }
    assert.equal(url.searchParams.get("current"), "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day");
    assert.equal(url.searchParams.has("apikey"), false);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response(JSON.stringify(weatherFixture()));
  };
  assert.deepEqual(await fetchOpenMeteoWeather(33.75, -84.39, { fetch: transport }), weatherFixture());
});

test("invalid coordinates fail before networking", async () => {
  for (const [lat, lng] of [[NaN, 0], [Infinity, 0], [91, 0], [-91, 0], [0, 181], [0, -181]]) {
    await assert.rejects(fetchOpenMeteoWeather(lat, lng, { fetch: async () => assert.fail("Must not fetch") }), isError("invalid_input"));
  }
});

test("accepts boundary coordinates and international locations", async () => {
  for (const [lat, lng] of [[-90, -180], [90, 180], [51.5, -0.12]]) {
    await fetchOpenMeteoWeather(lat, lng, { fetch: weatherTransport(weatherFixture()) });
  }
});

test("validates timeout configuration before networking", async () => {
  for (const timeoutMs of [0, -1, 1.5, Infinity, 60_001]) {
    await assert.rejects(fetchOpenMeteoWeather(0, 0, { timeoutMs }), isError("configuration"));
  }
});

test("preserves upstream error status while hiding response details", async () => {
  for (const status of [400, 429, 500, 503]) {
    await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch: weatherTransport({ reason: "private upstream details" }, status) }), (error: unknown) => {
      assert.ok(error instanceof WeatherClientError);
      assert.equal(error.code, "http"); assert.equal(error.status, status);
      assert.ok(!String(error).includes("private upstream details")); return true;
    });
  }
});

test("rejects unreadable JSON, empty payloads, wrong units, bad ranges and misaligned daily data", async () => {
  await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch: async () => new Response("broken JSON") }), isError("invalid_response"));
  const fixture = weatherFixture();
  for (const body of [null, {}, { ...fixture, current: null },
    { ...fixture, current_units: { ...fixture.current_units, temperature_2m: "°F" } },
    { ...fixture, current: { ...fixture.current, relative_humidity_2m: 101 } },
    { ...fixture, current: { ...fixture.current, wind_speed_10m: -1 } },
    { ...fixture, daily: { ...fixture.daily, uv_index_max: [] } },
    { ...fixture, daily: { ...fixture.daily, uv_index_max: [-1] } },
  ]) {
    await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch: weatherTransport(body) }), isError("invalid_response"));
  }
});

test("all-null current weather is an error rather than a false successful reading", async () => {
  const fixture = weatherFixture();
  const current = Object.fromEntries(Object.entries(fixture.current).map(([key, value]) => [key, ["time", "interval", "is_day"].includes(key) ? value : null]));
  await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch: weatherTransport({ ...fixture, current }) }), isError("invalid_response"));
});

test("partial missing values remain null", async () => {
  const fixture = weatherFixture();
  const result = await fetchOpenMeteoWeather(0, 0, { fetch: weatherTransport({ ...fixture,
    current: { ...fixture.current, apparent_temperature: null }, daily: { ...fixture.daily, uv_index_max: [null] },
  }) });
  assert.equal(result.current.apparent_temperature, null);
  assert.equal(result.daily.uv_index_max[0], null);
});

test("network errors are sanitized", async () => {
  await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch: async () => { throw new Error("internal network details"); } }), (error: unknown) => {
    assert.ok(isError("network")(error)); assert.ok(!String(error).includes("internal network details")); return true;
  });
});

test("aborts a stalled request and stalled body", async () => {
  const stalledRequest: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Did not abort")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
  });
  const stalledBody: typeof fetch = async (_input, init) => new Response(new ReadableStream({ start(controller) {
    const timer = setTimeout(() => controller.error(new Error("Did not abort body")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(timer); controller.error(init.signal?.reason); }, { once: true });
  } }));
  for (const fetch of [stalledRequest, stalledBody]) {
    await assert.rejects(fetchOpenMeteoWeather(0, 0, { fetch, timeoutMs: 10 }), isError("timeout"));
  }
});

test("honors caller cancellation before and during a request", async () => {
  await assert.rejects(fetchOpenMeteoWeather(0, 0, { signal: AbortSignal.abort(), fetch: async () => assert.fail("Must not fetch") }), isError("aborted"));
  const controller = new AbortController();
  await assert.rejects(fetchOpenMeteoWeather(0, 0, { signal: controller.signal, fetch: async () => {
    controller.abort(); throw new Error("Cancelled");
  } }), isError("aborted"));
});
