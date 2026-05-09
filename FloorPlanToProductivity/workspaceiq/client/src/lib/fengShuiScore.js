import { pointOnWall } from "./roomState.js";

const DISRUPTIVE_TYPES = ["office_equipment", "trashcan", "toilet", "sink", "shower"];
const COLLABORATION_ANCHORS = ["meeting_table", "table", "armchair", "whiteboard"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values, fallback = 0) {
  if (!Array.isArray(values) || values.length === 0) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function normalize(vector) {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (!magnitude) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude
  };
}

function bandScore(value, idealMin, idealMax, minValue, maxValue) {
  if (!Number.isFinite(value) || value <= minValue || value >= maxValue) {
    return 0;
  }

  if (value < idealMin) {
    return clamp((value - minValue) / Math.max(1, idealMin - minValue), 0, 1);
  }

  if (value > idealMax) {
    return clamp((maxValue - value) / Math.max(1, maxValue - idealMax), 0, 1);
  }

  return 1;
}

function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return start;
  }

  const ratio = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    0,
    1
  );

  return {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio
  };
}

function roomBounds(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: Number(wall?.x1_percent) || 0, y: Number(wall?.y1_percent) || 0 },
        { x: Number(wall?.x2_percent) || 0, y: Number(wall?.y2_percent) || 0 }
      ])
    : [];

  if (!points.length) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function roomCenter(walls) {
  const bounds = roomBounds(walls);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function deskPoint(desk) {
  return {
    x: Number(desk?.x_percent) || 0,
    y: Number(desk?.y_percent) || 0
  };
}

function facingVector(rotationDeg) {
  const radians = ((((Number(rotationDeg) || 0) % 360) + 360) % 360) * Math.PI / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function nearestDistance(point, targets) {
  if (!targets.length) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(...targets.map((target) => distance(point, target)));
}

function nearestDeskDistances(desks) {
  if (!desks.length) {
    return [];
  }

  if (desks.length === 1) {
    return [24];
  }

  return desks.map((desk, index) => {
    const point = deskPoint(desk);
    let best = Number.POSITIVE_INFINITY;

    desks.forEach((otherDesk, otherIndex) => {
      if (index === otherIndex) {
        return;
      }

      best = Math.min(best, distance(point, deskPoint(otherDesk)));
    });

    return best;
  });
}

function wallSupportQuality(desk, walls) {
  if (!walls.length) {
    return 0.55;
  }

  const back = {
    x: -facingVector(desk.rotation_deg).x,
    y: -facingVector(desk.rotation_deg).y
  };
  const point = deskPoint(desk);

  return walls.reduce((best, wall) => {
    const nearest = nearestPointOnSegment(
      point,
      { x: wall.x1_percent, y: wall.y1_percent },
      { x: wall.x2_percent, y: wall.y2_percent }
    );
    const toWall = {
      x: nearest.x - point.x,
      y: nearest.y - point.y
    };
    const alignment = dot(normalize(toWall), back);
    if (alignment <= 0.15) {
      return best;
    }

    const candidate =
      clamp((alignment - 0.15) / 0.85, 0, 1) *
      bandScore(distance(point, nearest), 8, 24, 0, 34);

    return Math.max(best, candidate);
  }, 0);
}

function frontWallPenalty(desk, walls) {
  if (!walls.length) {
    return 0;
  }

  const forward = facingVector(desk.rotation_deg);
  const point = deskPoint(desk);

  return walls.reduce((worst, wall) => {
    const nearest = nearestPointOnSegment(
      point,
      { x: wall.x1_percent, y: wall.y1_percent },
      { x: wall.x2_percent, y: wall.y2_percent }
    );
    const toWall = {
      x: nearest.x - point.x,
      y: nearest.y - point.y
    };
    const alignment = dot(normalize(toWall), forward);
    if (alignment <= 0.2) {
      return worst;
    }

    const candidate =
      clamp((alignment - 0.2) / 0.8, 0, 1) *
      clamp((24 - distance(point, nearest)) / 16, 0, 1);

    return Math.max(worst, candidate);
  }, 0);
}

function doorPathSeverity(point, doorPoints, center) {
  if (!doorPoints.length) {
    return 0;
  }

  return doorPoints.reduce((worst, doorPoint) => {
    const flowAxis = normalize({
      x: center.x - doorPoint.x,
      y: center.y - doorPoint.y
    });
    const fromDoor = {
      x: point.x - doorPoint.x,
      y: point.y - doorPoint.y
    };
    const forwardDistance = dot(fromDoor, flowAxis);
    if (forwardDistance <= 0) {
      return worst;
    }

    const lateralDistance = Math.abs(fromDoor.x * flowAxis.y - fromDoor.y * flowAxis.x);
    const candidate =
      clamp((16 - lateralDistance) / 16, 0, 1) *
      clamp((52 - forwardDistance) / 40, 0, 1);

    return Math.max(worst, candidate);
  }, 0);
}

function commandPositionQuality(desk, doorPoints, walls, center) {
  const point = deskPoint(desk);
  const forward = facingVector(desk.rotation_deg);
  const doorVisibility = doorPoints.length
    ? doorPoints.reduce((best, doorPoint) => {
        const viewAlignment = dot(normalize({
          x: doorPoint.x - point.x,
          y: doorPoint.y - point.y
        }), forward);

        return Math.max(best, clamp((viewAlignment + 0.25) / 1.25, 0, 1));
      }, 0)
    : 0.65;
  const pathPenalty = doorPathSeverity(point, doorPoints, center);
  const wallPenalty = frontWallPenalty(desk, walls);

  return clamp(
    doorVisibility * 0.4 +
      (1 - pathPenalty) * 0.35 +
      (1 - wallPenalty) * 0.25,
    0,
    1
  );
}

function doorwayClearanceQuality(desks, doorPoints, center) {
  if (!doorPoints.length) {
    return 0.8;
  }

  const deskPoints = desks.map(deskPoint);
  const clearance = average(
    doorPoints.map((doorPoint) =>
      clamp((Math.min(...deskPoints.map((point) => distance(point, doorPoint))) - 12) / 14, 0, 1)
    ),
    0.75
  );
  const pathPenalty = desks.length
    ? Math.max(...deskPoints.map((point) => doorPathSeverity(point, doorPoints, center)))
    : 0;

  return clamp(clearance * 0.65 + (1 - pathPenalty) * 0.35, 0, 1);
}

function daylightQuality(desk, windowPoints) {
  if (!windowPoints.length) {
    return 0.65;
  }

  const point = deskPoint(desk);
  return windowPoints.reduce((best, windowPoint) => {
    const candidate = bandScore(distance(point, windowPoint), 10, 28, 0, 42);
    return Math.max(best, candidate);
  }, 0);
}

function spacingQuality(distances) {
  if (!distances.length) {
    return 1;
  }

  return average(
    distances.map((distanceValue) => clamp((Math.min(distanceValue, 28) - 10) / 18, 0, 1)),
    1
  );
}

function areaPerDeskQuality(room, desks) {
  if (!desks.length) {
    return 1;
  }

  const roomArea =
    (Number(room?.estimated_width_m) || 0) * (Number(room?.estimated_height_m) || 0);

  return clamp((roomArea / desks.length - 3.5) / 3.5, 0, 1);
}

function nearestFurnitureDistance(point, furniture, types) {
  const matches = furniture
    .filter((item) => types.includes(item.type))
    .map(deskPoint);

  return nearestDistance(point, matches);
}

function focusHarmony(desks, doorPoints, furniture) {
  const doorBuffers = desks.map((desk) => {
    const point = deskPoint(desk);
    const nearestDoor = nearestDistance(point, doorPoints);
    return Number.isFinite(nearestDoor) ? clamp((nearestDoor - 18) / 22, 0, 1) : 0.85;
  });
  const noiseBuffers = desks.map((desk) => {
    const point = deskPoint(desk);
    const nearestNoise = nearestFurnitureDistance(point, furniture, DISRUPTIVE_TYPES);
    return Number.isFinite(nearestNoise) ? clamp((nearestNoise - 12) / 18, 0, 1) : 0.85;
  });
  const quietSeats = desks.filter(
    (_, index) => doorBuffers[index] >= 0.6 && noiseBuffers[index] >= 0.6
  ).length;

  return {
    quality: clamp(
      average(doorBuffers, 0.85) * 0.45 +
        average(noiseBuffers, 0.85) * 0.35 +
        spacingQuality(nearestDeskDistances(desks)) * 0.2,
      0,
      1
    ),
    quietSeats
  };
}

function collaborativeHarmony(desks, furniture, doorPoints, center) {
  const meetingAnchors = furniture.filter((item) => COLLABORATION_ANCHORS.includes(item.type));
  const distances = nearestDeskDistances(desks);
  const groupedSeats = distances.filter((distanceValue) => bandScore(distanceValue, 12, 22, 6, 34) >= 0.6).length;
  const anchorQuality = furniture.some((item) => item.type === "meeting_table")
    ? 1
    : meetingAnchors.length
      ? 0.8
      : 0.55;

  return {
    quality: clamp(
      average(distances.map((distanceValue) => bandScore(distanceValue, 12, 22, 6, 34)), 0.6) * 0.5 +
        anchorQuality * 0.3 +
        doorwayClearanceQuality(desks, doorPoints, center) * 0.2,
      0,
      1
    ),
    groupedSeats,
    hasAnchor: meetingAnchors.length > 0
  };
}

function natureAndClutter(desks, furniture) {
  const plants = furniture.filter((item) => item.type === "plant").map(deskPoint);
  const disruptiveItems = furniture
    .filter((item) => DISRUPTIVE_TYPES.includes(item.type))
    .map(deskPoint);

  const plantQualities = desks.map((desk) => {
    const nearestPlant = nearestDistance(deskPoint(desk), plants);
    return Number.isFinite(nearestPlant) ? bandScore(nearestPlant, 8, 22, 0, 32) : 0.55;
  });
  const clutterQualities = desks.map((desk) => {
    const nearestDisruption = nearestDistance(deskPoint(desk), disruptiveItems);
    return Number.isFinite(nearestDisruption) ? clamp((nearestDisruption - 10) / 18, 0, 1) : 0.85;
  });

  return {
    quality: clamp(
      average(plantQualities, 0.55) * 0.4 +
        average(clutterQualities, 0.85) * 0.6,
      0,
      1
    ),
    plantSupportedSeats: plantQualities.filter((value) => value >= 0.6).length,
    clutterRiskSeats: clutterQualities.filter((value) => value < 0.5).length
  };
}

function workStyleHarmony(workStyle, desks, doorPoints, furniture, center) {
  const focus = focusHarmony(desks, doorPoints, furniture);
  const collaborative = collaborativeHarmony(desks, furniture, doorPoints, center);

  if (workStyle === "focus") {
    return {
      quality: focus.quality,
      summary: `${focus.quietSeats}/${desks.length} desk(s) sit in calmer focus zones away from the entry and noisy objects`
    };
  }

  if (workStyle === "collaborative") {
    return {
      quality: collaborative.quality,
      summary: `${collaborative.groupedSeats}/${desks.length} desk(s) are grouped for teamwork${collaborative.hasAnchor ? " around a shared anchor" : ""}`
    };
  }

  return {
    quality: clamp((focus.quality + collaborative.quality) / 2, 0, 1),
    summary: `${focus.quietSeats}/${desks.length} quieter desk(s) are balanced with ${collaborative.groupedSeats}/${desks.length} collaboration-ready seat(s)`
  };
}

function buildAdvice({
  workStyle,
  doorPoints,
  windowPoints,
  commandQuality,
  supportQuality,
  flowQuality,
  lightQuality,
  harmonyQuality,
  natureQuality
}) {
  const suggestions = [];

  if (!doorPoints.length) {
    suggestions.push({
      priority: 1,
      text: "Add the main door to the plan so command position and circulation can be judged accurately."
    });
  }

  if (!windowPoints.length) {
    suggestions.push({
      priority: 0.96,
      text: "Add the room's windows on the correct wall so daylight scoring reflects the real space."
    });
  }

  if (commandQuality < 0.68) {
    suggestions.push({
      priority: 0.9 - commandQuality,
      text: "Rotate desks so people can see the door diagonally instead of facing a wall or sitting directly in the entry line."
    });
  }

  if (supportQuality < 0.6) {
    suggestions.push({
      priority: 0.82 - supportQuality,
      text: "Move desks a little closer to a solid wall or divider behind them so each seat has more support."
    });
  }

  if (flowQuality < 0.65) {
    suggestions.push({
      priority: 0.88 - flowQuality,
      text: "Clear the path from the door to the center of the room by pulling desks out of the entry lane and leaving more space between seats."
    });
  }

  if (windowPoints.length && lightQuality < 0.6) {
    suggestions.push({
      priority: 0.78 - lightQuality,
      text: "Shift one or two desks closer to windows, but keep them slightly off the glass for softer side light."
    });
  }

  if (harmonyQuality < 0.63) {
    const harmonyText = workStyle === "focus"
      ? "For focus work, keep the quiet side of the room away from the doorway and shared clutter."
      : workStyle === "collaborative"
        ? "For collaboration, cluster desks around a meeting table or whiteboard so the team shares a clear focal point."
        : "Balance one quieter edge for heads-down work with one shared zone around a table or whiteboard.";

    suggestions.push({
      priority: 0.8 - harmonyQuality,
      text: harmonyText
    });
  }

  if (natureQuality < 0.65) {
    suggestions.push({
      priority: 0.76 - natureQuality,
      text: "Add a plant near the work zone and keep trashcans or bulky equipment farther from the closest desks."
    });
  }

  const deduped = [];
  const seen = new Set();
  suggestions
    .sort((a, b) => b.priority - a.priority)
    .forEach((item) => {
      if (!seen.has(item.text)) {
        deduped.push(item.text);
        seen.add(item.text);
      }
    });

  return deduped.length
    ? deduped.slice(0, 3)
    : [
        "This layout is already strong. Keep the entry path open and make small light or plant adjustments for the last few points."
      ];
}

export function computeFengShuiScore(room, preferences = {}) {
  const desks = Array.isArray(room?.desks) ? room.desks : [];
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const windows = Array.isArray(room?.windows) ? room.windows : [];
  const doors = Array.isArray(room?.doors) ? room.doors : [];
  const furniture = Array.isArray(room?.furniture) ? room.furniture : [];
  const workStyle = preferences.workStyle || "balanced";

  if (!desks.length) {
    return {
      score: 0,
      breakdown: [
        "Add at least one desk to score Feng Shui command position, support, flow, and balance."
      ],
      advice: [
        "Add a desk to start scoring the workspace, then place windows and the main door so the advice can be more specific."
      ]
    };
  }

  const center = roomCenter(walls);
  const doorPoints = doors.map((door) => pointOnWall(door, walls));
  const windowPoints = windows.map((windowItem) => pointOnWall(windowItem, walls));
  const nearestDistances = nearestDeskDistances(desks);
  const averageSpacing = average(nearestDistances, 24);

  const commandQualities = desks.map((desk) =>
    commandPositionQuality(desk, doorPoints, walls, center)
  );
  const supportQualities = desks.map((desk) => wallSupportQuality(desk, walls));
  const daylightQualities = desks.map((desk) => daylightQuality(desk, windowPoints));
  const commandQuality = average(commandQualities, 0.65);
  const supportQuality = average(supportQualities, 0.55);
  const lightQuality = average(daylightQualities, 0.65);
  const flowQuality = clamp(
    spacingQuality(nearestDistances) * 0.4 +
      doorwayClearanceQuality(desks, doorPoints, center) * 0.4 +
      areaPerDeskQuality(room, desks) * 0.2,
    0,
    1
  );
  const harmony = workStyleHarmony(
    workStyle,
    desks,
    doorPoints,
    furniture,
    center
  );
  const nature = natureAndClutter(desks, furniture);

  const commandPoints = Math.round(commandQuality * 30);
  const supportPoints = Math.round(supportQuality * 20);
  const flowPoints = Math.round(flowQuality * 15);
  const lightPoints = Math.round(lightQuality * 10);
  const harmonyPoints = Math.round(harmony.quality * 15);
  const naturePoints = Math.round(nature.quality * 10);
  const score = clamp(
    commandPoints +
      supportPoints +
      flowPoints +
      lightPoints +
      harmonyPoints +
      naturePoints,
    0,
    100
  );

  const flowLabel = flowQuality >= 0.75
    ? "entry flow stays open"
    : flowQuality >= 0.5
      ? "circulation works but could open up more"
      : "entry flow feels cramped";

  return {
    score,
    breakdown: [
      `Command position: ${commandQualities.filter((value) => value >= 0.68).length}/${desks.length} desk(s) can see the entry without sitting in its direct line: +${commandPoints}`,
      `Support: ${supportQualities.filter((value) => value >= 0.6).length}/${desks.length} desk(s) have a solid wall or edge behind them: +${supportPoints}`,
      `Flow: ${flowLabel}; average desk spacing is ${averageSpacing.toFixed(1)} grid units: +${flowPoints}`,
      `Light: ${daylightQualities.filter((value) => value >= 0.6).length}/${desks.length} desk(s) get balanced daylight: +${lightPoints}`,
      `Harmony (${workStyle}): ${harmony.summary}: +${harmonyPoints}`,
      `Nature + clutter: ${nature.plantSupportedSeats}/${desks.length} desk(s) sit near plants; ${nature.clutterRiskSeats} sit too close to trashcans or other disruptive items: +${naturePoints}`
    ],
    advice: buildAdvice({
      workStyle,
      doorPoints,
      windowPoints,
      commandQuality,
      supportQuality,
      flowQuality,
      lightQuality,
      harmonyQuality: harmony.quality,
      natureQuality: nature.quality
    })
  };
}
