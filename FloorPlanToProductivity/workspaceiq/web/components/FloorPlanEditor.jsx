import { useMemo, useRef, useState } from "react";
import { getObjectDefinition } from "@/lib/objectCatalog";
import { normalizeWallGraph } from "@/lib/roomGeometry";
import { updateEdgeItemPosition, updatePlacedObjectPosition } from "@/lib/roomState";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const PADDING = 40;
const TRASH_TARGET = {
  x: CANVAS_WIDTH - PADDING - 70,
  y: CANVAS_HEIGHT - PADDING - 70,
  size: 58
};

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

function clampObjectPosition(pointer, roomBox) {
  return {
    x_percent: Math.max(0, Math.min(100, ((pointer.x - roomBox.x) / roomBox.width) * 100)),
    y_percent: Math.max(0, Math.min(100, ((pointer.y - roomBox.y) / roomBox.height) * 100))
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

function pointsToString(points, width, height) {
  return points
    .map((point) => `${width / 2 + (point.x_percent / 100) * width},${height / 2 + (point.y_percent / 100) * height}`)
    .join(" ");
}

function SvgObjectShape({ item, roomBox, fill, stroke, strokeWidth = 2, label }) {
  const { width, height } = objectPixelSize(item, roomBox);
  const definition = getObjectDefinition(item.type);
  const shapeKind = item.shape_kind || definition.shape_kind;

  if (shapeKind === "ellipse") {
    const seatCount = definition.seat_count || 0;
    return (
      <>
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
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
                <ellipse
                  key={`seat-${index}`}
                  cx={seatX}
                  cy={seatY}
                  rx={Math.max(5, width * 0.08)}
                  ry={Math.max(4, height * 0.08)}
                  fill="#f8f5ef"
                  stroke={stroke}
                  strokeWidth={1}
                />
              );
            })
          : null}
        <text x={6} y={Math.max(14, height / 2 + 4)} fontSize="12" fill={stroke}>
          {label}
        </text>
      </>
    );
  }

  if (shapeKind === "polygon" && Array.isArray(item.footprint_points) && item.footprint_points.length >= 3) {
    return (
      <>
        <polygon
          points={pointsToString(item.footprint_points, width, height)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text x={6} y={Math.max(14, height / 2 + 4)} fontSize="12" fill={stroke}>
          {label}
        </text>
      </>
    );
  }

  return (
    <>
      <rect
        width={width}
        height={height}
        rx={shapeKind === "rect" ? 6 : 0}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <text x={6} y={Math.max(14, height / 2 + 4)} fontSize="12" fill={stroke}>
        {label}
      </text>
    </>
  );
}

function TrashTarget() {
  const centerX = TRASH_TARGET.x + TRASH_TARGET.size / 2;
  const top = TRASH_TARGET.y + 18;
  const left = TRASH_TARGET.x + 18;
  const right = TRASH_TARGET.x + TRASH_TARGET.size - 18;
  const bottom = TRASH_TARGET.y + TRASH_TARGET.size - 14;

  return (
    <g pointerEvents="none">
      <rect
        x={TRASH_TARGET.x}
        y={TRASH_TARGET.y}
        width={TRASH_TARGET.size}
        height={TRASH_TARGET.size}
        fill="#fff2f2"
        stroke="#f0b9b9"
        strokeWidth={2}
        rx={8}
      />
      <line x1={left - 2} y1={top} x2={right + 2} y2={top} stroke="#a83b3b" strokeWidth={3} strokeLinecap="round" />
      <line x1={centerX - 8} y1={top - 6} x2={centerX + 8} y2={top - 6} stroke="#a83b3b" strokeWidth={3} strokeLinecap="round" />
      <line x1={left} y1={top + 7} x2={left + 4} y2={bottom} stroke="#a83b3b" strokeWidth={3} strokeLinecap="round" />
      <line x1={right} y1={top + 7} x2={right - 4} y2={bottom} stroke="#a83b3b" strokeWidth={3} strokeLinecap="round" />
      <line x1={left + 4} y1={bottom} x2={right - 4} y2={bottom} stroke="#a83b3b" strokeWidth={3} strokeLinecap="round" />
      <line x1={centerX - 7} y1={top + 12} x2={centerX - 5} y2={bottom - 6} stroke="#a83b3b" strokeWidth={2} strokeLinecap="round" />
      <line x1={centerX + 7} y1={top + 12} x2={centerX + 5} y2={bottom - 6} stroke="#a83b3b" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

export default function FloorPlanEditor({ room, setRoom, imagePreview, showReferenceImage = false }) {
  const svgRef = useRef(null);
  const [dragState, setDragState] = useState(null);
  const wallGraph = useMemo(() => normalizeWallGraph(room.walls || []), [room.walls]);
  const walls = wallGraph.walls.length ? wallGraph.walls : Array.isArray(room.walls) ? room.walls : [];
  const windows = Array.isArray(room.windows) ? room.windows : [];
  const doors = Array.isArray(room.doors) ? room.doors : [];
  const furniture = Array.isArray(room.furniture) ? room.furniture : [];
  const desks = Array.isArray(room.desks) ? room.desks : [];
  const roomSize = useMemo(() => getRoomPixelSize(walls), [walls]);
  const roomBox = {
    x: (CANVAS_WIDTH - roomSize.width) / 2,
    y: (CANVAS_HEIGHT - roomSize.height) / 2,
    width: roomSize.width,
    height: roomSize.height
  };

  function updatePlacedItem(type, index, updates) {
    setRoom((currentRoom) => {
      if (type === "windows" || type === "doors") {
        return updateEdgeItemPosition(currentRoom, type, index, updates);
      }

      return updatePlacedObjectPosition(currentRoom, type, index, updates);
    });
  }

  function removePlacedItem(type, index) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function getSvgPoint(event) {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    };
  }

  function startDrag(type, index, event) {
    event.preventDefault();
    event.stopPropagation();
    const point = getSvgPoint(event);
    setDragState({ type, index, point });
  }

  function handlePointerMove(event) {
    if (!dragState) {
      return;
    }

    const point = getSvgPoint(event);
    const next = clampObjectPosition(point, roomBox);
    updatePlacedItem(dragState.type, dragState.index, next);
  }

  function handlePointerUp(event) {
    if (!dragState) {
      return;
    }

    const point = getSvgPoint(event);
    const overTrash =
      point.x >= TRASH_TARGET.x &&
      point.x <= TRASH_TARGET.x + TRASH_TARGET.size &&
      point.y >= TRASH_TARGET.y &&
      point.y <= TRASH_TARGET.y + TRASH_TARGET.size;

    if (overTrash) {
      removePlacedItem(dragState.type, dragState.index);
    }

    setDragState(null);
  }

  return (
    <div className="editor-card">
      <div className="editor-header">
        <div>
          <p className="upload-kicker">Step 2</p>
          <h2>Fine-tune the floor plan</h2>
        </div>
      </div>

      <div className="floor-stage-shell">
        <svg
          ref={svgRef}
          className="floor-stage-svg"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
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
              <line
                key={`wall-${index}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={wallGraph.isValid ? "#10233d" : "#b03a3a"}
                strokeWidth="4"
                strokeLinecap="round"
              />
            );
          })}

          {wallGraph.nodes.map((node, index) => {
            const point = toCanvasPoint(node, roomBox, roomSize.bounds);
            return (
              <circle
                key={`wall-node-${index}`}
                cx={point.x}
                cy={point.y}
                r="4"
                fill={wallGraph.isValid ? "#10233d" : "#b03a3a"}
              />
            );
          })}

          {windows.map((windowItem, index) => {
            const x = roomBox.x + (windowItem.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (windowItem.y_percent / 100) * roomBox.height;
            return (
              <g
                key={`window-${index}`}
                transform={`translate(${x} ${y}) rotate(${windowItem.rotation_deg || 0})`}
                onPointerDown={(event) => startDrag("windows", index, event)}
                onDoubleClick={() =>
                  updatePlacedItem("windows", index, { rotation_deg: ((windowItem.rotation_deg || 0) + 90) % 360 })
                }
              >
                <line x1="-26" y1="0" x2="26" y2="0" stroke="#1877f2" strokeWidth="8" strokeLinecap="round" />
              </g>
            );
          })}

          {doors.map((doorItem, index) => {
            const x = roomBox.x + (doorItem.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (doorItem.y_percent / 100) * roomBox.height;
            return (
              <g
                key={`door-${index}`}
                transform={`translate(${x} ${y}) rotate(${doorItem.rotation_deg || 0})`}
                onPointerDown={(event) => startDrag("doors", index, event)}
                onDoubleClick={() =>
                  updatePlacedItem("doors", index, { rotation_deg: ((doorItem.rotation_deg || 0) + 90) % 360 })
                }
              >
                <line x1="-18" y1="0" x2="18" y2="0" stroke="#8b5e34" strokeWidth="10" strokeLinecap="round" />
              </g>
            );
          })}

          {furniture.map((item, index) => {
            const definition = getObjectDefinition(item.type);
            const { width, height } = objectPixelSize(item, roomBox);
            const x = roomBox.x + (item.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (item.y_percent / 100) * roomBox.height;

            return (
              <g
                key={`furniture-${index}`}
                transform={`translate(${x - width / 2} ${y - height / 2}) rotate(${item.rotation_deg || 0} ${width / 2} ${height / 2})`}
                onPointerDown={(event) => startDrag("furniture", index, event)}
                onDoubleClick={() => updatePlacedItem("furniture", index, { rotation_deg: (item.rotation_deg + 90) % 360 })}
              >
                <SvgObjectShape
                  item={item}
                  roomBox={roomBox}
                  fill={definition.tone}
                  stroke={definition.stroke}
                  strokeWidth={1.5}
                  label={getLabel(item, "Object")}
                />
              </g>
            );
          })}

          {desks.map((desk, index) => {
            const definition = getObjectDefinition(desk.type);
            const { width, height } = objectPixelSize(desk, roomBox);
            const x = roomBox.x + (desk.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (desk.y_percent / 100) * roomBox.height;

            return (
              <g
                key={`desk-${index}`}
                transform={`translate(${x - width / 2} ${y - height / 2}) rotate(${desk.rotation_deg || 0} ${width / 2} ${height / 2})`}
                onPointerDown={(event) => startDrag("desks", index, event)}
                onDoubleClick={() => updatePlacedItem("desks", index, { rotation_deg: (desk.rotation_deg + 90) % 360 })}
              >
                <SvgObjectShape
                  item={desk}
                  roomBox={roomBox}
                  fill={definition.tone}
                  stroke={definition.stroke}
                  strokeWidth={2}
                  label={`${getLabel(desk, "Desk")} ${index + 1}`}
                />
              </g>
            );
          })}

          <TrashTarget />
        </svg>
      </div>
    </div>
  );
}
