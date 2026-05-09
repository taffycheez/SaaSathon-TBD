import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeEdgeItems,
  fallbackRoom,
  mergeRoomAnalyses,
  normalizeAnalysisResult,
  normalizeEdgeItems,
  pointOnWall
} from "./analyseRoomHelpers.js";

const WALLS = [
  { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
  { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
  { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
  { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
];

test("normalizeEdgeItems projects point-like openings onto the nearest wall", () => {
  const [windowItem] = normalizeEdgeItems([{ x_percent: 98, y_percent: 42 }], WALLS);

  assert.equal(windowItem.wall_index, 1);
  assert.equal(windowItem.position_percent, 42);
});

test("dedupeEdgeItems removes clustered openings on the same wall", () => {
  assert.deepEqual(
    dedupeEdgeItems([
      { wall_index: 0, position_percent: 20 },
      { wall_index: 0, position_percent: 24 },
      { wall_index: 1, position_percent: 24 }
    ]),
    [
      { wall_index: 0, position_percent: 20 },
      { wall_index: 1, position_percent: 24 }
    ]
  );
});

test("normalizeAnalysisResult preserves opening metadata from vision analysis", () => {
  const result = normalizeAnalysisResult({
    is_valid_room: true,
    walls: WALLS,
    windows: [
      { wall_index: 1, position_percent: 40, width_percent: 14 }
    ],
    doors: [
      {
        wall_index: 2,
        position_percent: 35,
        width_percent: 9,
        opening_anchor: "edge",
        hinge_side: "end",
        swing_direction: -1
      }
    ]
  });

  assert.deepEqual(result.room.windows, [{ wall_index: 1, position_percent: 40, width_percent: 14 }]);
  assert.deepEqual(result.room.doors, [
    {
      wall_index: 2,
      position_percent: 35,
      width_percent: 9,
      opening_anchor: "edge",
      hinge_side: "end",
      swing_direction: -1
    }
  ]);
});

test("normalizeAnalysisResult rejects invalid images without inventing openings", () => {
  const result = normalizeAnalysisResult({
    is_valid_room: false,
    rejection_reason: "Not a floor plan."
  });

  assert.equal(result.is_valid_room, false);
  assert.equal(result.room.windows.length, 0);
  assert.equal(result.room.doors.length, 0);
  assert.deepEqual(fallbackRoom.windows, []);
  assert.deepEqual(fallbackRoom.doors, []);
});

test("mergeRoomAnalyses keeps primary walls and secondary openings", () => {
  const merged = mergeRoomAnalyses(
    {
      is_valid_room: true,
      room: {
        estimated_width_m: 10,
        estimated_height_m: 7,
        walls: WALLS,
        windows: [],
        doors: [],
        furniture: []
      }
    },
    {
      is_valid_room: true,
      room: {
        walls: WALLS,
        windows: [{ x_percent: 100, y_percent: 50 }],
        doors: [{ wall_index: 0, position_percent: 18 }],
        furniture: []
      }
    }
  );

  assert.equal(merged.room.walls.length, 4);
  assert.deepEqual(merged.room.windows, [{ wall_index: 1, position_percent: 50 }]);
  assert.deepEqual(merged.room.doors, [{ wall_index: 0, position_percent: 18 }]);
});

test("pointOnWall supports legacy wall labels", () => {
  assert.deepEqual(pointOnWall({ wall: "bottom", position_percent: 30 }, WALLS), {
    x: 70,
    y: 100
  });
});

test("mergeRoomAnalyses keeps primary walls when they already form a usable wall map", () => {
  const primary = {
    is_valid_room: true,
    room: {
      estimated_width_m: 8,
      estimated_height_m: 6,
      walls: WALLS,
      windows: [],
      doors: [],
      furniture: []
    }
  };
  const secondary = {
    is_valid_room: true,
    room: {
      estimated_width_m: 8,
      estimated_height_m: 6,
      walls: [
        { x1_percent: 12, y1_percent: 12, x2_percent: 88, y2_percent: 12 },
        { x1_percent: 88, y1_percent: 12, x2_percent: 88, y2_percent: 88 }
      ],
      windows: [],
      doors: [],
      furniture: []
    }
  };

  const merged = mergeRoomAnalyses(primary, secondary);

  assert.equal(merged.room.walls.length, 4);
  assert.deepEqual(merged.room.walls, primary.room.walls);
});

test("mergeRoomAnalyses combines secondary fixtures and openings with primary CV geometry", () => {
  const primary = {
    is_valid_room: true,
    room: {
      estimated_width_m: 8,
      estimated_height_m: 6,
      walls: WALLS,
      windows: [],
      doors: [],
      furniture: [
        {
          type: "desk",
          x_percent: 30,
          y_percent: 35,
          width_percent: 12,
          height_percent: 7,
          rotation_deg: 0
        }
      ]
    }
  };
  const secondary = {
    is_valid_room: true,
    room: {
      estimated_width_m: 8,
      estimated_height_m: 6,
      walls: WALLS,
      windows: [
        { wall_index: 1, position_percent: 40 }
      ],
      doors: [
        { wall_index: 2, position_percent: 25 }
      ],
      furniture: [
        {
          type: "sink",
          x_percent: 72,
          y_percent: 76,
          width_percent: 8,
          height_percent: 8,
          rotation_deg: 90
        },
        {
          type: "desk",
          x_percent: 31,
          y_percent: 35,
          width_percent: 12,
          height_percent: 7,
          rotation_deg: 0
        }
      ]
    }
  };

  const merged = mergeRoomAnalyses(primary, secondary);

  assert.equal(merged.room.windows.length, 1);
  assert.equal(merged.room.doors.length, 1);
  assert.equal(merged.room.furniture.length, 2);
  assert.ok(merged.room.furniture.some((item) => item.type === "desk"));
  assert.ok(merged.room.furniture.some((item) => item.type === "sink"));
});
