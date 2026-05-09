import test from "node:test";
import assert from "node:assert/strict";
import { computeFengShuiScore } from "../../client/src/lib/fengShuiScore.js";

const baseRoom = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [
    { wall_index: 0, position_percent: 72 },
    { wall_index: 1, position_percent: 35 }
  ],
  doors: [{ wall_index: 3, position_percent: 50 }],
  furniture: [],
  desks: []
};

test("Feng Shui score rewards command position, support, and plants", () => {
  const result = computeFengShuiScore({
    ...baseRoom,
    furniture: [{ type: "plant", x_percent: 66, y_percent: 50 }],
    desks: [
      { type: "desk", x_percent: 78, y_percent: 28, width_percent: 10, height_percent: 6, rotation_deg: 180 },
      { type: "desk", x_percent: 78, y_percent: 72, width_percent: 10, height_percent: 6, rotation_deg: 180 }
    ]
  }, { workStyle: "balanced" });

  assert.equal(result.score >= 75, true);
  assert.match(result.breakdown[0], /command position/i);
  assert.match(result.breakdown[1], /support/i);
  assert.equal(result.advice.length >= 1, true);
});

test("Feng Shui score drops when desks crowd the doorway and trashcan", () => {
  const goodLayout = computeFengShuiScore({
    ...baseRoom,
    furniture: [{ type: "plant", x_percent: 66, y_percent: 50 }],
    desks: [
      { type: "desk", x_percent: 78, y_percent: 28, width_percent: 10, height_percent: 6, rotation_deg: 180 },
      { type: "desk", x_percent: 78, y_percent: 72, width_percent: 10, height_percent: 6, rotation_deg: 180 }
    ]
  }, { workStyle: "balanced" });

  const poorLayout = computeFengShuiScore({
    ...baseRoom,
    furniture: [{ type: "trashcan", x_percent: 42, y_percent: 60 }],
    desks: [
      { type: "desk", x_percent: 30, y_percent: 50, width_percent: 10, height_percent: 6, rotation_deg: 0 },
      { type: "desk", x_percent: 42, y_percent: 50, width_percent: 10, height_percent: 6, rotation_deg: 0 }
    ]
  }, { workStyle: "balanced" });

  assert.equal(goodLayout.score > poorLayout.score, true);
  assert.equal(goodLayout.score - poorLayout.score >= 20, true);
  assert.match(poorLayout.advice.join(" "), /trashcans|entry lane|door/i);
});

test("work style changes the harmony score", () => {
  const sharedRoom = {
    ...baseRoom,
    furniture: [{ type: "meeting_table", x_percent: 50, y_percent: 50 }],
    desks: [
      { type: "desk", x_percent: 42, y_percent: 42, width_percent: 10, height_percent: 6, rotation_deg: 180 },
      { type: "desk", x_percent: 58, y_percent: 42, width_percent: 10, height_percent: 6, rotation_deg: 180 },
      { type: "desk", x_percent: 42, y_percent: 58, width_percent: 10, height_percent: 6, rotation_deg: 180 },
      { type: "desk", x_percent: 58, y_percent: 58, width_percent: 10, height_percent: 6, rotation_deg: 180 }
    ]
  };

  const collaborative = computeFengShuiScore(sharedRoom, { workStyle: "collaborative" });
  const focus = computeFengShuiScore(sharedRoom, { workStyle: "focus" });

  assert.equal(collaborative.score > focus.score, true);
  assert.match(collaborative.breakdown[4], /collaborative/i);
  assert.match(focus.breakdown[4], /focus/i);
});

test("advice suggests adding missing openings when the plan is incomplete", () => {
  const result = computeFengShuiScore({
    ...baseRoom,
    windows: [],
    doors: [],
    desks: [
      { type: "desk", x_percent: 20, y_percent: 18, width_percent: 10, height_percent: 6, rotation_deg: 0 }
    ]
  }, { workStyle: "focus" });

  assert.match(result.advice.join(" "), /door/i);
  assert.match(result.advice.join(" "), /windows/i);
});
