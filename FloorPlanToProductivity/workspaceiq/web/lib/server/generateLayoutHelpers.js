function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return clamp(numeric, 0, 100);
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function normalizeVector(vector) {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (!magnitude) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude
  };
}

function facingVector(rotationDeg) {
  const radians = (normalizeRotation(rotationDeg) * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians)
  };
}

function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) {
    return start;
  }

  const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio
  };
}

function roomCenter(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: Number(wall?.x1_percent) || 0, y: Number(wall?.y1_percent) || 0 },
        { x: Number(wall?.x2_percent) || 0, y: Number(wall?.y2_percent) || 0 }
      ])
    : [];

  if (!points.length) {
    return { x: 50, y: 50 };
  }

  return {
    x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
    y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2
  };
}

function pointFromEdgeItem(item, walls) {
  if (item?.x_percent != null && item?.y_percent != null) {
    return {
      x: clampPercent(item.x_percent),
      y: clampPercent(item.y_percent)
    };
  }

  const wallIndex = Math.max(0, Math.min((walls?.length || 1) - 1, Number(item?.wall_index) || 0));
  const wall = walls?.[wallIndex];
  if (!wall) {
    return { x: 50, y: 50 };
  }

  const ratio = clampPercent(item?.position_percent ?? 50) / 100;
  return {
    x: clampPercent((Number(wall.x1_percent) || 0) + ((Number(wall.x2_percent) || 0) - (Number(wall.x1_percent) || 0)) * ratio),
    y: clampPercent((Number(wall.y1_percent) || 0) + ((Number(wall.y2_percent) || 0) - (Number(wall.y1_percent) || 0)) * ratio)
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

function doorPathSeverity(point, doorPoints, center) {
  if (!doorPoints.length) {
    return 0;
  }

  return doorPoints.reduce((worst, doorPoint) => {
    const flowAxis = normalizeVector({
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
    return Math.max(
      worst,
      clamp((16 - lateralDistance) / 16, 0, 1) * clamp((52 - forwardDistance) / 40, 0, 1)
    );
  }, 0);
}

function wallSupportScore(point, rotationDeg, walls) {
  if (!Array.isArray(walls) || !walls.length) {
    return 0.55;
  }

  const back = {
    x: -facingVector(rotationDeg).x,
    y: -facingVector(rotationDeg).y
  };

  return walls.reduce((best, wall) => {
    const nearest = nearestPointOnSegment(
      point,
      { x: Number(wall.x1_percent) || 0, y: Number(wall.y1_percent) || 0 },
      { x: Number(wall.x2_percent) || 0, y: Number(wall.y2_percent) || 0 }
    );
    const toWall = {
      x: nearest.x - point.x,
      y: nearest.y - point.y
    };
    const alignment = dot(normalizeVector(toWall), back);
    if (alignment <= 0.15) {
      return best;
    }

    return Math.max(best, clamp((alignment - 0.15) / 0.85, 0, 1) * bandScore(distance(point, nearest), 8, 24, 0, 34));
  }, 0);
}

function commandScore(point, rotationDeg, doorPoints, center) {
  if (!doorPoints.length) {
    return 0.65;
  }

  const forward = facingVector(rotationDeg);
  const visibility = doorPoints.reduce((best, doorPoint) => {
    const alignment = dot(normalizeVector({ x: doorPoint.x - point.x, y: doorPoint.y - point.y }), forward);
    return Math.max(best, clamp((alignment + 0.25) / 1.25, 0, 1));
  }, 0);

  return clamp(visibility * 0.45 + (1 - doorPathSeverity(point, doorPoints, center)) * 0.55, 0, 1);
}

function daylightScore(point, windowPoints) {
  if (!windowPoints.length) {
    return 0.65;
  }

  return windowPoints.reduce((best, windowPoint) => Math.max(best, bandScore(distance(point, windowPoint), 10, 28, 0, 42)), 0);
}

function obstacleClearanceScore(point, furniture) {
  const obstacles = Array.isArray(furniture)
    ? furniture
        .filter((item) => item?.type !== "plant")
        .map((item) => ({ x: clampPercent(item?.x_percent), y: clampPercent(item?.y_percent) }))
    : [];

  if (!obstacles.length) {
    return 0.9;
  }

  const nearest = Math.min(...obstacles.map((obstacle) => distance(point, obstacle)));
  return clamp((nearest - 8) / 16, 0, 1);
}

function nearestSharedAnchor(room) {
  const anchors = ["meeting_table", "table", "whiteboard", "couch"];
  const matches = Array.isArray(room?.furniture)
    ? room.furniture.filter((item) => anchors.includes(item?.type)).map((item) => ({ x: clampPercent(item.x_percent), y: clampPercent(item.y_percent) }))
    : [];
  return matches[0] || null;
}

function chooseRotation(point, room) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const doors = Array.isArray(room?.doors) ? room.doors.map((door) => pointFromEdgeItem(door, walls)) : [];
  const center = roomCenter(walls);
  const rotations = [0, 90, 180, 270];

  return rotations
    .map((rotation) => ({
      rotation,
      score: wallSupportScore(point, rotation, walls) * 0.58 + commandScore(point, rotation, doors, center) * 0.42
    }))
    .sort((a, b) => b.score - a.score)[0].rotation;
}

function candidateBaseScore(point, room, workStyle) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const center = roomCenter(walls);
  const doorPoints = Array.isArray(room?.doors) ? room.doors.map((door) => pointFromEdgeItem(door, walls)) : [];
  const windowPoints = Array.isArray(room?.windows) ? room.windows.map((windowItem) => pointFromEdgeItem(windowItem, walls)) : [];
  const rotation = chooseRotation(point, room);
  const sharedAnchor = nearestSharedAnchor(room);
  const support = wallSupportScore(point, rotation, walls);
  const command = commandScore(point, rotation, doorPoints, center);
  const flow = 1 - doorPathSeverity(point, doorPoints, center);
  const light = daylightScore(point, windowPoints);
  const clearance = obstacleClearanceScore(point, room?.furniture);
  const anchorScore = sharedAnchor ? bandScore(distance(point, sharedAnchor), 16, 34, 8, 50) : 0.62;
  const focusBias = workStyle === "focus" ? support * 0.14 + flow * 0.1 : 0;
  const collaborativeBias = workStyle === "collaborative" ? anchorScore * 0.18 : anchorScore * 0.08;

  return {
    ...point,
    rotation_deg: rotation,
    score: support * 0.28 + command * 0.2 + flow * 0.24 + light * 0.12 + clearance * 0.12 + focusBias + collaborativeBias
  };
}

function spacingScore(point, selected, workStyle) {
  if (!selected.length) {
    return 0.8;
  }

  const distances = selected.map((desk) => distance(point, desk));
  const nearest = Math.min(...distances);
  if (nearest < 10) {
    return -1;
  }

  const ideal = workStyle === "collaborative" ? bandScore(nearest, 13, 22, 8, 34) : bandScore(nearest, 16, 28, 10, 40);
  return ideal;
}

function buildCandidatePoints() {
  const points = [];
  for (let y = 14; y <= 86; y += 6) {
    for (let x = 14; x <= 86; x += 6) {
      points.push({ x, y });
    }
  }
  return points;
}

function optimizeDesks(room, numPeople, workStyle, seedDesks = []) {
  const deskCount = Math.max(1, Number(numPeople) || seedDesks.length || 1);
  const seeded = normalizeDeskArray(seedDesks).filter((desk) => desk.x_percent > 0 || desk.y_percent > 0);
  const candidates = [
    ...seeded.map((desk) => ({ x: desk.x_percent, y: desk.y_percent })),
    ...buildCandidatePoints()
  ]
    .map((point) => candidateBaseScore(point, room || {}, workStyle))
    .sort((a, b) => b.score - a.score);
  const selected = [];

  while (selected.length < deskCount && candidates.length) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    candidates.forEach((candidate, index) => {
      const spacing = spacingScore(candidate, selected, workStyle);
      const score = spacing < 0 ? Number.NEGATIVE_INFINITY : candidate.score + spacing * 0.34;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    const [best] = candidates.splice(bestIndex, 1);
    if (!best || bestScore === Number.NEGATIVE_INFINITY) {
      break;
    }
    selected.push(best);
  }

  return selected.slice(0, deskCount).map((desk) => ({
    x_percent: clampPercent(desk.x),
    y_percent: clampPercent(desk.y),
    rotation_deg: normalizeRotation(desk.rotation_deg)
  }));
}

export function normalizeDeskArray(payload) {
  const desks = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.desks)
      ? payload.desks
      : [];

  return desks.map((item) => ({
    x_percent: clampPercent(item?.x_percent),
    y_percent: clampPercent(item?.y_percent),
    rotation_deg: normalizeRotation(item?.rotation_deg)
  }));
}

export function optimizeLayout(room, desks, numPeople, workStyle = "balanced") {
  return optimizeDesks(room, numPeople, workStyle, desks);
}

export function buildFallbackLayout(room, numPeople, workStyle) {
  return optimizeDesks(room, numPeople, workStyle);
}

export function buildLayoutNotes(desks, isFallback) {
  const notes = [];
  notes.push(
    isFallback
      ? "WorkspaceIQ created an optimized fallback desk plan using the analysed walls, openings, circulation, and furniture."
      : `Generated and optimized ${desks.length} desk position(s) from the analysed room and preferences.`
  );
  notes.push("The generated desks are scored for clearer door-to-center flow, stronger wall support, balanced spacing, daylight, and work-style fit.");
  notes.push("You can still drag desks, rotate them, and adjust doors or windows before reviewing the score.");
  return notes;
}
