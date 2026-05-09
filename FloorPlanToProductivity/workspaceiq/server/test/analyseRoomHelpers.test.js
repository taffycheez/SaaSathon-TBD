import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoomNotes,
  fallbackRoom,
  mergeRoomAnalyses,
  normalizeEdgeItems,
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
    furniture: [{
      type: "l desk",
      shape_kind: "polygon",
      x_percent: "44",
      y_percent: "oops",
      width_percent: 1,
      height_percent: 300,
      footprint_points: [
        { x_percent: -70, y_percent: -50 },
        { x_percent: 20, y_percent: -50 },
        { x_percent: 20, y_percent: -10 },
        { x_percent: 70, y_percent: -10 },
        { x_percent: 70, y_percent: 70 }
      ]
    }]
  });

  assert.equal(room.estimated_width_m, 1);
  assert.equal(room.estimated_height_m, 9);
  assert.deepEqual(room.walls, [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 }
  ]);
  assert.deepEqual(room.windows, [{ wall_index: 2, position_percent: 100 }]);
  assert.deepEqual(room.doors, [{ wall_index: 1, position_percent: 100 }]);
  assert.deepEqual(room.furniture, [{
    type: "l_shaped_desk",
    shape_kind: "polygon",
    x_percent: 44,
    y_percent: 0,
    width_percent: 2,
    height_percent: 100,
    rotation_deg: 0,
    footprint_points: [
      { x_percent: -50, y_percent: -50 },
      { x_percent: 20, y_percent: -50 },
      { x_percent: 20, y_percent: -10 },
      { x_percent: 50, y_percent: -10 },
      { x_percent: 50, y_percent: 50 }
    ]
  }]);
});

test("fallback room produces useful fallback notes", () => {
  const notes = buildRoomNotes(fallbackRoom, true);
  assert.equal(notes.length >= 2, true);
  assert.match(notes[0], /starter room/i);
  assert.deepEqual(fallbackRoom.windows, []);
  assert.deepEqual(fallbackRoom.doors, []);
});

test("normalizeRoomDescription drops generic equipment objects from office plans", () => {
  const room = normalizeRoomDescription({
    furniture: [
      { type: "copier", x_percent: 40, y_percent: 40 },
      { type: "plant", x_percent: 66, y_percent: 42 }
    ]
  });

  assert.deepEqual(room.furniture.map((item) => item.type), ["plant"]);
});

test("normalizeAnalysisResult preserves explicit room rejection", () => {
  const result = normalizeAnalysisResult({
    is_valid_room: false,
    rejection_reason: "The image shows a piece of fruit, not a room."
  });

  assert.equal(result.is_valid_room, false);
  assert.match(result.rejection_reason, /fruit/i);
});

test("normalizeAnalysisResult accepts wall evidence from borderline floor plans", () => {
  const result = normalizeAnalysisResult({
    is_valid_room: false,
    rejection_reason: "The image is sparse.",
    walls: [
      { x1_percent: 8, y1_percent: 12, x2_percent: 92, y2_percent: 12 },
      { x1_percent: 92, y1_percent: 12, x2_percent: 92, y2_percent: 88 }
    ]
  });

  assert.equal(result.is_valid_room, true);
  assert.equal(result.rejection_reason, "");
  assert.equal(result.room.walls.length, 2);
});

test("normalizeEdgeItems projects point-like openings to the nearest wall and dedupes them", () => {
  const walls = [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ];

  const openings = normalizeEdgeItems([
    { x_percent: 4, y_percent: 48 },
    { x_percent: 2, y_percent: 50 },
    { wall_index: 1, position_percent: 32 }
  ], walls);

  assert.deepEqual(openings, [
    { wall_index: 1, position_percent: 32 },
    { wall_index: 3, position_percent: 50 }
  ]);
});

test("mergeRoomAnalyses keeps primary walls and merges secondary openings onto them", () => {
  const primary = normalizeAnalysisResult({
    walls: [
      { x1_percent: 10, y1_percent: 10, x2_percent: 90, y2_percent: 10 },
      { x1_percent: 90, y1_percent: 10, x2_percent: 90, y2_percent: 90 },
      { x1_percent: 90, y1_percent: 90, x2_percent: 10, y2_percent: 90 },
      { x1_percent: 10, y1_percent: 90, x2_percent: 10, y2_percent: 10 }
    ],
    doors: [{ wall_index: 3, position_percent: 50 }]
  });
  const secondary = normalizeAnalysisResult({
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
    ],
    windows: [{ wall_index: 0, position_percent: 55 }]
  });

  const merged = mergeRoomAnalyses(primary, secondary);
  const mergedDoorWall = merged.room.walls[merged.room.doors[0].wall_index];

  assert.equal(merged.room.walls.length >= 4, true);
  assert.equal(merged.room.walls.some((wall) => wall.x1_percent === 10 && wall.y1_percent === 10), true);
  assert.equal(merged.room.doors[0].position_percent, 50);
  assert.deepEqual(mergedDoorWall, { x1_percent: 10, y1_percent: 90, x2_percent: 10, y2_percent: 10 });
  assert.deepEqual(merged.room.windows, [{ wall_index: 0, position_percent: 55 }]);
});
