import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackLayout,
  buildLayoutNotes,
  normalizeDeskArray
} from "../lib/generateLayoutHelpers.js";

test("normalizeDeskArray supports object-wrapped desk arrays and clamps values", () => {
  const desks = normalizeDeskArray({
    desks: [
      { x_percent: -12, y_percent: 25, rotation_deg: 450 },
      { x_percent: "55", y_percent: "101", rotation_deg: -90 }
    ]
  });

  assert.deepEqual(desks, [
    { x_percent: 0, y_percent: 25, rotation_deg: 90 },
    { x_percent: 55, y_percent: 100, rotation_deg: 270 }
  ]);
});

test("buildFallbackLayout returns the requested number of desks", () => {
  const desks = buildFallbackLayout({}, 5, "balanced");
  assert.equal(desks.length, 5);
  assert.equal(desks.every((desk) => desk.x_percent >= 0 && desk.x_percent <= 100), true);
  assert.equal(desks.every((desk) => desk.y_percent >= 0 && desk.y_percent <= 100), true);
});

test("buildLayoutNotes explain fallback mode", () => {
  const notes = buildLayoutNotes([{ x_percent: 20, y_percent: 20, rotation_deg: 0 }], true);
  assert.match(notes[0], /did not complete/i);
  assert.match(notes[1], /drag desks/i);
});
