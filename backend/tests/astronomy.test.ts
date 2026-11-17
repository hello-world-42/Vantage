import assert from "node:assert/strict";
import test from "node:test";
import SunCalc from "suncalc";
import { computeAstronomy, daylightFor, moonPhaseName, nextMoonEvents } from "../src/modules/astronomy/suncalc.service.js";
import { createAstronomyModule } from "../src/modules/astronomy/astronomy.service.js";

const minutesBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60_000;

test("Atlanta sunrise and sunset match published times within a few minutes", () => {
  // Published for Atlanta on 2026-11-15: sunrise ~7:08 EST (12:08Z), sunset ~17:32 EST (22:32Z).
  // The cell center is ~15 km from downtown, which shifts times by about a minute.
  const data = computeAstronomy(33.875, -84.375, new Date("2026-11-15T17:00:00Z"));
  assert.ok(minutesBetween(data.sun.sunrise!, "2026-11-15T12:08:00Z") < 6, data.sun.sunrise!);
  assert.ok(minutesBetween(data.sun.sunset!, "2026-11-15T22:32:00Z") < 6, data.sun.sunset!);
  assert.equal(data.sun.daylight, "day");
  assert.equal(data.sun.polar, null);
});

test("late evening in Atlanta is night, with the sun far below the horizon", () => {
  const data = computeAstronomy(33.875, -84.375, new Date("2026-11-16T04:00:00Z")); // 11 pm EST
  assert.equal(data.sun.daylight, "night");
  assert.ok(data.sun.altitudeDeg < -18);
});

test("Svalbard has polar night in December and midnight sun in June", () => {
  const december = computeAstronomy(78.2, 15.6, new Date("2026-12-21T12:00:00Z")).sun;
  assert.equal(december.polar, "down");
  assert.equal(december.sunrise, null);
  assert.equal(december.sunset, null);

  const june = computeAstronomy(78.2, 15.6, new Date("2026-06-21T00:00:00Z")).sun;
  assert.equal(june.polar, "up");
  assert.equal(june.daylight, "day", "the sun is up even at midnight");
});

test("twilight bands follow the standard sun-altitude thresholds", () => {
  assert.equal(daylightFor(10), "day");
  assert.equal(daylightFor(-0.5), "day", "the sun's disc is still partly up at -0.5°");
  assert.equal(daylightFor(-3), "civil_twilight");
  assert.equal(daylightFor(-9), "nautical_twilight");
  assert.equal(daylightFor(-15), "astronomical_twilight");
  assert.equal(daylightFor(-30), "night");
});

test("moon phase names cover the whole cycle", () => {
  assert.equal(moonPhaseName(0), "New moon");
  assert.equal(moonPhaseName(0.99), "New moon");
  assert.equal(moonPhaseName(0.12), "Waxing crescent");
  assert.equal(moonPhaseName(0.25), "First quarter");
  assert.equal(moonPhaseName(0.37), "Waxing gibbous");
  assert.equal(moonPhaseName(0.5), "Full moon");
  assert.equal(moonPhaseName(0.62), "Waning gibbous");
  assert.equal(moonPhaseName(0.75), "Last quarter");
  assert.equal(moonPhaseName(0.87), "Waning crescent");
});

test("the next moonrise is a real horizon crossing within 24 hours", () => {
  const from = new Date("2026-11-16T04:00:00Z");
  const { nextRise, nextSet } = nextMoonEvents(from, 33.875, -84.375);
  for (const time of [nextRise, nextSet].filter((t): t is string => t !== null)) {
    const t = Date.parse(time);
    assert.ok(t > from.getTime() && t <= from.getTime() + 24 * 3600_000, time);
    const altitudeDeg = (SunCalc.getMoonPosition(new Date(t), 33.875, -84.375).altitude * 180) / Math.PI;
    assert.ok(Math.abs(altitudeDeg - 0.133) < 0.5, `moon at the horizon at ${time} (was ${altitudeDeg.toFixed(2)}°)`);
  }
  assert.ok(nextRise || nextSet, "at mid-latitudes the moon rises or sets within a day");
});

test("the astronomy module answers for the cell center without any network", async () => {
  const module = createAstronomyModule(() => new Date("2026-11-15T17:00:00Z"));
  const outcome = await module.fetch({
    query: { lat: 33.8, lng: -84.4 },
    cell: { key: "k", lat: 33.875, lng: -84.375, sizeDeg: 0.25 },
    countryCode: null,
    signal: new AbortController().signal,
  });
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.status === "ok" && outcome.source, "suncalc");
});
