import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "./objectCatalog.js";
import {
  findFirstFreeObjectPlacement,
  findNearestValidObjectPlacement,
  normalizeObjectScale,
  isPlacementValid,
  normalizeWallGraph,
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

  return {
    ...room,
    walls: snappedWalls,
    wallIssues: graph.issues,
    windows: Array.isArray(room?.windows)
      ? room.windows.map((item) => snapEdgeItemToWalls(item, snappedWalls))
      : [],
    doors: Array.isArray(room?.doors)
      ? room.doors.map((item) => snapEdgeItemToWalls(item, snappedWalls))
      : []
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
      position_percent
    },
    walls
  );
}

export function createWindowForRoom(room) {
  return createEdgeItemForRoom(room, "window");
}

export function createDoorForRoom(room) {
  return createEdgeItemForRoom(room, "door");
}

export function updateEdgeItemPosition(room, collectionType, index, pointerPosition) {
  const walls = Array.isArray(room?.walls) ? room.walls : [];
  return {
    ...room,
    [collectionType]: (room?.[collectionType] || []).map((item, itemIndex) =>
      itemIndex === index ? snapEdgeItemToWalls({ ...item, ...pointerPosition }, walls) : item
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
    if (updates?.scale != null || updates?.width_percent != null || updates?.height_percent != null) {
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
