import { useMemo } from "react";
import { getObjectDefinition } from "@/lib/objectCatalog";
import { getScaledItemDimensions, normalizeWallGraph } from "@/lib/roomGeometry";

const VIEWBOX_WIDTH = 420;
const VIEWBOX_HEIGHT = 280;
const WALL_HEIGHT = 38;
const OBJECT_HEIGHT = 20;

function clampNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function getWallBounds(walls) {
  const points = Array.isArray(walls)
    ? walls.flatMap((wall) => [
        { x: clampNumber(wall?.x1_percent), y: clampNumber(wall?.y1_percent) },
        { x: clampNumber(wall?.x2_percent), y: clampNumber(wall?.y2_percent) }
      ])
    : [];

  if (!points.length) {
    return {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100
    };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y))
  };
}

function projectIsoPoint(x, y, z, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const normalizedX = (x - bounds.minX) / width;
  const normalizedY = (y - bounds.minY) / height;

  const worldX = (normalizedX - 0.5) * 210;
  const worldY = (normalizedY - 0.5) * 170;

  return {
    x: VIEWBOX_WIDTH / 2 + (worldX - worldY) * 0.86,
    y: VIEWBOX_HEIGHT / 2 + (worldX + worldY) * 0.36 - z
  };
}

function pointsToString(points) {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

function getExtrudedQuad(start, end, height, bounds) {
  const bottomStart = projectIsoPoint(start.x, start.y, 0, bounds);
  const bottomEnd = projectIsoPoint(end.x, end.y, 0, bounds);
  const topEnd = projectIsoPoint(end.x, end.y, height, bounds);
  const topStart = projectIsoPoint(start.x, start.y, height, bounds);

  return [bottomStart, bottomEnd, topEnd, topStart];
}

function getObjectFootprint(item) {
  const dimensions = getScaledItemDimensions(item);
  const halfWidth = dimensions.width_percent / 2;
  const halfHeight = dimensions.height_percent / 2;
  const rotation = ((clampNumber(item?.rotation_deg) % 360) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight }
  ];

  return corners.map((corner) => ({
    x: clampNumber(item?.x_percent, 50) + corner.x * cos - corner.y * sin,
    y: clampNumber(item?.y_percent, 50) + corner.x * sin + corner.y * cos
  }));
}

function shadeColor(hex, ratio) {
  const safe = hex.replace("#", "");
  const full = safe.length === 3 ? safe.split("").map((value) => value + value).join("") : safe;
  const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
  const adjusted = channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel * ratio))));
  return `rgb(${adjusted[0]}, ${adjusted[1]}, ${adjusted[2]})`;
}

export default function FloorPlanPreview3D({ room }) {
  const graph = useMemo(() => normalizeWallGraph(room?.walls || []), [room?.walls]);
  const walls = graph.walls.length ? graph.walls : Array.isArray(room?.walls) ? room.walls : [];
  const bounds = useMemo(() => getWallBounds(walls), [walls]);
  const objects = useMemo(
    () => [...(Array.isArray(room?.furniture) ? room.furniture : []), ...(Array.isArray(room?.desks) ? room.desks : [])],
    [room?.desks, room?.furniture]
  );

  const floorPolygon = useMemo(() => {
    const footprint = graph.outerPolygon?.length
      ? graph.outerPolygon
      : [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY }
        ];
    return footprint.map((point) => projectIsoPoint(point.x, point.y, 0, bounds));
  }, [bounds, graph.outerPolygon]);

  return (
    <div className="panel-card preview3d-card">
      <div className="score-topline">
        <div>
          <p className="upload-kicker">Preview</p>
          <h2>3D room beta</h2>
        </div>
        <div className="preview3d-badge">Beta</div>
      </div>
      <p className="preview3d-copy">
        First pass only: this uses your edited floor plan as the source of truth and extrudes walls and objects into a quick spatial preview.
      </p>
      <div className="preview3d-shell" aria-label="3D preview of the current floor plan">
        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="preview3d-svg" role="img">
          <defs>
            <linearGradient id="preview-floor" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f6efdf" />
              <stop offset="100%" stopColor="#e6dbc1" />
            </linearGradient>
          </defs>

          <polygon points={pointsToString(floorPolygon)} fill="url(#preview-floor)" stroke="#ccb48c" strokeWidth="1.4" />

          {walls.map((wall, index) => {
            const quad = getExtrudedQuad(
              { x: wall.x1_percent, y: wall.y1_percent },
              { x: wall.x2_percent, y: wall.y2_percent },
              WALL_HEIGHT,
              bounds
            );
            const topEdgeStart = projectIsoPoint(wall.x1_percent, wall.y1_percent, WALL_HEIGHT, bounds);
            const topEdgeEnd = projectIsoPoint(wall.x2_percent, wall.y2_percent, WALL_HEIGHT, bounds);

            return (
              <g key={`preview-wall-${index}`}>
                <polygon points={pointsToString(quad)} fill="#d6c3a4" stroke="#8d7553" strokeWidth="1.6" />
                <line
                  x1={topEdgeStart.x}
                  y1={topEdgeStart.y}
                  x2={topEdgeEnd.x}
                  y2={topEdgeEnd.y}
                  stroke="#6f593b"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {objects.map((item, index) => {
            const definition = getObjectDefinition(item.type);
            const base = getObjectFootprint(item);
            const top = base.map((point) => projectIsoPoint(point.x, point.y, OBJECT_HEIGHT, bounds));
            const bottom = base.map((point) => projectIsoPoint(point.x, point.y, 0, bounds));
            const frontFace = [bottom[0], bottom[1], top[1], top[0]];
            const sideFace = [bottom[1], bottom[2], top[2], top[1]];

            return (
              <g key={`preview-object-${index}`}>
                <polygon points={pointsToString(frontFace)} fill={shadeColor(definition.tone, 0.88)} stroke={definition.stroke} strokeWidth="1.1" />
                <polygon points={pointsToString(sideFace)} fill={shadeColor(definition.tone, 0.72)} stroke={definition.stroke} strokeWidth="1.1" />
                <polygon points={pointsToString(top)} fill={definition.tone} stroke={definition.stroke} strokeWidth="1.2" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
