import { canonicalizeObjectType, isDeskType } from "./objectCatalog.js";
import { getWallBounds, normalizeWallGraph, pointInPolygon } from "./roomGeometry.js";

export const ZONE_DEFINITIONS = {
  focus: {
    label: "Focus zone",
    cloudColor: "rgba(87, 132, 255, 0.22)",
    markerColor: "#3b5dd8",
    popupColor: "#eef2ff",
    description: "A low-noise work area for heads-down tasks, privacy, and stable concentration."
  },
  collaboration: {
    label: "Collaboration zone",
    cloudColor: "rgba(255, 176, 59, 0.22)",
    markerColor: "#c76f16",
    popupColor: "#fff2dc",
    description: "An open team area for shared discussion, meetings, and visible interaction."
  },
  social: {
    label: "Social zone",
    cloudColor: "rgba(112, 196, 147, 0.3)",
    markerColor: "#2d8b5f",
    popupColor: "#e9f7ef",
    description: "A casual seating area for informal conversation, waiting, and lighter social energy."
  },
  rest: {
    label: "Rest zone",
    cloudColor: "rgba(172, 134, 229, 0.2)",
    markerColor: "#8b5cc7",
    popupColor: "#f2ebfc",
    description: "A quiet reset area for wellbeing, decompression, and lower-intensity use."
  },
  utility: {
    label: "Utility zone",
    cloudColor: "rgba(125, 143, 163, 0.2)",
    markerColor: "#526377",
    popupColor: "#edf1f5",
    description: "A support area for practical functions like bathrooms, storage, printers, or waste."
  }
};

const ZONE_TYPE_ORDER = ["focus", "collaboration", "social", "rest", "utility"];
const UTILITY_TYPES = new Set(["toilet", "sink", "shower", "trashcan", "filing_cabinet", "fridge", "kitchenette"]);
const COLLAB_TYPES = new Set(["meeting_table", "table", "whiteboard"]);
const LOUNGE_TYPES = new Set(["armchair", "couch", "plant"]);
const SOCIAL_SUPPORT_TYPES = new Set(["chair", "table", "plant"]);
const SPACE_GRID_SIZE = 72;
const SPACE_MIN_CELLS = 10;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function average(values, fallback = 0) {
  if (!Array.isArray(values) || !values.length) {
    return fallback;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roomItems(room) {
  return [
    ...(Array.isArray(room?.desks) ? room.desks.map((item, index) => ({ ...item, collection: "desks", index })) : []),
    ...(Array.isArray(room?.furniture) ? room.furniture.map((item, index) => ({ ...item, collection: "furniture", index })) : [])
  ];
}

function getOuterPolygon(room) {
  const graph = normalizeWallGraph(room?.walls || []);
  return {
    walls: graph.walls.length ? graph.walls : Array.isArray(room?.walls) ? room.walls : [],
    outerPolygon: graph.outerPolygon
  };
}

function getPercentBounds(room) {
  const { walls, outerPolygon } = getOuterPolygon(room);
  const points = Array.isArray(outerPolygon) && outerPolygon.length >= 3
    ? outerPolygon
    : walls.flatMap((wall) => [
        { x: wall.x1_percent, y: wall.y1_percent },
        { x: wall.x2_percent, y: wall.y2_percent }
      ]);

  if (!points.length) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function percentToGrid(point, bounds, gridWidth, gridHeight) {
  return {
    x: clamp(
      Math.round(((point.x - bounds.minX) / Math.max(bounds.maxX - bounds.minX, 0.0001)) * (gridWidth - 1)),
      0,
      gridWidth - 1
    ),
    y: clamp(
      Math.round(((point.y - bounds.minY) / Math.max(bounds.maxY - bounds.minY, 0.0001)) * (gridHeight - 1)),
      0,
      gridHeight - 1
    )
  };
}

function gridToPercent(cellX, cellY, bounds, gridWidth, gridHeight) {
  return {
    x: bounds.minX + (cellX / Math.max(gridWidth - 1, 1)) * (bounds.maxX - bounds.minX),
    y: bounds.minY + (cellY / Math.max(gridHeight - 1, 1)) * (bounds.maxY - bounds.minY)
  };
}

function markWallCells(blocked, wall, bounds, gridWidth, gridHeight) {
  const start = percentToGrid({ x: wall.x1_percent, y: wall.y1_percent }, bounds, gridWidth, gridHeight);
  const end = percentToGrid({ x: wall.x2_percent, y: wall.y2_percent }, bounds, gridWidth, gridHeight);
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), 1);
  const thickness = 1;

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(start.x + ((end.x - start.x) * step) / steps);
    const y = Math.round(start.y + ((end.y - start.y) * step) / steps);

    for (let offsetY = -thickness; offsetY <= thickness; offsetY += 1) {
      for (let offsetX = -thickness; offsetX <= thickness; offsetX += 1) {
        const tx = x + offsetX;
        const ty = y + offsetY;
        if (tx >= 0 && tx < gridWidth && ty >= 0 && ty < gridHeight) {
          blocked[ty][tx] = true;
        }
      }
    }
  }
}

function buildSpaceGrid(room) {
  const { walls, outerPolygon } = getOuterPolygon(room);
  const bounds = getPercentBounds(room);
  const width = SPACE_GRID_SIZE;
  const height = SPACE_GRID_SIZE;
  const blocked = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const inside = Array.from({ length: height }, () => Array.from({ length: width }, () => true));

  if (Array.isArray(outerPolygon) && outerPolygon.length >= 3) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const point = gridToPercent(x, y, bounds, width, height);
        inside[y][x] = pointInPolygon(point, outerPolygon);
      }
    }
  }

  walls.forEach((wall) => markWallCells(blocked, wall, bounds, width, height));

  return { width, height, bounds, blocked, inside };
}

function floodFillSpaces(room) {
  const grid = buildSpaceGrid(room);
  const { width, height, bounds, blocked, inside } = grid;
  const visited = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const spaces = [];
  let nextSpaceIndex = 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (visited[y][x] || blocked[y][x] || !inside[y][x]) {
        continue;
      }

      const queue = [{ x, y }];
      visited[y][x] = true;
      const cells = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (queue.length) {
        const cell = queue.shift();
        cells.push(cell);
        minX = Math.min(minX, cell.x);
        maxX = Math.max(maxX, cell.x);
        minY = Math.min(minY, cell.y);
        maxY = Math.max(maxY, cell.y);

        const neighbors = [
          { x: cell.x + 1, y: cell.y },
          { x: cell.x - 1, y: cell.y },
          { x: cell.x, y: cell.y + 1 },
          { x: cell.x, y: cell.y - 1 }
        ];

        neighbors.forEach((neighbor) => {
          if (
            neighbor.x < 0 ||
            neighbor.x >= width ||
            neighbor.y < 0 ||
            neighbor.y >= height ||
            visited[neighbor.y][neighbor.x] ||
            blocked[neighbor.y][neighbor.x] ||
            !inside[neighbor.y][neighbor.x]
          ) {
            return;
          }

          visited[neighbor.y][neighbor.x] = true;
          queue.push(neighbor);
        });
      }

      if (cells.length < SPACE_MIN_CELLS) {
        continue;
      }

      const centerCell = {
        x: average(cells.map((cell) => cell.x), x),
        y: average(cells.map((cell) => cell.y), y)
      };
      const topLeft = gridToPercent(minX, minY, bounds, width, height);
      const bottomRight = gridToPercent(maxX, maxY, bounds, width, height);
      const center = gridToPercent(centerCell.x, centerCell.y, bounds, width, height);

      spaces.push({
        id: `space-${nextSpaceIndex}`,
        index: nextSpaceIndex - 1,
        cells,
        bounds: {
          minX: topLeft.x,
          minY: topLeft.y,
          maxX: bottomRight.x,
          maxY: bottomRight.y
        },
        center
      });
      nextSpaceIndex += 1;
    }
  }

  return {
    spaces: spaces.length
      ? spaces
      : [{
          id: "space-1",
          index: 0,
          cells: [],
          bounds,
          center: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
        }],
    grid
  };
}

function locateSpaceForPoint(point, subdivision) {
  const { spaces, grid } = subdivision;
  if (!spaces.length) {
    return null;
  }

  const gridPoint = percentToGrid(point, grid.bounds, grid.width, grid.height);
  const containing = spaces.find((space) => (
    gridPoint.x >= percentToGrid({ x: space.bounds.minX, y: 0 }, grid.bounds, grid.width, grid.height).x &&
    gridPoint.x <= percentToGrid({ x: space.bounds.maxX, y: 0 }, grid.bounds, grid.width, grid.height).x &&
    gridPoint.y >= percentToGrid({ x: 0, y: space.bounds.minY }, grid.bounds, grid.width, grid.height).y &&
    gridPoint.y <= percentToGrid({ x: 0, y: space.bounds.maxY }, grid.bounds, grid.width, grid.height).y
  ));

  return containing || spaces[0];
}

function getItemPoint(item) {
  return {
    x: Number(item?.x_percent) || 0,
    y: Number(item?.y_percent) || 0
  };
}

function groupNearbyItems(items, threshold) {
  const remaining = [...items];
  const groups = [];

  while (remaining.length) {
    const seed = remaining.shift();
    const group = [seed];
    let changed = true;

    while (changed) {
      changed = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        const closeToGroup = group.some((member) => distance(getItemPoint(member), getItemPoint(candidate)) <= threshold);
        if (closeToGroup) {
          group.push(candidate);
          remaining.splice(index, 1);
          changed = true;
        }
      }
    }

    groups.push(group);
  }

  return groups;
}

function inferChairRole(item, roomItemsByType) {
  const point = getItemPoint(item);
  const nearDesk = roomItemsByType.desks.some((desk) => distance(point, getItemPoint(desk)) <= 12);
  if (nearDesk) {
    return null;
  }

  const nearCollaborativeAnchor = roomItemsByType.collaboration.some((other) => distance(point, getItemPoint(other)) <= 18);
  if (nearCollaborativeAnchor) {
    return "collaboration";
  }

  return "social";
}

function createZoneFromMembers(space, inferredType, members, room, overrides) {
  if (!members.length) {
    return null;
  }

  const xs = members.map((item) => getItemPoint(item).x);
  const ys = members.map((item) => getItemPoint(item).y);
  const center = {
    x: average(xs, space.center.x),
    y: average(ys, space.center.y)
  };
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  const paddingX = inferredType === "collaboration" ? 14 : inferredType === "social" ? 13 : inferredType === "focus" ? 12 : 10;
  const paddingY = inferredType === "collaboration" ? 12 : inferredType === "social" ? 11 : inferredType === "focus" ? 10 : 9;
  const rx = clamp(Math.max(10, spreadX / 2 + paddingX), 9, Math.max(12, (space.bounds.maxX - space.bounds.minX) / 2));
  const ry = clamp(Math.max(8, spreadY / 2 + paddingY), 8, Math.max(10, (space.bounds.maxY - space.bounds.minY) / 2));
  const memberSignature = members
    .map((item) => `${item.collection}:${item.index}`)
    .sort()
    .join("-");
  const id = `${space.id}-${memberSignature || inferredType}`;
  const finalType = overrides?.[id] || inferredType;
  const definition = ZONE_DEFINITIONS[finalType];

  return {
    id,
    spaceId: space.id,
    inferredType,
    type: finalType,
    label: definition.label,
    description: definition.description,
    cloudColor: definition.cloudColor,
    markerColor: definition.markerColor,
    popupColor: definition.popupColor,
    center,
    radiusX: rx,
    radiusY: ry,
    spaceBounds: space.bounds,
    members: members.map((item) => ({
      id: `${item.collection}:${item.index}`,
      type: canonicalizeObjectType(item.type),
      collection: item.collection,
      index: item.index
    }))
  };
}

function inferZonesForSpace(space, items, room, overrides) {
  const byType = {
    desks: items.filter((item) => isDeskType(item.type)),
    collaboration: items.filter((item) => COLLAB_TYPES.has(canonicalizeObjectType(item.type))),
    utility: items.filter((item) => UTILITY_TYPES.has(canonicalizeObjectType(item.type))),
    lounge: items.filter((item) => LOUNGE_TYPES.has(canonicalizeObjectType(item.type))),
    chairs: items.filter((item) => canonicalizeObjectType(item.type) === "chair")
  };

  const zones = [];

  groupNearbyItems(byType.desks, 22).forEach((group) => {
    const zone = createZoneFromMembers(space, "focus", group, room, overrides);
    if (zone) {
      zones.push(zone);
    }
  });

  const collabCandidates = [
    ...byType.collaboration,
    ...byType.chairs.filter((item) => inferChairRole(item, byType) === "collaboration")
  ];
  groupNearbyItems(collabCandidates, 24).forEach((group) => {
    if (group.some((item) => COLLAB_TYPES.has(canonicalizeObjectType(item.type)))) {
      const zone = createZoneFromMembers(space, "collaboration", group, room, overrides);
      if (zone) {
        zones.push(zone);
      }
    }
  });

  groupNearbyItems(byType.utility, 20).forEach((group) => {
    const zone = createZoneFromMembers(space, "utility", group, room, overrides);
    if (zone) {
      zones.push(zone);
    }
  });

  const socialChairs = byType.chairs.filter((item) => inferChairRole(item, byType) === "social");
  const loungeCandidates = [...byType.lounge, ...socialChairs];
  groupNearbyItems(loungeCandidates, 18).forEach((group) => {
    const hasTable = group.some((item) => canonicalizeObjectType(item.type) === "table");
    const hasCouch = group.some((item) => canonicalizeObjectType(item.type) === "couch");
    const armchairs = group.filter((item) => canonicalizeObjectType(item.type) === "armchair").length;
    const plants = group.filter((item) => canonicalizeObjectType(item.type) === "plant").length;
    const type = hasCouch || hasTable || armchairs > 1 ? "social" : armchairs >= 1 || plants >= 1 ? "rest" : null;
    if (!type) {
      return;
    }
    const zone = createZoneFromMembers(space, type, group, room, overrides);
    if (zone) {
      zones.push(zone);
    }
  });

  return zones;
}

export function inferZones(room) {
  const subdivision = floodFillSpaces(room);
  const items = roomItems(room);
  const overrides = room?.zoneOverrides && typeof room.zoneOverrides === "object" ? room.zoneOverrides : {};
  const itemsBySpace = new Map(subdivision.spaces.map((space) => [space.id, []]));

  items.forEach((item) => {
    const space = locateSpaceForPoint(getItemPoint(item), subdivision);
    itemsBySpace.get(space?.id || subdivision.spaces[0].id)?.push(item);
  });

  const zones = subdivision.spaces.flatMap((space) => inferZonesForSpace(space, itemsBySpace.get(space.id) || [], room, overrides));
  const typeCounts = ZONE_TYPE_ORDER.reduce((accumulator, type) => {
    accumulator[type] = zones.filter((zone) => zone.type === type).length;
    return accumulator;
  }, {});

  return {
    spaces: subdivision.spaces,
    zones,
    counts: typeCounts
  };
}

const ZONE_NOISE_BASE = {
  focus: 0.12,
  collaboration: 0.82,
  social: 0.6,
  rest: 0.18,
  utility: 0.45
};

const ZONE_COMPATIBILITY = {
  focus: { focus: 0.9, collaboration: 0.18, social: 0.26, rest: 0.72, utility: 0.36 },
  collaboration: { focus: 0.18, collaboration: 0.88, social: 0.8, rest: 0.4, utility: 0.62 },
  social: { focus: 0.26, collaboration: 0.8, social: 0.82, rest: 0.45, utility: 0.58 },
  rest: { focus: 0.72, collaboration: 0.4, social: 0.45, rest: 0.92, utility: 0.7 },
  utility: { focus: 0.36, collaboration: 0.62, social: 0.58, rest: 0.7, utility: 0.78 }
};

export function summarizeZoneImpact(zoneAnalysis, preferences = {}) {
  const zones = Array.isArray(zoneAnalysis?.zones) ? zoneAnalysis.zones : [];
  if (!zones.length) {
    return {
      quality: 0.55,
      summary: "No clear work zones were detected yet, so zoning is being scored conservatively.",
      details: ["Add more desks, shared anchors, or utility objects to infer focus, collaboration, and support areas."],
      metrics: {
        separationQuality: 0.55,
        opennessQuality: 0.55,
        noiseQuality: 0.55
      }
    };
  }

  const pairScores = [];
  const noiseScores = [];
  const opennessScores = [];

  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const sameSpaceZones = zones.filter((candidate) => candidate.spaceId === zone.spaceId && candidate.id !== zone.id);
    const nearestDistance = sameSpaceZones.length
      ? Math.min(...sameSpaceZones.map((candidate) => distance(zone.center, candidate.center)))
      : 40;

    const desiredOpen = zone.type === "collaboration" || zone.type === "social";
    const opennessScore = desiredOpen
      ? clamp(nearestDistance / 24, 0, 1)
      : clamp((32 - nearestDistance) / 24, 0, 1);
    opennessScores.push(opennessScore);

    const nearbyNoise = sameSpaceZones.reduce((worst, candidate) => {
      const closeness = clamp((32 - distance(zone.center, candidate.center)) / 32, 0, 1);
      return Math.max(worst, ZONE_NOISE_BASE[candidate.type] * closeness);
    }, 0);

    const idealNoise = zone.type === "focus" ? 0.18 : zone.type === "rest" ? 0.22 : zone.type === "collaboration" ? 0.7 : zone.type === "social" ? 0.58 : 0.52;
    noiseScores.push(1 - clamp(Math.abs(nearbyNoise - idealNoise), 0, 1));

    for (let otherIndex = index + 1; otherIndex < zones.length; otherIndex += 1) {
      const other = zones[otherIndex];
      if (other.spaceId !== zone.spaceId) {
        continue;
      }
      const closeness = clamp((36 - distance(zone.center, other.center)) / 36, 0, 1);
      const compatibility = ZONE_COMPATIBILITY[zone.type]?.[other.type] ?? 0.6;
      pairScores.push(closeness * compatibility + (1 - closeness) * 0.72);
    }
  }

  const separationQuality = average(pairScores, 0.76);
  const opennessQuality = average(opennessScores, 0.7);
  const noiseQuality = average(noiseScores, 0.68);
  let quality = clamp(separationQuality * 0.45 + opennessQuality * 0.25 + noiseQuality * 0.3, 0, 1);

  if ((preferences?.workStyle || "balanced") === "focus") {
    quality = clamp(quality * 0.7 + noiseQuality * 0.3, 0, 1);
  } else if ((preferences?.workStyle || "balanced") === "collaborative") {
    quality = clamp(quality * 0.7 + opennessQuality * 0.3, 0, 1);
  }

  const details = [
    `${zoneAnalysis.counts.focus || 0} focus zone(s), ${zoneAnalysis.counts.collaboration || 0} collaboration zone(s), ${zoneAnalysis.counts.social || 0} social zone(s), ${zoneAnalysis.counts.rest || 0} rest zone(s), and ${zoneAnalysis.counts.utility || 0} utility zone(s) were inferred.`,
    `Noise compatibility is ${Math.round(noiseQuality * 100)}%, adjacency/separation is ${Math.round(separationQuality * 100)}%, and circulation fit is ${Math.round(opennessQuality * 100)}%.`
  ];

  return {
    quality,
    summary: `Zones are currently balancing noise, adjacency, and circulation at ${Math.round(quality * 100)}% effectiveness.`,
    details,
    metrics: {
      separationQuality,
      opennessQuality,
      noiseQuality
    }
  };
}

export function getZoneDefinition(type) {
  return ZONE_DEFINITIONS[type] || ZONE_DEFINITIONS.focus;
}

export function getZoneTypeOptions() {
  return ZONE_TYPE_ORDER.map((type) => ({
    value: type,
    label: ZONE_DEFINITIONS[type].label
  }));
}
