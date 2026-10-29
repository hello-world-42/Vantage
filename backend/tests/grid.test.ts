import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLng, snapToCell } from "../src/lib/grid.js";

test("nearby points share a cell; the cell center is used", () => {
  const a = snapToCell(33.749, -84.388);
  const b = snapToCell(33.74, -84.42);
  assert.equal(a.key, b.key);
  assert.deepEqual({ lat: a.lat, lng: a.lng }, { lat: 33.625, lng: -84.375 });
});

test("longitude wraps around the antimeridian", () => {
  assert.equal(normalizeLng(190), -170);
  assert.equal(normalizeLng(-190), 170);
  assert.equal(normalizeLng(180), -180);
  assert.equal(snapToCell(10, 190).key, snapToCell(10, -170).key);
});

test("poles and edges stay inside the grid", () => {
  const north = snapToCell(90, 0);
  const south = snapToCell(-90, 0);
  assert.ok(north.lat < 90 && south.lat > -90);
  assert.ok(snapToCell(0, 179.999).lng < 180);
});

test("rejects non-finite input and bad cell sizes", () => {
  assert.throws(() => snapToCell(Number.NaN, 0), RangeError);
  assert.throws(() => snapToCell(0, 0, 0.7), RangeError);
});
