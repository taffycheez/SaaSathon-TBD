function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
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

export function buildFallbackLayout(_room, numPeople, workStyle) {
  const deskCount = Math.max(1, Number(numPeople) || 1);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(deskCount))));
  const rows = Math.ceil(deskCount / columns);
  const desks = [];

  for (let index = 0; index < deskCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const xPercent = 18 + ((column + 0.5) * 64) / columns;
    const yPercent = 18 + ((row + 0.5) * 60) / Math.max(rows, 1);

    desks.push({
      x_percent: clampPercent(xPercent),
      y_percent: clampPercent(yPercent),
      rotation_deg: workStyle === "focus" ? 0 : column % 2 === 0 ? 90 : 0
    });
  }

  return desks;
}

export function buildLayoutNotes(desks, isFallback) {
  const notes = [];
  notes.push(
    isFallback
      ? "AI layout generation did not complete, so WorkspaceIQ created a basic evenly spaced desk plan."
      : `Generated ${desks.length} desk position(s) from the analysed room and preferences.`
  );
  notes.push("You can drag desks, rotate them, and adjust doors or windows before reviewing the score.");
  return notes;
}
