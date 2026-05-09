import { Fragment } from "react";
import { Layer, Line, Rect, Stage, Text, Group } from "react-konva";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 560;
const PADDING = 40;
const DESK_WIDTH = 50;
const DESK_HEIGHT = 28;

function getRoomPixelSize(room) {
  const scale = Math.min(
    (CANVAS_WIDTH - PADDING * 2) / Math.max(room.estimated_width_m, 1),
    (CANVAS_HEIGHT - PADDING * 2) / Math.max(room.estimated_height_m, 1)
  );

  return {
    width: room.estimated_width_m * scale,
    height: room.estimated_height_m * scale,
    scale
  };
}

function pointFromWall(item, roomBox) {
  if (item.wall === "top") {
    return { x: roomBox.x + (item.position_percent / 100) * roomBox.width, y: roomBox.y };
  }
  if (item.wall === "bottom") {
    return { x: roomBox.x + (item.position_percent / 100) * roomBox.width, y: roomBox.y + roomBox.height };
  }
  if (item.wall === "left") {
    return { x: roomBox.x, y: roomBox.y + (item.position_percent / 100) * roomBox.height };
  }
  return { x: roomBox.x + roomBox.width, y: roomBox.y + (item.position_percent / 100) * roomBox.height };
}

function clampDeskPosition(pointer, roomBox) {
  return {
    x_percent: ((pointer.x - roomBox.x) / roomBox.width) * 100,
    y_percent: ((pointer.y - roomBox.y) / roomBox.height) * 100
  };
}

export default function FloorPlanEditor({ room, setRoom, imagePreview }) {
  const roomSize = getRoomPixelSize(room);
  const roomBox = {
    x: (CANVAS_WIDTH - roomSize.width) / 2,
    y: (CANVAS_HEIGHT - roomSize.height) / 2,
    width: roomSize.width,
    height: roomSize.height
  };

  function updateEdgeItem(type, index, positionPercent) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [type]: currentRoom[type].map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, position_percent: Math.max(0, Math.min(100, positionPercent)) }
          : item
      )
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
        <p className="editor-note">Drag windows, doors, and desks. Double-click a desk to rotate it.</p>
      </div>

      <Stage width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="floor-stage">
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

          {imagePreview ? (
            <Text
              x={roomBox.x}
              y={roomBox.y - 24}
              text="Reference image uploaded"
              fill="#53708f"
              fontSize={14}
            />
          ) : null}

          <Rect
            x={roomBox.x}
            y={roomBox.y}
            width={roomBox.width}
            height={roomBox.height}
            fill="#ffffff"
            stroke="#10233d"
            strokeWidth={4}
            cornerRadius={6}
          />

          {room.windows.map((windowItem, index) => {
            const point = pointFromWall(windowItem, roomBox);
            const isHorizontal = windowItem.wall === "top" || windowItem.wall === "bottom";
            return (
              <Group
                key={`window-${index}`}
                draggable
                dragBoundFunc={(pos) => {
                  const positionPercent = isHorizontal
                    ? ((pos.x - roomBox.x) / roomBox.width) * 100
                    : ((pos.y - roomBox.y) / roomBox.height) * 100;
                  updateEdgeItem("windows", index, positionPercent);
                  return point;
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

          {room.doors.map((doorItem, index) => {
            const point = pointFromWall(doorItem, roomBox);
            const isHorizontal = doorItem.wall === "top" || doorItem.wall === "bottom";
            return (
              <Group
                key={`door-${index}`}
                draggable
                dragBoundFunc={(pos) => {
                  const positionPercent = isHorizontal
                    ? ((pos.x - roomBox.x) / roomBox.width) * 100
                    : ((pos.y - roomBox.y) / roomBox.height) * 100;
                  updateEdgeItem("doors", index, positionPercent);
                  return point;
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

          {room.furniture.map((item, index) => (
            <Rect
              key={`furniture-${index}`}
              x={roomBox.x + (item.x_percent / 100) * roomBox.width - 18}
              y={roomBox.y + (item.y_percent / 100) * roomBox.height - 18}
              width={36}
              height={36}
              fill="#d8dee8"
              cornerRadius={6}
            />
          ))}

          {room.desks.map((desk, index) => {
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
  );
}
