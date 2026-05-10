import test from "node:test";
import assert from "node:assert/strict";

import {
  addWallToRoom,
  addRectangleRoomToRoom,
  applyNorthDirection,
  applyScaleReference,
  addObjectToRoom,
  createDoorForRoom,
  createWindowForRoom,
  deleteWallFromRoom,
  flipDoorHingeInRoom,
  normalizeFurnitureItem,
  moveWallByDelta,
  normalizeRoomLayout,
  pointOnWall,
  resizeRoomBounds,
  rotateDoorHalfTurnInRoom,
  updateEdgeItem,
  updatePlacedObject,
  updateWallEndpoint,
  updateEdgeItemPosition,
  updatePlacedObjectPosition
} from "./roomState.js";
import { getScaledItemDimensions } from "./roomGeometry.js";

const BASE_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  estimated_area_m2: 48,
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
  assert.equal(windowItem.width_percent, 14);
});

test("createDoorForRoom attaches a new door to a wall", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const doorItem = createDoorForRoom(room);
  assert.equal(doorItem.wall_index, 0);
  assert.equal(doorItem.y_percent, 0);
  assert.equal(doorItem.position_percent, 18);
  assert.equal(doorItem.opening_anchor, "edge");
  assert.equal(doorItem.hinge_side, "start");
  assert.equal(doorItem.swing_direction, 1);
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
  assert.equal(room.doors[0].opening_anchor, "edge");
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

test("addObjectToRoom does not place a desk directly on an interior wall", () => {
  const room = addObjectToRoom(
    normalizeRoomLayout({
      ...BASE_ROOM,
      walls: [
        ...BASE_ROOM.walls,
        { x1_percent: 50, y1_percent: 16, x2_percent: 50, y2_percent: 84 }
      ]
    }),
    "desk"
  );

  assert.equal(room.desks.length, 1);
  assert.notEqual(room.desks[0].x_percent, 50);
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

test("updatePlacedObject allows rotation controls to nudge items into a valid orientation", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    desks: [
      normalizeFurnitureItem({
        type: "desk",
        x_percent: 8,
        y_percent: 50,
        width_percent: 10,
        height_percent: 6,
        rotation_deg: 0
      })
    ]
  });

  const rotated = updatePlacedObject(room, "desks", 0, { rotation_deg: 45 });
  assert.equal(rotated.desks[0].rotation_deg, 45);
  assert.ok(rotated.desks[0].x_percent >= room.desks[0].x_percent);
});

test("updatePlacedObjectPosition rejects overlapping moves", () => {
  let room = addObjectToRoom(normalizeRoomLayout(BASE_ROOM), "desk");
  room = addObjectToRoom(room, "desk");

  const moved = updatePlacedObjectPosition(room, "desks", 1, {
    x_percent: room.desks[0].x_percent,
    y_percent: room.desks[0].y_percent
  });

  assert.notDeepEqual(moved.desks[1], room.desks[1]);
  assert.notEqual(moved.desks[1].x_percent, room.desks[0].x_percent);
  assert.notEqual(moved.desks[1].y_percent, room.desks[0].y_percent);
});

test("updatePlacedObjectPosition nudges moves away from walls", () => {
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

  const moved = updatePlacedObjectPosition(room, "desks", 0, {
    x_percent: 50,
    y_percent: 50
  });

  assert.notDeepEqual(moved.desks[0], room.desks[0]);
  assert.notEqual(moved.desks[0].x_percent, 50);
});

test("updatePlacedObjectPosition nudges larger furniture to the nearest valid spot", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    furniture: [
      normalizeFurnitureItem({
        type: "couch",
        x_percent: 25,
        y_percent: 25,
        width_percent: 14,
        height_percent: 7
      }),
      normalizeFurnitureItem({
        type: "couch",
        x_percent: 50,
        y_percent: 25,
        width_percent: 14,
        height_percent: 7
      })
    ]
  });

  const moved = updatePlacedObjectPosition(room, "furniture", 1, {
    x_percent: 25,
    y_percent: 25
  });

  assert.notDeepEqual(moved.furniture[1], room.furniture[1]);
  assert.ok(Math.abs(moved.furniture[1].x_percent - 25) <= 16);
  assert.ok(Math.abs(moved.furniture[1].y_percent - 25) <= 16);
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

test("updateEdgeItem preserves door orientation metadata while re-snapping to the wall", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    doors: [createDoorForRoom(BASE_ROOM)]
  });

  const updated = updateEdgeItem(room, "doors", 0, {
    hinge_side: "end",
    swing_direction: -1
  });

  assert.equal(updated.doors[0].opening_anchor, "edge");
  assert.equal(updated.doors[0].hinge_side, "end");
  assert.equal(updated.doors[0].swing_direction, -1);
  assert.equal(updated.doors[0].y_percent, 0);
});

test("flipDoorHingeInRoom moves the hinge to the other end of the same doorway", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    doors: [{
      wall_index: 0,
      position_percent: 20,
      width_percent: 12,
      opening_anchor: "edge",
      hinge_side: "start",
      swing_direction: 1
    }]
  });

  const flipped = flipDoorHingeInRoom(room, 0);
  assert.equal(flipped.doors[0].hinge_side, "end");
  assert.equal(flipped.doors[0].position_percent, 32);
  assert.equal(flipped.doors[0].x_percent, 32);
  assert.equal(flipped.doors[0].y_percent, 0);

  const flippedBack = flipDoorHingeInRoom(flipped, 0);
  assert.equal(flippedBack.doors[0].hinge_side, "start");
  assert.equal(flippedBack.doors[0].position_percent, 20);
  assert.equal(flippedBack.doors[0].x_percent, 20);
  assert.equal(flippedBack.doors[0].y_percent, 0);
});

test("flipDoorHingeInRoom preserves doorway span on shorter wall segments", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      { x1_percent: 10, y1_percent: 10, x2_percent: 90, y2_percent: 10 },
      { x1_percent: 90, y1_percent: 10, x2_percent: 90, y2_percent: 90 },
      { x1_percent: 90, y1_percent: 90, x2_percent: 10, y2_percent: 90 },
      { x1_percent: 10, y1_percent: 90, x2_percent: 10, y2_percent: 10 }
    ],
    doors: [{
      wall_index: 0,
      position_percent: 30,
      width_percent: 8,
      opening_anchor: "edge",
      hinge_side: "start",
      swing_direction: 1
    }]
  });

  const flipped = flipDoorHingeInRoom(room, 0);
  assert.equal(flipped.doors[0].hinge_side, "end");
  assert.equal(flipped.doors[0].position_percent, 40);
  assert.equal(flipped.doors[0].x_percent, 42);

  const flippedBack = flipDoorHingeInRoom(flipped, 0);
  assert.equal(flippedBack.doors[0].hinge_side, "start");
  assert.equal(flippedBack.doors[0].position_percent, 30);
  assert.equal(flippedBack.doors[0].x_percent, 34);
});

test("rotateDoorHalfTurnInRoom rotates the rendered door symbol without mirroring its parts", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    doors: [{
      wall_index: 0,
      position_percent: 20,
      width_percent: 12,
      opening_anchor: "edge",
      hinge_side: "start",
      swing_direction: 1
    }]
  });

  const rotated = rotateDoorHalfTurnInRoom(room, 0);
  assert.equal(rotated.doors[0].hinge_side, "start");
  assert.equal(rotated.doors[0].swing_direction, 1);
  assert.equal(rotated.doors[0].symbol_rotation_deg, 180);
  assert.equal(rotated.doors[0].position_percent, 20);
  assert.equal(rotated.doors[0].x_percent, 20);
  assert.equal(rotated.doors[0].y_percent, 0);

  const rotatedBack = rotateDoorHalfTurnInRoom(rotated, 0);
  assert.equal(rotatedBack.doors[0].hinge_side, "start");
  assert.equal(rotatedBack.doors[0].swing_direction, 1);
  assert.equal(rotatedBack.doors[0].symbol_rotation_deg, 0);
  assert.equal(rotatedBack.doors[0].position_percent, 20);
  assert.equal(rotatedBack.doors[0].x_percent, 20);
  assert.equal(rotatedBack.doors[0].y_percent, 0);
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

test("moveWallByDelta stretches a room wall while keeping corners connected", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const moved = moveWallByDelta(room, 1, {
    x_percent: -12,
    y_percent: 0
  });

  assert.equal(moved.wallIssues.length, 0);
  assert.equal(moved.walls[0].x2_percent, moved.walls[1].x1_percent);
  assert.equal(moved.walls[2].x1_percent, moved.walls[1].x2_percent);
  assert.ok(moved.walls[1].x1_percent < 100);
  assert.equal(moved.walls[1].x1_percent, moved.walls[1].x2_percent);
});

test("addWallToRoom creates a connected wall by splitting the touched outer wall", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const updated = addWallToRoom(
    room,
    { x_percent: 50, y_percent: 0 },
    { x_percent: 50, y_percent: 100 }
  );

  assert.equal(updated.wallIssues.length, 0);
  assert.ok(updated.walls.length >= 5);
  assert.ok(
    updated.walls.some(
      (wall) =>
        wall.x1_percent === 50 &&
        wall.x2_percent === 50 &&
        wall.y1_percent === 0 &&
        wall.y2_percent === 100
    )
  );
  assert.ok(
    updated.walls.some(
      (wall) =>
        wall.y1_percent === 0 &&
        wall.y2_percent === 0 &&
        (wall.x1_percent === 0 || wall.x2_percent === 0) &&
        (wall.x1_percent === 50 || wall.x2_percent === 50)
    )
  );
});

test("addWallToRoom preserves a free interior wall when no structural snap is possible", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const updated = addWallToRoom(
    room,
    { x_percent: 24, y_percent: 24 },
    { x_percent: 76, y_percent: 24 }
  );

  assert.ok(
    updated.walls.some(
      (wall) =>
        wall.y1_percent === 24 &&
        wall.y2_percent === 24 &&
        ((wall.x1_percent === 24 && wall.x2_percent === 76) || (wall.x1_percent === 76 && wall.x2_percent === 24))
    )
  );
});

test("deleteWallFromRoom removes an interior partition when the layout stays connected", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      ...BASE_ROOM.walls,
      { x1_percent: 50, y1_percent: 0, x2_percent: 50, y2_percent: 100 }
    ]
  });

  const updated = deleteWallFromRoom(room, 4);

  assert.equal(updated.wallIssues.length, 0);
  assert.equal(updated.walls.length, 4);
  assert.ok(!updated.walls.some((wall) => wall.x1_percent === 50 && wall.x2_percent === 50));
});

test("deleteWallFromRoom merges split collinear walls after removing a partition", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 50, y2_percent: 0 },
      { x1_percent: 50, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
      { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 },
      { x1_percent: 50, y1_percent: 0, x2_percent: 50, y2_percent: 100 }
    ]
  });

  const updated = deleteWallFromRoom(room, 5);

  assert.equal(updated.wallIssues.length, 0);
  assert.ok(
    updated.walls.some(
      (wall) =>
        wall.y1_percent === 0 &&
        wall.y2_percent === 0 &&
        ((wall.x1_percent === 0 && wall.x2_percent === 100) || (wall.x1_percent === 100 && wall.x2_percent === 0))
    )
  );
});

test("deleteWallFromRoom can remove a connected boundary wall without deleting neighbours", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const updated = deleteWallFromRoom(room, 1);

  assert.equal(updated.walls.length, room.walls.length - 1);
  assert.ok(updated.wallIssues.length >= 1);
});

test("addRectangleRoomToRoom adds a four-wall room shell", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const updated = addRectangleRoomToRoom(
    room,
    { x_percent: 20, y_percent: 20 },
    { x_percent: 44, y_percent: 46 }
  );

  assert.ok(updated.walls.length >= 8);
  assert.ok(updated.walls.some((wall) => Math.abs(wall.y1_percent - 20) <= 0.1 && Math.abs(wall.y2_percent - 20) <= 0.1));
  assert.ok(updated.walls.some((wall) => Math.abs(wall.x1_percent - 44) <= 0.1 && Math.abs(wall.x2_percent - 44) <= 0.1));
  assert.ok(updated.walls.some((wall) => Math.abs(wall.y1_percent - 46) <= 0.1 && Math.abs(wall.y2_percent - 46) <= 0.1));
  assert.ok(updated.walls.some((wall) => Math.abs(wall.x1_percent - 20) <= 0.1 && Math.abs(wall.x2_percent - 20) <= 0.1));
});

test("resizeRoomBounds resizes the room shell while keeping object sizes intact", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    furniture: [
      normalizeFurnitureItem({
        type: "couch",
        x_percent: 50,
        y_percent: 50,
        width_percent: 14,
        height_percent: 7
      })
    ]
  });

  const resized = resizeRoomBounds(room, "e", { x_percent: 80, y_percent: 50 });

  assert.ok(resized.walls[1].x1_percent < 100);
  assert.ok(resized.walls[1].x2_percent < 100);
  assert.equal(resized.furniture[0].width_percent, room.furniture[0].width_percent);
  assert.equal(resized.furniture[0].height_percent, room.furniture[0].height_percent);
});

test("applyScaleReference recalculates room dimensions from a measured line", () => {
  const room = normalizeRoomLayout(BASE_ROOM);
  const updated = applyScaleReference(
    room,
    { x_percent: 0, y_percent: 0 },
    { x_percent: 50, y_percent: 0 },
    4
  );

  assert.equal(updated.estimated_width_m, 8);
  assert.equal(updated.estimated_height_m, 8);
  assert.equal(updated.estimated_area_m2, 64);
  assert.deepEqual(updated.scale_reference, {
    start: { x: 0, y: 0 },
    end: { x: 50, y: 0 },
    distance_m: 4
  });
});

test("applyScaleReference calculates polygon area for irregular rooms", () => {
  const room = normalizeRoomLayout({
    ...BASE_ROOM,
    walls: [
      { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
      { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 40 },
      { x1_percent: 100, y1_percent: 40, x2_percent: 40, y2_percent: 40 },
      { x1_percent: 40, y1_percent: 40, x2_percent: 40, y2_percent: 100 },
      { x1_percent: 40, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
      { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
    ]
  });
  const updated = applyScaleReference(
    room,
    { x_percent: 0, y_percent: 0 },
    { x_percent: 50, y_percent: 0 },
    4
  );

  assert.equal(updated.estimated_width_m, 8);
  assert.equal(updated.estimated_height_m, 8);
  assert.equal(updated.estimated_area_m2, 40.96);
});

test("applyNorthDirection normalizes and stores the room compass direction", () => {
  const updated = applyNorthDirection(BASE_ROOM, 450);
  assert.equal(updated.north_direction_deg, 90);
});
