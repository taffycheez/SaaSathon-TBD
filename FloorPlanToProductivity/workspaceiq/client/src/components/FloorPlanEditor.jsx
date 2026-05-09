import { Fragment, useEffect, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Text, Group, Ellipse, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import { getObjectDefinition } from "../objectCatalog";
import { deriveOpeningRenderData, snapOpeningToWall } from "../lib/roomState";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const PADDING = 40;
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
    scale,
    bounds
  };
}

function toCanvasPoint(point, roomBox, bounds) {
  return {
    x: roomBox.x + ((point.x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX)) * roomBox.width,
    y: roomBox.y + ((point.y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY)) * roomBox.height
  };
}

function fromCanvasPoint(point, roomBox, bounds) {
  return {
    x: bounds.minX + ((point.x - roomBox.x) / roomBox.width) * (bounds.maxX - bounds.minX),
    y: bounds.minY + ((point.y - roomBox.y) / roomBox.height) * (bounds.maxY - bounds.minY)
  };
}

function getObjectPosition(pointer, roomBox, options = {}) {
  const { clampToRoom = true } = options;
  const xPercent = ((pointer.x - roomBox.x) / roomBox.width) * 100;
  const yPercent = ((pointer.y - roomBox.y) / roomBox.height) * 100;

  return {
    x_percent: clampToRoom ? Math.max(0, Math.min(100, xPercent)) : xPercent,
    y_percent: clampToRoom ? Math.max(0, Math.min(100, yPercent)) : yPercent
  };
}

function objectPixelSize(item, roomBox) {
  return {
    width: Math.max(18, (item.width_percent / 100) * roomBox.width),
    height: Math.max(14, (item.height_percent / 100) * roomBox.height)
  };
}

function getLabel(item, fallbackLabel) {
  return getObjectDefinition(item.type).label || fallbackLabel;
}

function HistoryIcon({ direction = "undo" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`history-button-icon ${direction === "redo" ? "is-redo" : ""}`}
      aria-hidden="true"
    >
      <polyline points="10 6 4 12 10 18" />
      <path d="M5 12h8c3.87 0 7 3.13 7 7" />
    </svg>
  );
}

const ANIMATED_FURNITURE_TYPES = new Set(["chair", "armchair", "plant", "whiteboard"]);

function renderObjectLabel(label, width, height, stroke, options = {}) {
  if (!label) {
    return null;
  }

  const { y = Math.max(4, height - 14), fontSize = 10.5 } = options;
  return (
    <Text
      text={label}
      x={4}
      y={y}
      width={Math.max(24, width - 8)}
      align="center"
      fontSize={fontSize}
      fill={stroke}
      listening={false}
    />
  );
}

function ChairShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.4, strokeWidth * 0.7);
  return (
    <>
      <Rect
        x={width * 0.22}
        y={height * 0.26}
        width={width * 0.56}
        height={height * 0.28}
        cornerRadius={Math.max(4, width * 0.08)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Rect
        x={width * 0.2}
        y={height * 0.06}
        width={width * 0.6}
        height={height * 0.24}
        cornerRadius={Math.max(4, width * 0.08)}
        fill="#f7fbff"
        stroke={stroke}
        strokeWidth={detailStroke}
      />
      <Line points={[width * 0.3, height * 0.54, width * 0.24, height * 0.86]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.7, height * 0.54, width * 0.76, height * 0.86]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.38, height * 0.54, width * 0.38, height * 0.92]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.62, height * 0.54, width * 0.62, height * 0.92]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.33, height * 0.78, width * 0.67, height * 0.78]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" opacity={0.72} />
    </>
  );
}

function ArmchairShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.3, strokeWidth * 0.68);
  return (
    <>
      <Rect
        x={width * 0.22}
        y={height * 0.2}
        width={width * 0.56}
        height={height * 0.32}
        cornerRadius={Math.max(6, width * 0.12)}
        fill="#eef8f2"
        stroke={stroke}
        strokeWidth={detailStroke}
      />
      <Rect
        x={width * 0.14}
        y={height * 0.34}
        width={width * 0.14}
        height={height * 0.2}
        cornerRadius={Math.max(4, width * 0.1)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Rect
        x={width * 0.72}
        y={height * 0.34}
        width={width * 0.14}
        height={height * 0.2}
        cornerRadius={Math.max(4, width * 0.1)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Rect
        x={width * 0.24}
        y={height * 0.32}
        width={width * 0.52}
        height={height * 0.28}
        cornerRadius={Math.max(6, width * 0.12)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Line points={[width * 0.3, height * 0.6, width * 0.25, height * 0.88]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.7, height * 0.6, width * 0.75, height * 0.88]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
    </>
  );
}

function PlantShape({ width, height, stroke }) {
  return (
    <>
      <Line points={[width * 0.5, height * 0.46, width * 0.5, height * 0.6]} stroke={stroke} strokeWidth={Math.max(1.5, width * 0.08)} lineCap="round" />
      <Ellipse
        x={width * 0.5}
        y={height * 0.18}
        radiusX={Math.max(6, width * 0.14)}
        radiusY={Math.max(8, height * 0.22)}
        rotation={-4}
        fill="#89c86f"
        stroke={stroke}
        strokeWidth={1.6}
      />
      <Ellipse
        x={width * 0.34}
        y={height * 0.3}
        radiusX={Math.max(5, width * 0.12)}
        radiusY={Math.max(8, height * 0.2)}
        rotation={-34}
        fill="#b8e4a2"
        stroke={stroke}
        strokeWidth={1.4}
      />
      <Ellipse
        x={width * 0.66}
        y={height * 0.3}
        radiusX={Math.max(5, width * 0.12)}
        radiusY={Math.max(8, height * 0.2)}
        rotation={34}
        fill="#c8ebb7"
        stroke={stroke}
        strokeWidth={1.4}
      />
      <Rect
        x={width * 0.26}
        y={height * 0.6}
        width={width * 0.48}
        height={height * 0.18}
        cornerRadius={Math.max(4, width * 0.08)}
        fill="#b57c47"
        stroke="#7a512f"
        strokeWidth={1.6}
      />
      <Ellipse
        x={width * 0.5}
        y={height * 0.8}
        radiusX={Math.max(7, width * 0.26)}
        radiusY={Math.max(3, height * 0.05)}
        fill="#8f6036"
        stroke="#7a512f"
        strokeWidth={1.2}
      />
    </>
  );
}

function WhiteboardShape({ width, height, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.2, strokeWidth * 0.62);
  return (
    <>
      <Rect
        x={width * 0.12}
        y={height * 0.08}
        width={width * 0.76}
        height={height * 0.48}
        cornerRadius={Math.max(6, height * 0.14)}
        fill="#ffffff"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Line points={[width * 0.2, height * 0.22, width * 0.8, height * 0.22]} stroke="#d7e4ef" strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.2, height * 0.38, width * 0.72, height * 0.38]} stroke="#e7eef5" strokeWidth={detailStroke} lineCap="round" />
      <Ellipse x={width * 0.22} y={height * 0.18} radiusX={2.2} radiusY={2.2} fill="#74a3d3" />
      <Ellipse x={width * 0.78} y={height * 0.18} radiusX={2.2} radiusY={2.2} fill="#7ec18e" />
      <Rect
        x={width * 0.28}
        y={height * 0.58}
        width={width * 0.44}
        height={Math.max(3, height * 0.05)}
        cornerRadius={999}
        fill={stroke}
        opacity={0.72}
      />
      <Line points={[width * 0.34, height * 0.58, width * 0.22, height * 0.92]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.66, height * 0.58, width * 0.78, height * 0.92]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
    </>
  );
}

function DeskChairInset({ x, y, width, height, strokeWidth }) {
  const chairDefinition = getObjectDefinition("chair");
  return (
    <Group x={x} y={y}>
      <ChairShape
        width={width}
        height={height}
        fill={chairDefinition.tone}
        stroke={chairDefinition.stroke}
        strokeWidth={strokeWidth}
      />
    </Group>
  );
}

function DeskShape({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1.15, strokeWidth * 0.7);
  const chairWidth = Math.max(12, width * 0.32);
  const chairHeight = Math.max(10, height * 0.42);

  return (
    <>
      <Rect
        x={width * 0.14}
        y={height * 0.08}
        width={width * 0.72}
        height={height * 0.34}
        cornerRadius={Math.max(4, width * 0.08)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Line points={[width * 0.2, height * 0.42, width * 0.18, height * 0.66]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.32, height * 0.42, width * 0.32, height * 0.58]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.68, height * 0.42, width * 0.68, height * 0.58]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <Line points={[width * 0.8, height * 0.42, width * 0.82, height * 0.66]} stroke={stroke} strokeWidth={detailStroke} lineCap="round" />
      <DeskChairInset
        x={width * 0.34}
        y={height * 0.48}
        width={chairWidth}
        height={chairHeight}
        strokeWidth={detailStroke}
      />
    </>
  );
}

function LShapedDeskShape({ width, height, fill, stroke, strokeWidth, footprintPoints }) {
  const detailStroke = Math.max(1.15, strokeWidth * 0.68);
  const points = footprintPoints.flatMap((point) => [
    width / 2 + (point.x_percent / 100) * width,
    height / 2 + (point.y_percent / 100) * height
  ]);

  return (
    <>
      <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} lineJoin="round" />
      <Line
        points={[
          width * 0.58,
          height * 0.08,
          width * 0.58,
          height * 0.42,
          width * 0.86,
          height * 0.42
        ]}
        stroke={stroke}
        strokeWidth={detailStroke}
        lineJoin="round"
        opacity={0.34}
      />
      <DeskChairInset
        x={width * 0.16}
        y={height * 0.52}
        width={Math.max(12, width * 0.3)}
        height={Math.max(10, height * 0.36)}
        strokeWidth={detailStroke}
      />
    </>
  );
}

function getInteractiveMotion(type, mode = "idle") {
  if (!ANIMATED_FURNITURE_TYPES.has(type)) {
    return null;
  }

  const shadowColor = type === "plant"
    ? "#48703d"
    : type === "whiteboard"
      ? "#607587"
      : type === "chair"
        ? "#31526f"
        : "#2b6b53";

  if (mode === "dragging") {
    return {
      duration: 0.16,
      scale: type === "whiteboard" ? 1.04 : 1.08,
      shadowColor,
      shadowBlur: 24,
      shadowOpacity: 0.18,
      shadowOffsetY: 7
    };
  }

  if (mode === "hover") {
    return {
      duration: 0.18,
      scale: type === "whiteboard" ? 1.025 : 1.05,
      shadowColor,
      shadowBlur: 16,
      shadowOpacity: 0.12,
      shadowOffsetY: 4
    };
  }

  return {
    duration: 0.14,
    scale: 1,
    shadowColor,
    shadowBlur: 0,
    shadowOpacity: 0,
    shadowOffsetY: 0
  };
}

function animateInteractiveNode(node, type, mode = "idle") {
  const motion = getInteractiveMotion(type, mode);
  if (!node || !motion) {
    return;
  }

  node.to({
    duration: motion.duration,
    scaleX: motion.scale,
    scaleY: motion.scale,
    shadowColor: motion.shadowColor,
    shadowBlur: motion.shadowBlur,
    shadowOpacity: motion.shadowOpacity,
    shadowOffsetX: 0,
    shadowOffsetY: motion.shadowOffsetY
  });
}

function markNodeDragging(node, dragging) {
  if (!node) {
    return;
  }

  node.setAttr("workspaceiqDragging", dragging);
}

function nodeIsDragging(node) {
  return Boolean(node?.getAttr?.("workspaceiqDragging"));
}

function FootprintShape({ item, roomBox, fill, stroke, strokeWidth = 2, label }) {
  const { width, height } = objectPixelSize(item, roomBox);
  const definition = getObjectDefinition(item.type);
  const shapeKind = item.shape_kind || definition.shape_kind;

  if (item.type === "desk") {
    return (
      <>
        <DeskShape width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {renderObjectLabel(label, width, height, stroke, { y: Math.max(4, height * 0.12), fontSize: 10.5 })}
      </>
    );
  }

  if (item.type === "l_shaped_desk") {
    const footprintPoints = Array.isArray(item.footprint_points) && item.footprint_points.length >= 3
      ? item.footprint_points
      : normalizeFootprintPoints(definition.footprint_points, definition.footprint_points);

    return (
      <>
        <LShapedDeskShape
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          footprintPoints={footprintPoints}
        />
        {renderObjectLabel(label, width, height, stroke, { y: Math.max(4, height * 0.12), fontSize: 10.5 })}
      </>
    );
  }

  if (item.type === "chair") {
    return <ChairShape width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (item.type === "armchair") {
    return <ArmchairShape width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (item.type === "plant") {
    return <PlantShape width={width} height={height} stroke={stroke} />;
  }

  if (item.type === "whiteboard") {
    return <WhiteboardShape width={width} height={height} stroke={stroke} strokeWidth={strokeWidth} />;
  }

  if (shapeKind === "ellipse") {
    const seatCount = definition.seat_count || 0;
    return (
      <>
        <Ellipse
          x={width / 2}
          y={height / 2}
          radiusX={width / 2}
          radiusY={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        {seatCount
          ? Array.from({ length: seatCount }).map((_, index) => {
              const angle = (Math.PI * 2 * index) / seatCount;
              const seatX = width / 2 + Math.cos(angle) * (width * 0.42);
              const seatY = height / 2 + Math.sin(angle) * (height * 0.58);
              return (
                <Ellipse
                  key={`seat-${index}`}
                  x={seatX}
                  y={seatY}
                  radiusX={Math.max(5, width * 0.08)}
                  radiusY={Math.max(4, height * 0.08)}
                  fill="#f8f5ef"
                  stroke={stroke}
                  strokeWidth={1}
                />
              );
            })
          : null}
        {renderObjectLabel(label, width, height, stroke, { y: Math.max(4, height / 2 - 8), fontSize: 12 })}
      </>
    );
  }

  if (shapeKind === "polygon" && Array.isArray(item.footprint_points) && item.footprint_points.length >= 3) {
    const points = item.footprint_points.flatMap((point) => [
      width / 2 + (point.x_percent / 100) * width,
      height / 2 + (point.y_percent / 100) * height
    ]);
    return (
      <>
        <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {renderObjectLabel(label, width, height, stroke, { y: Math.max(4, height / 2 - 8), fontSize: 12 })}
      </>
    );
  }

  return (
    <>
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        cornerRadius={shapeKind === "rect" ? 6 : 0}
      />
      {renderObjectLabel(label, width, height, stroke, { y: Math.max(4, height / 2 - 8), fontSize: 12 })}
    </>
  );
}

export default function FloorPlanEditor(
{
  room,
  setRoom,
  onRoomPreviewChange,
  imagePreview,
  showReferenceImage = false,
  onActionStart,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) {
  const shellRef = useRef(null);
  const trashRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);
  const [isTrashHot, setIsTrashHot] = useState(false);
  const walls = Array.isArray(room.walls) ? room.walls : [];
  const windows = Array.isArray(room.windows) ? room.windows : [];
  const doors = Array.isArray(room.doors) ? room.doors : [];
  const furniture = Array.isArray(room.furniture) ? room.furniture : [];
  const desks = Array.isArray(room.desks) ? room.desks : [];
  const [referenceImage] = useImage(imagePreview || "");
  const roomSize = getRoomPixelSize(walls);
  const roomBox = {
    x: (CANVAS_WIDTH - roomSize.width) / 2,
    y: (CANVAS_HEIGHT - roomSize.height) / 2,
    width: roomSize.width,
    height: roomSize.height
  };
  const controlColumn = {
    x: Math.max(12, roomBox.x - 96),
    y: Math.max(12, roomBox.y + 6)
  };
  const trashTarget = {
    x: controlColumn.x,
    y: Math.min(CANVAS_HEIGHT - 72, controlColumn.y + 120),
    size: 58
  };
  const historyControlsStyle = {
    left: `${controlColumn.x * stageScale}px`,
    top: `${controlColumn.y * stageScale}px`,
    transform: `scale(${stageScale})`
  };
  const trashShellStyle = {
    left: `${trashTarget.x * stageScale}px`,
    top: `${trashTarget.y * stageScale}px`,
    transform: `scale(${stageScale})`
  };

  function clearRoomPreview() {
    onRoomPreviewChange?.(null);
  }

  useEffect(() => {
    const node = shellRef.current;
    if (!node) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      setStageScale(Math.min(1, nextWidth / CANVAS_WIDTH));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function withUpdatedPlacedItem(currentRoom, type, index, updates) {
    return {
      ...currentRoom,
      [type]: (currentRoom[type] || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    };
  }

  function updatePlacedItem(type, index, updates) {
    setRoom((currentRoom) => withUpdatedPlacedItem(currentRoom, type, index, updates));
  }

  function previewPlacedItem(type, index, updates) {
    onRoomPreviewChange?.(withUpdatedPlacedItem(room, type, index, updates));
  }

  function getDragClientPoint(event) {
    const sourceEvent = event.evt;
    const touch = sourceEvent?.changedTouches?.[0] || sourceEvent?.touches?.[0];

    if (touch) {
      return { x: touch.clientX, y: touch.clientY };
    }

    if (typeof sourceEvent?.clientX === "number" && typeof sourceEvent?.clientY === "number") {
      return { x: sourceEvent.clientX, y: sourceEvent.clientY };
    }

    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    const containerRect = stage?.container().getBoundingClientRect();

    if (pointer && containerRect) {
      return {
        x: containerRect.left + pointer.x * stageScale,
        y: containerRect.top + pointer.y * stageScale
      };
    }

    return null;
  }

  function isOverTrash(event) {
    const trashRect = trashRef.current?.getBoundingClientRect();
    const point = getDragClientPoint(event);

    if (!trashRect || !point) {
      return false;
    }

    return (
      point.x >= trashRect.left &&
      point.x <= trashRect.right &&
      point.y >= trashRect.top &&
      point.y <= trashRect.bottom
    );
  }

  function updateTrashHover(event) {
    setIsTrashHot(isOverTrash(event));
  }

  function withRemovedPlacedItem(currentRoom, type, index) {
    return {
      ...currentRoom,
      [type]: (currentRoom[type] || []).filter((_item, itemIndex) => itemIndex !== index)
    };
  }

  function removePlacedItem(type, index) {
    setRoom((currentRoom) => withRemovedPlacedItem(currentRoom, type, index));
  }

  function handlePlacedItemDragMove(type, index, event) {
    updateTrashHover(event);

    if (isOverTrash(event)) {
      return;
    }

    previewPlacedItem(
      type,
      index,
      getObjectPosition(event.target.position(), roomBox, { clampToRoom: false })
    );
  }

  function handlePlacedItemDragEnd(type, index, event) {
    const position = event.target.position();
    setIsTrashHot(false);
    clearRoomPreview();

    if (isOverTrash(event)) {
      removePlacedItem(type, index);
      return;
    }

    updatePlacedItem(type, index, getObjectPosition(position, roomBox));
  }

  function handleOpeningDragMove(type, openingType, item, index, event) {
    updateTrashHover(event);

    if (isOverTrash(event)) {
      return;
    }

    previewPlacedItem(
      type,
      index,
      snapOpeningToWall(
        {
          ...item,
          ...getObjectPosition(event.target.position(), roomBox)
        },
        walls,
        openingType
      )
    );
  }

  function handleOpeningDragEnd(type, openingType, item, index, event) {
    const position = event.target.position();
    setIsTrashHot(false);
    clearRoomPreview();

    if (isOverTrash(event)) {
      removePlacedItem(type, index);
      return;
    }

    updatePlacedItem(
      type,
      index,
      snapOpeningToWall(
        {
          ...item,
          ...getObjectPosition(position, roomBox)
        },
        walls,
        openingType
      )
    );
  }

  function moveWall(index, deltaXPercent, deltaYPercent) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      walls: currentRoom.walls.map((wall, wallIndex) => {
        if (wallIndex !== index) {
          return wall;
        }

        return {
          ...wall,
          x1_percent: Math.max(0, Math.min(100, wall.x1_percent + deltaXPercent)),
          y1_percent: Math.max(0, Math.min(100, wall.y1_percent + deltaYPercent)),
          x2_percent: Math.max(0, Math.min(100, wall.x2_percent + deltaXPercent)),
          y2_percent: Math.max(0, Math.min(100, wall.y2_percent + deltaYPercent))
        };
      })
    }));
  }

  function rotateWall(index) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      walls: currentRoom.walls.map((wall, wallIndex) => {
        if (wallIndex !== index) {
          return wall;
        }

        const centerX = (wall.x1_percent + wall.x2_percent) / 2;
        const centerY = (wall.y1_percent + wall.y2_percent) / 2;
        const dx = (wall.x2_percent - wall.x1_percent) / 2;
        const dy = (wall.y2_percent - wall.y1_percent) / 2;

        return {
          ...wall,
          x1_percent: Math.max(0, Math.min(100, centerX + dy)),
          y1_percent: Math.max(0, Math.min(100, centerY - dx)),
          x2_percent: Math.max(0, Math.min(100, centerX - dy)),
          y2_percent: Math.max(0, Math.min(100, centerY + dx))
        };
      })
    }));
  }

  return (
    <div className="editor-card">
      <div className="editor-header">
        <div>
          <p className="upload-kicker">Step 2</p>
          <h2>Fine-tune the floor plan</h2>
        </div>
      </div>

      <div
        ref={shellRef}
        className="floor-stage-shell"
        style={{ height: CANVAS_HEIGHT * stageScale }}
      >
        <div className="editor-history-controls" style={historyControlsStyle}>
          <button
            type="button"
            className="undo-button editor-history-button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label="Undo last change"
            title="Undo"
          >
            <HistoryIcon direction="undo" />
          </button>
          <button
            type="button"
            className="undo-button editor-history-button"
            onClick={onRedo}
            disabled={!canRedo}
            aria-label="Redo last change"
            title="Redo"
          >
            <HistoryIcon direction="redo" />
          </button>
        </div>
        <div ref={trashRef} className="trash-indicator-shell" style={trashShellStyle} aria-hidden="true">
          <div className={`trash-indicator${isTrashHot ? " is-hot" : ""}`}>
            <div className="trash-lid" />
            <div className="trash-handle" />
            <div className="trash-body">
              <span />
              <span />
            </div>
          </div>
        </div>
        <Stage
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          scaleX={stageScale}
          scaleY={stageScale}
          className="floor-stage"
        >
          <Layer>
            {Array.from({ length: 19 }).map((_, index) => {
              const x = PADDING + index * ((CANVAS_WIDTH - PADDING * 2) / 18);
              const y = PADDING + index * ((CANVAS_HEIGHT - PADDING * 2) / 18);
              return (
                <Fragment key={`grid-${index}`}>
                  <Line points={[x, PADDING, x, CANVAS_HEIGHT - PADDING]} stroke="#e3e8ef" strokeWidth={1} />
                  <Line points={[PADDING, y, CANVAS_WIDTH - PADDING, y]} stroke="#e3e8ef" strokeWidth={1} />
                </Fragment>
              );
            })}

            {imagePreview && showReferenceImage ? (
              <>
                <Text
                  x={roomBox.x}
                  y={roomBox.y - 24}
                  text="Reference image uploaded"
                  fill="#53708f"
                  fontSize={14}
                />
                {referenceImage ? (
                  <Group clipX={roomBox.x} clipY={roomBox.y} clipWidth={roomBox.width} clipHeight={roomBox.height}>
                    <KonvaImage
                      image={referenceImage}
                      x={roomBox.x}
                      y={roomBox.y}
                      width={roomBox.width}
                      height={roomBox.height}
                      opacity={0.55}
                      listening={false}
                    />
                  </Group>
                ) : null}
              </>
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
                <Group
                  key={wall.id || `wall-${index}`}
                  draggable
                  onDragStart={() => {
                    onActionStart?.();
                    clearRoomPreview();
                    setIsTrashHot(false);
                  }}
                  onDragEnd={(event) => {
                    setIsTrashHot(false);
                    const deltaXPercent = (event.target.x() / roomBox.width) * (roomSize.bounds.maxX - roomSize.bounds.minX);
                    const deltaYPercent = (event.target.y() / roomBox.height) * (roomSize.bounds.maxY - roomSize.bounds.minY);
                    moveWall(index, deltaXPercent, deltaYPercent);
                    event.target.position({ x: 0, y: 0 });
                  }}
                  onDblClick={() => {
                    onActionStart?.();
                    rotateWall(index);
                  }}
                >
                  <Line
                    points={[start.x, start.y, end.x, end.y]}
                    stroke="#10233d"
                    strokeWidth={4}
                    lineCap="round"
                  />
                </Group>
              );
            })}

            {windows.map((windowItem, index) => {
              const renderData = deriveOpeningRenderData(windowItem, walls);
              const x = roomBox.x + (renderData.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (renderData.y_percent / 100) * roomBox.height;
              return (
                <Group
                  key={windowItem.id || `window-${index}`}
                  x={x}
                  y={y}
                  rotation={renderData.rotation_deg || 0}
                  offsetX={0}
                  offsetY={0}
                  draggable
                  onDragStart={() => {
                    onActionStart?.();
                    clearRoomPreview();
                    setIsTrashHot(false);
                  }}
                  onDragMove={(event) => handleOpeningDragMove("windows", "window", windowItem, index, event)}
                  onDragEnd={(event) => handleOpeningDragEnd("windows", "window", windowItem, index, event)}
                >
                  <Line
                    points={[-26, 0, 26, 0]}
                    stroke="#1877f2"
                    strokeWidth={8}
                    lineCap="round"
                  />
                </Group>
              );
            })}

            {doors.map((doorItem, index) => {
              const renderData = deriveOpeningRenderData(doorItem, walls);
              const x = roomBox.x + (renderData.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (renderData.y_percent / 100) * roomBox.height;
              return (
                <Group
                  key={doorItem.id || `door-${index}`}
                  x={x}
                  y={y}
                  rotation={renderData.rotation_deg || 0}
                  draggable
                  onDragStart={() => {
                    onActionStart?.();
                    clearRoomPreview();
                    setIsTrashHot(false);
                  }}
                  onDragMove={(event) => handleOpeningDragMove("doors", "door", doorItem, index, event)}
                  onDragEnd={(event) => handleOpeningDragEnd("doors", "door", doorItem, index, event)}
                >
                  <Line
                    points={[-18, 0, 18, 0]}
                    stroke="#8b5e34"
                    strokeWidth={10}
                    lineCap="round"
                  />
                </Group>
              );
            })}

            {furniture.map((item, index) => {
              const definition = getObjectDefinition(item.type);
              const { width, height } = objectPixelSize(item, roomBox);
              const x = roomBox.x + (item.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (item.y_percent / 100) * roomBox.height;

              return (
                <Group
                  key={item.id || `furniture-${index}`}
                  x={x}
                  y={y}
                  rotation={item.rotation_deg || 0}
                  offsetX={width / 2}
                  offsetY={height / 2}
                  draggable
                  onDragStart={(event) => {
                    onActionStart?.();
                    clearRoomPreview();
                    setIsTrashHot(false);
                    markNodeDragging(event.target, true);
                    animateInteractiveNode(event.target, item.type, "dragging");
                  }}
                  onDragMove={(event) => handlePlacedItemDragMove("furniture", index, event)}
                  onDragEnd={(event) => {
                    markNodeDragging(event.target, false);
                    animateInteractiveNode(event.target, item.type, "idle");
                    handlePlacedItemDragEnd("furniture", index, event);
                  }}
                  onMouseEnter={(event) => animateInteractiveNode(event.target, item.type, "hover")}
                  onMouseLeave={(event) => {
                    if (!nodeIsDragging(event.target)) {
                      animateInteractiveNode(event.target, item.type, "idle");
                    }
                  }}
                  onDblClick={() => {
                    onActionStart?.();
                    updatePlacedItem("furniture", index, { rotation_deg: (item.rotation_deg + 90) % 360 });
                  }}
                >
                  <FootprintShape
                    item={item}
                    roomBox={roomBox}
                    fill={definition.tone}
                    stroke={definition.stroke}
                    strokeWidth={1.5}
                    label={getLabel(item, "Object")}
                  />
                </Group>
              );
            })}

            {desks.map((desk, index) => {
              const definition = getObjectDefinition(desk.type);
              const { width, height } = objectPixelSize(desk, roomBox);
              const x = roomBox.x + (desk.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (desk.y_percent / 100) * roomBox.height;

              return (
                <Group
                  key={desk.id || `desk-${index}`}
                  x={x}
                  y={y}
                  rotation={desk.rotation_deg}
                  offsetX={width / 2}
                  offsetY={height / 2}
                  draggable
                  onDragStart={() => {
                    onActionStart?.();
                    clearRoomPreview();
                    setIsTrashHot(false);
                  }}
                  onDragMove={(event) => handlePlacedItemDragMove("desks", index, event)}
                  onDragEnd={(event) => handlePlacedItemDragEnd("desks", index, event)}
                  onDblClick={() => {
                    onActionStart?.();
                    updatePlacedItem("desks", index, { rotation_deg: (desk.rotation_deg + 90) % 360 });
                  }}
                >
                  <FootprintShape
                    item={desk}
                    roomBox={roomBox}
                    fill={definition.tone}
                    stroke={definition.stroke}
                    strokeWidth={2}
                    label={`${getLabel(desk, "Desk")} ${index + 1}`}
                  />
                </Group>
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
