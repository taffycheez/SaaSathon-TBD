import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackLayout,
  buildLayoutNotes,
  normalizeDeskArray,
  normalizeLayoutPayload,
  optimizeLayout,
  optimizeRoomLayout
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

test("buildFallbackLayout keeps generated desks out of the main entry lane", () => {
  const room = {
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
    ],
    doors: [{ x_percent: 50, y_percent: 100 }],
    windows: [{ x_percent: 20, y_percent: 0 }],
    furniture: []
  };

  const desks = buildFallbackLayout(room, 4, "focus");

  assert.equal(desks.length, 4);
  assert.ok(desks.every((desk) => !(desk.x_percent > 42 && desk.x_percent < 58 && desk.y_percent > 48)));
});

test("optimizeLayout improves rough model output against room constraints", () => {
  const room = {
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
    ],
    doors: [{ x_percent: 50, y_percent: 100 }],
    windows: [{ x_percent: 18, y_percent: 0 }],
    furniture: []
  };
  const roughDesks = [
    { x_percent: 50, y_percent: 82, rotation_deg: 0 },
    { x_percent: 50, y_percent: 70, rotation_deg: 0 }
  ];

  const desks = optimizeLayout(room, roughDesks, 2, "balanced");

  assert.equal(desks.length, 2);
  assert.ok(desks.some((desk) => desk.x_percent !== 50 || desk.y_percent < 65));
  assert.ok(desks.every((desk) => [0, 90, 180, 270].includes(desk.rotation_deg)));
});

test("normalizeLayoutPayload accepts desks and furniture", () => {
  const layout = normalizeLayoutPayload({
    desks: [{ x_percent: 40, y_percent: 55, rotation_deg: 450 }],
    furniture: [{ type: "plant", x_percent: 41, y_percent: 56, rotation_deg: -90 }]
  });

  assert.deepEqual(layout.desks, [{ x_percent: 40, y_percent: 55, rotation_deg: 90 }]);
  assert.equal(layout.furniture[0].type, "plant");
  assert.equal(layout.furniture[0].rotation_deg, 270);
});

test("optimizeRoomLayout repositions movable furniture while preserving fixed fixtures", () => {
  const room = {
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
    ],
    doors: [{ wall_index: 2, position_percent: 50 }],
    windows: [{ wall_index: 0, position_percent: 25 }],
    desks: [{ type: "desk", x_percent: 50, y_percent: 78, rotation_deg: 0 }],
    furniture: [
      { type: "plant", x_percent: 92, y_percent: 92, width_percent: 5, height_percent: 6, rotation_deg: 0 },
      { type: "trashcan", x_percent: 50, y_percent: 74, width_percent: 4, height_percent: 4, rotation_deg: 0 },
      { type: "toilet", x_percent: 12, y_percent: 88, width_percent: 5, height_percent: 7, rotation_deg: 0 }
    ]
  };

  const layout = optimizeRoomLayout(room, {}, 1, "focus");

  assert.equal(layout.desks.length, 1);
  assert.equal(layout.furniture.length, 3);
  assert.equal(layout.furniture[2].type, "toilet");
  assert.equal(layout.furniture[2].x_percent, 12);
  assert.ok(layout.moved_furniture_count >= 1);
  assert.ok(layout.score_after >= layout.score_before);
});

test("buildLayoutNotes distinguishes fallback layouts from AI layouts", () => {
  assert.match(buildLayoutNotes([], true)[0], /optimized fallback layout/i);
  assert.match(buildLayoutNotes([{ x_percent: 50, y_percent: 50 }], false)[0], /Generated and optimized 1 desk/i);
});
