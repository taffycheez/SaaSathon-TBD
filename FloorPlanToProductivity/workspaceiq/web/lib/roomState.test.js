import test from "node:test";
import assert from "node:assert/strict";

import {
  addObjectToRoom,
  createDoorForRoom,
  createWindowForRoom,
  normalizeFurnitureItem,
  normalizeRoomLayout,
  pointOnWall,
  updatePlacedObject,
  updateWallEndpoint,
  updateEdgeItemPosition,
  updatePlacedObjectPosition
} from "./roomState.js";
import { getScaledItemDimensions } from "./roomGeometry.js";

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

test("normalizeRoomLayout keeps legacy opening metadata anchored to the intended wall", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    doors: [
      {
        wall_index: 1,
        position_percent: 40
      }
    ]
  });

  assert.equal(room.doors[0].wall_index, 1);
  assert.equal(room.doors[0].x_percent, 100);
  assert.equal(room.doors[0].y_percent, 40);
});

test("addObjectToRoom chooses a non-overlapping catalog placement", () => {
  const firstRoom = addObjectToRoom(normalizeRoomLayout(BASE_ROOM), "desk");
  const secondRoom = addObjectToRoom(firstRoom, "desk");

  assert.equal(secondRoom.desks.length, 2);
  assert.equal(secondRoom.desks[0].scale, 1);
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

test("normalizeFurnitureItem preserves individual scale factors", () => {
  const item = normalizeFurnitureItem({
    type: "desk",
    width_percent: 10,
    height_percent: 6,
    scale: 1.5
  });

  assert.equal(item.scale, 1.5);
  assert.deepEqual(getScaledItemDimensions(item), {
    width_percent: 15,
    height_percent: 9
  });
});

test("updatePlacedObject validates scaled furniture footprints", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    desks: [
      normalizeFurnitureItem({
        type: "desk",
        x_percent: 50,
        y_percent: 50,
        width_percent: 60,
        height_percent: 20
      })
    ]
  });

  const rejected = updatePlacedObject(room, "desks", 0, { scale: 2 });
  assert.equal(rejected.desks[0].scale, 1);
});

test("updatePlacedObject nudges wall-touching furniture while scaling", () => {
  const firstDesk = normalizeFurnitureItem({
    type: "desk",
    x_percent: 30,
    y_percent: 3,
    width_percent: 10,
    height_percent: 6
  });
  const secondDesk = normalizeFurnitureItem({
    type: "desk",
    x_percent: 43,
    y_percent: 20,
    width_percent: 10,
    height_percent: 6
  });
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    desks: [firstDesk, secondDesk]
  });

  const updated = updatePlacedObject(room, "desks", 0, { scale: 1.5 });
  assert.equal(updated.desks[0].scale, 1.5);
  assert.ok(updated.desks[0].y_percent > firstDesk.y_percent);
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

test("updatePlacedObjectPosition rejects moves that place a desk on a wall", () => {
  const room = addObjectToRoom(
    normalizeRoomLayout({
      ...BASE_ROOM,
      walls: [
        ...BASE_ROOM.walls,
        { x1_percent: 50, y1_percent: 0, x2_percent: 50, y2_percent: 100 }
      ]
    }),
    "desk"
  );

  const originalDesk = room.desks[0];
  const moved = updatePlacedObjectPosition(room, "desks", 0, {
    x_percent: 50,
    y_percent: 50
  });

  assert.deepEqual(moved.desks[0], originalDesk);
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

test("updateWallEndpoint moves connected wall endpoints together", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 50, y2_percent: 0 },
      { x1_percent: 50, y1_percent: 0, x2_percent: 50, y2_percent: 50 }
    ]
  });

  const updated = updateWallEndpoint(room, 0, "end", {
    x_percent: 60,
    y_percent: 10
  });

  assert.equal(updated.walls[0].x2_percent, updated.walls[1].x1_percent);
  assert.equal(updated.walls[0].y2_percent, updated.walls[1].y1_percent);
});
