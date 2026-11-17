import assert from "node:assert/strict";
import test from "node:test";
import { offlineCountry, withOfflineCountryFallback } from "../src/aggregator/offlineCountry.js";

test("offline check recognises the US, including Alaska, Hawaii and Indiana's own zones", () => {
  const us: Array<[string, number, number]> = [
    ["Atlanta", 33.75, -84.39], ["Los Angeles", 34.05, -118.24], ["Anchorage", 61.22, -149.9],
    ["Honolulu", 21.31, -157.86], ["Indianapolis", 39.77, -86.16], ["Phoenix", 33.45, -112.07],
  ];
  for (const [name, lat, lng] of us) assert.equal(offlineCountry(lat, lng), "US", name);
});

test("offline check doesn't claim the US for neighbours, other countries or the ocean", () => {
  const notUs: Array<[string, number, number]> = [
    ["Toronto", 43.65, -79.38], ["Vancouver", 49.28, -123.12], ["Tijuana", 32.51, -117.04],
    ["Mexico City", 19.43, -99.13], ["Paris", 48.85, 2.35], ["Tokyo", 35.68, 139.69], ["Mid-Atlantic", 0, -30],
  ];
  for (const [name, lat, lng] of notUs) assert.equal(offlineCountry(lat, lng), null, name);
});

test("fallback: Mapbox's answer wins; a Mapbox failure or no Mapbox uses the offline check", async () => {
  const mapboxSaysFrance = withOfflineCountryFallback(async () => "FR");
  assert.equal(await mapboxSaysFrance(33.75, -84.39), "FR");

  const mapboxSaysOcean = withOfflineCountryFallback(async () => null);
  assert.equal(await mapboxSaysOcean(33.75, -84.39), null, "a real 'no country' answer isn't second-guessed");

  const logged: unknown[] = [];
  const mapboxDown = withOfflineCountryFallback(async () => { throw new Error("down"); }, (_m, e) => logged.push(e));
  assert.equal(await mapboxDown(33.75, -84.39), "US");
  assert.equal(logged.length, 1);

  assert.equal(await withOfflineCountryFallback(undefined)(48.85, 2.35), null);
});
