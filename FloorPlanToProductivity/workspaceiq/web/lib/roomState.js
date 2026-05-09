import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "./objectCatalog.js";
import {
  findFirstFreeObjectPlacement,
  isPlacementValid,
  normalizeWallGraph,
  snapEdgeItemToWalls
} from "./roomGeometry.js";

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

export function createWindowForRoom(room) {
  return snapEdgeItemToWalls(
    {
      x_percent: 50,
      y_percent: 12,
      rotation_deg: 0,
      wall_index: 0,
      position_percent: 50
    },
    room?.walls || []
  );
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
  const items = Array.isArray(room?.[collectionType]) ? room[collectionType] : [];
  const currentItem = items[index];
  if (!currentItem) {
    return room;
  }

  const nextItem = {
    ...currentItem,
    x_percent: clampPercent(pointerPosition?.x_percent),
    y_percent: clampPercent(pointerPosition?.y_percent)
  };

  if (!isPlacementValid(room, collectionType, index, nextItem)) {
    return room;
  }

  return {
    ...room,
    [collectionType]: items.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
  };
}
