import { Fragment, useEffect, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Text, Group, Ellipse, Image as KonvaImage } from "react-konva";
import useImage from "use-image";
import { getObjectDefinition } from "../objectCatalog";

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

function FootprintShape({ item, roomBox, fill, stroke, strokeWidth = 2, label }) {
  const { width, height } = objectPixelSize(item, roomBox);
  const definition = getObjectDefinition(item.type);
  const shapeKind = item.shape_kind || definition.shape_kind;

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
        <Text text={label} x={6} y={Math.max(2, height / 2 - 8)} fontSize={12} fill={stroke} />
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
        <Text text={label} x={6} y={Math.max(2, height / 2 - 8)} fontSize={12} fill={stroke} />
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
      <Text text={label} x={6} y={Math.max(2, height / 2 - 8)} fontSize={12} fill={stroke} />
    </>
  );
}

export default function FloorPlanEditor({
  room,
  setRoom,
  imagePreview,
  showReferenceImage = false,
  onActionStart,
  onUndo,
  canUndo
}) {
  const shellRef = useRef(null);
  const [stageScale, setStageScale] = useState(1);
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

  function updatePlacedItem(type, index, updates) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    }));
  }

  function isOverTrash(position) {
    return (
      position.x >= TRASH_TARGET.x &&
      position.x <= TRASH_TARGET.x + TRASH_TARGET.size &&
      position.y >= TRASH_TARGET.y &&
      position.y <= TRASH_TARGET.y + TRASH_TARGET.size
    );
  }

  function removePlacedItem(type, index) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  function handlePlacedItemDragEnd(type, index, event) {
    const position = event.target.position();

    if (isOverTrash(position)) {
      removePlacedItem(type, index);
      return;
    }

    updatePlacedItem(type, index, clampObjectPosition(position, roomBox));
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
        <button
          type="button"
          className="undo-button editor-undo-button"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <div className="trash-indicator" aria-hidden="true">
          <div className="trash-lid" />
          <div className="trash-handle" />
          <div className="trash-body">
            <span />
            <span />
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

            <Rect
              x={roomBox.x}
              y={roomBox.y}
              width={roomBox.width}
              height={roomBox.height}
              fill="#f8fbff"
              opacity={0.92}
              strokeEnabled={false}
              cornerRadius={6}
            />

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
                  key={`wall-${index}`}
                  draggable
                  onDragStart={() => onActionStart?.()}
                  onDragEnd={(event) => {
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
              const x = roomBox.x + (windowItem.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (windowItem.y_percent / 100) * roomBox.height;
              return (
                <Group
                  key={`window-${index}`}
                  x={x}
                  y={y}
                  rotation={windowItem.rotation_deg || 0}
                  offsetX={0}
                  offsetY={0}
                  draggable
                  onDragStart={() => onActionStart?.()}
                  onDragMove={(event) => {
                    const next = clampObjectPosition(event.target.position(), roomBox);
                    updatePlacedItem("windows", index, next);
                  }}
                  onDblClick={() => {
                    onActionStart?.();
                    updatePlacedItem("windows", index, { rotation_deg: ((windowItem.rotation_deg || 0) + 90) % 360 });
                  }}
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
              const x = roomBox.x + (doorItem.x_percent / 100) * roomBox.width;
              const y = roomBox.y + (doorItem.y_percent / 100) * roomBox.height;
              return (
                <Group
                  key={`door-${index}`}
                  x={x}
                  y={y}
                  rotation={doorItem.rotation_deg || 0}
                  draggable
                  onDragStart={() => onActionStart?.()}
                  onDragMove={(event) => {
                    const next = clampObjectPosition(event.target.position(), roomBox);
                    updatePlacedItem("doors", index, next);
                  }}
                  onDblClick={() => {
                    onActionStart?.();
                    updatePlacedItem("doors", index, { rotation_deg: ((doorItem.rotation_deg || 0) + 90) % 360 });
                  }}
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
                  key={`furniture-${index}`}
                  x={x}
                  y={y}
                  rotation={item.rotation_deg || 0}
                  offsetX={width / 2}
                  offsetY={height / 2}
                  draggable
                  onDragStart={() => onActionStart?.()}
                  onDragEnd={(event) => handlePlacedItemDragEnd("furniture", index, event)}
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
                  key={`desk-${index}`}
                  x={x}
                  y={y}
                  rotation={desk.rotation_deg}
                  offsetX={width / 2}
                  offsetY={height / 2}
                  draggable
                  onDragStart={() => onActionStart?.()}
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
