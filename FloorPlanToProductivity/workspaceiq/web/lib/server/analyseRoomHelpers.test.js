import test from "node:test";
import assert from "node:assert/strict";

import { mergeRoomAnalyses } from "./analyseRoomHelpers.js";

test("mergeRoomAnalyses keeps primary walls when they already form a usable wall map", () => {
  const primary = {
    is_valid_room: true,
    room: {
      estimated_width_m: 8,
      estimated_height_m: 6,
      walls: [
        { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
        { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
        { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
        { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
      ],
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
      walls: [
        { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
        { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
        { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
        { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
      ],
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
      walls: [
        { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
        { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
        { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
        { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
      ],
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
