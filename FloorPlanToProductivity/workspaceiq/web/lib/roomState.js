import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "./objectCatalog.js";
import {
  findFirstFreeObjectPlacement,
  findNearestValidObjectPlacement,
  estimateRoomAreaSquareMeters,
  normalizeObjectScale,
  insertConnectedWall,
  isPlacementValid,
  lineAngleDegrees,
  normalizeWallGraph,
  snapEditorPointToWalls,
  snapEdgeItemToWalls
} from "./roomGeometry.js";

const OPENING_POSITIONS = {
  window: [28, 72, 50, 18, 82],
  door: [18, 50, 82, 34, 66]
};
const WALL_ENDPOINT_MATCH_TOLERANCE = 1.5;

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
}

export function normalizeShapeKind(value, fallback) {
  return value === "ellipse" || value === "polygon" || value === "rect" ? value : fallback;
}

export function normalizeFootprintPoints(points, fallbackPoints) {
  const source = Array.isArray(points) && points.length >= 3 ? points : fallbackPoints;
  return Array.isArray(source)
    ? source.map((point) => ({
        x_percent: Math.max(-50, Math.min(50, Number(point?.x_percent) || 0)),
        y_percent: Math.max(-50, Math.min(50, Number(point?.y_percent) || 0))
      }))
    : [];
}

export function pointOnWall(item, walls) {
  if (item && item.x_percent != null && item.y_percent != null) {
    return {
      x: clampPercent(item.x_percent),
      y: clampPercent(item.y_percent)
    };
  }

  const safeWalls = Array.isArray(walls) ? walls : [];
  if (!safeWalls.length) {
    return {
      x: clampPercent(item?.x_percent ?? 50),
      y: clampPercent(item?.y_percent ?? 50)
    };
  }

  const wallIndex = Math.max(0, Math.min(safeWalls.length - 1, Number(item?.wall_index) || 0));
  const wall = safeWalls[wallIndex];
  const ratio = clampPercent(item?.position_percent) / 100;

  return {
    x: clampPercent(wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio),
    y: clampPercent(wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio)
  };
}

function wallLengthPercent(wall) {
  if (!wall) {
    return 0;
  }

  return Math.hypot(
    Number(wall.x2_percent) - Number(wall.x1_percent),
    Number(wall.y2_percent) - Number(wall.y1_percent)
  );
}

function pointAtWallPosition(wall, positionPercent) {
  const ratio = clampPercent(positionPercent) / 100;
  return {
    x_percent: Number(
      clampPercent(wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio).toFixed(2)
    ),
    y_percent: Number(
      clampPercent(wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio).toFixed(2)
    )
  };
}

function doorOpeningRange(door, wall) {
  const currentPosition = clampPercent(door?.position_percent ?? 50);
  const effectiveWidthPercent = Math.max(4, clampPercent(door?.width_percent ?? 10));
  const lengthPercent = Math.max(wallLengthPercent(wall), effectiveWidthPercent);
  const spanPercent = Math.min(98, (effectiveWidthPercent / lengthPercent) * 100);
  const hingeSide = door?.hinge_side === "end" ? "end" : "start";
  let start = hingeSide === "end" ? currentPosition - spanPercent : currentPosition;
  let end = hingeSide === "end" ? currentPosition : currentPosition + spanPercent;

  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > 100) {
    start -= end - 100;
    end = 100;
  }

  return {
    start: clampPercent(start),
    end: clampPercent(end)
  };
}

export function flipDoorHingeInRoom(room, index) {
  const doors = Array.isArray(room?.doors) ? room.doors : [];
  const door = doors[index];
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  if (!door || !walls.length) {
    return room;
  }

  const wallIndex = Math.max(0, Math.min(walls.length - 1, Number(door.wall_index) || 0));
  const wall = walls[wallIndex];
  const nextHingeSide = door.hinge_side === "end" ? "start" : "end";
  const range = doorOpeningRange(door, wall);
  const nextPosition = nextHingeSide === "end" ? range.end : range.start;

  return updateEdgeItem(room, "doors", index, {
    ...pointAtWallPosition(wall, nextPosition),
    wall_index: wallIndex,
    position_percent: Number(nextPosition.toFixed(2)),
    opening_anchor: "edge",
    hinge_side: nextHingeSide
  });
}

export function rotateDoorHalfTurnInRoom(room, index) {
  const doors = Array.isArray(room?.doors) ? room.doors : [];
  const door = doors[index];
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  if (!door || !walls.length) {
    return room;
  }

  const wallIndex = Math.max(0, Math.min(walls.length - 1, Number(door.wall_index) || 0));
  const wall = walls[wallIndex];
  const nextHingeSide = door.hinge_side === "end" ? "start" : "end";
  const currentSwingDirection = Number(door?.swing_direction) === -1 ? -1 : 1;
  const range = doorOpeningRange(door, wall);
  const nextPosition = nextHingeSide === "end" ? range.end : range.start;

  return updateEdgeItem(room, "doors", index, {
    ...pointAtWallPosition(wall, nextPosition),
    wall_index: wallIndex,
    position_percent: Number(nextPosition.toFixed(2)),
    opening_anchor: "edge",
    hinge_side: nextHingeSide,
    swing_direction: currentSwingDirection === 1 ? -1 : 1
  });
}

export function createPlacedObject(type, seedIndex = 0) {
  const canonicalType = canonicalizeObjectType(type);
  const definition = getObjectDefinition(canonicalType);

  return {
    type: canonicalType,
    shape_kind: definition.shape_kind,
    x_percent: 28 + (seedIndex % 4) * 15,
    y_percent: 28 + (Math.floor(seedIndex / 4) % 3) * 16,
    width_percent: definition.width_percent,
    height_percent: definition.height_percent,
    scale: 1,
    rotation_deg: 0,
    footprint_points: normalizeFootprintPoints(definition.footprint_points, definition.footprint_points)
  };
}

export function addObjectToRoom(room, type) {
  const canonicalType = canonicalizeObjectType(type);
  const seedIndex = (room?.desks?.length || 0) + (room?.furniture?.length || 0);
  const nextItem = createPlacedObject(canonicalType, seedIndex);
  const collectionType = isDeskType(canonicalType) ? "desks" : "furniture";
  const placement = findFirstFreeObjectPlacement(room, nextItem, collectionType);
  if (!placement) {
    return room;
  }
  const placedItem = {
    ...nextItem,
    ...placement
  };

  return {
    ...room,
    desks: isDeskType(canonicalType) ? [...(room.desks || []), placedItem] : [...(room.desks || [])],
    furniture: isDeskType(canonicalType) ? [...(room.furniture || [])] : [...(room.furniture || []), placedItem]
  };
}

export function isDeskLikeFurniture(item) {
  return isDeskType(item?.type);
}

export function normalizeFurnitureItem(item) {
  const type = canonicalizeObjectType(item?.type);
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

export function normalizeRoomLayout(room) {
  const graph = normalizeWallGraph(room?.walls || []);
  const snappedWalls = graph.walls.length ? graph.walls : room?.walls || [];
  const metrics = computeRoomMetrics({
    ...room,
    walls: snappedWalls
  });

  return {
    ...room,
    estimated_width_m: metrics.estimated_width_m,
    estimated_height_m: metrics.estimated_height_m,
    estimated_area_m2: metrics.estimated_area_m2,
    north_direction_deg: normalizeRotation(room?.north_direction_deg),
    walls: snappedWalls,
    wallIssues: graph.issues,
    windows: Array.isArray(room?.windows)
      ? room.windows.map((item) => snapEdgeItemToWalls(item, snappedWalls, item?.width_percent ?? 14))
      : [],
    doors: Array.isArray(room?.doors)
      ? room.doors.map((item) => snapEdgeItemToWalls({
        opening_anchor: "edge",
        hinge_side: "start",
        swing_direction: 1,
        ...item
      }, snappedWalls, item?.width_percent ?? 10))
      : []
  };
}

export function applyNorthDirection(room, angleDeg) {
  return {
    ...room,
    north_direction_deg: normalizeRotation(angleDeg)
  };
}

function createEdgeItemForRoom(room, type) {
  const collection = type === "window" ? "windows" : "doors";
  const existingItems = Array.isArray(room?.[collection]) ? room[collection] : [];
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const wallCount = Math.max(1, walls.length);
  const seedIndex = existingItems.length;
  const positions = OPENING_POSITIONS[type] || OPENING_POSITIONS.window;
  const wall_index = seedIndex % wallCount;
  const position_percent = positions[seedIndex % positions.length];
  const wall = walls[wall_index];
  const ratio = position_percent / 100;

  const x_percent = wall
    ? clampPercent(wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio)
    : 50;
  const y_percent = wall
    ? clampPercent(wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio)
    : 12;

  return snapEdgeItemToWalls(
    {
      x_percent,
      y_percent,
      rotation_deg: 0,
      wall_index,
      position_percent,
      width_percent: type === "window" ? 14 : 10
    },
    walls,
    type === "window" ? 14 : 10
  );
}

export function createWindowForRoom(room) {
  return createEdgeItemForRoom(room, "window");
}

export function createDoorForRoom(room) {
  return snapEdgeItemToWalls(
    {
      ...createEdgeItemForRoom(room, "door"),
      opening_anchor: "edge",
      hinge_side: "start",
      swing_direction: 1
    },
    Array.isArray(room?.walls) ? room.walls : []
  );
}

export function updateEdgeItemPosition(room, collectionType, index, pointerPosition) {
  return updateEdgeItem(room, collectionType, index, pointerPosition);
}

export function updateEdgeItem(room, collectionType, index, updates) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const items = Array.isArray(room?.[collectionType]) ? room[collectionType] : [];
  return {
    ...room,
    [collectionType]: items.map((item, itemIndex) =>
      itemIndex === index
        ? snapEdgeItemToWalls(
            { ...item, ...updates },
            walls,
            collectionType === "windows" ? item?.width_percent ?? 14 : item?.width_percent ?? 10
          )
        : item
    )
  };
}

export function updatePlacedObjectPosition(room, collectionType, index, pointerPosition) {
  return updatePlacedObject(room, collectionType, index, pointerPosition);
}

export function updatePlacedObject(room, collectionType, index, updates) {
  const items = Array.isArray(room?.[collectionType]) ? room[collectionType] : [];
  const currentItem = items[index];
  if (!currentItem) {
    return room;
  }

  const nextItem = {
    ...currentItem
  };

  if (updates?.x_percent != null) {
    nextItem.x_percent = clampPercent(updates.x_percent);
  }
  if (updates?.y_percent != null) {
    nextItem.y_percent = clampPercent(updates.y_percent);
  }
  if (updates?.rotation_deg != null) {
    nextItem.rotation_deg = normalizeRotation(updates.rotation_deg);
  }
  if (updates?.scale != null) {
    nextItem.scale = normalizeObjectScale(updates.scale);
  }
  if (updates?.width_percent != null) {
    nextItem.width_percent = Math.max(2, clampPercent(updates.width_percent));
  }
  if (updates?.height_percent != null) {
    nextItem.height_percent = Math.max(2, clampPercent(updates.height_percent));
  }

  if (!isPlacementValid(room, collectionType, index, nextItem)) {
    if (
      updates?.rotation_deg != null ||
      updates?.scale != null ||
      updates?.width_percent != null ||
      updates?.height_percent != null ||
      updates?.x_percent != null ||
      updates?.y_percent != null
    ) {
      const placement = findNearestValidObjectPlacement(room, nextItem, collectionType, index);
      if (placement) {
        nextItem.x_percent = placement.x_percent;
        nextItem.y_percent = placement.y_percent;
      }
    }
  }

  if (!isPlacementValid(room, collectionType, index, nextItem)) {
    return room;
  }

  return {
    ...room,
    [collectionType]: items.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
  };
}

function endpointMatches(wall, endpoint, point) {
  const xKey = endpoint === "start" ? "x1_percent" : "x2_percent";
  const yKey = endpoint === "start" ? "y1_percent" : "y2_percent";
  return (
    Math.abs(Number(wall?.[xKey]) - point.x) <= WALL_ENDPOINT_MATCH_TOLERANCE &&
    Math.abs(Number(wall?.[yKey]) - point.y) <= WALL_ENDPOINT_MATCH_TOLERANCE
  );
}

function pointsMatch(a, b, tolerance = 0.6) {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function pointOnInfiniteLine(point, wall, tolerance = 0.6) {
  const dx = wall.x2_percent - wall.x1_percent;
  const dy = wall.y2_percent - wall.y1_percent;
  return Math.abs((point.y - wall.y1_percent) * dx - (point.x - wall.x1_percent) * dy) <= tolerance;
}

function mergeCollinearWalls(walls) {
  const nextWalls = [...walls];
  let changed = true;

  while (changed) {
    changed = false;

    for (let index = 0; index < nextWalls.length; index += 1) {
      const wallA = nextWalls[index];
      const startA = { x: wallA.x1_percent, y: wallA.y1_percent };
      const endA = { x: wallA.x2_percent, y: wallA.y2_percent };

      for (let compareIndex = index + 1; compareIndex < nextWalls.length; compareIndex += 1) {
        const wallB = nextWalls[compareIndex];
        const startB = { x: wallB.x1_percent, y: wallB.y1_percent };
        const endB = { x: wallB.x2_percent, y: wallB.y2_percent };
        const sharedPoint =
          pointsMatch(startA, startB) ? startA
            : pointsMatch(startA, endB) ? startA
              : pointsMatch(endA, startB) ? endA
                : pointsMatch(endA, endB) ? endA
                  : null;

        if (!sharedPoint) {
          continue;
        }

        const angleA = lineAngleDegrees(wallA);
        const angleB = lineAngleDegrees(wallB);
        const delta = Math.min(
          Math.abs(angleA - angleB),
          Math.abs(angleA - ((angleB + 180) % 360))
        );

        if (delta > 1.5) {
          continue;
        }

        const candidates = [startA, endA, startB, endB].filter((point) => !pointsMatch(point, sharedPoint));
        if (candidates.length !== 2) {
          continue;
        }

        if (!pointOnInfiniteLine(candidates[0], wallA) || !pointOnInfiniteLine(candidates[1], wallA)) {
          continue;
        }

        nextWalls.splice(compareIndex, 1);
        nextWalls.splice(index, 1, {
          x1_percent: candidates[0].x,
          y1_percent: candidates[0].y,
          x2_percent: candidates[1].x,
          y2_percent: candidates[1].y
        });
        changed = true;
        break;
      }

      if (changed) {
        break;
      }
    }
  }

  return nextWalls;
}

export function updateWallEndpoint(room, wallIndex, endpoint, pointerPosition) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const targetWall = walls[wallIndex];
  if (!targetWall || (endpoint !== "start" && endpoint !== "end")) {
    return room;
  }

  const originalPoint = endpoint === "start"
    ? { x: Number(targetWall.x1_percent), y: Number(targetWall.y1_percent) }
    : { x: Number(targetWall.x2_percent), y: Number(targetWall.y2_percent) };
  const nextPoint = {
    x: clampPercent(pointerPosition?.x_percent),
    y: clampPercent(pointerPosition?.y_percent)
  };

  return normalizeRoomLayout({
    ...room,
    walls: walls.map((wall) => {
      const nextWall = { ...wall };
      if (endpointMatches(nextWall, "start", originalPoint)) {
        nextWall.x1_percent = nextPoint.x;
        nextWall.y1_percent = nextPoint.y;
      }
      if (endpointMatches(nextWall, "end", originalPoint)) {
        nextWall.x2_percent = nextPoint.x;
        nextWall.y2_percent = nextPoint.y;
      }
      return nextWall;
    })
  });
}

function applyDeltaToPoint(point, delta) {
  return {
    x: clampPercent(point.x + delta.x),
    y: clampPercent(point.y + delta.y)
  };
}

function clampBoundsSize(min, max, minimumSize = 8) {
  if (max - min >= minimumSize) {
    return { min, max };
  }

  const center = (min + max) / 2;
  const half = minimumSize / 2;
  return {
    min: clampPercent(center - half),
    max: clampPercent(center + half)
  };
}

function transformPointWithinBounds(point, fromBounds, toBounds) {
  const sourceWidth = Math.max(1, fromBounds.maxX - fromBounds.minX);
  const sourceHeight = Math.max(1, fromBounds.maxY - fromBounds.minY);
  const nextWidth = Math.max(1, toBounds.maxX - toBounds.minX);
  const nextHeight = Math.max(1, toBounds.maxY - toBounds.minY);
  const xRatio = (point.x - fromBounds.minX) / sourceWidth;
  const yRatio = (point.y - fromBounds.minY) / sourceHeight;

  return {
    x: clampPercent(toBounds.minX + xRatio * nextWidth),
    y: clampPercent(toBounds.minY + yRatio * nextHeight)
  };
}

export function moveWallByDelta(room, wallIndex, rawDelta) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const targetWall = walls[wallIndex];
  if (!targetWall) {
    return room;
  }

  const start = { x: Number(targetWall.x1_percent), y: Number(targetWall.y1_percent) };
  const end = { x: Number(targetWall.x2_percent), y: Number(targetWall.y2_percent) };
  const wallAngleRadians = (lineAngleDegrees(targetWall) * Math.PI) / 180;
  const normal = {
    x: -Math.sin(wallAngleRadians),
    y: Math.cos(wallAngleRadians)
  };
  const requestedDelta = {
    x: Number(rawDelta?.x_percent) || 0,
    y: Number(rawDelta?.y_percent) || 0
  };
  const projectedMagnitude = requestedDelta.x * normal.x + requestedDelta.y * normal.y;
  const delta = {
    x: normal.x * projectedMagnitude,
    y: normal.y * projectedMagnitude
  };

  return normalizeRoomLayout({
    ...room,
    walls: walls.map((wall) => {
      const nextWall = { ...wall };

      if (endpointMatches(nextWall, "start", start)) {
        const moved = applyDeltaToPoint(start, delta);
        nextWall.x1_percent = moved.x;
        nextWall.y1_percent = moved.y;
      }
      if (endpointMatches(nextWall, "end", start)) {
        const moved = applyDeltaToPoint(start, delta);
        nextWall.x2_percent = moved.x;
        nextWall.y2_percent = moved.y;
      }
      if (endpointMatches(nextWall, "start", end)) {
        const moved = applyDeltaToPoint(end, delta);
        nextWall.x1_percent = moved.x;
        nextWall.y1_percent = moved.y;
      }
      if (endpointMatches(nextWall, "end", end)) {
        const moved = applyDeltaToPoint(end, delta);
        nextWall.x2_percent = moved.x;
        nextWall.y2_percent = moved.y;
      }

      return nextWall;
    })
  });
}

export function resizeRoomBounds(room, handle, pointerPosition) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  if (!walls.length) {
    return room;
  }

  const bounds = getWallBounds(walls);
  let nextBounds = { ...bounds };
  const targetX = clampPercent(pointerPosition?.x_percent);
  const targetY = clampPercent(pointerPosition?.y_percent);

  if (handle.includes("w")) {
    nextBounds.minX = Math.min(targetX, bounds.maxX - 8);
  }
  if (handle.includes("e")) {
    nextBounds.maxX = Math.max(targetX, bounds.minX + 8);
  }
  if (handle.includes("n")) {
    nextBounds.minY = Math.min(targetY, bounds.maxY - 8);
  }
  if (handle.includes("s")) {
    nextBounds.maxY = Math.max(targetY, bounds.minY + 8);
  }

  const widthClamped = clampBoundsSize(nextBounds.minX, nextBounds.maxX, 8);
  const heightClamped = clampBoundsSize(nextBounds.minY, nextBounds.maxY, 8);
  nextBounds = {
    minX: widthClamped.min,
    maxX: widthClamped.max,
    minY: heightClamped.min,
    maxY: heightClamped.max
  };

  const transform = (point) => transformPointWithinBounds(point, bounds, nextBounds);

  const transformedWalls = walls.map((wall) => {
    const start = transform({ x: Number(wall.x1_percent) || 0, y: Number(wall.y1_percent) || 0 });
    const end = transform({ x: Number(wall.x2_percent) || 0, y: Number(wall.y2_percent) || 0 });
    return {
      ...wall,
      x1_percent: start.x,
      y1_percent: start.y,
      x2_percent: end.x,
      y2_percent: end.y
    };
  });

  const transformEdgeItem = (item) => {
    if (!item || item.x_percent == null || item.y_percent == null) {
      return item;
    }
    const nextPoint = transform({ x: Number(item.x_percent) || 0, y: Number(item.y_percent) || 0 });
    return {
      ...item,
      x_percent: nextPoint.x,
      y_percent: nextPoint.y
    };
  };

  const transformPlacedItem = (item) => {
    const nextPoint = transform({ x: Number(item?.x_percent) || 0, y: Number(item?.y_percent) || 0 });
    return {
      ...item,
      x_percent: nextPoint.x,
      y_percent: nextPoint.y
    };
  };

  const nextRoom = {
    ...room,
    walls: transformedWalls,
    windows: Array.isArray(room?.windows) ? room.windows.map(transformEdgeItem) : [],
    doors: Array.isArray(room?.doors) ? room.doors.map(transformEdgeItem) : [],
    furniture: Array.isArray(room?.furniture) ? room.furniture.map(transformPlacedItem) : [],
    desks: Array.isArray(room?.desks) ? room.desks.map(transformPlacedItem) : [],
    scale_reference: room?.scale_reference
      ? {
          ...room.scale_reference,
          start: transform(room.scale_reference.start),
          end: transform(room.scale_reference.end)
        }
      : room?.scale_reference
  };

  return normalizeRoomLayout(nextRoom);
}

export function addWallToRoom(room, startPoint, endPoint) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const insertedWalls = insertConnectedWall(walls, startPoint, endPoint);
  const safeStart = {
    x: clampPercent(startPoint?.x_percent ?? startPoint?.x),
    y: clampPercent(startPoint?.y_percent ?? startPoint?.y)
  };
  const safeEnd = {
    x: clampPercent(endPoint?.x_percent ?? endPoint?.x),
    y: clampPercent(endPoint?.y_percent ?? endPoint?.y)
  };
  const hasMatchingWall = insertedWalls.some((wall) => (
    (Math.abs(wall.x1_percent - safeStart.x) <= 0.9 &&
      Math.abs(wall.y1_percent - safeStart.y) <= 0.9 &&
      Math.abs(wall.x2_percent - safeEnd.x) <= 0.9 &&
      Math.abs(wall.y2_percent - safeEnd.y) <= 0.9) ||
    (Math.abs(wall.x1_percent - safeEnd.x) <= 0.9 &&
      Math.abs(wall.y1_percent - safeEnd.y) <= 0.9 &&
      Math.abs(wall.x2_percent - safeStart.x) <= 0.9 &&
      Math.abs(wall.y2_percent - safeStart.y) <= 0.9)
  ));
  const nextWalls = hasMatchingWall
    ? insertedWalls
    : [
        ...insertedWalls,
        {
          x1_percent: safeStart.x,
          y1_percent: safeStart.y,
          x2_percent: safeEnd.x,
          y2_percent: safeEnd.y
        }
      ];

  return normalizeRoomLayout({
    ...room,
    walls: nextWalls
  });
}

export function deleteWallFromRoom(room, wallIndex) {
  const rawWalls = Array.isArray(room?.walls) ? room.walls : [];
  const graph = normalizeWallGraph(rawWalls);
  const displayWalls = graph.walls.length ? graph.walls : rawWalls;
  const targetWall = displayWalls[wallIndex];

  if (!targetWall || rawWalls.length <= 3) {
    return room;
  }

  const rawIndex = rawWalls.findIndex((wall) => (
    (Math.abs(wall.x1_percent - targetWall.x1_percent) <= 0.9 &&
      Math.abs(wall.y1_percent - targetWall.y1_percent) <= 0.9 &&
      Math.abs(wall.x2_percent - targetWall.x2_percent) <= 0.9 &&
      Math.abs(wall.y2_percent - targetWall.y2_percent) <= 0.9) ||
    (Math.abs(wall.x1_percent - targetWall.x2_percent) <= 0.9 &&
      Math.abs(wall.y1_percent - targetWall.y2_percent) <= 0.9 &&
      Math.abs(wall.x2_percent - targetWall.x1_percent) <= 0.9 &&
      Math.abs(wall.y2_percent - targetWall.y1_percent) <= 0.9)
  ));
  const filteredWalls = rawWalls.filter((_wall, index) => index !== (rawIndex >= 0 ? rawIndex : wallIndex));
  const mergedWalls = mergeCollinearWalls(filteredWalls);

  return normalizeRoomLayout({
    ...room,
    walls: mergedWalls
  });
}

export function addRectangleRoomToRoom(room, startPoint, endPoint) {
  const start = {
    x: clampPercent(startPoint?.x_percent ?? startPoint?.x),
    y: clampPercent(startPoint?.y_percent ?? startPoint?.y)
  };
  const end = {
    x: clampPercent(endPoint?.x_percent ?? endPoint?.x),
    y: clampPercent(endPoint?.y_percent ?? endPoint?.y)
  };

  if (Math.abs(end.x - start.x) < 2 || Math.abs(end.y - start.y) < 2) {
    return room;
  }

  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);

  const corners = [
    { x_percent: left, y_percent: top },
    { x_percent: right, y_percent: top },
    { x_percent: right, y_percent: bottom },
    { x_percent: left, y_percent: bottom }
  ];

  return normalizeRoomLayout(corners.reduce((nextRoom, corner, index) => (
    addWallToRoom(nextRoom, corner, corners[(index + 1) % corners.length])
  ), room));
}

export function getSnappedWallPoint(room, pointerPosition) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  return snapEditorPointToWalls(
    {
      x_percent: pointerPosition?.x_percent,
      y_percent: pointerPosition?.y_percent
    },
    walls
  ).point;
}

function getWallBounds(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: Number(wall?.x1_percent) || 0, y: Number(wall?.y1_percent) || 0 },
        { x: Number(wall?.x2_percent) || 0, y: Number(wall?.y2_percent) || 0 }
      ])
    : [];

  if (!points.length) {
    return {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

export function applyScaleReference(room, startPoint, endPoint, distanceMeters) {
  const numericDistance = Number(distanceMeters);
  if (!Number.isFinite(numericDistance) || numericDistance <= 0) {
    return room;
  }

  const start = {
    x: clampPercent(startPoint?.x_percent ?? startPoint?.x),
    y: clampPercent(startPoint?.y_percent ?? startPoint?.y)
  };
  const end = {
    x: clampPercent(endPoint?.x_percent ?? endPoint?.x),
    y: clampPercent(endPoint?.y_percent ?? endPoint?.y)
  };
  const measuredPercent = Math.hypot(end.x - start.x, end.y - start.y);
  if (measuredPercent < 0.5) {
    return room;
  }

  return computeRoomMetrics({
    ...room,
    scale_reference: {
      start,
      end,
      distance_m: Number(numericDistance.toFixed(2))
    }
  });
}

function computeRoomMetrics(room) {
  const bounds = getWallBounds(room?.walls || []);
  const widthPercent = Math.max(1, bounds.maxX - bounds.minX);
  const heightPercent = Math.max(1, bounds.maxY - bounds.minY);
  const measuredDistance = Number(room?.scale_reference?.distance_m);
  const scaleStart = room?.scale_reference?.start;
  const scaleEnd = room?.scale_reference?.end;
  const measuredPercent =
    scaleStart && scaleEnd
      ? Math.hypot((Number(scaleEnd.x) || 0) - (Number(scaleStart.x) || 0), (Number(scaleEnd.y) || 0) - (Number(scaleStart.y) || 0))
      : 0;
  const hasScaleReference = Number.isFinite(measuredDistance) && measuredDistance > 0 && measuredPercent >= 0.5;
  const metersPerPercent = hasScaleReference ? measuredDistance / measuredPercent : 0;
  const estimated_width_m = hasScaleReference
    ? Math.max(1, Number((widthPercent * metersPerPercent).toFixed(2)))
    : Math.max(1, Number(room?.estimated_width_m) || 0);
  const estimated_height_m = hasScaleReference
    ? Math.max(1, Number((heightPercent * metersPerPercent).toFixed(2)))
    : Math.max(1, Number(room?.estimated_height_m) || 0);
  const estimated_area_m2 = Math.max(
    1,
    Number(
      (
        estimateRoomAreaSquareMeters({
          ...room,
          estimated_width_m,
          estimated_height_m
        }) || estimated_width_m * estimated_height_m
      ).toFixed(2)
    )
  );

  return {
    ...room,
    estimated_width_m,
    estimated_height_m,
    estimated_area_m2
  };
}
