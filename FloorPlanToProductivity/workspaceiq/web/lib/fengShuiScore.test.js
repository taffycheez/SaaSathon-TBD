import test from "node:test";
import assert from "node:assert/strict";

import { computeFengShuiScore } from "./fengShuiScore.js";
import { inferZones } from "./zoning.js";

const BASE_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  estimated_area_m2: 48,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [],
  doors: [],
  furniture: [],
  desks: []
};

test("computeFengShuiScore returns guidance when no desks are present", () => {
  const result = computeFengShuiScore(BASE_ROOM, { workStyle: "balanced" });

  assert.equal(result.score, 0);
  assert.match(result.breakdown[0], /Add at least one desk/i);
  assert.ok(result.advice.length > 0);
});

test("computeFengShuiScore rewards a supported desk with a visible door and nearby window", () => {
  const result = computeFengShuiScore(
    {
      ...BASE_ROOM,
      windows: [{ x_percent: 24, y_percent: 0, wall_index: 0, position_percent: 24 }],
      doors: [{ x_percent: 100, y_percent: 60, wall_index: 1, position_percent: 60 }],
      desks: [
        {
          type: "desk",
          x_percent: 28,
          y_percent: 34,
          width_percent: 10,
          height_percent: 6,
          rotation_deg: 0
        }
      ]
    },
    { workStyle: "balanced" }
  );

  assert.ok(result.score > 40);
  assert.equal(result.breakdown.length, 7);
  assert.match(result.breakdown[5], /Zoning:/);
});

test("computeFengShuiScore changes harmony messaging by work style", () => {
  const room = {
    ...BASE_ROOM,
    doors: [{ x_percent: 100, y_percent: 50, wall_index: 1, position_percent: 50 }],
    desks: [
      { type: "desk", x_percent: 25, y_percent: 30, width_percent: 10, height_percent: 6, rotation_deg: 0 },
      { type: "desk", x_percent: 55, y_percent: 30, width_percent: 10, height_percent: 6, rotation_deg: 0 }
    ],
    furniture: [
      { type: "meeting_table", x_percent: 50, y_percent: 55, width_percent: 16, height_percent: 10, rotation_deg: 0 }
    ]
  };

  const focusResult = computeFengShuiScore(room, { workStyle: "focus" });
  const collaborativeResult = computeFengShuiScore(room, { workStyle: "collaborative" });

  assert.match(focusResult.breakdown[4], /Harmony \(focus\)/);
  assert.match(collaborativeResult.breakdown[4], /Harmony \(collaborative\)/);
  assert.notEqual(focusResult.breakdown[4], collaborativeResult.breakdown[4]);
});

test("computeFengShuiScore penalizes disruptive furniture near desks", () => {
  const calmRoom = {
    ...BASE_ROOM,
    desks: [
      { type: "desk", x_percent: 30, y_percent: 40, width_percent: 10, height_percent: 6, rotation_deg: 0 }
    ],
    furniture: [{ type: "plant", x_percent: 40, y_percent: 40, width_percent: 5, height_percent: 6, rotation_deg: 0 }]
  };
  const noisyRoom = {
    ...calmRoom,
    furniture: [{ type: "trashcan", x_percent: 34, y_percent: 40, width_percent: 4, height_percent: 4, rotation_deg: 0 }]
  };

  const calmResult = computeFengShuiScore(calmRoom, { workStyle: "balanced" });
  const noisyResult = computeFengShuiScore(noisyRoom, { workStyle: "balanced" });

  assert.ok(calmResult.score > noisyResult.score);
});

test("computeFengShuiScore includes zone-aware scoring when multiple zones are inferred", () => {
  const room = {
    ...BASE_ROOM,
    desks: [
      { type: "desk", x_percent: 18, y_percent: 24, width_percent: 10, height_percent: 6, rotation_deg: 0 },
      { type: "desk", x_percent: 34, y_percent: 24, width_percent: 10, height_percent: 6, rotation_deg: 0 }
    ],
    furniture: [
      { type: "meeting_table", x_percent: 72, y_percent: 26, width_percent: 16, height_percent: 10, rotation_deg: 0 },
      { type: "armchair", x_percent: 76, y_percent: 74, width_percent: 8, height_percent: 7, rotation_deg: 0 },
      { type: "plant", x_percent: 86, y_percent: 74, width_percent: 5, height_percent: 6, rotation_deg: 0 }
    ]
  };

  const result = computeFengShuiScore(room, {
    workStyle: "balanced",
    zoneAnalysis: inferZones(room)
  });

  assert.match(result.breakdown[5], /focus zone/i);
  assert.ok(result.score > 0);
});
