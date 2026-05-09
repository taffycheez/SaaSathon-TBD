import test from "node:test";
import assert from "node:assert/strict";

import {
  addObjectToRoom,
  createWindowForRoom,
  normalizeRoomLayout,
  updateEdgeItemPosition,
  updatePlacedObjectPosition
} from "./roomState.js";

const BASE_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 98, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 2 }
  ],
  windows: [],
  doors: [],
  furniture: [],
  desks: []
};

test("normalizeRoomLayout snaps nearly connected wall endpoints together", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  assert.equal(room.wallIssues.length, 0);
  assert.equal(room.walls[0].x2_percent, 100);
  assert.equal(room.walls[3].y2_percent, 0);
});

test("createWindowForRoom attaches a new window to a wall", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const windowItem = createWindowForRoom(room);
  assert.equal(windowItem.wall_index, 0);
  assert.equal(windowItem.y_percent, 0);
  assert.equal(windowItem.position_percent, 50);
});

test("addObjectToRoom chooses a non-overlapping catalog placement", () => {
  const firstRoom = addObjectToRoom(normalizeRoomLayout(BASE_ROOM), "desk");
  const secondRoom = addObjectToRoom(firstRoom, "desk");

  assert.equal(secondRoom.desks.length, 2);
  assert.notDeepEqual(
    {
      x_percent: secondRoom.desks[0].x_percent,
      y_percent: secondRoom.desks[0].y_percent
    },
    {
      x_percent: secondRoom.desks[1].x_percent,
      y_percent: secondRoom.desks[1].y_percent
    }
  );
});

test("updatePlacedObjectPosition rejects overlapping moves", () => {
  let room = addObjectToRoom(normalizeRoomLayout(BASE_ROOM), "desk");
  room = addObjectToRoom(room, "desk");

  const originalSecondDesk = room.desks[1];
  const moved = updatePlacedObjectPosition(room, "desks", 1, {
    x_percent: room.desks[0].x_percent,
    y_percent: room.desks[0].y_percent
  });

  assert.deepEqual(moved.desks[1], originalSecondDesk);
});

test("updateEdgeItemPosition keeps windows snapped to the nearest wall", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    windows: [createWindowForRoom(BASE_ROOM)]
  });

  const moved = updateEdgeItemPosition(room, "windows", 0, {
    x_percent: 98,
    y_percent: 52
  });

  assert.equal(moved.windows[0].wall_index, 1);
  assert.equal(moved.windows[0].x_percent, 100);
});
