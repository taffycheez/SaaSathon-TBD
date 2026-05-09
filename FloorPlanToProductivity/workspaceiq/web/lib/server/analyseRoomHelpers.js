import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "@/lib/objectCatalog";

export const fallbackRoom = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [
    { wall_index: 0, position_percent: 25 },
    { wall_index: 0, position_percent: 75 }
  ],
  doors: [{ wall_index: 3, position_percent: 70 }],
  furniture: []
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function clampIndex(value, max) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || max < 0) {
    return 0;
  }
  return Math.max(0, Math.min(max, numeric));
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
}

function normalizeShapeKind(value, fallback) {
  return value === "ellipse" || value === "polygon" || value === "rect" ? value : fallback;
}

function normalizeFootprintPoints(points, fallbackPoints) {
  const source = Array.isArray(points) && points.length >= 3 ? points : fallbackPoints;
  return Array.isArray(source)
    ? source.map((point) => ({
        x_percent: Math.max(-50, Math.min(50, Number(point?.x_percent) || 0)),
        y_percent: Math.max(-50, Math.min(50, Number(point?.y_percent) || 0))
      }))
    : [];
}

function normalizeWallSegment(item) {
  return {
    x1_percent: clampPercent(item?.x1_percent),
    y1_percent: clampPercent(item?.y1_percent),
    x2_percent: clampPercent(item?.x2_percent),
    y2_percent: clampPercent(item?.y2_percent)
  };
}

function normalizeLegacyWallToIndex(value) {
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
  return 0;
}

function normalizeEdgeItems(items, walls) {
  const wallCount = Math.max(0, walls.length - 1);
  return Array.isArray(items)
    ? items.map((item) => ({
        wall_index: clampIndex(
          item?.wall_index ?? normalizeLegacyWallToIndex(item?.wall),
          wallCount
        ),
        position_percent: clampPercent(item?.position_percent)
      }))
    : [];
}

export function normalizeRoomDescription(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const walls = Array.isArray(safePayload.walls) && safePayload.walls.length >= 3
    ? safePayload.walls.map(normalizeWallSegment)
    : fallbackRoom.walls.map(normalizeWallSegment);

  return {
    estimated_width_m: Math.max(1, Number(safePayload.estimated_width_m) || 8),
    estimated_height_m: Math.max(1, Number(safePayload.estimated_height_m) || 6),
    walls,
    windows: normalizeEdgeItems(safePayload.windows, walls),
    doors: normalizeEdgeItems(safePayload.doors, walls),
    furniture: Array.isArray(safePayload.furniture)
      ? safePayload.furniture.map((item) => {
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
        })
      : []
  };
}

export function normalizeAnalysisResult(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const returnedWallCount = Array.isArray(safePayload.walls) ? safePayload.walls.length : 0;
  const returnedObjectCount = Array.isArray(safePayload.furniture) ? safePayload.furniture.length : 0;
  const returnedEdgeCount =
    (Array.isArray(safePayload.windows) ? safePayload.windows.length : 0) +
    (Array.isArray(safePayload.doors) ? safePayload.doors.length : 0);
  const hasFloorPlanEvidence = returnedWallCount >= 2 || returnedObjectCount > 0 || returnedEdgeCount > 0;
  const isValidRoom = safePayload.is_valid_room !== false || hasFloorPlanEvidence;
  const rejectionReason =
    typeof safePayload.rejection_reason === "string" && safePayload.rejection_reason.trim()
      ? safePayload.rejection_reason.trim()
      : "This image does not appear to show an office or room layout we can analyse.";

  return {
    is_valid_room: isValidRoom,
    rejection_reason: isValidRoom ? "" : rejectionReason,
    room: normalizeRoomDescription(safePayload)
  };
}

export function buildRoomNotes(room, isFallback) {
  const notes = [];
  const wallCount = room.walls.length;
  const windowCount = room.windows.length;
  const doorCount = room.doors.length;
  const deskCount = room.furniture.filter((item) => isDeskType(item.type)).length;
  const furnitureCount = room.furniture.filter((item) => !isDeskType(item.type)).length;

  notes.push(
    isFallback
      ? "Automatic vision analysis did not complete, so WorkspaceIQ created a starter room you can edit manually."
      : `Estimated room size is ${room.estimated_width_m}m by ${room.estimated_height_m}m.`
  );
  notes.push(`${wallCount} wall segment(s), ${windowCount} window(s), ${doorCount} door(s), ${deskCount} detected desk(s), and ${furnitureCount} other object(s) were mapped.`);

  if (deskCount > 0) {
    notes.push("Detected desks are added directly into the editable floor plan so you can adjust the existing layout before generating a new one.");
  }

  if (windowCount === 0) {
    notes.push("No windows were confidently detected, so daylight scoring may be conservative until you add them.");
  }

  return notes;
}
