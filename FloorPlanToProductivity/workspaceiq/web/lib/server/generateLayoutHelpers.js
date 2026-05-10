import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "../objectCatalog.js";
import { computeFengShuiScore } from "../fengShuiScore.js";
import { inferZones } from "../zoning.js";
import { isPlacementValid, normalizeObjectScale } from "../roomGeometry.js";

const FIXED_FURNITURE_TYPES = new Set(["toilet", "sink", "shower", "kitchenette", "fridge"]);
const UTILITY_TYPES = new Set(["trashcan", "filing_cabinet", "office_equipment"]);
const COLLABORATION_TYPES = new Set(["meeting_table", "table", "whiteboard", "chair"]);
const SOCIAL_TYPES = new Set(["couch", "armchair"]);

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

function normalizeShapeKind(value, fallback) {
  return value === "ellipse" || value === "polygon" || value === "rect" ? value : fallback;
}

function normalizeFootprintPoints(points, fallbackPoints) {
  const source = Array.isArray(points) && points.length >= 3 ? points : fallbackPoints;
  return Array.isArray(source)
    ? source.map((point) => ({
        x_percent: clamp(Number(point?.x_percent) || 0, -50, 50),
        y_percent: clamp(Number(point?.y_percent) || 0, -50, 50)
      }))
    : [];
}

function normalizePlacedObject(item, fallbackType = "desk") {
  const type = canonicalizeObjectType(item?.type || fallbackType);
  const definition = getObjectDefinition(type);

  return {
    type,
    shape_kind: normalizeShapeKind(item?.shape_kind, definition.shape_kind),
    x_percent: clampPercent(item?.x_percent),
    y_percent: clampPercent(item?.y_percent),
    width_percent: Math.max(2, clampPercent(item?.width_percent ?? definition.width_percent)),
    height_percent: Math.max(2, clampPercent(item?.height_percent ?? definition.height_percent)),
    scale: normalizeObjectScale(item?.scale),
    rotation_deg: normalizeRotation(item?.rotation_deg),
    footprint_points: normalizeFootprintPoints(item?.footprint_points, definition.footprint_points)
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

function nearestDeskDistance(point, desks) {
  if (!Array.isArray(desks) || !desks.length) {
    return 30;
  }

  return Math.min(...desks.map((desk) => distance(point, { x: desk.x_percent, y: desk.y_percent })));
}

function deskCentroid(desks) {
  if (!Array.isArray(desks) || !desks.length) {
    return { x: 50, y: 50 };
  }

  return {
    x: desks.reduce((sum, desk) => sum + clampPercent(desk.x_percent), 0) / desks.length,
    y: desks.reduce((sum, desk) => sum + clampPercent(desk.y_percent), 0) / desks.length
  };
}

function edgeAffinity(point, walls) {
  if (!Array.isArray(walls) || !walls.length) {
    return 0.5;
  }

  const nearest = Math.min(...walls.map((wall) => {
    const nearestPoint = nearestPointOnSegment(
      point,
      { x: Number(wall.x1_percent) || 0, y: Number(wall.y1_percent) || 0 },
      { x: Number(wall.x2_percent) || 0, y: Number(wall.y2_percent) || 0 }
    );
    return distance(point, nearestPoint);
  }));

  return bandScore(nearest, 4, 12, 0, 28);
}

function nearestMatchingSeed(item, seedFurniture, usedSeedIndexes) {
  if (!Array.isArray(seedFurniture)) {
    return null;
  }

  let best = null;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  seedFurniture.forEach((candidate, index) => {
    if (usedSeedIndexes.has(index) || candidate.type !== item.type) {
      return;
    }

    const candidateDistance = distance(
      { x: item.x_percent, y: item.y_percent },
      { x: candidate.x_percent, y: candidate.y_percent }
    );
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestIndex = index;
      bestDistance = candidateDistance;
    }
  });

  if (bestIndex >= 0) {
    usedSeedIndexes.add(bestIndex);
  }

  return best;
}

function buildFurnitureCandidatePoints(item, seed, room, desks, workStyle) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const center = roomCenter(walls);
  const deskAnchor = deskCentroid(desks);
  const points = [
    { x: item.x_percent, y: item.y_percent },
    seed ? { x: seed.x_percent, y: seed.y_percent } : null
  ].filter(Boolean);

  if (item.type === "plant") {
    desks.slice(0, 6).forEach((desk, index) => {
      const angle = (index * Math.PI * 2) / Math.max(1, Math.min(6, desks.length));
      points.push({
        x: clampPercent(desk.x_percent + Math.cos(angle) * 12),
        y: clampPercent(desk.y_percent + Math.sin(angle) * 12)
      });
    });
  } else if (UTILITY_TYPES.has(item.type) || FIXED_FURNITURE_TYPES.has(item.type)) {
    points.push(
      { x: 12, y: 12 },
      { x: 88, y: 12 },
      { x: 88, y: 88 },
      { x: 12, y: 88 }
    );
  } else if (SOCIAL_TYPES.has(item.type)) {
    const socialY = workStyle === "focus" ? 82 : 74;
    points.push(
      { x: 22, y: socialY },
      { x: 78, y: socialY },
      { x: center.x + 22, y: center.y + 20 },
      { x: center.x - 22, y: center.y + 20 }
    );
  } else if (COLLABORATION_TYPES.has(item.type)) {
    points.push(
      { x: deskAnchor.x, y: clampPercent(deskAnchor.y - 18) },
      { x: clampPercent(deskAnchor.x + 18), y: deskAnchor.y },
      { x: clampPercent(deskAnchor.x - 18), y: deskAnchor.y },
      { x: center.x, y: center.y }
    );
  }

  for (let y = 14; y <= 86; y += 12) {
    for (let x = 14; x <= 86; x += 12) {
      points.push({ x, y });
    }
  }

  return points.map((point) => ({
    x_percent: clampPercent(point.x),
    y_percent: clampPercent(point.y)
  }));
}

function scoreFurnitureCandidate(item, candidate, room, desks, workStyle, seed) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const center = roomCenter(walls);
  const doorPoints = Array.isArray(room?.doors) ? room.doors.map((door) => pointFromEdgeItem(door, walls)) : [];
  const point = { x: candidate.x_percent, y: candidate.y_percent };
  const deskAnchor = deskCentroid(desks);
  const deskDistance = nearestDeskDistance(point, desks);
  const flow = 1 - doorPathSeverity(point, doorPoints, center);
  const edge = edgeAffinity(point, walls);
  const seedScore = seed ? bandScore(distance(point, { x: seed.x_percent, y: seed.y_percent }), 0, 10, 0, 34) * 0.08 : 0;

  if (item.type === "plant") {
    return bandScore(deskDistance, 8, 18, 2, 34) * 0.62 + flow * 0.22 + edge * 0.08 + seedScore;
  }

  if (UTILITY_TYPES.has(item.type)) {
    return clamp((deskDistance - 16) / 28, 0, 1) * 0.54 + edge * 0.26 + flow * 0.12 + seedScore;
  }

  if (SOCIAL_TYPES.has(item.type)) {
    const socialDistance = bandScore(deskDistance, workStyle === "focus" ? 26 : 18, 38, 10, 58);
    return socialDistance * 0.42 + edge * 0.22 + flow * 0.18 + seedScore;
  }

  if (COLLABORATION_TYPES.has(item.type)) {
    const anchorDistance = distance(point, deskAnchor);
    const collaborationDistance = workStyle === "collaborative"
      ? bandScore(anchorDistance, 14, 28, 6, 46)
      : bandScore(anchorDistance, 18, 38, 8, 58);
    return collaborationDistance * 0.48 + flow * 0.2 + edge * (item.type === "whiteboard" ? 0.22 : 0.08) + seedScore;
  }

  return clamp((deskDistance - 10) / 24, 0, 1) * 0.36 + flow * 0.24 + edge * 0.18 + seedScore;
}

function scoreRoom(room, workStyle) {
  const zoneAnalysis = inferZones(room);
  return computeFengShuiScore(room, {
    workStyle,
    zoneAnalysis
  }).score;
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

export function normalizeFurnitureArray(payload) {
  const furniture = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.furniture)
      ? payload.furniture
      : [];

  return furniture
    .map((item) => normalizePlacedObject(item, item?.type || "chair"))
    .filter((item) => !isDeskType(item.type));
}

export function normalizeLayoutPayload(payload) {
  return {
    desks: normalizeDeskArray(payload),
    furniture: normalizeFurnitureArray(payload)
  };
}

export function optimizeLayout(room, desks, numPeople, workStyle = "balanced") {
  return optimizeDesks(room, numPeople, workStyle, desks);
}

export function buildFallbackLayout(room, numPeople, workStyle) {
  return optimizeDesks(room, numPeople, workStyle);
}

function optimizeFurniture(room, seedFurniture, workStyle) {
  const currentFurniture = normalizeFurnitureArray(room?.furniture || []);
  const normalizedSeeds = normalizeFurnitureArray(seedFurniture || []);
  const usedSeedIndexes = new Set();
  const desks = Array.isArray(room?.desks)
    ? room.desks.map((desk) => normalizePlacedObject({ ...desk, type: "desk" }, "desk"))
    : [];
  const result = [];

  currentFurniture.forEach((item) => {
    const seed = nearestMatchingSeed(item, normalizedSeeds, usedSeedIndexes);
    const seededItem = seed ? { ...item, ...seed, type: item.type } : item;

    if (FIXED_FURNITURE_TYPES.has(item.type)) {
      result.push(item);
      return;
    }

    const contextRoom = {
      ...room,
      desks,
      furniture: result
    };
    const candidates = buildFurnitureCandidatePoints(seededItem, seed, room, desks, workStyle)
      .map((point) => ({
        ...seededItem,
        ...point
      }))
      .filter((candidate) => isPlacementValid(contextRoom, "furniture", -1, candidate))
      .map((candidate) => ({
        item: candidate,
        score: scoreFurnitureCandidate(seededItem, candidate, room, desks, workStyle, seed)
      }))
      .sort((a, b) => b.score - a.score);

    result.push(candidates[0]?.item || seededItem);
  });

  return result;
}

export function optimizeRoomLayout(room, payload, numPeople, workStyle = "balanced") {
  const normalizedRoom = {
    ...(room || {}),
    desks: normalizeDeskArray(room?.desks || []),
    furniture: normalizeFurnitureArray(room?.furniture || [])
  };
  const requested = normalizeLayoutPayload(payload);
  const desks = optimizeDesks(
    normalizedRoom,
    numPeople,
    workStyle,
    requested.desks.length ? requested.desks : normalizedRoom.desks
  );
  const deskItems = desks.map((desk) => normalizePlacedObject({ ...desk, type: "desk" }, "desk"));
  const deskOnlyRoom = {
    ...normalizedRoom,
    desks: deskItems
  };
  const furniture = optimizeFurniture(deskOnlyRoom, requested.furniture, workStyle);
  const fullRoom = {
    ...deskOnlyRoom,
    furniture
  };
  const scoreBefore = scoreRoom(normalizedRoom, workStyle);
  const deskOnlyScore = scoreRoom(deskOnlyRoom, workStyle);
  const fullScore = scoreRoom(fullRoom, workStyle);
  const acceptedFurniture = fullScore >= deskOnlyScore;

  return {
    desks: deskItems,
    furniture: acceptedFurniture ? furniture : normalizedRoom.furniture,
    score_before: scoreBefore,
    score_after: acceptedFurniture ? fullScore : deskOnlyScore,
    moved_furniture_count: acceptedFurniture
      ? furniture.filter((item, index) => {
          const previous = normalizedRoom.furniture[index];
          return previous && (
            Math.abs(item.x_percent - previous.x_percent) > 1 ||
            Math.abs(item.y_percent - previous.y_percent) > 1 ||
            Math.abs(item.rotation_deg - previous.rotation_deg) > 1
          );
        }).length
      : 0
  };
}

export function buildFallbackRoomLayout(room, numPeople, workStyle) {
  return optimizeRoomLayout(room, {}, numPeople, workStyle);
}

export function buildLayoutNotes(layoutOrDesks, isFallback) {
  const desks = Array.isArray(layoutOrDesks) ? layoutOrDesks : layoutOrDesks?.desks || [];
  const furniture = Array.isArray(layoutOrDesks) ? [] : layoutOrDesks?.furniture || [];
  const movedFurnitureCount = Array.isArray(layoutOrDesks) ? 0 : Number(layoutOrDesks?.moved_furniture_count) || 0;
  const scoreDelta = Array.isArray(layoutOrDesks)
    ? null
    : Math.round((Number(layoutOrDesks?.score_after) || 0) - (Number(layoutOrDesks?.score_before) || 0));
  const notes = [];
  notes.push(
    isFallback
      ? "WorkspaceIQ created an optimized fallback layout using the analysed walls, openings, circulation, and furniture."
      : `Generated and optimized ${desks.length} desk position(s) and reviewed ${furniture.length} furniture object(s) from the analysed room and preferences.`
  );
  notes.push("The generated layout uses the same score drivers as the productivity panel: command position, wall support, entry flow, daylight, work-style harmony, zoning, plants, and clutter distance.");
  notes.push(`${movedFurnitureCount} non-desk object(s) were repositioned where doing so improved or preserved the productivity score${scoreDelta == null ? "." : `; estimated score change: ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}.`}`);
  notes.push("You can still drag desks or furniture, rotate objects, and adjust doors or windows before reviewing the score.");
  return notes;
}
