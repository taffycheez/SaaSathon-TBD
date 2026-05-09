import test from "node:test";
import assert from "node:assert/strict";
import {
  addObjectToRoom,
  addOpeningToRoom,
  deriveOpeningRenderData,
  nearestWallIndex,
  pointOnWall,
  positionPercentOnWall,
  snapOpeningToWall
} from "../../client/src/lib/roomState.js";

const rectangularWalls = [
  { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
  { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
  { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
  { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
];

test("addObjectToRoom adds desks to the desk collection", () => {
  const room = { desks: [], furniture: [] };
  const next = addObjectToRoom(room, "desk");

  assert.equal(next.desks.length, 1);
  assert.equal(next.furniture.length, 0);
  assert.equal(next.desks[0].type, "desk");
  assert.equal(next.desks[0].x_percent, 28);
});

test("addObjectToRoom adds non-desk objects to furniture", () => {
  const room = { desks: [], furniture: [] };
  const next = addObjectToRoom(room, "plant");

  assert.equal(next.desks.length, 0);
  assert.equal(next.furniture.length, 1);
  assert.equal(next.furniture[0].type, "plant");
});

test("addOpeningToRoom adds wall-attached windows and doors with stable defaults", () => {
  const room = {
    walls: rectangularWalls,
    windows: [],
    doors: []
  };

  const withWindow = addOpeningToRoom(room, "window");
  const withDoor = addOpeningToRoom(withWindow, "door");
  const withSecondWindow = addOpeningToRoom(withDoor, "window");

  assert.equal(Boolean(withWindow.windows[0].id), true);
  assert.deepEqual(withWindow.windows[0], {
    id: withWindow.windows[0].id,
    wall_index: 0,
    position_percent: 28,
    x_percent: 28,
    y_percent: 0,
    rotation_deg: 0
  });
  assert.deepEqual(withDoor.doors[0], {
    id: withDoor.doors[0].id,
    wall_index: 0,
    position_percent: 18,
    x_percent: 18,
    y_percent: 0,
    rotation_deg: 0
  });
  assert.equal(withSecondWindow.windows[1].wall_index, 1);
  assert.equal(withSecondWindow.windows[1].position_percent, 72);
});

test("geometry helpers snap point openings to the nearest wall", () => {
  const point = { x: 96, y: 42 };

  assert.equal(nearestWallIndex(point, rectangularWalls), 1);
  assert.equal(positionPercentOnWall(point, rectangularWalls[1]), 42);

  const snapped = snapOpeningToWall({ x_percent: 96, y_percent: 42 }, rectangularWalls, "window");

  assert.equal(snapped.wall_index, 1);
  assert.equal(snapped.position_percent, 42);
  assert.deepEqual(pointOnWall(snapped, rectangularWalls), { x: 100, y: 42 });
  assert.deepEqual(deriveOpeningRenderData(snapped, rectangularWalls), {
    x_percent: 100,
    y_percent: 42,
    rotation_deg: 90
  });
});
