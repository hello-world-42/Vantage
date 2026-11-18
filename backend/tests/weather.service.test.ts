import assert from "node:assert/strict";
import test from "node:test";
import { fetchWeather } from "../src/modules/weather/weather.service.js";
import { WeatherClientError } from "../src/modules/weather/openMeteo.client.js";
import { createAggregator } from "../src/aggregator/aggregateLocation.js";
import { createMemoryCache } from "../src/cache/memoryCache.js";
import { weatherFixture, weatherTransport } from "./fixtures/weather.js";

test("normalizes timestamps, units, current fields, UTC daily UV and attribution", async () => {
  const fixture = weatherFixture();
  const result = await fetchWeather(33.75, -84.39, { fetch: weatherTransport(fixture) });
  assert.deepEqual(result, { status: "ok", source: "Open-Meteo", data: {
    validAt: new Date(fixture.current.time * 1000).toISOString(), intervalSeconds: 900,
    temperature: 18.5, feelsLike: 17.2, humidity: 65, windSpeed: 12.5, windDirection: 270,
    precipitation: 0, weatherCode: 3, isDay: true,
    dailyUvMax: { dateUtc: new Date(fixture.daily.time[0] * 1000).toISOString().slice(0, 10), index: 4.2 },
    units: { temperature: "°C", humidity: "%", windSpeed: "km/h", windDirection: "°", precipitation: "mm" },
    attribution: {
      text: "Weather data by Open-Meteo", url: "https://open-meteo.com/", license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      changes: "Field names and timestamps normalized; model values unchanged.",
    },
  } });
});

test("zero values and nighttime stay distinct from unavailable data", async () => {
  const fixture = weatherFixture();
  const result = await fetchWeather(0, 0, { fetch: weatherTransport({ ...fixture,
    current: { ...fixture.current, temperature_2m: 0, apparent_temperature: null, wind_speed_10m: 0, weather_code: 0, is_day: 0 },
    daily: { ...fixture.daily, uv_index_max: [null] },
  }) });
  assert.equal(result.data.temperature, 0); assert.equal(result.data.feelsLike, null);
  assert.equal(result.data.windSpeed, 0); assert.equal(result.data.weatherCode, 0);
  assert.equal(result.data.isDay, false); assert.equal(result.data.dailyUvMax.index, null);
});

test("unknown day/night is preserved as null", async () => {
  const fixture = weatherFixture();
  const result = await fetchWeather(0, 0, { fetch: weatherTransport({ ...fixture, current: { ...fixture.current, is_day: null } }) });
  assert.equal(result.data.isDay, null);
});

test("service throws typed failures for aggregator isolation", async () => {
  await assert.rejects(fetchWeather(0, 0, { fetch: weatherTransport({}, 503) }), (error: unknown) => error instanceof WeatherClientError && error.code === "http");
});

test("provider integrates through the existing callback contract and cache without changing registry code", async () => {
  let calls = 0;
  const transport: typeof fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.notEqual(url.searchParams.get("latitude"), "33.75"); // cell center, not raw click
    return new Response(JSON.stringify(weatherFixture()));
  };
  const aggregate = createAggregator({ cache: createMemoryCache(), modules: [{
    id: "weather", label: "Weather", scope: "cell", ttlSeconds: 600,
    fetch: ({ cell, signal }) => fetchWeather(cell.lat, cell.lng, { fetch: transport, signal }),
  }] });
  const first = await aggregate({ lat: 33.75, lng: -84.39 });
  const second = await aggregate({ lat: 33.75, lng: -84.39 });
  assert.equal(first.modules.weather?.status, "ok");
  assert.deepEqual(first.modules.weather, second.modules.weather); assert.equal(calls, 1);
});
