import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "../objectCatalog.js";

let nextRoomItemId = 1;

const OPENING_POSITIONS = {
  window: [28, 72, 50, 18, 82],
  door: [18, 50, 82, 34, 66]
};

export function ensureRoomItemId(item, prefix = "item") {
  if (item?.id) {
    return item.id;
  }

  const generatedId = `${prefix}-${nextRoomItemId}`;
  nextRoomItemId += 1;
  return generatedId;
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
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

export function normalizeWallIndex(value, wallsLength) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || wallsLength <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(wallsLength - 1, numeric));
}

function legacyWallToIndex(value) {
  if (value === "top") {
    return 0;
  }
  if (value === "right") {
    return 1;
  }
  if (value === "bottom") {
    return 2;
  }
  if (value === "left") {
    return 3;
  }
  return null;
}

function wallPointAt(wall, ratio) {
  return {
    x: roundPercent(wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio),
    y: roundPercent(wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio)
  };
}

function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return start;
  }

  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );

  return {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio
  };
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function openingAnchorPoint(item, walls) {
  const wallIndex = item?.wall_index ?? legacyWallToIndex(item?.wall);
  const hasWallPlacement = wallIndex != null && item?.position_percent != null;

  if (hasWallPlacement && Array.isArray(walls) && walls.length) {
    const wall = walls[normalizeWallIndex(wallIndex, walls.length)];
    if (wall) {
      return wallPointAt(wall, clampPercent(item.position_percent) / 100);
    }
  }

  return {
    x: clampPercent(item?.x_percent ?? 50),
    y: clampPercent(item?.y_percent ?? 50)
  };
}

export function pointOnWall(item, walls) {
  const point = openingAnchorPoint(item, walls);
  return {
    x: clampPercent(point.x),
    y: clampPercent(point.y)
  };
}

export function nearestWallIndex(point, walls) {
  if (!Array.isArray(walls) || !walls.length) {
    return 0;
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  walls.forEach((wall, index) => {
    const nearest = nearestPointOnSegment(
      point,
      { x: wall.x1_percent, y: wall.y1_percent },
      { x: wall.x2_percent, y: wall.y2_percent }
    );
    const distance = distanceSquared(point, nearest);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function positionPercentOnWall(point, wall) {
  if (!wall) {
    return 50;
  }

  const dx = wall.x2_percent - wall.x1_percent;
  const dy = wall.y2_percent - wall.y1_percent;
  const lengthSquared = dx * dx + dy * dy;

  if (!lengthSquared) {
    return 50;
  }

  const ratio = ((point.x - wall.x1_percent) * dx + (point.y - wall.y1_percent) * dy) / lengthSquared;
  return roundPercent(clampPercent(ratio * 100));
}

function wallRotation(wall) {
  if (!wall) {
    return 0;
  }

  return normalizeRotation(
    Math.atan2(wall.y2_percent - wall.y1_percent, wall.x2_percent - wall.x1_percent) * 180 / Math.PI
  );
}

export function deriveOpeningRenderData(item, walls) {
  if (!Array.isArray(walls) || !walls.length) {
    return {
      x_percent: clampPercent(item?.x_percent ?? 50),
      y_percent: clampPercent(item?.y_percent ?? 50),
      rotation_deg: normalizeRotation(item?.rotation_deg)
    };
  }

  const wallIndexValue = item?.wall_index ?? legacyWallToIndex(item?.wall);

  if (wallIndexValue == null || item?.position_percent == null) {
    const point = pointOnWall(item, walls);
    const wallIndex = nearestWallIndex(point, walls);
    const wall = walls[wallIndex];

    return {
      x_percent: point.x,
      y_percent: point.y,
      rotation_deg: wallRotation(wall)
    };
  }

  const wallIndex = normalizeWallIndex(wallIndexValue, walls.length);
  const wall = walls[wallIndex];
  const point = wallPointAt(wall, clampPercent(item.position_percent) / 100);

  return {
    x_percent: clampPercent(point.x),
    y_percent: clampPercent(point.y),
    rotation_deg: wallRotation(wall)
  };
}

export function snapOpeningToWall(item, walls, prefix = "opening") {
  const sourcePoint = pointOnWall(item, walls);

  if (!Array.isArray(walls) || !walls.length) {
    return {
      id: ensureRoomItemId(item, prefix),
      wall_index: 0,
      position_percent: 50,
      x_percent: sourcePoint.x,
      y_percent: sourcePoint.y,
      rotation_deg: normalizeRotation(item?.rotation_deg)
    };
  }

  const wall_index = nearestWallIndex(sourcePoint, walls);
  const position_percent = positionPercentOnWall(sourcePoint, walls[wall_index]);
  const render = deriveOpeningRenderData({ wall_index, position_percent }, walls);

  return {
    id: ensureRoomItemId(item, prefix),
    wall_index,
    position_percent,
    ...render
  };
}

export function createPlacedObject(type, seedIndex = 0) {
  const canonicalType = canonicalizeObjectType(type);
  const definition = getObjectDefinition(canonicalType);

  return {
    id: ensureRoomItemId(null, canonicalType),
    type: canonicalType,
    shape_kind: definition.shape_kind,
    x_percent: 28 + (seedIndex % 4) * 15,
    y_percent: 28 + (Math.floor(seedIndex / 4) % 3) * 16,
    width_percent: definition.width_percent,
    height_percent: definition.height_percent,
    rotation_deg: 0,
    footprint_points: normalizeFootprintPoints(definition.footprint_points, definition.footprint_points)
  };
}

export function addObjectToRoom(room, type) {
  const canonicalType = canonicalizeObjectType(type);
  const seedIndex = (room?.desks?.length || 0) + (room?.furniture?.length || 0);
  const nextItem = createPlacedObject(canonicalType, seedIndex);

  return {
    ...room,
    desks: isDeskType(canonicalType) ? [...(room.desks || []), nextItem] : [...(room.desks || [])],
    furniture: isDeskType(canonicalType) ? [...(room.furniture || [])] : [...(room.furniture || []), nextItem]
  };
}

export function addOpeningToRoom(room, type) {
  const collection = type === "window" ? "windows" : "doors";
  const existingItems = Array.isArray(room?.[collection]) ? room[collection] : [];
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  const wallCount = Math.max(1, walls.length);
  const seedIndex = existingItems.length;
  const wall_index = seedIndex % wallCount;
  const positions = OPENING_POSITIONS[type] || OPENING_POSITIONS.window;
  const position_percent = positions[seedIndex % positions.length];

  return {
    ...room,
    [collection]: [
      ...existingItems,
      snapOpeningToWall(
        {
          id: ensureRoomItemId(null, type),
          wall_index,
          position_percent
        },
        walls,
        type
      )
    ]
  };
}

export function isDeskLikeFurniture(item) {
  return isDeskType(item?.type);
}

export function normalizeFurnitureItem(item) {
  const type = canonicalizeObjectType(item?.type);
  const definition = getObjectDefinition(type);
  return {
    id: ensureRoomItemId(item, type),
    type,
    shape_kind: normalizeShapeKind(item?.shape_kind, definition.shape_kind),
    x_percent: clampPercent(item?.x_percent),
    y_percent: clampPercent(item?.y_percent),
    width_percent: Math.max(2, clampPercent(item?.width_percent ?? definition.width_percent)),
    height_percent: Math.max(2, clampPercent(item?.height_percent ?? definition.height_percent)),
    rotation_deg: normalizeRotation(item?.rotation_deg),
    footprint_points: normalizeFootprintPoints(item?.footprint_points, definition.footprint_points)
  };
}
