export const fallbackRoom = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  windows: [
    { wall: "top", position_percent: 25 },
    { wall: "top", position_percent: 75 }
  ],
  doors: [{ wall: "left", position_percent: 70 }],
  furniture: []
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function normalizeWall(value) {
  const validWalls = ["top", "bottom", "left", "right"];
  return validWalls.includes(value) ? value : "top";
}

export function normalizeRoomDescription(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  return {
    estimated_width_m: Math.max(1, Number(safePayload.estimated_width_m) || 8),
    estimated_height_m: Math.max(1, Number(safePayload.estimated_height_m) || 6),
    windows: Array.isArray(safePayload.windows)
      ? safePayload.windows.map((item) => ({
          wall: normalizeWall(item?.wall),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    doors: Array.isArray(safePayload.doors)
      ? safePayload.doors.map((item) => ({
          wall: normalizeWall(item?.wall),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    furniture: Array.isArray(safePayload.furniture)
      ? safePayload.furniture.map((item) => ({
          type: typeof item?.type === "string" ? item.type : "furniture",
          x_percent: clampPercent(item?.x_percent),
          y_percent: clampPercent(item?.y_percent)
        }))
      : []
  };
}

export function buildRoomNotes(room, isFallback) {
  const notes = [];
  const windowCount = room.windows.length;
  const doorCount = room.doors.length;
  const furnitureCount = room.furniture.length;

  notes.push(
    isFallback
      ? "Automatic vision analysis did not complete, so WorkspaceIQ created a starter room you can edit manually."
      : `Estimated room size is ${room.estimated_width_m}m by ${room.estimated_height_m}m.`
  );
  notes.push(`${windowCount} window(s), ${doorCount} door(s), and ${furnitureCount} furniture item(s) were mapped.`);

  if (windowCount === 0) {
    notes.push("No windows were confidently detected, so daylight scoring may be conservative until you add them.");
  }

  return notes;
}
