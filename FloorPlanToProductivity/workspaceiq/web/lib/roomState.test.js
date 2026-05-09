import test from "node:test";
import assert from "node:assert/strict";

import {
  addObjectToRoom,
  createDoorForRoom,
  createWindowForRoom,
  normalizeRoomLayout,
  pointOnWall,
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

test("normalizeRoomLayout snaps wall angles to multiples of 45 degrees while keeping joints connected", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 28, y2_percent: 18 },
      { x1_percent: 28, y1_percent: 18, x2_percent: 58, y2_percent: 18 }
    ]
  });

  const firstWall = room.walls[0];
  const secondWall = room.walls[1];
  const firstAngle = Math.round((Math.atan2(firstWall.y2_percent - firstWall.y1_percent, firstWall.x2_percent - firstWall.x1_percent) * 180) / Math.PI);
  const secondAngle = Math.round((Math.atan2(secondWall.y2_percent - secondWall.y1_percent, secondWall.x2_percent - secondWall.x1_percent) * 180) / Math.PI);

  assert.equal(firstAngle % 45, 0);
  assert.equal(secondAngle % 45, 0);
  assert.equal(firstWall.x2_percent, secondWall.x1_percent);
  assert.equal(firstWall.y2_percent, secondWall.y1_percent);
});

test("createWindowForRoom attaches a new window to a wall", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const windowItem = createWindowForRoom(room);
  assert.equal(windowItem.wall_index, 0);
  assert.equal(windowItem.y_percent, 0);
  assert.equal(windowItem.position_percent, 28);
});

test("createDoorForRoom attaches a new door to a wall", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const doorItem = createDoorForRoom(room);
  assert.equal(doorItem.wall_index, 0);
  assert.equal(doorItem.y_percent, 0);
  assert.equal(doorItem.position_percent, 18);
  assert.deepEqual(pointOnWall(doorItem, room.walls), { x: 18, y: 0 });
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
