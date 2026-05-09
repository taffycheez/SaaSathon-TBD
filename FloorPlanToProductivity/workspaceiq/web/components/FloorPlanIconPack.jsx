import { getObjectDefinition } from "@/lib/objectCatalog";

function DeskIcon({ width, height, fill, stroke, strokeWidth }) {
  const legStroke = Math.max(1.2, strokeWidth * 0.7);
  return (
    <>
      <rect x={width * 0.16} y={height * 0.12} width={width * 0.68} height={height * 0.28} rx={Math.max(4, width * 0.06)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.22} y1={height * 0.4} x2={width * 0.18} y2={height * 0.72} stroke={stroke} strokeWidth={legStroke} strokeLinecap="round" />
      <line x1={width * 0.78} y1={height * 0.4} x2={width * 0.82} y2={height * 0.72} stroke={stroke} strokeWidth={legStroke} strokeLinecap="round" />
      <rect x={width * 0.36} y={height * 0.54} width={width * 0.28} height={height * 0.2} rx={Math.max(4, width * 0.04)} fill="#f7fbff" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.65)} />
    </>
  );
}

function LDeskIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <polygon
      points={`${width * 0.14},${height * 0.14} ${width * 0.6},${height * 0.14} ${width * 0.6},${height * 0.4} ${width * 0.86},${height * 0.4} ${width * 0.86},${height * 0.86} ${width * 0.14},${height * 0.86}`}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  );
}

function ChairIcon({ width, height, fill, stroke, strokeWidth }) {
  const detailStroke = Math.max(1, strokeWidth * 0.65);
  return (
    <>
      <rect x={width * 0.24} y={height * 0.18} width={width * 0.52} height={height * 0.22} rx={Math.max(4, width * 0.08)} fill="#f7fbff" stroke={stroke} strokeWidth={detailStroke} />
      <rect x={width * 0.22} y={height * 0.42} width={width * 0.56} height={height * 0.22} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.28} y1={height * 0.64} x2={width * 0.24} y2={height * 0.9} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
      <line x1={width * 0.72} y1={height * 0.64} x2={width * 0.76} y2={height * 0.9} stroke={stroke} strokeWidth={detailStroke} strokeLinecap="round" />
    </>
  );
}

function ArmchairIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.18} y={height * 0.2} width={width * 0.64} height={height * 0.42} rx={Math.max(6, width * 0.12)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.08} y={height * 0.28} width={width * 0.14} height={height * 0.26} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.78} y={height * 0.28} width={width * 0.14} height={height * 0.26} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </>
  );
}

function CouchIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.1} y={height * 0.22} width={width * 0.8} height={height * 0.34} rx={Math.max(8, width * 0.1)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.16} y={height * 0.08} width={width * 0.68} height={height * 0.16} rx={Math.max(8, width * 0.1)} fill="#eef5ea" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.65)} />
      <rect x={width * 0.04} y={height * 0.18} width={width * 0.12} height={height * 0.34} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.84} y={height * 0.18} width={width * 0.12} height={height * 0.34} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </>
  );
}

function TableIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.14} y={height * 0.18} width={width * 0.72} height={height * 0.44} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.24} y1={height * 0.62} x2={width * 0.2} y2={height * 0.88} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.65)} strokeLinecap="round" />
      <line x1={width * 0.76} y1={height * 0.62} x2={width * 0.8} y2={height * 0.88} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.65)} strokeLinecap="round" />
    </>
  );
}

function MeetingTableIcon({ width, height, fill, stroke, strokeWidth }) {
  const seatCount = getObjectDefinition("meeting_table").seat_count || 6;
  return (
    <>
      <ellipse cx={width / 2} cy={height / 2} rx={width * 0.34} ry={height * 0.24} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {Array.from({ length: seatCount }).map((_, index) => {
        const angle = (Math.PI * 2 * index) / seatCount;
        const seatX = width / 2 + Math.cos(angle) * width * 0.42;
        const seatY = height / 2 + Math.sin(angle) * height * 0.34;
        return (
          <ellipse
            key={index}
            cx={seatX}
            cy={seatY}
            rx={Math.max(4, width * 0.05)}
            ry={Math.max(3.2, height * 0.06)}
            fill="#f8f5ef"
            stroke={stroke}
            strokeWidth={Math.max(0.9, strokeWidth * 0.45)}
          />
        );
      })}
    </>
  );
}

function FilingCabinetIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.18} y={height * 0.08} width={width * 0.64} height={height * 0.84} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.18} y1={height * 0.38} x2={width * 0.82} y2={height * 0.38} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} />
      <line x1={width * 0.18} y1={height * 0.66} x2={width * 0.82} y2={height * 0.66} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} />
    </>
  );
}

function WhiteboardIcon({ width, height, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.1} y={height * 0.1} width={width * 0.8} height={height * 0.46} rx={Math.max(6, width * 0.08)} fill="#ffffff" stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.28} y1={height * 0.58} x2={width * 0.18} y2={height * 0.92} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} strokeLinecap="round" />
      <line x1={width * 0.72} y1={height * 0.58} x2={width * 0.82} y2={height * 0.92} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} strokeLinecap="round" />
    </>
  );
}

function PlantIcon({ width, height, stroke }) {
  return (
    <>
      <ellipse cx={width * 0.5} cy={height * 0.24} rx={Math.max(6, width * 0.12)} ry={Math.max(9, height * 0.22)} fill="#89c86f" stroke={stroke} strokeWidth="1.4" />
      <ellipse cx={width * 0.34} cy={height * 0.32} rx={Math.max(5, width * 0.1)} ry={Math.max(8, height * 0.18)} fill="#b8e4a2" stroke={stroke} strokeWidth="1.2" />
      <ellipse cx={width * 0.66} cy={height * 0.32} rx={Math.max(5, width * 0.1)} ry={Math.max(8, height * 0.18)} fill="#c8ebb7" stroke={stroke} strokeWidth="1.2" />
      <rect x={width * 0.28} y={height * 0.62} width={width * 0.44} height={height * 0.16} rx={Math.max(4, width * 0.08)} fill="#b57c47" stroke="#7a512f" strokeWidth="1.4" />
    </>
  );
}

function TrashIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <path d={`M ${width * 0.3} ${height * 0.26} L ${width * 0.7} ${height * 0.26} L ${width * 0.64} ${height * 0.82} L ${width * 0.36} ${height * 0.82} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <line x1={width * 0.26} y1={height * 0.24} x2={width * 0.74} y2={height * 0.24} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} />
    </>
  );
}

function ToiletIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.34} y={height * 0.08} width={width * 0.32} height={height * 0.18} rx={Math.max(4, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <ellipse cx={width * 0.5} cy={height * 0.5} rx={width * 0.2} ry={height * 0.22} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <ellipse cx={width * 0.5} cy={height * 0.54} rx={width * 0.1} ry={height * 0.12} fill="#ffffff" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.5)} />
    </>
  );
}

function SinkIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.18} y={height * 0.22} width={width * 0.64} height={height * 0.44} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <ellipse cx={width * 0.5} cy={height * 0.44} rx={width * 0.14} ry={height * 0.1} fill="#ffffff" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.5)} />
      <line x1={width * 0.62} y1={height * 0.18} x2={width * 0.74} y2={height * 0.12} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} strokeLinecap="round" />
    </>
  );
}

function ShowerIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.16} y={height * 0.16} width={width * 0.68} height={height * 0.68} rx={Math.max(5, width * 0.06)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <path d={`M ${width * 0.34} ${height * 0.24} Q ${width * 0.52} ${height * 0.08} ${width * 0.66} ${height * 0.24}`} fill="none" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} />
      <line x1={width * 0.58} y1={height * 0.34} x2={width * 0.58} y2={height * 0.62} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.45)} strokeDasharray="2 3" />
    </>
  );
}

function FridgeIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.2} y={height * 0.08} width={width * 0.6} height={height * 0.84} rx={Math.max(5, width * 0.08)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <line x1={width * 0.2} y1={height * 0.46} x2={width * 0.8} y2={height * 0.46} stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.6)} />
    </>
  );
}

function KitchenetteIcon({ width, height, fill, stroke, strokeWidth }) {
  return (
    <>
      <rect x={width * 0.08} y={height * 0.26} width={width * 0.84} height={height * 0.34} rx={Math.max(5, height * 0.14)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <rect x={width * 0.16} y={height * 0.32} width={width * 0.16} height={height * 0.2} rx="3" fill="#f8f5ef" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.55)} />
      <circle cx={width * 0.66} cy={height * 0.42} r={Math.max(3, height * 0.08)} fill="#ffffff" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.55)} />
      <circle cx={width * 0.78} cy={height * 0.42} r={Math.max(3, height * 0.08)} fill="#ffffff" stroke={stroke} strokeWidth={Math.max(1, strokeWidth * 0.55)} />
    </>
  );
}

export function FloorPlanObjectIcon({ item, width, height, fill, stroke, strokeWidth }) {
  switch (item.type) {
    case "desk":
      return <DeskIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "l_shaped_desk":
      return <LDeskIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "chair":
      return <ChairIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "armchair":
      return <ArmchairIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "couch":
      return <CouchIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "table":
      return <TableIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "meeting_table":
      return <MeetingTableIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "filing_cabinet":
      return <FilingCabinetIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "whiteboard":
      return <WhiteboardIcon width={width} height={height} stroke={stroke} strokeWidth={strokeWidth} />;
    case "plant":
      return <PlantIcon width={width} height={height} stroke={stroke} />;
    case "trashcan":
      return <TrashIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "toilet":
      return <ToiletIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "sink":
      return <SinkIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "shower":
      return <ShowerIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "fridge":
      return <FridgeIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    case "kitchenette":
      return <KitchenetteIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
    default:
      return <TableIcon width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
  }
}
