import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomNotes,
  fallbackRoom,
  normalizeAnalysisResult,
  normalizeRoomDescription
} from "../lib/analyseRoomHelpers.js";

test("normalizeRoomDescription clamps bad values into a safe room shape", () => {
  const room = normalizeRoomDescription({
    estimated_width_m: -4,
    estimated_height_m: "9",
    walls: [
      { x1_percent: -10, y1_percent: 0, x2_percent: 110, y2_percent: 0 },
      { x1_percent: 110, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 }
    ],
    windows: [{ wall_index: 10, position_percent: 130 }],
    doors: [{ wall: "left", position_percent: -20 }],
    furniture: [{ type: 99, x_percent: "44", y_percent: "oops", width_percent: 1, height_percent: 300 }]
  });

  assert.equal(room.estimated_width_m, 1);
  assert.equal(room.estimated_height_m, 9);
  assert.deepEqual(room.walls, [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 }
  ]);
  assert.deepEqual(room.windows, [{ wall_index: 2, position_percent: 100 }]);
  assert.deepEqual(room.doors, [{ wall_index: 2, position_percent: 0 }]);
  assert.deepEqual(room.furniture, [{
    type: "desk",
    x_percent: 44,
    y_percent: 0,
    width_percent: 2,
    height_percent: 100,
    rotation_deg: 0
  }]);
});

test("fallback room produces useful fallback notes", () => {
  const notes = buildRoomNotes(fallbackRoom, true);
  assert.equal(notes.length >= 2, true);
  assert.match(notes[0], /starter room/i);
});

test("normalizeAnalysisResult preserves explicit room rejection", () => {
  const result = normalizeAnalysisResult({
    is_valid_room: false,
    rejection_reason: "The image shows a piece of fruit, not a room."
  });

  assert.equal(result.is_valid_room, false);
  assert.match(result.rejection_reason, /fruit/i);
});
