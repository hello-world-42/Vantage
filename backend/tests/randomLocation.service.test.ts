import assert from "node:assert/strict";
import test from "node:test";
import { containsLandPoint, isLand, type LandPolygon } from "../src/modules/geo/landMask.js";
import { getRandomLocation, RandomLocationError } from "../src/modules/geo/randomLocation.service.js";

test("offline mask classifies inland points on all major continents", () => {
  for (const [lat, lng] of [[33.75, -84.39], [48.85, 2.35], [28.6, 77.2], [-1.29, 36.8],
    [-23.55, -46.63], [-23.7, 133.9], [-80, 0]]) assert.equal(isLand(lat, lng), true, `${lat}, ${lng}`);
});

test("offline mask rejects open oceans and invalid coordinates", () => {
  for (const [lat, lng] of [[0, -140], [30, -40], [0, 90], [89, 0], [NaN, 0], [91, 0], [0, 181]]) {
    assert.equal(isLand(lat, lng), false, `${lat}, ${lng}`);
  }
});

test("polygon containment handles holes, edges and reversed winding", () => {
  const polygon: LandPolygon = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];
  for (const shape of [polygon, polygon.map((ring) => [...ring].reverse())]) {
    assert.equal(containsLandPoint(2, 2, shape), true);
    assert.equal(containsLandPoint(5, 5, shape), false);
    assert.equal(containsLandPoint(0, 5, shape), false);
    assert.equal(containsLandPoint(4, 5, shape), false);
    assert.equal(containsLandPoint(11, 5, shape), false);
  }
});

test("rejects an ocean sample then returns the inland candidate", () => {
  const values = [0.5, 40 / 360, (Math.sin(33.75 * Math.PI / 180) + 1) / 2, (-84.39 + 180) / 360];
  let index = 0;
  const result = getRandomLocation({ random: () => values[index++] });
  assert.ok(Math.abs(result.lat - 33.75) < 1e-10);
  assert.ok(Math.abs(result.lng + 84.39) < 1e-10);
  assert.equal(index, 4);
});

test("samples latitude by spherical area rather than uniformly in degrees", () => {
  const values = [0.75, 190 / 360];
  const result = getRandomLocation({ random: () => values.shift()! });
  assert.ok(Math.abs(result.lat - 30) < 1e-10); assert.ok(Math.abs(result.lng - 10) < 1e-10);
});

test("bounded rejection never falls back to an ocean point", () => {
  let calls = 0;
  assert.throws(() => getRandomLocation({ maxAttempts: 2, random: () => ++calls % 2 ? 0.5 : 40 / 360 }), RandomLocationError);
  assert.equal(calls, 4);
});

test("rejects invalid attempt limits and random source outputs", () => {
  for (const maxAttempts of [0, -1, 1.5, Infinity, 1001]) assert.throws(() => getRandomLocation({ maxAttempts }), RandomLocationError);
  for (const value of [-1, 1, NaN, Infinity]) assert.throws(() => getRandomLocation({ random: () => value }), RandomLocationError);
});

test("1000 deterministic selections remain on masked land and span both hemispheres", () => {
  let seed = 1847;
  const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  const results = Array.from({ length: 1000 }, () => getRandomLocation({ random }));
  for (const { lat, lng } of results) {
    assert.ok(Number.isFinite(lat) && Number.isFinite(lng)); assert.equal(isLand(lat, lng), true);
  }
  assert.ok(results.filter(({ lat }) => lat > 0).length > 100);
  assert.ok(results.filter(({ lat }) => lat < 0).length > 100);
  assert.equal(new Set(results.map(({ lat, lng }) => `${lat},${lng}`)).size, 1000);
});
