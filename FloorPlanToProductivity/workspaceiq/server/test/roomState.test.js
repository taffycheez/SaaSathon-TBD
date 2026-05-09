import test from "node:test";
import assert from "node:assert/strict";
import { addObjectToRoom, addOpeningToRoom } from "../../client/src/lib/roomState.js";

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

test("addOpeningToRoom adds windows and doors as point openings", () => {
  const room = {
    walls: rectangularWalls,
    windows: [],
    doors: []
  };

  const withWindow = addOpeningToRoom(room, "window");
  const withDoor = addOpeningToRoom(withWindow, "door");

  assert.deepEqual(withWindow.windows[0], { x_percent: 30, y_percent: 0, rotation_deg: 0 });
  assert.deepEqual(withDoor.doors[0], { x_percent: 20, y_percent: 0, rotation_deg: 0 });
});
