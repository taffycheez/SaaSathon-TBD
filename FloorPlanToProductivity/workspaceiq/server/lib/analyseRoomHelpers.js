import { canonicalizeObjectType, getObjectDefinition, isDeskType } from "./objectCatalog.js";

export const fallbackRoom = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [],
  doors: [],
  furniture: []
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function roundPercent(value) {
  return Math.round(value * 100) / 100;
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

function wallLength(wall) {
  return Math.hypot(wall.x2_percent - wall.x1_percent, wall.y2_percent - wall.y1_percent);
}

function dedupeWalls(walls) {
  if (!Array.isArray(walls)) {
    return [];
  }

  const unique = [];

  walls
    .map(normalizeWallSegment)
    .sort((a, b) => wallLength(b) - wallLength(a))
    .forEach((wall) => {
      const duplicate = unique.some((existing) => (
        Math.abs(wall.x1_percent - existing.x1_percent) <= 2 &&
        Math.abs(wall.y1_percent - existing.y1_percent) <= 2 &&
        Math.abs(wall.x2_percent - existing.x2_percent) <= 2 &&
        Math.abs(wall.y2_percent - existing.y2_percent) <= 2
      ) || (
        Math.abs(wall.x1_percent - existing.x2_percent) <= 2 &&
        Math.abs(wall.y1_percent - existing.y2_percent) <= 2 &&
        Math.abs(wall.x2_percent - existing.x1_percent) <= 2 &&
        Math.abs(wall.y2_percent - existing.y1_percent) <= 2
      ));

      if (!duplicate) {
        unique.push(wall);
      }
    });

  return unique;
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

export function pointOnWall(item, walls) {
  const wallIndex = item?.wall_index ?? normalizeLegacyWallToIndex(item?.wall);
  const hasWallPlacement = wallIndex != null && item?.position_percent != null;

  if (hasWallPlacement && Array.isArray(walls) && walls.length) {
    const wall = walls[clampIndex(wallIndex, walls.length - 1)];
    if (wall) {
      return wallPointAt(wall, clampPercent(item.position_percent) / 100);
    }
  }

  return {
    x: clampPercent(item?.x_percent ?? 50),
    y: clampPercent(item?.y_percent ?? 50)
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

export function normalizeEdgeItems(items, targetWalls, sourceWalls = targetWalls) {
  if (!Array.isArray(items)) {
    return [];
  }

  const walls = Array.isArray(targetWalls) && targetWalls.length ? targetWalls : fallbackRoom.walls;
  const source = Array.isArray(sourceWalls) && sourceWalls.length ? sourceWalls : walls;

  const normalized = items.map((item) => {
    const point = pointOnWall(item, source);
    const wall_index = nearestWallIndex(point, walls);

    return {
      wall_index,
      position_percent: positionPercentOnWall(point, walls[wall_index])
    };
  });

  return dedupeEdgeItems(normalized);
}

export function dedupeEdgeItems(items, tolerance = 8) {
  if (!Array.isArray(items)) {
    return [];
  }

  const sorted = [...items]
    .map((item) => ({
      wall_index: clampIndex(item?.wall_index, Number.MAX_SAFE_INTEGER),
      position_percent: clampPercent(item?.position_percent)
    }))
    .sort((a, b) => a.wall_index - b.wall_index || a.position_percent - b.position_percent);

  return sorted.filter((item, index) => {
    const previous = sorted[index - 1];
    if (!previous) {
      return true;
    }

    return !(
      previous.wall_index === item.wall_index &&
      Math.abs(previous.position_percent - item.position_percent) <= tolerance
    );
  });
}

export function normalizeRoomDescription(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const walls = Array.isArray(safePayload.walls) && safePayload.walls.length >= 2
    ? dedupeWalls(safePayload.walls)
    : fallbackRoom.walls.map(normalizeWallSegment);

  return {
    estimated_width_m: Math.max(1, Number(safePayload.estimated_width_m) || 8),
    estimated_height_m: Math.max(1, Number(safePayload.estimated_height_m) || 6),
    walls,
    windows: normalizeEdgeItems(safePayload.windows, walls, safePayload.walls),
    doors: normalizeEdgeItems(safePayload.doors, walls, safePayload.walls),
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

export function mergeRoomAnalyses(primaryAnalysis, secondaryAnalysis) {
  const primary = primaryAnalysis?.room ? primaryAnalysis : null;
  const secondary = secondaryAnalysis?.room ? secondaryAnalysis : null;
  const primaryRoom = primary ? normalizeRoomDescription(primary.room) : null;
  const secondaryRoom = secondary ? normalizeRoomDescription(secondary.room) : null;
  const mergedWalls = dedupeWalls([
    ...(Array.isArray(primaryRoom?.walls) ? primaryRoom.walls : []),
    ...(Array.isArray(secondaryRoom?.walls) ? secondaryRoom.walls : [])
  ]);
  const walls = mergedWalls.length >= 2 ? mergedWalls : fallbackRoom.walls.map(normalizeWallSegment);

  const windows = dedupeEdgeItems([
    ...normalizeEdgeItems(primaryRoom?.windows || [], walls, primaryRoom?.walls),
    ...normalizeEdgeItems(secondaryRoom?.windows || [], walls, secondaryRoom?.walls)
  ]);
  const doors = dedupeEdgeItems([
    ...normalizeEdgeItems(primaryRoom?.doors || [], walls, primaryRoom?.walls),
    ...normalizeEdgeItems(secondaryRoom?.doors || [], walls, secondaryRoom?.walls)
  ]);
  const furniture = Array.isArray(primaryRoom?.furniture) && primaryRoom.furniture.length
    ? primaryRoom.furniture
    : Array.isArray(secondaryRoom?.furniture)
      ? secondaryRoom.furniture
      : [];
  const isValidRoom = Boolean(primary?.is_valid_room || secondary?.is_valid_room || windows.length || doors.length || furniture.length || walls.length >= 2);
  const rejectionReason =
    isValidRoom
      ? ""
      : secondary?.rejection_reason || primary?.rejection_reason || "This image does not appear to show an office or room layout we can analyse.";

  return {
    is_valid_room: isValidRoom,
    rejection_reason: rejectionReason,
    room: {
      estimated_width_m: Math.max(
        1,
        Number(primaryRoom?.estimated_width_m) || Number(secondaryRoom?.estimated_width_m) || fallbackRoom.estimated_width_m
      ),
      estimated_height_m: Math.max(
        1,
        Number(primaryRoom?.estimated_height_m) || Number(secondaryRoom?.estimated_height_m) || fallbackRoom.estimated_height_m
      ),
      walls,
      windows,
      doors,
      furniture
    }
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
