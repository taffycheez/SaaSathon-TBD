import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "@/lib/objectCatalog";

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

  return {
    ...room,
    desks: isDeskType(canonicalType) ? [...(room.desks || []), nextItem] : [...(room.desks || [])],
    furniture: isDeskType(canonicalType) ? [...(room.furniture || [])] : [...(room.furniture || []), nextItem]
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
