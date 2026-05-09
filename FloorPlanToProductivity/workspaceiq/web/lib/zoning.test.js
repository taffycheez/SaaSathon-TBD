import test from "node:test";
import assert from "node:assert/strict";

import { inferZones, summarizeZoneImpact } from "./zoning.js";

const OPEN_PLAN_ROOM = {
  estimated_width_m: 12,
  estimated_height_m: 8,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [],
  doors: [],
  desks: [
    { type: "desk", x_percent: 18, y_percent: 24, width_percent: 10, height_percent: 6, rotation_deg: 0 },
    { type: "desk", x_percent: 34, y_percent: 26, width_percent: 10, height_percent: 6, rotation_deg: 0 }
  ],
  furniture: [
    { type: "meeting_table", x_percent: 74, y_percent: 28, width_percent: 16, height_percent: 10, rotation_deg: 0 },
    { type: "chair", x_percent: 70, y_percent: 18, width_percent: 6, height_percent: 6, rotation_deg: 0 },
    { type: "armchair", x_percent: 72, y_percent: 72, width_percent: 8, height_percent: 7, rotation_deg: 0 },
    { type: "plant", x_percent: 82, y_percent: 74, width_percent: 5, height_percent: 6, rotation_deg: 0 }
  ],
  zoneOverrides: {}
};

test("inferZones creates multiple zone types inside an open plan room", () => {
  const analysis = inferZones(OPEN_PLAN_ROOM);

  assert.ok(analysis.zones.some((zone) => zone.type === "focus"));
  assert.ok(analysis.zones.some((zone) => zone.type === "collaboration"));
  assert.ok(analysis.zones.some((zone) => zone.type === "rest" || zone.type === "social"));
});

test("inferZones keeps zones separated across partitioned spaces", () => {
  const room = {
    ...OPEN_PLAN_ROOM,
    walls: [
      ...OPEN_PLAN_ROOM.walls,
      { x1_percent: 50, y1_percent: 0, x2_percent: 50, y2_percent: 100 }
    ],
    furniture: [
      { type: "meeting_table", x_percent: 76, y_percent: 28, width_percent: 16, height_percent: 10, rotation_deg: 0 }
    ]
  };

  const analysis = inferZones(room);
  const focusZone = analysis.zones.find((zone) => zone.type === "focus");
  const collaborationZone = analysis.zones.find((zone) => zone.type === "collaboration");

  assert.ok(focusZone);
  assert.ok(collaborationZone);
  assert.notEqual(focusZone.spaceId, collaborationZone.spaceId);
});

test("summarizeZoneImpact penalizes noisy adjacency around focus zones", () => {
  const quietAnalysis = inferZones(OPEN_PLAN_ROOM);
  const noisyAnalysis = {
    ...quietAnalysis,
    zones: quietAnalysis.zones.map((zone) => (
      zone.type === "collaboration"
        ? { ...zone, center: { ...zone.center, x: 42, y: 30 } }
        : zone
    ))
  };

  const quietScore = summarizeZoneImpact(quietAnalysis, { workStyle: "focus" });
  const noisyScore = summarizeZoneImpact(noisyAnalysis, { workStyle: "focus" });

  assert.ok(quietScore.quality > noisyScore.quality);
});
