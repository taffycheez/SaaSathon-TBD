import { useEffect, useMemo, useRef, useState } from "react";
import { getObjectDefinition } from "@/lib/objectCatalog";
import { FloorPlanObjectIcon } from "@/components/FloorPlanIconPack";
import {
  getScaledItemDimensions,
  normalizeObjectScale,
  normalizeWallGraph,
  pointInPolygon,
  snapEdgeItemToWalls
} from "@/lib/roomGeometry";
import {
  addRectangleRoomToRoom,
  addWallToRoom,
  deleteWallFromRoom,
  getSnappedWallPoint,
  moveWallByDelta,
  normalizeRotation,
  resizeRoomBounds,
  updateEdgeItem,
  updatePlacedObject,
  updateWallEndpoint
} from "@/lib/roomState";
import { getZoneTypeOptions } from "@/lib/zoning";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const PADDING = 40;
const DRAG_THRESHOLD = 6;
const ROTATION_STEP_DEGREES = 45;
const DOOR_RENDER_LENGTH = 30;

function getWallBounds(walls) {
  const points = walls.flatMap((wall) => [
    { x: wall.x1_percent, y: wall.y1_percent },
    { x: wall.x2_percent, y: wall.y2_percent }
  ]);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 100),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, 100)
  };
}

function getRoomPixelSize(walls) {
  const bounds = getWallBounds(walls);
  const widthPercent = Math.max(1, bounds.maxX - bounds.minX);
  const heightPercent = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(
    (CANVAS_WIDTH - PADDING * 2) / widthPercent,
    (CANVAS_HEIGHT - PADDING * 2) / heightPercent
  );

  return {
    width: widthPercent * scale,
    height: heightPercent * scale,
    bounds
  };
}

function toCanvasPoint(point, roomBox, bounds) {
  return {
    x: roomBox.x + ((point.x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX)) * roomBox.width,
    y: roomBox.y + ((point.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * roomBox.height
  };
}

function pointerToRoomPosition(pointer, roomBox, shouldClamp = true) {
  const xPercent = ((pointer.x - roomBox.x) / roomBox.width) * 100;
  const yPercent = ((pointer.y - roomBox.y) / roomBox.height) * 100;

  if (!shouldClamp) {
    return {
      x_percent: xPercent,
      y_percent: yPercent
    };
  }

  return {
    x_percent: Math.max(0, Math.min(100, xPercent)),
    y_percent: Math.max(0, Math.min(100, yPercent))
  };
}

function objectPixelSize(item, roomBox) {
  const dimensions = getScaledItemDimensions(item);
  return {
    width: Math.max(18, (dimensions.width_percent / 100) * roomBox.width),
    height: Math.max(14, (dimensions.height_percent / 100) * roomBox.height)
  };
}

function getLabel(item, fallbackLabel) {
  return getObjectDefinition(item.type).label || fallbackLabel;
}

function pointsToString(points, width, height) {
  return points
    .map((point) => `${width / 2 + (point.x_percent / 100) * width},${height / 2 + (point.y_percent / 100) * height}`)
    .join(" ");
}

function renderObjectLabel(label, width, height, stroke, options = {}) {
  return null;
}

function ChairShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.4, strokeWidth * 0.7);
  return (
    <>
      <rect x={width * 0.22} y={height * 0.26} width={width * 0.56} height={height * 0.28} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.2} y={height * 0.06} width={width * 0.6} height={height * 0.24} rx={Math.max(4, width * 0.08)} fill="#f7fbff" stroke={stroke} strokeWidth={detailStroke} />
      <line x1={width * 0.3} y1={height * 0.54} x2={width * 0.24} y2={height * 0.86} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.7} y1={height * 0.54} x2={width * 0.76} y2={height * 0.86} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.38} y1={height * 0.54} x2={width * 0.38} y2={height * 0.92} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.62} y1={height * 0.54} x2={width * 0.62} y2={height * 0.92} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.33} y1={height * 0.78} x2={width * 0.67} y2={height * 0.78} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" opacity={0.72} />
    </>
  );
}

function ArmchairShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.3, strokeWidth * 0.68);
  return (
    <>
      <rect x={width * 0.22} y={height * 0.2} width={width * 0.56} height={height * 0.32} rx={Math.max(6, width * 0.12)} fill="#eef8f2" stroke={stroke} strokeWidth={detailStroke} />
      <rect x={width * 0.14} y={height * 0.34} width={width * 0.14} height={height * 0.2} rx={Math.max(4, width * 0.1)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.72} y={height * 0.34} width={width * 0.14} height={height * 0.2} rx={Math.max(4, width * 0.1)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.24} y={height * 0.32} width={width * 0.52} height={height * 0.28} rx={Math.max(6, width * 0.12)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.3} y1={height * 0.6} x2={width * 0.25} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.7} y1={height * 0.6} x2={width * 0.75} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function PlantShape({ width, height, stroke }) {
  return (
    <>
      <line x1={width * 0.5} y1={height * 0.46} x2={width * 0.5} y2={height * 0.6} stroke={stroke} strokeWidth={Math.max(1.5, width * 0.08)} strokeLinecap="round" />
      <ellipse cx={width * 0.5} cy={height * 0.18} rx={Math.max(6, width * 0.14)} ry={Math.max(8, height * 0.22)} transform={`rotate(-4 ${width * 0.5} ${height * 0.18})`} fill="#89c86f" stroke={stroke} strokeWidth={1.6} />
      <ellipse cx={width * 0.34} cy={height * 0.3} rx={Math.max(5, width * 0.12)} ry={Math.max(8, height * 0.2)} transform={`rotate(-34 ${width * 0.34} ${height * 0.3})`} fill="#b8e4a2" stroke={stroke} strokeWidth={1.4} />
      <ellipse cx={width * 0.66} cy={height * 0.3} rx={Math.max(5, width * 0.12)} ry={Math.max(8, height * 0.2)} transform={`rotate(34 ${width * 0.66} ${height * 0.3})`} fill="#c8ebb7" stroke={stroke} strokeWidth={1.4} />
      <rect x={width * 0.26} y={height * 0.6} width={width * 0.48} height={height * 0.18} rx={Math.max(4, width * 0.08)} fill="#b57c47" stroke="#7a512f" strokeWidth={1.6} />
      <ellipse cx={width * 0.5} cy={height * 0.8} rx={Math.max(7, width * 0.26)} ry={Math.max(3, height * 0.05)} fill="#8f6036" stroke="#7a512f" strokeWidth={1.2} />
    </>
  );
}

function WhiteboardShape({ width, height, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.2, strokeWidth * 0.62);
  return (
    <>
      <rect x={width * 0.12} y={height * 0.08} width={width * 0.76} height={height * 0.48} rx={Math.max(6, height * 0.14)} fill="#ffffff" stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.2} y1={height * 0.22} x2={width * 0.8} y2={height * 0.22} stroke="#d7e4ef" strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.2} y1={height * 0.38} x2={width * 0.72} y2={height * 0.38} stroke="#e7eef5" strokeWidth={detailStroke} strokeLinecap="round" />
      <ellipse cx={width * 0.22} cy={height * 0.18} rx={2.2} ry={2.2} fill="#74a3d3" />
      <ellipse cx={width * 0.78} cy={height * 0.18} rx={2.2} ry={2.2} fill="#7ec18e" />
      <rect x={width * 0.28} y={height * 0.58} width={width * 0.44} height={Math.max(3, height * 0.05)} rx={999} fill={stroke} opacity={0.72} />
      <line x1={width * 0.34} y1={height * 0.58} x2={width * 0.22} y2={height * 0.92} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.66} y1={height * 0.58} x2={width * 0.78} y2={height * 0.92} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function CouchShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.3, strokeWidth * 0.65);
  return (
    <>
      <rect x={width * 0.14} y={height * 0.2} width={width * 0.72} height={height * 0.38} rx={Math.max(8, width * 0.1)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.18} y={height * 0.1} width={width * 0.64} height={height * 0.18} rx={Math.max(8, width * 0.1)} fill="#eef5ea" stroke={stroke} strokeWidth={detailStroke} />
      <rect x={width * 0.06} y={height * 0.18} width={width * 0.12} height={height * 0.36} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.82} y={height * 0.18} width={width * 0.12} height={height * 0.36} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.2} y1={height * 0.58} x2={width * 0.16} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.8} y1={height * 0.58} x2={width * 0.84} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function FridgeShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.1, strokeWidth * 0.62);
  return (
    <>
      <rect x={width * 0.22} y={height * 0.08} width={width * 0.56} height={height * 0.84} rx={Math.max(6, width * 0.14)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.22} y1={height * 0.46} x2={width * 0.78} y2={height * 0.46} stroke={stroke} strokeWidth={detailStroke} />
      <line x1={width * 0.68} y1={height * 0.22} x2={width * 0.68} y2={height * 0.34} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.68} y1={height * 0.58} x2={width * 0.68} y2={height * 0.78} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function KitchenetteShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.1, strokeWidth * 0.62);
  return (
    <>
      <rect x={width * 0.06} y={height * 0.2} width={width * 0.88} height={height * 0.46} rx={Math.max(6, height * 0.18)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.12} y={height * 0.26} width={width * 0.18} height={height * 0.32} rx={3} fill="#f8f5ef" stroke={stroke} strokeWidth={detailStroke} />
      <rect x={width * 0.36} y={height * 0.28} width={width * 0.18} height={height * 0.2} rx={999} fill="#dbeaf3" stroke={stroke} strokeWidth={detailStroke} />
      <circle cx={width * 0.68} cy={height * 0.38} r={Math.max(3, height * 0.09)} fill="#ffffff" stroke={stroke} strokeWidth={detailStroke} />
      <circle cx={width * 0.8} cy={height * 0.38} r={Math.max(3, height * 0.09)} fill="#ffffff" stroke={stroke} strokeWidth={detailStroke} />
      <line x1={width * 0.18} y1={height * 0.66} x2={width * 0.18} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.82} y1={height * 0.66} x2={width * 0.82} y2={height * 0.88} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function DeskChairInset({ x, y, width, height, strokeWidth }) {
  const chairDefinition = getObjectDefinition("chair");
  return (
    <g transform={`translate(${x} ${y})`}>
      <ChairShape width={width} height={height} fill={chairDefinition.tone} stroke={chairDefinition.stroke} strokeWidth={strokeWidth} />
    </g>
  );
}

function DeskShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.15, strokeWidth * 0.7);
  const chairWidth = Math.max(12, width * 0.32);
  const chairHeight = Math.max(10, height * 0.42);

  return (
    <>
      <rect x={width * 0.14} y={height * 0.08} width={width * 0.72} height={height * 0.34} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.2} y1={height * 0.42} x2={width * 0.18} y2={height * 0.66} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.32} y1={height * 0.42} x2={width * 0.32} y2={height * 0.58} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.68} y1={height * 0.42} x2={width * 0.68} y2={height * 0.58} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.8} y1={height * 0.42} x2={width * 0.82} y2={height * 0.66} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <DeskChairInset x={width * 0.34} y={height * 0.48} width={chairWidth} height={chairHeight} strokeWidth={detailStroke} />
    </>
  );
}

function LShapedDeskShape({ width, height, fill, stroke, strokeWidth, footprintPoints }) {
  const detailStroke = Math.max(1.15, strokeWidth * 0.68);
  return (
    <>
      <polygon points={pointsToString(footprintPoints, width, height)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <polyline
        points={`${width * 0.58},${height * 0.08} ${width * 0.58},${height * 0.42} ${width * 0.86},${height * 0.42}`}
        fill="none"
        stroke={stroke}
        strokeWidth={detailStroke}
        strokeLinejoin="round"
        opacity={0.34}
      />
      <DeskChairInset x={width * 0.16} y={height * 0.52} width={Math.max(12, width * 0.3)} height={Math.max(10, height * 0.36)} strokeWidth={detailStroke} />
    </>
  );
}

function SvgObjectShape({ item, roomBox, fill, stroke, strokeWidth = 2, label }) {
  const { width, height } = objectPixelSize(item, roomBox);
  return (
    <>
      <FloorPlanObjectIcon item={item} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {renderObjectLabel(label, width, height, stroke)}
    </>
  );
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7H4v5" />
      <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 7h5v5" />
      <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function CloseGlyph({ size = 12, stroke = "currentColor", strokeWidth = 2 }) {
  return (
    <g aria-hidden="true">
      <line
        x1="0"
        y1="0"
        x2={size}
        y2={size}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1="0"
        y1={size}
        x2={size}
        y2="0"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </g>
  );
}

function pointerToBoundedRoomPosition(pointer, roomBox, bounds, shouldClamp = true) {
  const rawX = bounds.minX + ((pointer.x - roomBox.x) / roomBox.width) * Math.max(1, bounds.maxX - bounds.minX);
  const rawY = bounds.minY + ((pointer.y - roomBox.y) / roomBox.height) * Math.max(1, bounds.maxY - bounds.minY);

  return {
    x_percent: shouldClamp ? Math.max(0, Math.min(100, rawX)) : rawX,
    y_percent: shouldClamp ? Math.max(0, Math.min(100, rawY)) : rawY
  };
}

function northAngleFromPoint(point, bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const dx = point.x_percent - centerX;
  const dy = point.y_percent - centerY;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

function rotateByStep(rotationDeg, step = ROTATION_STEP_DEGREES) {
  return ((rotationDeg || 0) + step + 360) % 360;
}

function cycleDoorOrientation(door) {
  const currentHingeSide = door?.hinge_side === "end" ? "end" : "start";
  const currentSwingDirection = Number(door?.swing_direction) === -1 ? -1 : 1;

  return {
    hinge_side: currentHingeSide,
    swing_direction: currentSwingDirection === 1 ? -1 : 1,
    opening_anchor: "edge"
  };
}

function clampPercent(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : 0));
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWallLengthPercent(wall) {
  if (!wall) {
    return 0;
  }

  return Math.hypot(
    Number(wall.x2_percent) - Number(wall.x1_percent),
    Number(wall.y2_percent) - Number(wall.y1_percent)
  );
}

function pointOnWallAtPosition(wall, positionPercent) {
  const ratio = clampPercent(positionPercent) / 100;
  return {
    x_percent: Number((Number(wall.x1_percent) + (Number(wall.x2_percent) - Number(wall.x1_percent)) * ratio).toFixed(2)),
    y_percent: Number((Number(wall.y1_percent) + (Number(wall.y2_percent) - Number(wall.y1_percent)) * ratio).toFixed(2))
  };
}

function flipDoorHinge(door, walls) {
  const safeWalls = Array.isArray(walls) ? walls : [];
  const wallIndex = Math.max(0, Math.min(safeWalls.length - 1, Number(door?.wall_index) || 0));
  const wall = safeWalls[wallIndex];
  const currentHingeSide = door?.hinge_side === "end" ? "end" : "start";
  const nextHingeSide = currentHingeSide === "end" ? "start" : "end";
  const currentPosition = clampPercent(door?.position_percent ?? 50);
  const effectiveWidthPercent = Math.max(4, clampPercent(door?.width_percent ?? 10));
  const wallLengthPercent = Math.max(getWallLengthPercent(wall), effectiveWidthPercent);
  const spanPercent = Math.min(98, (effectiveWidthPercent / wallLengthPercent) * 100);
  const nextPosition = nextHingeSide === "end"
    ? clampPercent(currentPosition + spanPercent)
    : clampPercent(currentPosition - spanPercent);
  const nextPoint = wall
    ? pointOnWallAtPosition(wall, nextPosition)
    : {
        x_percent: clampPercent(door?.x_percent),
        y_percent: clampPercent(door?.y_percent)
      };

  return {
    ...nextPoint,
    wall_index: wallIndex,
    position_percent: Number(nextPosition.toFixed(2)),
    opening_anchor: "edge",
    hinge_side: nextHingeSide
  };
}

function DoorShape({ hingeSide = "start", swingDirection = 1 }) {
  const closedX = hingeSide === "end" ? -DOOR_RENDER_LENGTH : DOOR_RENDER_LENGTH;
  const openY = DOOR_RENDER_LENGTH * swingDirection;
  const arcSweep = swingDirection > 0 ? 1 : 0;
  return (
    <>
      <line x1="0" y1="0" x2="0" y2={openY} stroke="#8b5e34" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d={`M ${closedX} 0 A ${DOOR_RENDER_LENGTH} ${DOOR_RENDER_LENGTH} 0 0 ${arcSweep} 0 ${openY}`}
        fill="none"
        stroke="#8b5e34"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
      <circle cx="0" cy="0" r="2.1" fill="#8b5e34" />
    </>
  );
}

function getRenderedDoorSwingDirection(door, outerPolygon) {
  const swingDirection = Number(door?.swing_direction) === -1 ? -1 : 1;
  if (!Array.isArray(outerPolygon) || outerPolygon.length < 3) {
    return swingDirection;
  }

  const probeDistance = Math.max(4, Math.min(12, Number(door?.width_percent) || 10));
  const angleRadians = ((Number(door?.rotation_deg) || 0) * Math.PI) / 180;
  const rotated = (direction) => ({
    x: (Math.cos(angleRadians + Math.PI / 2) * probeDistance * direction),
    y: (Math.sin(angleRadians + Math.PI / 2) * probeDistance * direction)
  });
  const currentProbe = rotated(swingDirection);
  const oppositeProbe = rotated(-swingDirection);
  const hingePoint = {
    x: Number(door?.x_percent) || 0,
    y: Number(door?.y_percent) || 0
  };
  const currentInside = pointInPolygon(
    { x: hingePoint.x + currentProbe.x, y: hingePoint.y + currentProbe.y },
    outerPolygon
  );
  const oppositeInside = pointInPolygon(
    { x: hingePoint.x + oppositeProbe.x, y: hingePoint.y + oppositeProbe.y },
    outerPolygon
  );

  if (!currentInside && oppositeInside) {
    return -swingDirection;
  }

  return swingDirection;
}

export default function FloorPlanEditor({
  room,
  displayRoom = room,
  setRoom,
  onRoomPreviewChange,
  zones = [],
  onZoneOverride,
  imagePreview,
  showReferenceImage = false,
  setShowReferenceImage,
  showZones = true,
  setShowZones,
  wallToolMode = "select",
  setWallToolMode,
  scaleToolActive = false,
  setScaleToolActive,
  northToolActive = false,
  setNorthToolActive,
  onAddWall,
  onAddRectangleRoom,
  onApplyScale,
  onApplyNorthDirection,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo
}) {
  const svgRef = useRef(null);
  const trashRef = useRef(null);
  const dragStateRef = useRef(null);
  const roomBoxRef = useRef(null);
  const wallsRef = useRef([]);
  const [dragState, setDragState] = useState(null);
  const [selectedWallIndex, setSelectedWallIndex] = useState(null);
  const [selectedPlacedItem, setSelectedPlacedItem] = useState(null);
  const [selectedEdgeItem, setSelectedEdgeItem] = useState(null);
  const [scaleDraft, setScaleDraft] = useState(null);
  const [scaleInputValue, setScaleInputValue] = useState("1");
  const [hoveredZoneId, setHoveredZoneId] = useState(null);
  const [pinnedZoneId, setPinnedZoneId] = useState(null);
  const renderedRoom = displayRoom || room;
  const wallGraph = useMemo(() => normalizeWallGraph(renderedRoom.walls || []), [renderedRoom.walls]);
  const walls = wallGraph.walls.length ? wallGraph.walls : Array.isArray(renderedRoom.walls) ? renderedRoom.walls : [];
  const windows = Array.isArray(room.windows) ? room.windows : [];
  const doors = Array.isArray(room.doors) ? room.doors : [];
  const furniture = Array.isArray(room.furniture) ? room.furniture : [];
  const desks = Array.isArray(room.desks) ? room.desks : [];
  const selectedItem =
    selectedPlacedItem && (selectedPlacedItem.type === "furniture" || selectedPlacedItem.type === "desks")
      ? room?.[selectedPlacedItem.type]?.[selectedPlacedItem.index]
      : null;
  const selectedOpening =
    selectedEdgeItem && (selectedEdgeItem.type === "windows" || selectedEdgeItem.type === "doors")
      ? room?.[selectedEdgeItem.type]?.[selectedEdgeItem.index]
      : null;
  const selectedItemLabel = selectedItem
    ? `${getLabel(selectedItem, "Object")}${selectedPlacedItem.type === "desks" ? ` ${selectedPlacedItem.index + 1}` : ""}`
    : "";
  const selectedItemScale = normalizeObjectScale(selectedItem?.scale);
  const roomSize = useMemo(() => getRoomPixelSize(walls), [walls]);
  const roomBox = {
    x: (CANVAS_WIDTH - roomSize.width) / 2,
    y: (CANVAS_HEIGHT - roomSize.height) / 2,
    width: roomSize.width,
    height: roomSize.height
  };
  const zoneMarkerRadius = Math.max(6, Math.min(11, 12 - (roomBox.width / CANVAS_WIDTH) * 4));
  const roomCenter = {
    x: (roomSize.bounds.minX + roomSize.bounds.maxX) / 2,
    y: (roomSize.bounds.minY + roomSize.bounds.maxY) / 2
  };
  const currentNorthAngle =
    dragState?.kind === "north-set"
      ? northAngleFromPoint(pointerToBoundedRoomPosition(dragState.point, roomBoxRef.current, roomSize.bounds, false), roomSize.bounds)
      : normalizeRotation(room?.north_direction_deg);

  function nudgeNorthAngle(deltaDegrees) {
    const baseAngle = normalizeRotation(room?.north_direction_deg);
    onApplyNorthDirection?.(baseAngle + deltaDegrees);
  }

  dragStateRef.current = dragState;
  roomBoxRef.current = roomBox;
  wallsRef.current = walls;

  function setLiveDragState(nextValueOrUpdater) {
    const nextValue = typeof nextValueOrUpdater === "function"
      ? nextValueOrUpdater(dragStateRef.current)
      : nextValueOrUpdater;
    dragStateRef.current = nextValue;
    setDragState(nextValue);
    return nextValue;
  }

  useEffect(() => {
    if (selectedWallIndex == null) {
      return;
    }
    if (selectedWallIndex < 0 || selectedWallIndex >= walls.length) {
      setSelectedWallIndex(null);
    }
  }, [selectedWallIndex, walls.length]);

  useEffect(() => {
    if (!selectedPlacedItem) {
      return;
    }
    const items = selectedPlacedItem.type === "furniture" ? furniture : desks;
    if (selectedPlacedItem.index < 0 || selectedPlacedItem.index >= items.length) {
      setSelectedPlacedItem(null);
    }
  }, [selectedPlacedItem, furniture.length, desks.length]);

  useEffect(() => {
    if (!selectedEdgeItem) {
      return;
    }
    const items = selectedEdgeItem.type === "windows" ? windows : doors;
    if (selectedEdgeItem.index < 0 || selectedEdgeItem.index >= items.length) {
      setSelectedEdgeItem(null);
    }
  }, [selectedEdgeItem, windows.length, doors.length]);

  useEffect(() => {
    if (pinnedZoneId && !zones.some((zone) => zone.id === pinnedZoneId)) {
      setPinnedZoneId(null);
    }
    if (hoveredZoneId && !zones.some((zone) => zone.id === hoveredZoneId)) {
      setHoveredZoneId(null);
    }
  }, [hoveredZoneId, pinnedZoneId, zones]);

  useEffect(() => {
    if (!scaleToolActive) {
      setScaleDraft(null);
    }
  }, [scaleToolActive]);

  useEffect(() => {
    function isEditableTarget(target) {
      return target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    }

    function handleKeyDown(event) {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const usesCommand = event.ctrlKey || event.metaKey;

      if (usesCommand && key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }

      if ((usesCommand && key === "y") || (usesCommand && event.shiftKey && key === "z")) {
        event.preventDefault();
        onRedo?.();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedWallIndex != null) {
          event.preventDefault();
          removeSelectedWall();
          return;
        }

        if (selectedEdgeItem?.type === "windows" || selectedEdgeItem?.type === "doors") {
          event.preventDefault();
          removePlacedItem(selectedEdgeItem.type, selectedEdgeItem.index);
          setSelectedEdgeItem(null);
          return;
        }

        if (selectedPlacedItem?.type === "furniture" || selectedPlacedItem?.type === "desks") {
          event.preventDefault();
          removeSelectedPlacedItem();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onRedo, onUndo, selectedEdgeItem, selectedPlacedItem, selectedWallIndex]);

  function withUpdatedPlacedItem(currentRoom, type, index, updates) {
    return {
      ...currentRoom,
      [type]: (currentRoom[type] || []).map((item, itemIndex) => (
        itemIndex === index ? { ...item, ...updates } : item
      ))
    };
  }

  function clearRoomPreview() {
    onRoomPreviewChange?.(null);
  }

  function previewPlacedItem(type, index, updates) {
    onRoomPreviewChange?.(withUpdatedPlacedItem(room, type, index, updates));
  }

  function updatePlacedItem(type, index, updates, options) {
    setRoom((currentRoom) => {
      if (type === "windows" || type === "doors") {
        return updateEdgeItem(currentRoom, type, index, updates);
      }

      return updatePlacedObject(currentRoom, type, index, updates);
    }, options);
  }

  function updateSelectedItemScale(scale) {
    if (!selectedPlacedItem) {
      return;
    }

    updatePlacedItem(selectedPlacedItem.type, selectedPlacedItem.index, { scale });
  }

  function updateSelectedWindowWidth(widthPercent) {
    if (selectedEdgeItem?.type !== "windows") {
      return;
    }

    updatePlacedItem("windows", selectedEdgeItem.index, { width_percent: Number(widthPercent) });
  }

  function rotateSelectedItem(step = ROTATION_STEP_DEGREES) {
    if (!selectedPlacedItem) {
      return;
    }

    const collection = selectedPlacedItem.type === "desks" ? desks : furniture;
    const item = collection?.[selectedPlacedItem.index];
    if (!item) {
      return;
    }

    updatePlacedItem(selectedPlacedItem.type, selectedPlacedItem.index, {
      rotation_deg: rotateByStep(item.rotation_deg, step)
    });
  }

  function cycleSelectedDoorOrientation() {
    if (selectedEdgeItem?.type !== "doors") {
      return;
    }

    const item = doors?.[selectedEdgeItem.index];
    if (!item) {
      return;
    }

    updatePlacedItem("doors", selectedEdgeItem.index, cycleDoorOrientation(item));
  }

  function flipSelectedDoorHinge() {
    if (selectedEdgeItem?.type !== "doors") {
      return;
    }

    const item = doors?.[selectedEdgeItem.index];
    if (!item) {
      return;
    }

    updatePlacedItem("doors", selectedEdgeItem.index, flipDoorHinge(item, walls));
  }

  function previewWallUpdate(wallIndex, endpoint, point) {
    const previewPosition = pointerToRoomPosition(point, roomBoxRef.current, false);
    onRoomPreviewChange?.(updateWallEndpoint(room, wallIndex, endpoint, previewPosition));
  }

  function commitWallUpdate(wallIndex, endpoint, point, options) {
    const previewPosition = pointerToRoomPosition(point, roomBoxRef.current, false);
    setRoom((currentRoom) => updateWallEndpoint(currentRoom, wallIndex, endpoint, previewPosition), options);
  }

  function wallDragDeltaToRoomPercent(startPoint, point) {
    const startPosition = pointerToRoomPosition(startPoint, roomBoxRef.current, false);
    const endPosition = pointerToRoomPosition(point, roomBoxRef.current, false);
    return {
      x_percent: endPosition.x_percent - startPosition.x_percent,
      y_percent: endPosition.y_percent - startPosition.y_percent
    };
  }

  function previewWallMove(wallIndex, startPoint, point) {
    onRoomPreviewChange?.(
      moveWallByDelta(room, wallIndex, wallDragDeltaToRoomPercent(startPoint, point))
    );
  }

  function commitWallMove(wallIndex, startPoint, point, options) {
    setRoom(
      (currentRoom) => moveWallByDelta(currentRoom, wallIndex, wallDragDeltaToRoomPercent(startPoint, point)),
      options
    );
  }

  function previewRoomResize(handle, point) {
    const previewPosition = pointerToBoundedRoomPosition(point, roomBoxRef.current, roomSize.bounds, false);
    onRoomPreviewChange?.(resizeRoomBounds(room, handle, previewPosition));
  }

  function commitRoomResize(handle, point, options) {
    const previewPosition = pointerToBoundedRoomPosition(point, roomBoxRef.current, roomSize.bounds, false);
    setRoom((currentRoom) => resizeRoomBounds(currentRoom, handle, previewPosition), options);
  }

  function removePlacedItem(type, index) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function removeSelectedPlacedItem() {
    if (!(selectedPlacedItem?.type === "furniture" || selectedPlacedItem?.type === "desks")) {
      return;
    }

    removePlacedItem(selectedPlacedItem.type, selectedPlacedItem.index);
    setSelectedPlacedItem(null);
  }

  function removeSelectedWall() {
    if (selectedWallIndex == null) {
      return;
    }

    setRoom((currentRoom) => deleteWallFromRoom(currentRoom, selectedWallIndex));
    setSelectedWallIndex(null);
  }

  function getSvgPointFromClient(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  }

  function isOverTrash(clientX, clientY) {
    const rect = trashRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }

    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  function buildPreviewItem(item, type, point) {
    const previewPosition = pointerToRoomPosition(point, roomBoxRef.current, false);
    if (type === "windows" || type === "doors") {
      return snapEdgeItemToWalls({ ...item, ...previewPosition }, wallsRef.current);
    }

    return {
      ...item,
      ...previewPosition
    };
  }

  function getPreviewItem(type, index, item) {
    if (!dragState || dragState.type !== type || dragState.index !== index) {
      return item;
    }

    return buildPreviewItem(item, type, dragState.point);
  }

  function startDrag(type, index, event) {
    if (wallToolMode === "add") {
      startWallDrawDrag(event);
      return;
    }
    if (wallToolMode === "rect") {
      startRectangleRoomDrag(event);
      return;
    }
    if (scaleToolActive) {
      startScaleDrag(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    if (type === "furniture" || type === "desks") {
      setSelectedPlacedItem({ type, index });
      setSelectedEdgeItem(null);
      setSelectedWallIndex(null);
    } else if (type === "windows" || type === "doors") {
      setSelectedEdgeItem({ type, index });
      setSelectedPlacedItem(null);
      setSelectedWallIndex(null);
    } else {
      setSelectedPlacedItem(null);
      setSelectedEdgeItem(null);
    }
    setLiveDragState({
      kind: "item",
      type,
      index,
      startPoint: point,
      point,
      overTrash: isOverTrash(event.clientX, event.clientY)
    });
  }

  function startWallHandleDrag(wallIndex, endpoint, event) {
    if (wallToolMode === "add") {
      startWallDrawDrag(event);
      return;
    }
    if (wallToolMode === "rect") {
      startRectangleRoomDrag(event);
      return;
    }
    if (scaleToolActive) {
      startScaleDrag(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    setSelectedPlacedItem(null);
    setSelectedWallIndex(wallIndex);
    setLiveDragState({
      kind: "wall-handle",
      wallIndex,
      endpoint,
      startPoint: point,
      point,
      overTrash: false
    });
  }

  function startWallMoveDrag(wallIndex, event) {
    if (wallToolMode === "add") {
      startWallDrawDrag(event);
      return;
    }
    if (wallToolMode === "rect") {
      startRectangleRoomDrag(event);
      return;
    }
    if (scaleToolActive) {
      startScaleDrag(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    setSelectedPlacedItem(null);
    setSelectedWallIndex(wallIndex);
    setLiveDragState({
      kind: "wall-move",
      wallIndex,
      startPoint: point,
      point,
      overTrash: false
    });
  }

  function startRoomResizeDrag(handle, event) {
    if (wallToolMode !== "select" || scaleToolActive) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    setSelectedPlacedItem(null);
    setSelectedEdgeItem(null);
    setSelectedWallIndex(null);
    setPinnedZoneId(null);
    setLiveDragState({
      kind: "room-resize",
      handle,
      startPoint: point,
      point,
      overTrash: false
    });
  }

  function startWallDrawDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    const snappedPoint = snapWallEditorPoint(point);
    setSelectedPlacedItem(null);
    setSelectedWallIndex(null);
    setPinnedZoneId(null);
    setLiveDragState({
      kind: "wall-draw",
      startPoint: point,
      point,
      startWallPoint: snappedPoint,
      overTrash: false
    });
  }

  function updateWallDrawPointer(point) {
    setLiveDragState((current) => (
      current?.kind === "wall-draw"
        ? {
            ...current,
            point
          }
        : current
    ));
  }

  function finishWallDraw(clientX, clientY) {
    const currentDrag = dragStateRef.current;
    if (currentDrag?.kind !== "wall-draw") {
      return;
    }
    finishDrag(clientX, clientY);
  }

  function startRectangleRoomDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    const snappedPoint = snapWallEditorPoint(point);
    setSelectedPlacedItem(null);
    setSelectedWallIndex(null);
    setPinnedZoneId(null);
    setLiveDragState({
      kind: "room-rect",
      startPoint: point,
      point,
      startRoomPoint: snappedPoint,
      overTrash: false
    });
  }

  function updateRectangleRoomPointer(point) {
    setLiveDragState((current) => (
      current?.kind === "room-rect"
        ? {
            ...current,
            point
          }
        : current
    ));
  }

  function startScaleDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    const snappedPoint = getSnappedWallPoint(room, pointerToRoomPosition(point, roomBoxRef.current, false));
    setSelectedPlacedItem(null);
    setSelectedWallIndex(null);
    setPinnedZoneId(null);
    setScaleDraft(null);
    setLiveDragState({
      kind: "scale-measure",
      startPoint: point,
      point,
      startMeasurePoint: snappedPoint,
      overTrash: false
    });
  }

  function startNorthDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);

    const point = getSvgPointFromClient(event.clientX, event.clientY);
    setSelectedPlacedItem(null);
    setSelectedWallIndex(null);
    setPinnedZoneId(null);
    setLiveDragState({
      kind: "north-set",
      startPoint: point,
      point,
      overTrash: false
    });
  }

  function updateScalePointer(point) {
    setLiveDragState((current) => (
      current?.kind === "scale-measure"
        ? {
            ...current,
            point
          }
        : current
    ));
  }

  function updateNorthPointer(point) {
    setLiveDragState((current) => (
      current?.kind === "north-set"
        ? {
            ...current,
            point
          }
        : current
    ));
  }

  function finishScaleDrag(clientX, clientY) {
    const currentDrag = dragStateRef.current;
    if (currentDrag?.kind !== "scale-measure") {
      return;
    }
    finishDrag(clientX, clientY);
  }

  function finishNorthDrag(clientX, clientY) {
    const currentDrag = dragStateRef.current;
    if (currentDrag?.kind !== "north-set") {
      return;
    }
    finishDrag(clientX, clientY);
  }

  function promptForScaleDraft(start, end) {
    if (typeof window === "undefined") {
      setScaleDraft({ start, end });
      return;
    }

    const response = window.prompt(
      "Enter the real-world length of that line in metres.",
      scaleInputValue || "1"
    );

    if (response == null) {
      return;
    }

    const numericDistance = Number(response);
    if (!Number.isFinite(numericDistance) || numericDistance <= 0) {
      window.alert("Please enter a positive number in metres.");
      return;
    }

    setScaleInputValue(String(numericDistance));
    onApplyScale?.(start, end, numericDistance);
  }

  function applyScaleDraft() {
    if (!scaleDraft) {
      return;
    }
    onApplyScale?.(scaleDraft.start, scaleDraft.end, scaleInputValue);
    setScaleDraft(null);
  }

  function cancelScaleDraft() {
    setScaleDraft(null);
    setScaleToolActive?.(false);
  }

  function snapWallEditorPoint(point) {
    return getSnappedWallPoint(room, pointerToRoomPosition(point, roomBoxRef.current, false));
  }

  function buildWallDraftRoom(startWallPoint, dragPoint) {
    const snappedEndPoint = snapWallEditorPoint(dragPoint);
    if (
      Math.hypot(
        snappedEndPoint.x_percent - startWallPoint.x_percent,
        snappedEndPoint.y_percent - startWallPoint.y_percent
      ) < 2
    ) {
      return null;
    }

    return addWallToRoom(room, startWallPoint, snappedEndPoint);
  }

  function buildRectangleDraftRoom(startRoomPoint, dragPoint) {
    const snappedEndPoint = snapWallEditorPoint(dragPoint);
    if (
      Math.abs(snappedEndPoint.x_percent - startRoomPoint.x_percent) < 2 ||
      Math.abs(snappedEndPoint.y_percent - startRoomPoint.y_percent) < 2
    ) {
      return null;
    }

    return addRectangleRoomToRoom(room, startRoomPoint, snappedEndPoint);
  }

  function resolveFinalDragPoint(currentDrag, fallbackClientX, fallbackClientY) {
    if (currentDrag?.point && (
      currentDrag.kind === "wall-draw" ||
      currentDrag.kind === "room-rect" ||
      currentDrag.kind === "scale-measure" ||
      currentDrag.kind === "north-set"
    )) {
      return currentDrag.point;
    }

    return getSvgPointFromClient(fallbackClientX, fallbackClientY);
  }

  function finishDrag(clientX, clientY) {
    const currentDrag = dragStateRef.current;
    if (!currentDrag) {
      return;
    }

    const point = resolveFinalDragPoint(currentDrag, clientX, clientY);
    const overTrash = isOverTrash(clientX, clientY);
    const dragDistance = Math.hypot(
      point.x - currentDrag.startPoint.x,
      point.y - currentDrag.startPoint.y
    );

    clearRoomPreview();

    if (currentDrag.kind === "wall-handle") {
      if (dragDistance >= DRAG_THRESHOLD) {
        commitWallUpdate(currentDrag.wallIndex, currentDrag.endpoint, point);
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "wall-move") {
      if (dragDistance >= DRAG_THRESHOLD) {
        commitWallMove(currentDrag.wallIndex, currentDrag.startPoint, point);
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "room-resize") {
      if (dragDistance >= DRAG_THRESHOLD) {
        commitRoomResize(currentDrag.handle, point);
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "wall-draw") {
      const previewRoom = buildWallDraftRoom(currentDrag.startWallPoint, point);
      if (previewRoom) {
        setRoom(previewRoom);
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "room-rect") {
      const previewRoom = buildRectangleDraftRoom(currentDrag.startRoomPoint, point);
      if (previewRoom) {
        setRoom(previewRoom);
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "scale-measure") {
      if (dragDistance >= DRAG_THRESHOLD) {
        const snappedEndPoint = getSnappedWallPoint(room, pointerToRoomPosition(point, roomBoxRef.current, false));
        if (
          Math.hypot(
            snappedEndPoint.x_percent - currentDrag.startMeasurePoint.x_percent,
            snappedEndPoint.y_percent - currentDrag.startMeasurePoint.y_percent
          ) >= 1
        ) {
          promptForScaleDraft(currentDrag.startMeasurePoint, snappedEndPoint);
        }
      }
      setLiveDragState(null);
      return;
    }

    if (currentDrag.kind === "north-set") {
      const nextPosition = pointerToBoundedRoomPosition(point, roomBoxRef.current, roomSize.bounds, false);
      onApplyNorthDirection?.(northAngleFromPoint(nextPosition, roomSize.bounds));
      setLiveDragState(null);
      return;
    }

    if (overTrash) {
      removePlacedItem(currentDrag.type, currentDrag.index);
      if (
        selectedPlacedItem?.type === currentDrag.type &&
        selectedPlacedItem?.index === currentDrag.index
      ) {
        setSelectedPlacedItem(null);
      }
      setLiveDragState(null);
      return;
    }

    if (dragDistance < DRAG_THRESHOLD) {
      setLiveDragState(null);
      return;
    }

    updatePlacedItem(
      currentDrag.type,
      currentDrag.index,
      pointerToRoomPosition(point, roomBoxRef.current, false)
    );
    setLiveDragState(null);
  }

  const isDragging = Boolean(dragState);

  useEffect(() => {
    if (!isDragging) {
      clearRoomPreview();
      return undefined;
    }

    function handleWindowPointerMove(event) {
      const point = getSvgPointFromClient(event.clientX, event.clientY);
      const overTrash = isOverTrash(event.clientX, event.clientY);
      const currentDrag = dragStateRef.current;
      if (currentDrag?.kind === "wall-handle") {
        previewWallUpdate(currentDrag.wallIndex, currentDrag.endpoint, point);
      } else if (currentDrag?.kind === "wall-move") {
        previewWallMove(currentDrag.wallIndex, currentDrag.startPoint, point);
      } else if (currentDrag?.kind === "room-resize") {
        previewRoomResize(currentDrag.handle, point);
      } else if (currentDrag?.kind === "wall-draw") {
        updateWallDrawPointer(point);
        onRoomPreviewChange?.(buildWallDraftRoom(currentDrag.startWallPoint, point));
      } else if (currentDrag?.kind === "room-rect") {
        updateRectangleRoomPointer(point);
        onRoomPreviewChange?.(buildRectangleDraftRoom(currentDrag.startRoomPoint, point));
      } else if (currentDrag?.kind === "scale-measure") {
        updateScalePointer(point);
        clearRoomPreview();
      } else if (currentDrag?.kind === "north-set") {
        updateNorthPointer(point);
        clearRoomPreview();
      } else {
        const currentItem = currentDrag ? room?.[currentDrag.type]?.[currentDrag.index] : null;

        if (currentDrag && currentItem && !overTrash) {
          previewPlacedItem(currentDrag.type, currentDrag.index, buildPreviewItem(currentItem, currentDrag.type, point));
        } else {
          clearRoomPreview();
        }
      }

      setLiveDragState((current) => (
        current
          ? {
              ...current,
              point,
              overTrash
            }
          : current
      ));
    }

    function handleWindowPointerUp(event) {
      finishDrag(event.clientX, event.clientY);
    }

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [isDragging]);

  const wallDraft =
    dragState?.kind === "wall-draw"
      ? {
          start: dragState.startWallPoint,
          end: snapWallEditorPoint(dragState.point)
        }
      : null;
  const rectangleRoomDraft =
    dragState?.kind === "room-rect"
      ? {
          start: dragState.startRoomPoint,
          end: snapWallEditorPoint(dragState.point)
        }
      : null;
  const roomResizeHandles = useMemo(() => {
    const { minX, maxX, minY, maxY } = roomSize.bounds;
    return [
      { id: "nw", point: { x: minX, y: minY }, cursor: "nwse-resize" },
      { id: "n", point: { x: (minX + maxX) / 2, y: minY }, cursor: "ns-resize" },
      { id: "ne", point: { x: maxX, y: minY }, cursor: "nesw-resize" },
      { id: "e", point: { x: maxX, y: (minY + maxY) / 2 }, cursor: "ew-resize" },
      { id: "se", point: { x: maxX, y: maxY }, cursor: "nwse-resize" },
      { id: "s", point: { x: (minX + maxX) / 2, y: maxY }, cursor: "ns-resize" },
      { id: "sw", point: { x: minX, y: maxY }, cursor: "nesw-resize" },
      { id: "w", point: { x: minX, y: (minY + maxY) / 2 }, cursor: "ew-resize" }
    ];
  }, [roomSize.bounds]);
  const scaleMeasureDraft =
    dragState?.kind === "scale-measure"
      ? {
          start: dragState.startMeasurePoint,
          end: getSnappedWallPoint(room, pointerToRoomPosition(dragState.point, roomBoxRef.current, false))
        }
      : null;

  return (
    <div className="editor-card">
      <div className="editor-header">
        <div>
          <p className="upload-kicker">Step 2</p>
          <h2>Fine-tune the floor plan</h2>
        </div>
        <div className="editor-actions">
          <button
            type="button"
            className="editor-icon-button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo the last room edit"
          >
            <span className="editor-icon">
              <UndoIcon />
            </span>
          </button>
          <button
            type="button"
            className="editor-icon-button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo the last room edit"
          >
            <span className="editor-icon">
              <RedoIcon />
            </span>
          </button>
          <div
            ref={trashRef}
            className={`trash-drop-zone${dragState ? " is-dragging" : ""}${dragState?.overTrash ? " is-active" : ""}`}
            aria-live="polite"
          >
            <span className="editor-icon">
              <TrashIcon />
            </span>
            <div className="trash-drop-copy">
              <strong>{dragState?.overTrash ? "Release to delete" : "Trash"}</strong>
              <span>{dragState ? "Drag an item here to remove it." : "Drop items here to delete."}</span>
            </div>
          </div>
        </div>
      </div>

      {selectedItem ? (
        <div
          className="object-scale-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="object-scale-field">
            <span>
              <strong>{selectedItemLabel}</strong>
              <small>Scale {Math.round(selectedItemScale * 100)}%</small>
            </span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.05"
              value={selectedItemScale}
              onChange={(event) => updateSelectedItemScale(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="object-scale-reset"
            onClick={() => updateSelectedItemScale(1)}
            disabled={selectedItemScale === 1}
          >
            Reset
          </button>
          <div className="object-scale-actions">
            <button
              type="button"
              className="object-scale-reset"
              onClick={() => rotateSelectedItem(-ROTATION_STEP_DEGREES)}
            >
              Rotate -45°
            </button>
            <button
              type="button"
              className="object-scale-reset"
              onClick={() => rotateSelectedItem(ROTATION_STEP_DEGREES)}
            >
              Rotate +45°
            </button>
          </div>
        </div>
      ) : null}

      {!selectedItem && selectedOpening ? (
        <div
          className="object-scale-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {selectedEdgeItem?.type === "windows" ? (
            <>
              <label className="object-scale-field">
                <span>
                  <strong>Window size</strong>
                  <small>Width {Math.round(Number(selectedOpening.width_percent) || 14)}%</small>
                </span>
                <input
                  type="range"
                  min="4"
                  max="30"
                  step="1"
                  value={Number(selectedOpening.width_percent) || 14}
                  onChange={(event) => updateSelectedWindowWidth(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="object-scale-reset"
                onClick={() => updateSelectedWindowWidth(14)}
                disabled={(Number(selectedOpening.width_percent) || 14) === 14}
              >
                Reset
              </button>
            </>
          ) : null}
          {selectedEdgeItem?.type === "doors" ? (
            <div className="object-scale-actions">
              <button
                type="button"
                className="object-scale-reset"
                onClick={cycleSelectedDoorOrientation}
              >
                Flip door swing
              </button>
              <button
                type="button"
                className="object-scale-reset"
                onClick={flipSelectedDoorHinge}
              >
                Flip door hinge
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!selectedItem && !selectedOpening && selectedWallIndex != null ? (
        <div
          className="wall-action-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="wall-action-copy">
            <strong>Wall {selectedWallIndex + 1}</strong>
            <small>Delete removes only this wall segment. You can reconnect or reshape neighbouring walls afterwards.</small>
          </div>
          <button
            type="button"
            className="wall-delete-button"
            onClick={removeSelectedWall}
          >
            Delete wall
          </button>
        </div>
      ) : null}

      {wallToolMode === "add" ? (
        <div
          className="wall-action-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="wall-action-copy">
            <strong>Draw walls</strong>
            <small>Click and drag to draw a snapped wall segment, like a build tool rather than a node editor.</small>
          </div>
        </div>
      ) : null}

      {wallToolMode === "rect" ? (
        <div
          className="wall-action-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="wall-action-copy">
            <strong>Rectangle room</strong>
            <small>Click and drag to drop a four-wall room shell in one move.</small>
          </div>
        </div>
      ) : null}

      {scaleToolActive ? (
        <div
          className="wall-action-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="wall-action-copy">
            <strong>Set scale</strong>
            <small>
              {scaleDraft
                ? "Measured line captured. Enter the real-world length to calibrate the plan."
                : "Click and drag a measurement line across something with a known real-world length."}
            </small>
          </div>
        </div>
      ) : null}

      {northToolActive ? (
        <div
          className="wall-action-panel"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="wall-action-copy">
            <strong>Set north</strong>
            <small>Drag anywhere on the room to rotate the compass. The 3D daylight will use this north direction.</small>
          </div>
          <label className="field">
            <span className="field-label">
              North direction
              <strong>{Math.round(currentNorthAngle)}°</strong>
            </span>
            <input
              type="range"
              min="0"
              max="359"
              step="1"
              value={Math.round(currentNorthAngle)}
              onChange={(event) => onApplyNorthDirection?.(Number(event.target.value))}
            />
          </label>
          <div className="object-scale-actions">
            <button type="button" className="object-scale-reset" onClick={() => nudgeNorthAngle(-15)}>
              Turn Left 15°
            </button>
            <button type="button" className="object-scale-reset" onClick={() => onApplyNorthDirection?.(0)}>
              Face Up
            </button>
            <button type="button" className="object-scale-reset" onClick={() => nudgeNorthAngle(15)}>
              Turn Right 15°
            </button>
          </div>
        </div>
      ) : null}

      {scaleDraft ? (
        <div className="modal-backdrop" role="presentation" onClick={cancelScaleDraft}>
          <div
            className="confirm-modal scale-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scale-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="upload-kicker">Set scale</p>
            <h2 id="scale-modal-title">What is the real length of this line?</h2>
            <p>Enter the known distance in metres and WorkspaceIQ will calibrate the whole plan from that measurement.</p>
            <div className="scale-tool-actions scale-tool-actions--modal">
              <label className="scale-modal-field">
                <span>Real length (m)</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={scaleInputValue}
                  onChange={(event) => setScaleInputValue(event.target.value)}
                  aria-label="Known real-world distance in metres"
                  autoFocus
                />
              </label>
              <button
                type="button"
                className="primary-button modal-button"
                onClick={applyScaleDraft}
              >
                Apply scale
              </button>
              <button
                type="button"
                className="secondary-button modal-button"
                onClick={cancelScaleDraft}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="floor-stage-shell">
        <div className="stage-view-controls" role="group" aria-label="Sandpit view controls">
          <div className="stage-view-controls__label">
            <span>View</span>
            <small>Choose what appears on the plan</small>
          </div>
          <div className="stage-view-controls__actions">
          {imagePreview ? (
            <button
              type="button"
              className={`editor-toggle-button editor-toggle-button--view${showReferenceImage ? " is-active" : ""}`}
              onClick={() => setShowReferenceImage?.((current) => !current)}
              aria-pressed={showReferenceImage}
            >
              <span className="editor-toggle-button__eyebrow">Reference</span>
              <strong>{showReferenceImage ? "Original On" : "Original Off"}</strong>
            </button>
          ) : null}
          <button
            type="button"
            className={`editor-toggle-button editor-toggle-button--view${showZones ? " is-active" : ""}`}
            onClick={() => setShowZones?.((current) => !current)}
            aria-pressed={showZones}
          >
            <span className="editor-toggle-button__eyebrow">Zoning</span>
            <strong>{showZones ? "Zones On" : "Zones Off"}</strong>
          </button>
        </div>
        </div>
        <svg
          ref={svgRef}
          className="floor-stage-svg"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          onPointerDown={(event) => {
            if (!dragStateRef.current) {
              setSelectedWallIndex(null);
              setSelectedPlacedItem(null);
              setPinnedZoneId(null);
            }
          }}
        >
          {Array.from({ length: 19 }).map((_, index) => {
            const x = PADDING + index * ((CANVAS_WIDTH - PADDING * 2) / 18);
            const y = PADDING + index * ((CANVAS_HEIGHT - PADDING * 2) / 18);
            return (
              <g key={`grid-${index}`}>
                <line x1={x} y1={PADDING} x2={x} y2={CANVAS_HEIGHT - PADDING} stroke="#e3e8ef" strokeWidth="1" />
                <line x1={PADDING} y1={y} x2={CANVAS_WIDTH - PADDING} y2={y} stroke="#e3e8ef" strokeWidth="1" />
              </g>
            );
          })}

          <rect
            x={roomBox.x}
            y={roomBox.y}
            width={roomBox.width}
            height={roomBox.height}
            rx={6}
            fill="#f8fbff"
            opacity={0.92}
          />

          {imagePreview && showReferenceImage ? (
            <>
              <text x={roomBox.x} y={roomBox.y - 10} fill="#53708f" fontSize="14">
                Reference image uploaded
              </text>
              <image
                href={imagePreview}
                x={roomBox.x}
                y={roomBox.y}
                width={roomBox.width}
                height={roomBox.height}
                opacity={0.55}
                preserveAspectRatio="none"
              />
            </>
          ) : null}

          <defs>
            <filter id="zone-cloud-blur">
              <feGaussianBlur stdDeviation="10" />
            </filter>
          </defs>

          {northToolActive ? (
            <g className="editor-compass is-active">
              {(() => {
                const compassCenter = {
                  x: roomBox.x + roomBox.width - 44,
                  y: roomBox.y + 44
                };
                const compassRadius = 24;
                const radians = (currentNorthAngle * Math.PI) / 180;
                const arrowX = compassCenter.x + Math.sin(radians) * compassRadius;
                const arrowY = compassCenter.y - Math.cos(radians) * compassRadius;
                const labelX = compassCenter.x + Math.sin(radians) * (compassRadius + 14);
                const labelY = compassCenter.y - Math.cos(radians) * (compassRadius + 14);
                return (
                  <>
                    <circle cx={compassCenter.x} cy={compassCenter.y} r="26" fill="rgba(255,255,255,0.84)" stroke="#a98c68" strokeWidth="2" />
                    <circle cx={compassCenter.x} cy={compassCenter.y} r="4" fill="#7b5d3f" />
                    <line x1={compassCenter.x} y1={compassCenter.y} x2={arrowX} y2={arrowY} stroke="#7b5d3f" strokeWidth="3" strokeLinecap="round" />
                    <polygon
                      points={`${arrowX},${arrowY - 6} ${arrowX + 5},${arrowY + 6} ${arrowX - 5},${arrowY + 6}`}
                      fill="#7b5d3f"
                      transform={`rotate(${currentNorthAngle} ${arrowX} ${arrowY})`}
                    />
                    <text x={labelX} y={labelY + 4} textAnchor="middle" fill="#7b5d3f" fontSize="11" fontWeight="800">
                      N
                    </text>
                  </>
                );
              })()}
            </g>
          ) : null}

          {zones.map((zone) => {
            const center = toCanvasPoint({ x: zone.center.x, y: zone.center.y }, roomBox, roomSize.bounds);
            const radiusX = Math.max(26, (zone.radiusX / 100) * roomBox.width);
            const radiusY = Math.max(22, (zone.radiusY / 100) * roomBox.height);

            return (
              <ellipse
                key={`${zone.id}-cloud`}
                cx={center.x}
                cy={center.y}
                rx={radiusX}
                ry={radiusY}
                fill={zone.cloudColor}
                filter="url(#zone-cloud-blur)"
                opacity="0.95"
                pointerEvents="none"
              />
            );
          })}

          {wallToolMode === "select" ? (
            <g className="room-resize-overlay">
              <rect
                x={roomBox.x}
                y={roomBox.y}
                width={roomBox.width}
                height={roomBox.height}
                fill="none"
                stroke="#7f93ad"
                strokeWidth="1.5"
                strokeDasharray="7 6"
                opacity="0.7"
                pointerEvents="none"
              />
              {roomResizeHandles.map((handle) => {
                const handlePoint = toCanvasPoint(handle.point, roomBox, roomSize.bounds);
                return (
                  <rect
                    key={`room-resize-${handle.id}`}
                    x={handlePoint.x - 6}
                    y={handlePoint.y - 6}
                    width="12"
                    height="12"
                    rx="2.5"
                    fill="#ffffff"
                    stroke="#10233d"
                    strokeWidth="2"
                    style={{ cursor: handle.cursor }}
                    onPointerDown={(event) => startRoomResizeDrag(handle.id, event)}
                  />
                );
              })}
            </g>
          ) : null}

          {walls.map((wall, index) => {
            const start = toCanvasPoint(
              { x: wall.x1_percent, y: wall.y1_percent },
              roomBox,
              roomSize.bounds
            );
            const end = toCanvasPoint(
              { x: wall.x2_percent, y: wall.y2_percent },
              roomBox,
              roomSize.bounds
            );

            return (
              <g key={`wall-${index}`}>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={selectedWallIndex === index ? "#0b1628" : "#10233d"}
                  strokeWidth={selectedWallIndex === index ? "5" : "4"}
                  strokeLinecap="round"
                />
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="transparent"
                  strokeWidth="16"
                  strokeLinecap="round"
                  onPointerDown={(event) => startWallMoveDrag(index, event)}
                />
                {selectedWallIndex === index ? (
                  <>
                    <rect
                      x={start.x - 6}
                      y={start.y - 6}
                      width="12"
                      height="12"
                      rx="2"
                      fill="#ffffff"
                      stroke="#10233d"
                      strokeWidth="2"
                      onPointerDown={(event) => startWallHandleDrag(index, "start", event)}
                    />
                    <rect
                      x={end.x - 6}
                      y={end.y - 6}
                      width="12"
                      height="12"
                      rx="2"
                      fill="#ffffff"
                      stroke="#10233d"
                      strokeWidth="2"
                      onPointerDown={(event) => startWallHandleDrag(index, "end", event)}
                    />
                    <g
                      className="wall-inline-delete"
                      transform={`translate(${(start.x + end.x) / 2} ${(start.y + end.y) / 2})`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeSelectedWall();
                      }}
                    >
                      <circle cx="0" cy="0" r="11" fill="#ffffff" stroke="#8f3a3a" strokeWidth="2" />
                      <g transform="translate(-6 -6)" color="#8f3a3a">
                        <CloseGlyph />
                      </g>
                    </g>
                  </>
                ) : null}
              </g>
            );
          })}

          {wallDraft ? (
            <g pointerEvents="none">
              <line
                x1={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).x}
                y1={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).y}
                x2={toCanvasPoint(wallDraft.end, roomBox, roomSize.bounds).x}
                y2={toCanvasPoint(wallDraft.end, roomBox, roomSize.bounds).y}
                stroke="#1a3558"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="10 7"
                opacity="0.92"
              />
              <circle
                cx={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).x}
                cy={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).y}
                r="6"
                fill="#10233d"
                opacity="0.85"
              />
              <circle
                cx={toCanvasPoint(wallDraft.end, roomBox, roomSize.bounds).x}
                cy={toCanvasPoint(wallDraft.end, roomBox, roomSize.bounds).y}
                r="5"
                fill="#ffffff"
                stroke="#10233d"
                strokeWidth="2"
                opacity="0.95"
              />
              <text
                x={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).x + 10}
                y={toCanvasPoint(wallDraft.start, roomBox, roomSize.bounds).y - 10}
                fill="#10233d"
                fontSize="12"
              >
                Drag like The Sims: release to place the wall
              </text>
            </g>
          ) : null}

          {rectangleRoomDraft ? (
            <g pointerEvents="none">
              {(() => {
                const start = toCanvasPoint(rectangleRoomDraft.start, roomBox, roomSize.bounds);
                const end = toCanvasPoint(rectangleRoomDraft.end, roomBox, roomSize.bounds);
                const left = Math.min(start.x, end.x);
                const top = Math.min(start.y, end.y);
                const width = Math.abs(end.x - start.x);
                const height = Math.abs(end.y - start.y);
                return (
                  <>
                    <rect
                      x={left}
                      y={top}
                      width={width}
                      height={height}
                      fill="rgba(35, 92, 168, 0.08)"
                      stroke="#1a3558"
                      strokeWidth="3.5"
                      strokeDasharray="10 7"
                      rx="4"
                    />
                    <text x={left + 10} y={top - 10} fill="#10233d" fontSize="12">
                      Release to place a rectangular room
                    </text>
                  </>
                );
              })()}
            </g>
          ) : null}

          {scaleMeasureDraft || scaleDraft ? (
            <g pointerEvents="none">
              <line
                x1={toCanvasPoint((scaleMeasureDraft || scaleDraft).start, roomBox, roomSize.bounds).x}
                y1={toCanvasPoint((scaleMeasureDraft || scaleDraft).start, roomBox, roomSize.bounds).y}
                x2={toCanvasPoint((scaleMeasureDraft || scaleDraft).end, roomBox, roomSize.bounds).x}
                y2={toCanvasPoint((scaleMeasureDraft || scaleDraft).end, roomBox, roomSize.bounds).y}
                stroke="#c76f16"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="8 6"
                opacity="0.94"
              />
              <circle
                cx={toCanvasPoint((scaleMeasureDraft || scaleDraft).start, roomBox, roomSize.bounds).x}
                cy={toCanvasPoint((scaleMeasureDraft || scaleDraft).start, roomBox, roomSize.bounds).y}
                r="5"
                fill="#fff7eb"
                stroke="#c76f16"
                strokeWidth="2"
              />
              <circle
                cx={toCanvasPoint((scaleMeasureDraft || scaleDraft).end, roomBox, roomSize.bounds).x}
                cy={toCanvasPoint((scaleMeasureDraft || scaleDraft).end, roomBox, roomSize.bounds).y}
                r="5"
                fill="#fff7eb"
                stroke="#c76f16"
                strokeWidth="2"
              />
            </g>
          ) : null}

          {windows.map((windowItem, index) => {
            const renderedWindow = getPreviewItem("windows", index, windowItem);
            const x = roomBox.x + (renderedWindow.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (renderedWindow.y_percent / 100) * roomBox.height;
            const windowLength = Math.max(24, ((Number(renderedWindow.width_percent) || 14) / 100) * Math.min(roomBox.width, roomBox.height));
            return (
              <g
                key={`window-${index}`}
                className={`workspace-opening${dragState?.type === "windows" && dragState?.index === index ? " is-dragging" : ""}`}
                transform={`translate(${x} ${y}) rotate(${renderedWindow.rotation_deg || 0})`}
                onPointerDown={(event) => startDrag("windows", index, event)}
                onDoubleClick={() =>
                  updatePlacedItem("windows", index, { rotation_deg: ((windowItem.rotation_deg || 0) + 90) % 360 })
                }
              >
                <line x1={-windowLength / 2} y1="0" x2={windowLength / 2} y2="0" stroke="#1877f2" strokeWidth="8" strokeLinecap="round" />
              </g>
            );
          })}

          {doors.map((doorItem, index) => {
            const renderedDoor = getPreviewItem("doors", index, doorItem);
            const renderedSwingDirection = getRenderedDoorSwingDirection(renderedDoor, wallGraph.outerPolygon);
            const x = roomBox.x + (renderedDoor.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (renderedDoor.y_percent / 100) * roomBox.height;
            return (
              <g
                key={`door-${index}`}
                className={`workspace-opening${dragState?.type === "doors" && dragState?.index === index ? " is-dragging" : ""}`}
                transform={`translate(${x} ${y}) rotate(${renderedDoor.rotation_deg || 0})`}
                onPointerDown={(event) => startDrag("doors", index, event)}
                onDoubleClick={() =>
                  updatePlacedItem("doors", index, cycleDoorOrientation(doorItem))
                }
              >
                <DoorShape
                  hingeSide={renderedDoor.hinge_side}
                  swingDirection={renderedSwingDirection}
                />
              </g>
            );
          })}

          {furniture.map((item, index) => {
            const renderedItem = getPreviewItem("furniture", index, item);
            const definition = getObjectDefinition(item.type);
            const { width, height } = objectPixelSize(renderedItem, roomBox);
            const x = roomBox.x + (renderedItem.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (renderedItem.y_percent / 100) * roomBox.height;

            return (
              <g
                key={`furniture-${index}`}
                transform={`translate(${x - width / 2} ${y - height / 2}) rotate(${renderedItem.rotation_deg || 0} ${width / 2} ${height / 2})`}
                onPointerDown={(event) => startDrag("furniture", index, event)}
                onDoubleClick={() => updatePlacedItem("furniture", index, { rotation_deg: rotateByStep(item.rotation_deg) })}
              >
                <g className={`workspace-object workspace-object--${item.type.replace(/_/g, "-")}${dragState?.type === "furniture" && dragState?.index === index ? " is-dragging" : ""}${selectedPlacedItem?.type === "furniture" && selectedPlacedItem?.index === index ? " is-selected" : ""}`}>
                  <SvgObjectShape
                    item={renderedItem}
                    roomBox={roomBox}
                    fill={definition.tone}
                    stroke={definition.stroke}
                    strokeWidth={1.5}
                    label={null}
                  />
                </g>
              </g>
            );
          })}

          {desks.map((desk, index) => {
            const renderedDesk = getPreviewItem("desks", index, desk);
            const definition = getObjectDefinition(desk.type);
            const { width, height } = objectPixelSize(renderedDesk, roomBox);
            const x = roomBox.x + (renderedDesk.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (renderedDesk.y_percent / 100) * roomBox.height;

            return (
              <g
                key={`desk-${index}`}
                transform={`translate(${x - width / 2} ${y - height / 2}) rotate(${renderedDesk.rotation_deg || 0} ${width / 2} ${height / 2})`}
                onPointerDown={(event) => startDrag("desks", index, event)}
                onDoubleClick={() => updatePlacedItem("desks", index, { rotation_deg: rotateByStep(desk.rotation_deg) })}
              >
                <g className={`workspace-object workspace-object--${desk.type.replace(/_/g, "-")}${dragState?.type === "desks" && dragState?.index === index ? " is-dragging" : ""}${selectedPlacedItem?.type === "desks" && selectedPlacedItem?.index === index ? " is-selected" : ""}`}>
                  <SvgObjectShape
                    item={renderedDesk}
                    roomBox={roomBox}
                    fill={definition.tone}
                    stroke={definition.stroke}
                    strokeWidth={2}
                    label={null}
                  />
                </g>
              </g>
            );
          })}

          {zones.map((zone) => {
            const center = toCanvasPoint({ x: zone.center.x, y: zone.center.y }, roomBox, roomSize.bounds);
            const isActive = hoveredZoneId === zone.id || pinnedZoneId === zone.id;
            const popupMargin = 14;
            const popupGap = 18;
            const popupWidth = pinnedZoneId === zone.id ? 248 : 232;
            const popupHeight = pinnedZoneId === zone.id ? 176 : 126;
            const preferredPopupX = center.x <= CANVAS_WIDTH / 2
              ? center.x + popupGap
              : center.x - popupWidth - popupGap;
            const preferredPopupY = center.y - popupHeight - popupGap >= popupMargin
              ? center.y - popupHeight - popupGap
              : center.y + popupGap;
            const popupX = clampValue(preferredPopupX, popupMargin, CANVAS_WIDTH - popupWidth - popupMargin);
            const popupY = clampValue(preferredPopupY, popupMargin, CANVAS_HEIGHT - popupHeight - popupMargin);

            return (
              <g key={`${zone.id}-marker-layer`}>
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={isActive ? zoneMarkerRadius + 2 : zoneMarkerRadius}
                  fill={zone.markerColor}
                  fillOpacity={isActive ? "0.94" : "0.82"}
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  className={`zone-marker${isActive ? " is-active" : ""}`}
                  onPointerEnter={() => setHoveredZoneId(zone.id)}
                  onPointerLeave={() => setHoveredZoneId((current) => (current === zone.id && pinnedZoneId !== zone.id ? null : current))}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinnedZoneId((current) => (current === zone.id ? null : zone.id));
                  }}
                />
                {(isActive || pinnedZoneId === zone.id) ? (
                  <foreignObject
                    x={popupX}
                    y={popupY}
                    width={popupWidth}
                    height={popupHeight}
                    onPointerEnter={() => setHoveredZoneId(zone.id)}
                    onPointerLeave={() => setHoveredZoneId((current) => (current === zone.id && pinnedZoneId !== zone.id ? null : current))}
                  >
                    <div
                      className="zone-popup"
                      style={{ background: zone.popupColor, borderColor: zone.markerColor }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <strong>{zone.label}</strong>
                      <p>{zone.description}</p>
                      {pinnedZoneId === zone.id ? (
                        <label>
                          <span>Zone type</span>
                          <select
                            value={zone.type}
                            onChange={(event) => onZoneOverride?.(zone.id, event.target.value)}
                          >
                            {getZoneTypeOptions().map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <small>Click the marker to change this zone.</small>
                      )}
                    </div>
                  </foreignObject>
                ) : null}
              </g>
            );
          })}

          {(wallToolMode === "add" || wallToolMode === "rect" || scaleToolActive || northToolActive) ? (
            <rect
              x={roomBox.x}
              y={roomBox.y}
              width={roomBox.width}
              height={roomBox.height}
              fill="rgba(0, 0, 0, 0.001)"
              pointerEvents="all"
              onPointerDown={(event) => {
                if (wallToolMode === "add") {
                  startWallDrawDrag(event);
                  return;
                }
                if (wallToolMode === "rect") {
                  startRectangleRoomDrag(event);
                  return;
                }
                if (scaleToolActive) {
                  startScaleDrag(event);
                  return;
                }
                if (northToolActive) {
                  startNorthDrag(event);
                }
              }}
              onPointerMove={(event) => {
                if (dragStateRef.current?.kind === "wall-draw") {
                  updateWallDrawPointer(getSvgPointFromClient(event.clientX, event.clientY));
                } else if (dragStateRef.current?.kind === "room-rect") {
                  updateRectangleRoomPointer(getSvgPointFromClient(event.clientX, event.clientY));
                } else if (dragStateRef.current?.kind === "scale-measure") {
                  updateScalePointer(getSvgPointFromClient(event.clientX, event.clientY));
                } else if (dragStateRef.current?.kind === "north-set") {
                  updateNorthPointer(getSvgPointFromClient(event.clientX, event.clientY));
                }
              }}
              onPointerUp={(event) => {
                if (dragStateRef.current?.kind === "wall-draw") {
                  finishWallDraw(event.clientX, event.clientY);
                } else if (dragStateRef.current?.kind === "room-rect") {
                  finishDrag(event.clientX, event.clientY);
                } else if (dragStateRef.current?.kind === "scale-measure") {
                  finishScaleDrag(event.clientX, event.clientY);
                } else if (dragStateRef.current?.kind === "north-set") {
                  finishNorthDrag(event.clientX, event.clientY);
                }
              }}
            />
          ) : null}
        </svg>
      </div>
    </div>
  );
}
