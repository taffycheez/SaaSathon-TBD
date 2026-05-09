import { Fragment, useEffect, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Text, Group, Image as KonvaImage } from "react-konva";
import useImage from "use-image";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const PADDING = 40;
const DESK_WIDTH = 50;
const DESK_HEIGHT = 28;

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

function pointFromWall(item, walls, roomBox, bounds) {
  const wall = walls[item.wall_index];
  if (!wall) {
    return { x: roomBox.x, y: roomBox.y };
  }

  const ratio = Math.max(0, Math.min(1, (item.position_percent || 0) / 100));
  return toCanvasPoint({
    x: wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio,
    y: wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio
  }, roomBox, bounds);
}

function clampDeskPosition(pointer, roomBox) {
  return {
    x_percent: Math.max(0, Math.min(100, ((pointer.x - roomBox.x) / roomBox.width) * 100)),
    y_percent: Math.max(0, Math.min(100, ((pointer.y - roomBox.y) / roomBox.height) * 100))
  };
}

function projectPointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) {
    return { point: start, ratio: 0, distanceSquared: (point.x - start.x) ** 2 + (point.y - start.y) ** 2 };
  }

  const rawRatio = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const ratio = Math.max(0, Math.min(1, rawRatio));
  const projected = {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio
  };

  return {
    point: projected,
    ratio,
    distanceSquared: (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2
  };
}

export default function FloorPlanEditor({ room, setRoom, imagePreview }) {
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

  function updateEdgeItem(type, index, pointerPosition) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        const normalizedPointer = fromCanvasPoint(pointerPosition, roomBox, roomSize.bounds);
        let bestWallIndex = item.wall_index ?? 0;
        let bestPositionPercent = item.position_percent ?? 0;
        let bestDistance = Number.POSITIVE_INFINITY;

        currentRoom.walls.forEach((wall, wallIndex) => {
          const projection = projectPointToSegment(
            normalizedPointer,
            { x: wall.x1_percent, y: wall.y1_percent },
            { x: wall.x2_percent, y: wall.y2_percent }
          );

          if (projection.distanceSquared < bestDistance) {
            bestDistance = projection.distanceSquared;
            bestWallIndex = wallIndex;
            bestPositionPercent = projection.ratio * 100;
          }
        });

        return {
          ...item,
          wall_index: bestWallIndex,
          position_percent: bestPositionPercent
        };
      })
    }));
  }

  function updateDesk(index, updates) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      desks: currentRoom.desks.map((desk, deskIndex) =>
        deskIndex === index ? { ...desk, ...updates } : desk
      )
    }));
  }

  return (
    <div className="editor-card">
      <div className="editor-header">
        <div>
          <p className="upload-kicker">Step 2</p>
          <h2>Fine-tune the floor plan</h2>
        </div>
        <p className="editor-note">Detected walls are drawn as segments. Drag windows, doors, and desks. Double-click a desk to rotate it.</p>
      </div>

      <div
        ref={shellRef}
        className="floor-stage-shell"
        style={{ height: CANVAS_HEIGHT * stageScale }}
      >
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

          {imagePreview ? (
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
              <Line
                key={`wall-${index}`}
                points={[start.x, start.y, end.x, end.y]}
                stroke="#10233d"
                strokeWidth={4}
                lineCap="round"
              />
            );
          })}

          {windows.map((windowItem, index) => {
            const point = pointFromWall(windowItem, walls, roomBox, roomSize.bounds);
            const wall = walls[windowItem.wall_index];
            const isHorizontal = wall ? Math.abs(wall.x2_percent - wall.x1_percent) >= Math.abs(wall.y2_percent - wall.y1_percent) : true;
            return (
              <Group
                key={`window-${index}`}
                draggable
                dragBoundFunc={(pos) => {
                  updateEdgeItem("windows", index, pos);
                  return pos;
                }}
              >
                <Line
                  points={
                    isHorizontal
                      ? [point.x - 26, point.y, point.x + 26, point.y]
                      : [point.x, point.y - 26, point.x, point.y + 26]
                  }
                  stroke="#1877f2"
                  strokeWidth={8}
                  lineCap="round"
                />
              </Group>
            );
          })}

          {doors.map((doorItem, index) => {
            const point = pointFromWall(doorItem, walls, roomBox, roomSize.bounds);
            const wall = walls[doorItem.wall_index];
            const isHorizontal = wall ? Math.abs(wall.x2_percent - wall.x1_percent) >= Math.abs(wall.y2_percent - wall.y1_percent) : true;
            return (
              <Group
                key={`door-${index}`}
                draggable
                dragBoundFunc={(pos) => {
                  updateEdgeItem("doors", index, pos);
                  return pos;
                }}
              >
                <Line
                  points={
                    isHorizontal
                      ? [point.x - 18, point.y, point.x + 18, point.y]
                      : [point.x, point.y - 18, point.x, point.y + 18]
                  }
                  stroke="#8b5e34"
                  strokeWidth={10}
                  lineCap="round"
                />
              </Group>
            );
          })}

          {furniture.map((item, index) => {
            const x = roomBox.x + (item.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (item.y_percent / 100) * roomBox.height;
            const width = Math.max(18, (item.width_percent / 100) * roomBox.width);
            const height = Math.max(14, (item.height_percent / 100) * roomBox.height);

            return (
              <Group
                key={`furniture-${index}`}
                x={x}
                y={y}
                rotation={item.rotation_deg || 0}
                offsetX={width / 2}
                offsetY={height / 2}
              >
                <Rect
                  width={width}
                  height={height}
                  fill={item.type === "desk" ? "#d7e9ff" : "#d8dee8"}
                  stroke="#6c7c8f"
                  strokeWidth={1.5}
                  cornerRadius={6}
                />
                <Text
                  text={item.type === "desk" ? "Desk" : item.type}
                  x={6}
                  y={Math.max(2, height / 2 - 8)}
                  fontSize={12}
                  fill="#304860"
                />
              </Group>
            );
          })}

          {desks.map((desk, index) => {
            const x = roomBox.x + (desk.x_percent / 100) * roomBox.width;
            const y = roomBox.y + (desk.y_percent / 100) * roomBox.height;

            return (
              <Group
                key={`desk-${index}`}
                x={x}
                y={y}
                rotation={desk.rotation_deg}
                offsetX={DESK_WIDTH / 2}
                offsetY={DESK_HEIGHT / 2}
                draggable
                onDragMove={(event) => {
                  const next = clampDeskPosition(event.target.position(), roomBox);
                  updateDesk(index, next);
                }}
                onDblClick={() => updateDesk(index, { rotation_deg: (desk.rotation_deg + 90) % 360 })}
              >
                <Rect
                  width={DESK_WIDTH}
                  height={DESK_HEIGHT}
                  fill="#8ec5ff"
                  stroke="#0f4c81"
                  strokeWidth={2}
                  cornerRadius={6}
                />
                <Text text={`D${index + 1}`} x={12} y={7} fontSize={13} fill="#0f2a43" />
              </Group>
            );
          })}
        </Layer>
        </Stage>
      </div>
    </div>
  );
}
