const SNAP_TOLERANCE_PERCENT = 3;
const MIN_WALL_LENGTH_PERCENT = 5;
const DEFAULT_OPENING_WIDTH_PERCENT = 10;
const ELLIPSE_SEGMENTS = 12;
const WALL_ANGLE_INCREMENT_DEGREES = 45;
const OPENING_WALL_BIAS = 0.75;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
}

function distanceBetweenPoints(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function roundPoint(point) {
  return {
    x: Number(point.x.toFixed(2)),
    y: Number(point.y.toFixed(2))
  };
}

function snapCoordinateToBorder(value, tolerance = SNAP_TOLERANCE_PERCENT) {
  if (value <= tolerance) {
    return 0;
  }
  if (value >= 100 - tolerance) {
    return 100;
  }
  return value;
}

function snapPointToBorder(point, tolerance = SNAP_TOLERANCE_PERCENT) {
  return {
    x: snapCoordinateToBorder(point.x, tolerance),
    y: snapCoordinateToBorder(point.y, tolerance)
  };
}

function lineLength(wall) {
  return Math.hypot(wall.x2_percent - wall.x1_percent, wall.y2_percent - wall.y1_percent);
}

function lineAngleDegrees(wall) {
  return normalizeRotation(
    (Math.atan2(wall.y2_percent - wall.y1_percent, wall.x2_percent - wall.x1_percent) * 180) / Math.PI
  );
}

function quantizeAngleDegrees(angle) {
  return normalizeRotation(
    Math.round(angle / WALL_ANGLE_INCREMENT_DEGREES) * WALL_ANGLE_INCREMENT_DEGREES
  );
}

function isBorderValue(value, tolerance = SNAP_TOLERANCE_PERCENT) {
  return value <= tolerance || value >= 100 - tolerance;
}

function pointKey(point) {
  return `${point.x.toFixed(2)}:${point.y.toFixed(2)}`;
}

function normalizeWallSegment(wall) {
  return {
    x1_percent: clampPercent(wall?.x1_percent),
    y1_percent: clampPercent(wall?.y1_percent),
    x2_percent: clampPercent(wall?.x2_percent),
    y2_percent: clampPercent(wall?.y2_percent)
  };
}

function quantizeWallAngle(wall) {
  const length = lineLength(wall);
  if (length < MIN_WALL_LENGTH_PERCENT) {
    return wall;
  }

  const centerX = (wall.x1_percent + wall.x2_percent) / 2;
  const centerY = (wall.y1_percent + wall.y2_percent) / 2;
  const angleRadians = (quantizeAngleDegrees(lineAngleDegrees(wall)) * Math.PI) / 180;
  const halfDx = Math.cos(angleRadians) * (length / 2);
  const halfDy = Math.sin(angleRadians) * (length / 2);

  return {
    x1_percent: clampPercent(centerX - halfDx),
    y1_percent: clampPercent(centerY - halfDy),
    x2_percent: clampPercent(centerX + halfDx),
    y2_percent: clampPercent(centerY + halfDy)
  };
}

function nodePriority(node) {
  if (!node) {
    return 0;
  }

  let priority = 0;
  if (node.isBorderNode) {
    priority += 2;
  }
  if (node.count > 1) {
    priority += 1;
  }
  return priority;
}

function updateNodePosition(node, point, tolerance = SNAP_TOLERANCE_PERCENT) {
  const snapped = snapPointToBorder(point, tolerance);
  node.x = clampPercent(snapped.x);
  node.y = clampPercent(snapped.y);
  node.isBorderNode = isBorderValue(node.x, tolerance) || isBorderValue(node.y, tolerance);
}

function quantizeWallNodePair(startNode, endNode, tolerance = SNAP_TOLERANCE_PERCENT) {
  const wall = {
    x1_percent: startNode.x,
    y1_percent: startNode.y,
    x2_percent: endNode.x,
    y2_percent: endNode.y
  };
  const length = lineLength(wall);
  if (length < MIN_WALL_LENGTH_PERCENT) {
    return;
  }

  const angleRadians = (quantizeAngleDegrees(lineAngleDegrees(wall)) * Math.PI) / 180;
  const dx = Math.cos(angleRadians) * length;
  const dy = Math.sin(angleRadians) * length;
  const startPriority = nodePriority(startNode);
  const endPriority = nodePriority(endNode);

  if (startPriority > endPriority) {
    updateNodePosition(
      endNode,
      {
        x: startNode.x + dx,
        y: startNode.y + dy
      },
      tolerance
    );
    return;
  }

  if (endPriority > startPriority) {
    updateNodePosition(
      startNode,
      {
        x: endNode.x - dx,
        y: endNode.y - dy
      },
      tolerance
    );
    return;
  }

  const centerX = (startNode.x + endNode.x) / 2;
  const centerY = (startNode.y + endNode.y) / 2;
  updateNodePosition(
    startNode,
    {
      x: centerX - dx / 2,
      y: centerY - dy / 2
    },
    tolerance
  );
  updateNodePosition(
    endNode,
    {
      x: centerX + dx / 2,
      y: centerY + dy / 2
    },
    tolerance
  );
}

function dedupeWalls(walls) {
  const unique = [];

  for (const wall of walls) {
    const duplicate = unique.some((existing) => {
      const sameDirection =
        Math.abs(existing.x1_percent - wall.x1_percent) <= 0.6 &&
        Math.abs(existing.y1_percent - wall.y1_percent) <= 0.6 &&
        Math.abs(existing.x2_percent - wall.x2_percent) <= 0.6 &&
        Math.abs(existing.y2_percent - wall.y2_percent) <= 0.6;
      const reversed =
        Math.abs(existing.x1_percent - wall.x2_percent) <= 0.6 &&
        Math.abs(existing.y1_percent - wall.y2_percent) <= 0.6 &&
        Math.abs(existing.x2_percent - wall.x1_percent) <= 0.6 &&
        Math.abs(existing.y2_percent - wall.y1_percent) <= 0.6;
      return sameDirection || reversed;
    });

    if (!duplicate) {
      unique.push(wall);
    }
  }

  return unique;
}

function buildConnectedComponents(adjacency, nodeKeys) {
  const visited = new Set();
  let components = 0;

  for (const key of nodeKeys) {
    if (visited.has(key)) {
      continue;
    }

    components += 1;
    const stack = [key];
    visited.add(key);

    while (stack.length) {
      const current = stack.pop();
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
  }

  return components;
}

function buildOuterPolygon(walls, adjacency, nodesByKey) {
  const nodeKeys = [...nodesByKey.keys()];
  if (!nodeKeys.length || nodeKeys.some((key) => (adjacency.get(key) || []).size !== 2)) {
    return null;
  }

  const polygon = [];
  const startKey = nodeKeys[0];
  let currentKey = startKey;
  let previousKey = null;

  while (true) {
    polygon.push(nodesByKey.get(currentKey));
    const neighbors = [...(adjacency.get(currentKey) || [])];
    const nextKey = neighbors.find((neighbor) => neighbor !== previousKey);
    if (!nextKey) {
      return null;
    }
    previousKey = currentKey;
    currentKey = nextKey;
    if (currentKey === startKey) {
      break;
    }
    if (polygon.length > walls.length + 2) {
      return null;
    }
  }

  return polygon.map(roundPoint);
}

export function normalizeWallGraph(rawWalls, tolerance = SNAP_TOLERANCE_PERCENT) {
  const safeWalls = Array.isArray(rawWalls) ? rawWalls.map(normalizeWallSegment) : [];
  const nodes = [];

  function assignNode(point, pool = nodes) {
    const existing = pool.find((node) => distanceBetweenPoints(node, point) <= tolerance);
    if (existing) {
      existing.x = (existing.x * existing.count + point.x) / (existing.count + 1);
      existing.y = (existing.y * existing.count + point.y) / (existing.count + 1);
      existing.count += 1;
      return existing;
    }

    const created = { x: point.x, y: point.y, count: 1, isBorderNode: false };
    pool.push(created);
    return created;
  }

  const wallNodes = safeWalls.map((wall) => ({
    startNode: assignNode({ x: wall.x1_percent, y: wall.y1_percent }),
    endNode: assignNode({ x: wall.x2_percent, y: wall.y2_percent })
  }));

  nodes.forEach((node) => {
    updateNodePosition(node, node, tolerance);
  });

  wallNodes.forEach(({ startNode, endNode }) => {
    quantizeWallNodePair(startNode, endNode, tolerance);
  });

  const connectedWalls = dedupeWalls(
    wallNodes
      .map(({ startNode, endNode }) => ({
        x1_percent: clampPercent(startNode.x),
        y1_percent: clampPercent(startNode.y),
        x2_percent: clampPercent(endNode.x),
        y2_percent: clampPercent(endNode.y)
      }))
      .filter((wall) => lineLength(wall) >= MIN_WALL_LENGTH_PERCENT)
  );

  const nodesByKey = new Map();
  const adjacency = new Map();

  for (const wall of connectedWalls) {
    const start = roundPoint({ x: wall.x1_percent, y: wall.y1_percent });
    const end = roundPoint({ x: wall.x2_percent, y: wall.y2_percent });
    const startKey = pointKey(start);
    const endKey = pointKey(end);
    nodesByKey.set(startKey, start);
    nodesByKey.set(endKey, end);
    adjacency.set(startKey, adjacency.get(startKey) || new Set());
    adjacency.set(endKey, adjacency.get(endKey) || new Set());
    adjacency.get(startKey).add(endKey);
    adjacency.get(endKey).add(startKey);
  }

  const nodeKeys = [...nodesByKey.keys()];
  const danglingNodes = nodeKeys.filter((key) => (adjacency.get(key) || new Set()).size < 2);
  const components = buildConnectedComponents(adjacency, nodeKeys);
  const outerPolygon = buildOuterPolygon(connectedWalls, adjacency, nodesByKey);
  const issues = [];

  if (components > 1) {
    issues.push("Some walls are disconnected from the main floor plan.");
  }
  if (danglingNodes.length) {
    issues.push("Some wall endpoints do not meet another wall cleanly.");
  }
  if (!outerPolygon) {
    issues.push("The wall outline is not yet a clean closed loop.");
  }

  return {
    walls: connectedWalls,
    nodes: nodeKeys.map((key) => nodesByKey.get(key)),
    issues,
    isValid: issues.length === 0,
    outerPolygon
  };
}

export function getWallBounds(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: wall.x1_percent, y: wall.y1_percent },
        { x: wall.x2_percent, y: wall.y2_percent }
      ])
    : [];

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: xs.length ? Math.min(...xs) : 0,
    maxX: xs.length ? Math.max(...xs) : 100,
    minY: ys.length ? Math.min(...ys) : 0,
    maxY: ys.length ? Math.max(...ys) : 100
  };
}

export function projectPointOntoWall(point, wall) {
  const ax = wall.x1_percent;
  const ay = wall.y1_percent;
  const bx = wall.x2_percent;
  const by = wall.y2_percent;
  const abx = bx - ax;
  const aby = by - ay;
  const denominator = abx * abx + aby * aby || 1;
  const rawT = ((point.x - ax) * abx + (point.y - ay) * aby) / denominator;
  const t = Math.max(0, Math.min(1, rawT));
  const projected = {
    x: ax + abx * t,
    y: ay + aby * t
  };

  return {
    point: projected,
    distance: distanceBetweenPoints(projected, point),
    positionPercent: t * 100
  };
}

function edgeItemAnchorPoint(item, walls) {
  const safeWalls = Array.isArray(walls) ? walls : [];
  if (item && item.x_percent != null && item.y_percent != null) {
    return {
      x: clampPercent(item.x_percent),
      y: clampPercent(item.y_percent)
    };
  }

  if (!safeWalls.length) {
    return {
      x: 50,
      y: 50
    };
  }

  const wallIndex = Math.max(0, Math.min(safeWalls.length - 1, Number(item?.wall_index) || 0));
  const wall = safeWalls[wallIndex];
  const ratio = clampPercent(item?.position_percent ?? 50) / 100;
  return {
    x: clampPercent(wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio),
    y: clampPercent(wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio)
  };
}

export function snapEdgeItemToWalls(item, walls, widthPercent = DEFAULT_OPENING_WIDTH_PERCENT) {
  const safeWalls = Array.isArray(walls) ? walls : [];
  if (!safeWalls.length) {
    return {
      x_percent: 50,
      y_percent: 50,
      rotation_deg: 0,
      wall_index: 0,
      position_percent: 50
    };
  }

  const target = edgeItemAnchorPoint(item, safeWalls);
  const preferredWallIndex = Number.isInteger(Number(item?.wall_index)) ? Number(item.wall_index) : -1;

  let best = null;
  safeWalls.forEach((wall, wallIndex) => {
    const projection = projectPointOntoWall(target, wall);
    const weightedDistance =
      projection.distance - (wallIndex === preferredWallIndex ? OPENING_WALL_BIAS : 0);
    if (!best || weightedDistance < best.weightedDistance) {
      best = { ...projection, wall, wallIndex, weightedDistance };
    }
  });

  const wallLengthPercent = Math.max(lineLength(best.wall), widthPercent);
  const halfSpanPercent = Math.min(49, (widthPercent / wallLengthPercent) * 50);
  const clampedPosition = Number(
    Math.max(halfSpanPercent, Math.min(100 - halfSpanPercent, best.positionPercent)).toFixed(2)
  );
  const t = clampedPosition / 100;

  return {
    ...item,
    x_percent: Number(
      clampPercent(best.wall.x1_percent + (best.wall.x2_percent - best.wall.x1_percent) * t).toFixed(2)
    ),
    y_percent: Number(
      clampPercent(best.wall.y1_percent + (best.wall.y2_percent - best.wall.y1_percent) * t).toFixed(2)
    ),
    rotation_deg: lineAngleDegrees(best.wall),
    wall_index: best.wallIndex,
    position_percent: clampedPosition
  };
}

function rotateLocalPoint(point, rotationDeg) {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

export function getItemFootprint(item) {
  const width = Number(item?.width_percent) || 0;
  const height = Number(item?.height_percent) || 0;
  const rotation = normalizeRotation(item?.rotation_deg);

  let localPoints;
  if (item?.shape_kind === "polygon" && Array.isArray(item?.footprint_points) && item.footprint_points.length >= 3) {
    localPoints = item.footprint_points.map((point) => ({
      x: (point.x_percent / 100) * width,
      y: (point.y_percent / 100) * height
    }));
  } else if (item?.shape_kind === "ellipse") {
    localPoints = Array.from({ length: ELLIPSE_SEGMENTS }).map((_, index) => {
      const angle = (Math.PI * 2 * index) / ELLIPSE_SEGMENTS;
      return {
        x: Math.cos(angle) * width * 0.5,
        y: Math.sin(angle) * height * 0.5
      };
    });
  } else {
    localPoints = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 }
    ];
  }

  return localPoints.map((point) => {
    const rotated = rotateLocalPoint(point, rotation);
    return {
      x: clampPercent((Number(item?.x_percent) || 0) + rotated.x),
      y: clampPercent((Number(item?.y_percent) || 0) + rotated.y)
    };
  });
}

function pointOnSegment(point, start, end) {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.0001) {
    return false;
  }

  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) {
    return false;
  }

  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= squaredLength;
}

function segmentsIntersect(a1, a2, b1, b2) {
  function orientation(p, q, r) {
    return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  }

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if ((o1 > 0 && o2 < 0 || o1 < 0 && o2 > 0) && (o3 > 0 && o4 < 0 || o3 < 0 && o4 > 0)) {
    return true;
  }

  if (Math.abs(o1) <= 0.0001 && pointOnSegment(b1, a1, a2)) {
    return true;
  }
  if (Math.abs(o2) <= 0.0001 && pointOnSegment(b2, a1, a2)) {
    return true;
  }
  if (Math.abs(o3) <= 0.0001 && pointOnSegment(a1, b1, b2)) {
    return true;
  }
  if (Math.abs(o4) <= 0.0001 && pointOnSegment(a2, b1, b2)) {
    return true;
  }

  return false;
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (!denominator) {
    return distanceBetweenPoints(point, start);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator));
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t
  };

  return distanceBetweenPoints(point, closest);
}

export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];

    if (pointOnSegment(point, prior, current)) {
      return true;
    }

    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / ((prior.y - current.y) || 0.000001) + current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonsIntersect(polygonA, polygonB) {
  if (!Array.isArray(polygonA) || !Array.isArray(polygonB) || polygonA.length < 3 || polygonB.length < 3) {
    return false;
  }

  for (let indexA = 0; indexA < polygonA.length; indexA += 1) {
    const nextA = polygonA[(indexA + 1) % polygonA.length];
    for (let indexB = 0; indexB < polygonB.length; indexB += 1) {
      const nextB = polygonB[(indexB + 1) % polygonB.length];
      if (segmentsIntersect(polygonA[indexA], nextA, polygonB[indexB], nextB)) {
        return true;
      }
    }
  }

  return pointInPolygon(polygonA[0], polygonB) || pointInPolygon(polygonB[0], polygonA);
}

function footprintIntersectsWalls(footprint, walls, tolerance = 0.35) {
  if (!Array.isArray(footprint) || footprint.length < 3 || !Array.isArray(walls) || !walls.length) {
    return false;
  }

  for (const wall of walls) {
    const wallStart = { x: wall.x1_percent, y: wall.y1_percent };
    const wallEnd = { x: wall.x2_percent, y: wall.y2_percent };
    const wallMidpoint = {
      x: (wallStart.x + wallEnd.x) / 2,
      y: (wallStart.y + wallEnd.y) / 2
    };

    if (
      pointInPolygon(wallStart, footprint) ||
      pointInPolygon(wallEnd, footprint) ||
      pointInPolygon(wallMidpoint, footprint)
    ) {
      return true;
    }

    for (let index = 0; index < footprint.length; index += 1) {
      const next = footprint[(index + 1) % footprint.length];
      if (segmentsIntersect(footprint[index], next, wallStart, wallEnd)) {
        return true;
      }
    }

    if (footprint.some((point) => distancePointToSegment(point, wallStart, wallEnd) <= tolerance)) {
      return true;
    }
  }

  return false;
}

export function isPlacementValid(room, collectionType, index, nextItem) {
  const graph = normalizeWallGraph(room?.walls || []);
  const activeWalls = graph.walls.length ? graph.walls : room?.walls || [];
  const bounds = getWallBounds(activeWalls);
  const footprint = getItemFootprint(nextItem);

  const insideBounds = footprint.every(
    (point) =>
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
  );

  if (!insideBounds) {
    return false;
  }

  if (graph.outerPolygon && !footprint.every((point) => pointInPolygon(point, graph.outerPolygon))) {
    return false;
  }

  if (footprintIntersectsWalls(footprint, activeWalls)) {
    return false;
  }

  const collections = ["desks", "furniture"];
  for (const collectionName of collections) {
    const items = Array.isArray(room?.[collectionName]) ? room[collectionName] : [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      if (collectionName === collectionType && itemIndex === index) {
        continue;
      }
      if (polygonsIntersect(footprint, getItemFootprint(items[itemIndex]))) {
        return false;
      }
    }
  }

  return true;
}

export function findFirstFreeObjectPlacement(room, item, collectionType, excludedIndex = -1) {
  const graph = normalizeWallGraph(room?.walls || []);
  const bounds = getWallBounds(graph.walls.length ? graph.walls : room?.walls || []);
  const candidates = [];

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      candidates.push({
        x_percent: clampPercent(bounds.minX + 12 + column * 14),
        y_percent: clampPercent(bounds.minY + 12 + row * 14)
      });
    }
  }

  candidates.unshift({
    x_percent: clampPercent(item.x_percent),
    y_percent: clampPercent(item.y_percent)
  });

  return (
    candidates.find((candidate) =>
      isPlacementValid(room, collectionType, excludedIndex, {
        ...item,
        x_percent: candidate.x_percent,
        y_percent: candidate.y_percent
      })
    ) || {
      x_percent: clampPercent(item.x_percent),
      y_percent: clampPercent(item.y_percent)
    }
  );
}
