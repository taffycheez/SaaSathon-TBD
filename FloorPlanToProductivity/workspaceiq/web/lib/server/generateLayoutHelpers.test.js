import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackLayout,
  buildLayoutNotes,
  normalizeDeskArray
} from "./generateLayoutHelpers.js";

test("normalizeDeskArray accepts either a bare array or a desks object", () => {
  assert.deepEqual(normalizeDeskArray([{ x_percent: 120, y_percent: -10, rotation_deg: -90 }]), [
    { x_percent: 100, y_percent: 0, rotation_deg: 270 }
  ]);

  assert.deepEqual(normalizeDeskArray({ desks: [{ x_percent: 40, y_percent: 55, rotation_deg: 450 }] }), [
    { x_percent: 40, y_percent: 55, rotation_deg: 90 }
  ]);
});

test("buildFallbackLayout creates bounded desks for the requested headcount", () => {
  const desks = buildFallbackLayout({}, 7, "collaborative");

  assert.equal(desks.length, 7);
  assert.ok(desks.every((desk) => desk.x_percent >= 0 && desk.x_percent <= 100));
  assert.ok(desks.every((desk) => desk.y_percent >= 0 && desk.y_percent <= 100));
});

test("buildLayoutNotes distinguishes fallback layouts from AI layouts", () => {
  assert.match(buildLayoutNotes([], true)[0], /did not complete/i);
  assert.match(buildLayoutNotes([{ x_percent: 50, y_percent: 50 }], false)[0], /Generated 1 desk/i);
});
