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
    windows: [{ wall: "ceiling", position_percent: 130 }],
    doors: [{ wall: "left", position_percent: -20 }],
    furniture: [{ type: 99, x_percent: "44", y_percent: "oops" }]
  });

  assert.equal(room.estimated_width_m, 1);
  assert.equal(room.estimated_height_m, 9);
  assert.deepEqual(room.windows, [{ wall: "top", position_percent: 100 }]);
  assert.deepEqual(room.doors, [{ wall: "left", position_percent: 0 }]);
  assert.deepEqual(room.furniture, [{ type: "furniture", x_percent: 44, y_percent: 0 }]);
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
