import test from "node:test";
import assert from "node:assert/strict";
import { addObjectToRoom } from "../../client/src/lib/roomState.js";

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
