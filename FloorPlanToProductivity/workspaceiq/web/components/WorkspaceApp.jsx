"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import UploadScreen from "@/components/UploadScreen";
import ControlPanel from "@/components/ControlPanel";
import FloorPlanEditor from "@/components/FloorPlanEditor";
import FloorPlanEditorBoundary from "@/components/FloorPlanEditorBoundary";
import { FloorPlanObjectIcon } from "@/components/FloorPlanIconPack";
import ScorePanel from "@/components/ScorePanel";
import { getObjectDefinition } from "@/lib/objectCatalog";
import { computeFengShuiScore } from "@/lib/fengShuiScore";
import { inferZones } from "@/lib/zoning";
import {
  addWallToRoom,
  addRectangleRoomToRoom,
  addObjectToRoom,
  applyNorthDirection,
  applyScaleReference,
  clampPercent,
  createDoorForRoom,
  createWindowForRoom,
  isDeskLikeFurniture,
  normalizeRoomLayout,
  normalizeFootprintPoints,
  normalizeFurnitureItem,
  normalizeRotation,
  normalizeShapeKind
} from "@/lib/roomState";
import { normalizeObjectScale } from "@/lib/roomGeometry";

const FloorPlanPreview3D = dynamic(() => import("@/components/FloorPlanPreview3D.jsx"), {
  ssr: false
});

const API_BASE_URL = "/api";

const DEFAULT_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  estimated_area_m2: 48,
  north_direction_deg: 0,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [],
  doors: [],
  furniture: [],
  desks: [],
  zoneOverrides: {}
};

const defaultPreferences = {
  numPeople: 8,
  workStyle: "balanced"
};

const DEFAULT_ANALYSIS_BOUNDS = {
  x_percent: 0,
  y_percent: 0,
  width_percent: 100,
  height_percent: 100
};

const WALL_DETECTION_SETTINGS = {
  darkPixelThreshold: 42,
  maxBrightForeground: 235,
  minHorizontalLengthRatio: 0.18,
  minVerticalLengthRatio: 0.18,
  maxBandGapPx: 4,
  maxSegmentGapPx: 12
};

const HERO_LAYOUT_SCENES = [
  {
    id: "focus",
    label: "Focus-heavy",
    score: 86,
    insights: ["Light +24", "Flow +16", "Quiet +20"],
    windows: [{ left: "12%", width: "30%" }, { left: "56%", width: "18%" }],
    doors: [{ side: "right", top: "62%", height: "18%" }],
    objects: [
      { id: "desk-a", kind: "desk", left: "14%", top: "20%", rotate: "0deg" },
      { id: "desk-b", kind: "desk", left: "40%", top: "20%", rotate: "0deg" },
      { id: "desk-c", kind: "desk", left: "66%", top: "20%", rotate: "0deg" },
      { id: "desk-d", kind: "desk", left: "14%", top: "60%", rotate: "0deg" },
      { id: "desk-e", kind: "desk", left: "40%", top: "60%", rotate: "0deg" },
      { id: "desk-f", kind: "desk", left: "66%", top: "60%", rotate: "0deg" },
      { id: "table", kind: "zone", left: "43%", top: "42%", width: "15%", height: "10%", opacity: 0.22 },
      { id: "plant-a", kind: "plant", left: "8%", top: "82%" },
      { id: "plant-b", kind: "plant", left: "86%", top: "8%" },
      { id: "quiet-band", kind: "band", left: "9%", top: "10%", width: "74%", height: "22%", opacity: 0.85 }
    ]
  },
  {
    id: "balanced",
    label: "Balanced",
    score: 82,
    insights: ["Light +20", "Flow +15", "Team +14"],
    windows: [{ left: "16%", width: "26%" }, { left: "60%", width: "20%" }],
    doors: [{ side: "right", top: "54%", height: "20%" }],
    objects: [
      { id: "desk-a", kind: "desk", left: "18%", top: "22%", rotate: "0deg" },
      { id: "desk-b", kind: "desk", left: "43%", top: "22%", rotate: "0deg" },
      { id: "desk-c", kind: "desk", left: "68%", top: "22%", rotate: "0deg" },
      { id: "desk-d", kind: "desk", left: "18%", top: "62%", rotate: "0deg" },
      { id: "desk-e", kind: "desk", left: "68%", top: "62%", rotate: "0deg" },
      { id: "desk-f", kind: "desk", left: "43%", top: "67%", rotate: "90deg" },
      { id: "table", kind: "table", left: "40%", top: "44%", width: "20%", height: "14%", rotate: "0deg" },
      { id: "plant-a", kind: "plant", left: "78%", top: "80%" },
      { id: "plant-b", kind: "plant", left: "14%", top: "16%" },
      { id: "quiet-band", kind: "band", left: "10%", top: "12%", width: "78%", height: "18%", opacity: 0.52 }
    ]
  },
  {
    id: "collab",
    label: "Collaboration",
    score: 79,
    insights: ["Team +22", "Flow +13", "Light +16"],
    windows: [{ left: "14%", width: "24%" }, { left: "54%", width: "24%" }],
    doors: [{ side: "right", top: "48%", height: "24%" }],
    objects: [
      { id: "desk-a", kind: "desk", left: "16%", top: "24%", rotate: "90deg" },
      { id: "desk-b", kind: "desk", left: "27%", top: "24%", rotate: "90deg" },
      { id: "desk-c", kind: "desk", left: "63%", top: "24%", rotate: "90deg" },
      { id: "desk-d", kind: "desk", left: "74%", top: "24%", rotate: "90deg" },
      { id: "desk-e", kind: "desk", left: "22%", top: "68%", rotate: "0deg" },
      { id: "desk-f", kind: "desk", left: "68%", top: "68%", rotate: "0deg" },
      { id: "table", kind: "table", left: "36%", top: "44%", width: "28%", height: "18%", rotate: "0deg" },
      { id: "plant-a", kind: "plant", left: "48%", top: "78%" },
      { id: "plant-b", kind: "plant", left: "82%", top: "44%" },
      { id: "quiet-band", kind: "band", left: "12%", top: "60%", width: "76%", height: "18%", opacity: 0.3 }
    ]
  }
];

const LOADING_MESSAGES = [
  {
    title: "Tracing walls and boundaries",
    detail: "WorkspaceIQ is finding the room outline first so the editor starts from something real."
  },
  {
    title: "Looking for doors and windows",
    detail: "We’re checking openings, daylight edges, and circulation points before placing anything inside."
  },
  {
    title: "Scanning existing furniture",
    detail: "Desks, seating, and utility fixtures are being matched into editable floor-plan objects."
  },
  {
    title: "Preparing your editable plan",
    detail: "We’re stitching the analysis into a layout you can immediately drag, tweak, and score."
  }
];

const LOADING_FLOATING_OBJECTS = [
  { id: "desk", type: "desk", size: 66, top: "-18%", left: "-28%", rotate: -8, delay: "0ms" },
  { id: "chair", type: "chair", size: 52, top: "-16%", right: "-26%", rotate: 12, delay: "620ms" },
  { id: "plant", type: "plant", size: 50, top: "34%", left: "-30%", rotate: -10, delay: "1220ms" },
  { id: "couch", type: "couch", size: 82, bottom: "-14%", left: "-24%", rotate: -4, delay: "1820ms" },
  { id: "sink", type: "sink", size: 52, bottom: "-12%", right: "-24%", rotate: 8, delay: "2420ms" }
];

function normalizeWallIndex(value, wallsLength) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || wallsLength <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(wallsLength - 1, numeric));
}

function edgeItemFromLegacy(item, walls) {
  if (item && (item.x_percent != null || item.y_percent != null)) {
    return {
      x_percent: clampPercent(item?.x_percent),
      y_percent: clampPercent(item?.y_percent),
      rotation_deg: normalizeRotation(item?.rotation_deg)
    };
  }

  const wall = walls[normalizeWallIndex(item?.wall_index, walls.length)];
  const ratio = clampPercent(item?.position_percent) / 100;
  const x = wall
    ? wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio
    : 50;
  const y = wall
    ? wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio
    : 50;
  const rotation = wall
    ? normalizeRotation(Math.atan2(wall.y2_percent - wall.y1_percent, wall.x2_percent - wall.x1_percent) * 180 / Math.PI)
    : 0;

  return {
    x_percent: clampPercent(x),
    y_percent: clampPercent(y),
    rotation_deg: rotation
  };
}

function looksLikeDeskChair(chair, desks) {
  if (chair?.type !== "chair" || !Array.isArray(desks) || !desks.length) {
    return false;
  }

  return desks.some((desk) => {
    const dx = Math.abs((chair.x_percent || 0) - (desk.x_percent || 0));
    const dy = Math.abs((chair.y_percent || 0) - (desk.y_percent || 0));
    const widthAllowance = ((desk.width_percent || 0) * (desk.scale || 1)) * 0.9 + 4;
    const heightAllowance = ((desk.height_percent || 0) * (desk.scale || 1)) * 1.25 + 5;
    return dx <= widthAllowance && dy <= heightAllowance;
  });
}

function normalizeRoomData(data) {
  const safeData = data && typeof data === "object" ? data : {};
  const walls = Array.isArray(safeData.walls) && safeData.walls.length >= 3
    ? safeData.walls.map((wall) => ({
        x1_percent: clampPercent(wall?.x1_percent),
        y1_percent: clampPercent(wall?.y1_percent),
        x2_percent: clampPercent(wall?.x2_percent),
        y2_percent: clampPercent(wall?.y2_percent)
      }))
    : DEFAULT_ROOM.walls;

  const furniture = Array.isArray(safeData.furniture)
    ? safeData.furniture
        .map(normalizeFurnitureItem)
        .filter((item) => item.type !== "office_equipment")
    : [];
  const detectedDesks = furniture.filter(isDeskLikeFurniture).map(normalizeFurnitureItem);
  const filteredFurniture = furniture.filter((item) => !isDeskLikeFurniture(item) && !looksLikeDeskChair(item, detectedDesks));

  return {
    ...DEFAULT_ROOM,
    estimated_width_m: Math.max(1, Number(safeData.estimated_width_m) || DEFAULT_ROOM.estimated_width_m),
    estimated_height_m: Math.max(1, Number(safeData.estimated_height_m) || DEFAULT_ROOM.estimated_height_m),
    estimated_area_m2: Math.max(1, Number(safeData.estimated_area_m2) || DEFAULT_ROOM.estimated_area_m2),
    north_direction_deg: normalizeRotation(safeData.north_direction_deg),
    walls,
    windows: Array.isArray(safeData.windows)
      ? safeData.windows.map((item) => edgeItemFromLegacy(item, walls))
      : [],
    doors: Array.isArray(safeData.doors)
      ? safeData.doors.map((item) => edgeItemFromLegacy(item, walls))
      : [],
    furniture: filteredFurniture,
    desks: detectedDesks,
    notes: Array.isArray(safeData.notes) ? safeData.notes : [],
    wallIssues: [],
    zoneOverrides: safeData.zoneOverrides && typeof safeData.zoneOverrides === "object" ? safeData.zoneOverrides : {}
  };
}

function wallTouchesBorder(wall, tolerance = 2) {
  const values = [wall.x1_percent, wall.x2_percent, wall.y1_percent, wall.y2_percent];
  return values.some((value) => Math.abs(value) <= tolerance || Math.abs(value - 100) <= tolerance);
}

function wallsLookLikeOuterBorder(walls) {
  if (!Array.isArray(walls) || walls.length < 4) {
    return false;
  }

  const onBorderCount = walls.filter((wall) => wallTouchesBorder(wall)).length;
  return onBorderCount >= Math.max(4, walls.length - 1);
}

function mergeAxisSegments(segments, axis, maxBandGapPx, maxSegmentGapPx) {
  if (!segments.length) {
    return [];
  }

  const sorted = [...segments].sort((a, b) => {
    if (axis === "horizontal") {
      return a.anchor - b.anchor || a.start - b.start;
    }
    return a.anchor - b.anchor || a.start - b.start;
  });

  const merged = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.anchor - segment.anchor) <= maxBandGapPx &&
      segment.start <= last.end + maxSegmentGapPx
    ) {
      last.start = Math.min(last.start, segment.start);
      last.end = Math.max(last.end, segment.end);
      last.anchor = (last.anchor + segment.anchor) / 2;
      last.count += 1;
    } else {
      merged.push({ ...segment, count: 1 });
    }
  }

  return merged.map(({ anchor, start, end }) => ({ anchor, start, end }));
}

function normalizeDetectedWalls(segments, width, height) {
  return segments.map((segment) => {
    if (segment.axis === "horizontal") {
      const yPercent = clampPercent((segment.anchor / Math.max(1, height)) * 100);
      return {
        x1_percent: clampPercent((segment.start / Math.max(1, width)) * 100),
        y1_percent: yPercent,
        x2_percent: clampPercent((segment.end / Math.max(1, width)) * 100),
        y2_percent: yPercent
      };
    }

    const xPercent = clampPercent((segment.anchor / Math.max(1, width)) * 100);
    return {
      x1_percent: xPercent,
      y1_percent: clampPercent((segment.start / Math.max(1, height)) * 100),
      x2_percent: xPercent,
      y2_percent: clampPercent((segment.end / Math.max(1, height)) * 100)
    };
  });
}

function detectAxisWallSegments(binaryMask, width, height, axis) {
  const segments = [];
  const minLength =
    axis === "horizontal"
      ? Math.max(24, Math.round(width * WALL_DETECTION_SETTINGS.minHorizontalLengthRatio))
      : Math.max(24, Math.round(height * WALL_DETECTION_SETTINGS.minVerticalLengthRatio));

  if (axis === "horizontal") {
    for (let y = 0; y < height; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= width; x += 1) {
        const isDark = x < width ? binaryMask[y * width + x] === 1 : false;
        if (isDark) {
          if (runStart === -1) {
            runStart = x;
          }
        } else if (runStart !== -1) {
          const runLength = x - runStart;
          if (runLength >= minLength) {
            segments.push({ axis, anchor: y, start: runStart, end: x });
          }
          runStart = -1;
        }
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      let runStart = -1;
      for (let y = 0; y <= height; y += 1) {
        const isDark = y < height ? binaryMask[y * width + x] === 1 : false;
        if (isDark) {
          if (runStart === -1) {
            runStart = y;
          }
        } else if (runStart !== -1) {
          const runLength = y - runStart;
          if (runLength >= minLength) {
            segments.push({ axis, anchor: x, start: runStart, end: y });
          }
          runStart = -1;
        }
      }
    }
  }

  return mergeAxisSegments(
    segments,
    axis,
    WALL_DETECTION_SETTINGS.maxBandGapPx,
    WALL_DETECTION_SETTINGS.maxSegmentGapPx
  ).map((segment) => ({ ...segment, axis }));
}

function detectPlanWallsFromImageData(imageData, width, height) {
  const pixels = imageData.data;

  function samplePixel(x, y) {
    const offset = (y * width + x) * 4;
    return {
      r: pixels[offset],
      g: pixels[offset + 1],
      b: pixels[offset + 2]
    };
  }

  const cornerSamples = [
    samplePixel(0, 0),
    samplePixel(Math.max(0, width - 1), 0),
    samplePixel(0, Math.max(0, height - 1)),
    samplePixel(Math.max(0, width - 1), Math.max(0, height - 1))
  ];

  const background = cornerSamples.reduce(
    (accumulator, sample) => ({
      r: accumulator.r + sample.r / cornerSamples.length,
      g: accumulator.g + sample.g / cornerSamples.length,
      b: accumulator.b + sample.b / cornerSamples.length
    }),
    { r: 0, g: 0, b: 0 }
  );

  const binaryMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { r, g, b } = samplePixel(x, y);
      const distance =
        Math.abs(r - background.r) +
        Math.abs(g - background.g) +
        Math.abs(b - background.b);
      const brightness = (r + g + b) / 3;
      binaryMask[y * width + x] =
        distance > WALL_DETECTION_SETTINGS.darkPixelThreshold || brightness < WALL_DETECTION_SETTINGS.maxBrightForeground
          ? 1
          : 0;
    }
  }

  const horizontalSegments = detectAxisWallSegments(binaryMask, width, height, "horizontal");
  const verticalSegments = detectAxisWallSegments(binaryMask, width, height, "vertical");
  return normalizeDetectedWalls([...horizontalSegments, ...verticalSegments], width, height);
}

function remapWallsIntoOriginalBounds(walls, analysisBounds) {
  if (!Array.isArray(walls) || !analysisBounds) {
    return [];
  }

  return walls.map((wall) => remapWallIntoOriginal(
    wall,
    analysisBounds.x_percent,
    analysisBounds.y_percent,
    analysisBounds.width_percent,
    analysisBounds.height_percent
  ));
}

function chooseBestWalls(modelRoom, clientDetectedWalls) {
  return modelRoom;
}

function remapPercentIntoOriginal(value, startPercent, sizePercent) {
  return clampPercent(startPercent + (clampPercent(value) / 100) * sizePercent);
}

function remapWallIntoOriginal(wall, startX, startY, widthScale, heightScale) {
  return {
    ...wall,
    x1_percent: remapPercentIntoOriginal(wall.x1_percent, startX, widthScale),
    y1_percent: remapPercentIntoOriginal(wall.y1_percent, startY, heightScale),
    x2_percent: remapPercentIntoOriginal(wall.x2_percent, startX, widthScale),
    y2_percent: remapPercentIntoOriginal(wall.y2_percent, startY, heightScale)
  };
}

function remapEdgeItemIntoOriginal(item, startX, startY, widthScale, heightScale) {
  return item && item.x_percent != null && item.y_percent != null
    ? {
        ...item,
        x_percent: remapPercentIntoOriginal(item.x_percent, startX, widthScale),
        y_percent: remapPercentIntoOriginal(item.y_percent, startY, heightScale)
      }
    : item;
}

function remapPlacedItemIntoOriginal(item, startX, startY, widthScale, heightScale) {
  return {
    ...item,
    x_percent: remapPercentIntoOriginal(item.x_percent, startX, widthScale),
    y_percent: remapPercentIntoOriginal(item.y_percent, startY, heightScale),
    width_percent: clampPercent((Number(item.width_percent) || 0) * (widthScale / 100)),
    height_percent: clampPercent((Number(item.height_percent) || 0) * (heightScale / 100))
  };
}

function remapRoomToOriginalBounds(room, analysisBounds) {
  if (!room || !analysisBounds) {
    return room;
  }

  const { x_percent: startX, y_percent: startY, width_percent: widthScale, height_percent: heightScale } = analysisBounds;
  const safeWidthScale = Math.max(1, widthScale);
  const safeHeightScale = Math.max(1, heightScale);

  return {
    ...room,
    walls: Array.isArray(room.walls)
      ? room.walls.map((wall) => remapWallIntoOriginal(wall, startX, startY, safeWidthScale, safeHeightScale))
      : room.walls,
    windows: Array.isArray(room.windows)
      ? room.windows.map((item) => remapEdgeItemIntoOriginal(item, startX, startY, safeWidthScale, safeHeightScale))
      : room.windows,
    doors: Array.isArray(room.doors)
      ? room.doors.map((item) => remapEdgeItemIntoOriginal(item, startX, startY, safeWidthScale, safeHeightScale))
      : room.doors,
    furniture: Array.isArray(room.furniture)
      ? room.furniture.map((item) => remapPlacedItemIntoOriginal(item, startX, startY, safeWidthScale, safeHeightScale))
      : room.furniture,
    desks: Array.isArray(room.desks)
      ? room.desks.map((item) => remapPlacedItemIntoOriginal(item, startX, startY, safeWidthScale, safeHeightScale))
      : room.desks
  };
}

async function prepareImageForAnalysis(file) {
  const originalDataUrl = await fileToBase64(file);

  try {
    const processed = await cropImageToLikelyPlanBounds(originalDataUrl);
    const analysisImage = await loadImage(processed?.analysisDataUrl || originalDataUrl);
    const wallCanvas = document.createElement("canvas");
    wallCanvas.width = analysisImage.naturalWidth || analysisImage.width;
    wallCanvas.height = analysisImage.naturalHeight || analysisImage.height;
    const wallContext = wallCanvas.getContext("2d", { willReadFrequently: true });

    let detectedWalls = [];
    if (wallContext) {
      wallContext.drawImage(analysisImage, 0, 0, wallCanvas.width, wallCanvas.height);
      const wallImageData = wallContext.getImageData(0, 0, wallCanvas.width, wallCanvas.height);
      detectedWalls = remapWallsIntoOriginalBounds(
        detectPlanWallsFromImageData(wallImageData, wallCanvas.width, wallCanvas.height),
        processed?.analysisBounds || DEFAULT_ANALYSIS_BOUNDS
      );
    }

    return {
      originalDataUrl,
      analysisDataUrl: processed?.analysisDataUrl || originalDataUrl,
      analysisBounds: processed?.analysisBounds || DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: processed?.preprocessingNotes || [],
      detectedWalls
    };
  } catch {
    return {
      originalDataUrl,
      analysisDataUrl: originalDataUrl,
      analysisBounds: DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: [],
      detectedWalls: []
    };
  }
}

function normalizeDeskData(data) {
  const safeData = data && typeof data === "object" ? data : {};
  const rawDesks = Array.isArray(data) ? data : Array.isArray(safeData.desks) ? safeData.desks : [];

  return {
    desks: rawDesks.map((desk) => {
      const type = normalizeFurnitureItem({ ...desk, type: desk?.type ?? "desk" }).type;
      const definition = getObjectDefinition(type);
      return {
        type,
        shape_kind: normalizeShapeKind(desk?.shape_kind, definition.shape_kind),
        x_percent: clampPercent(desk?.x_percent),
        y_percent: clampPercent(desk?.y_percent),
        width_percent: Math.max(2, clampPercent(desk?.width_percent ?? definition.width_percent)),
        height_percent: Math.max(2, clampPercent(desk?.height_percent ?? definition.height_percent)),
        scale: normalizeObjectScale(desk?.scale),
        rotation_deg: normalizeRotation(desk?.rotation_deg),
        footprint_points: normalizeFootprintPoints(desk?.footprint_points, definition.footprint_points)
      };
    }),
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
}

export default function WorkspaceApp() {
  const uploadRef = useRef(null);
  const roomRef = useRef(DEFAULT_ROOM);
  const [room, setRoomState] = useState(DEFAULT_ROOM);
  const [roomPreview, setRoomPreview] = useState(null);
  const [baseRoom, setBaseRoom] = useState(DEFAULT_ROOM);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [imagePreview, setImagePreview] = useState("");
  const [showReferenceImage, setShowReferenceImage] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [wallToolMode, setWallToolMode] = useState("select");
  const [scaleToolActive, setScaleToolActive] = useState(false);
  const [northToolActive, setNorthToolActive] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [roomNotes, setRoomNotes] = useState([]);
  const [layoutNotes, setLayoutNotes] = useState([]);
  const [scoreExplanation, setScoreExplanation] = useState(null);
  const [isExplainingScore, setIsExplainingScore] = useState(false);
  const [isSandboxMode, setIsSandboxMode] = useState(false);
  const [confirmDialogMode, setConfirmDialogMode] = useState(null);
  const [pendingDiscardTarget, setPendingDiscardTarget] = useState("home");
  const [pendingScrollTarget, setPendingScrollTarget] = useState("");
  const [heroSceneIndex, setHeroSceneIndex] = useState(0);
  const [headerHidden, setHeaderHidden] = useState(false);

  const heroScene = HERO_LAYOUT_SCENES[heroSceneIndex];
  const hasWorkspace = Boolean(imagePreview) || isSandboxMode;
  const activeRoom = roomPreview ?? room;

  useEffect(() => {
    if (!isAnalysing) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isAnalysing]);

  const zoneAnalysis = useMemo(() => inferZones(activeRoom), [activeRoom]);
  const committedZoneAnalysis = useMemo(() => inferZones(room), [room]);
  const scoreResult = useMemo(
    () => computeFengShuiScore(activeRoom, { ...preferences, zoneAnalysis }),
    [activeRoom, preferences, zoneAnalysis]
  );
  const committedScoreResult = useMemo(
    () => computeFengShuiScore(room, { ...preferences, zoneAnalysis: committedZoneAnalysis }),
    [room, preferences, committedZoneAnalysis]
  );

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setError("");
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => {
    if (!pendingScrollTarget) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = document.getElementById(pendingScrollTarget);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      setPendingScrollTarget("");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [pendingScrollTarget, imagePreview]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeroSceneIndex((current) => (current + 1) % HERO_LAYOUT_SCENES.length);
    }, 3200);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!Array.isArray(room?.desks) || room.desks.length === 0) {
      setScoreExplanation(null);
      setIsExplainingScore(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsExplainingScore(true);

      try {
        const response = await fetch(`${API_BASE_URL}/score-explanation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room,
            preferences,
            scoreResult: committedScoreResult
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error("Score explanation failed.");
        }

        const payload = await response.json();
        if (!controller.signal.aborted) {
          setScoreExplanation(payload);
        }
      } catch (explanationError) {
        if (!controller.signal.aborted) {
          setScoreExplanation(null);
          console.warn("score explanation request failed", explanationError);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsExplainingScore(false);
        }
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [room, preferences, committedScoreResult]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateHeaderVisibility() {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY;

      if (currentScrollY <= 8) {
        setHeaderHidden(false);
      } else if (scrollDelta > 6) {
        setHeaderHidden(true);
      } else if (scrollDelta < -6) {
        setHeaderHidden(false);
      }

      lastScrollY = currentScrollY;
      ticking = false;
    }

    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateHeaderVisibility);
        ticking = true;
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function syncRoomState(nextRoom) {
    roomRef.current = nextRoom;
    setRoomPreview(null);
    setRoomState(nextRoom);
    return nextRoom;
  }

  function setRoom(update, options = {}) {
    const { recordHistory = true, resetHistory = false } = options;
    const currentRoom = roomRef.current;
    const nextRoom = typeof update === "function" ? update(currentRoom) : update;

    if (!nextRoom || nextRoom === currentRoom) {
      if (resetHistory) {
        setUndoStack([]);
        setRedoStack([]);
      }
      return currentRoom;
    }

    if (resetHistory) {
      setUndoStack([]);
      setRedoStack([]);
      return syncRoomState(nextRoom);
    }

    if (recordHistory) {
      setUndoStack((current) => [...current.slice(-49), currentRoom]);
      setRedoStack([]);
    }

    return syncRoomState(nextRoom);
  }

  function undoRoomChange() {
    if (!undoStack.length) {
      return;
    }

    const previousRoom = undoStack[undoStack.length - 1];
    const currentRoom = roomRef.current;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-49), currentRoom]);
    syncRoomState(previousRoom);
  }

  function redoRoomChange() {
    if (!redoStack.length) {
      return;
    }

    const nextRoom = redoStack[redoStack.length - 1];
    const currentRoom = roomRef.current;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-49), currentRoom]);
    syncRoomState(nextRoom);
  }

  function addObject(type) {
    setRoom((currentRoom) => addObjectToRoom(currentRoom, type));
  }

  function addWindow() {
    setRoom((currentRoom) => ({
      ...currentRoom,
      windows: [
        ...(currentRoom.windows || []),
        createWindowForRoom(currentRoom)
      ]
    }));
  }

  function addDoor() {
    setRoom((currentRoom) => ({
      ...currentRoom,
      doors: [
        ...(currentRoom.doors || []),
        createDoorForRoom(currentRoom)
      ]
    }));
  }

  function addWall(startPoint, endPoint) {
    setRoom((currentRoom) => addWallToRoom(currentRoom, startPoint, endPoint));
  }

  function addRectangleRoom(startPoint, endPoint) {
    setRoom((currentRoom) => addRectangleRoomToRoom(currentRoom, startPoint, endPoint));
  }

  function applyScale(startPoint, endPoint, distanceMeters) {
    setRoom((currentRoom) => applyScaleReference(currentRoom, startPoint, endPoint, distanceMeters));
    setScaleToolActive(false);
  }

  function applyNorthAngle(angleDeg) {
    setRoom((currentRoom) => applyNorthDirection(currentRoom, angleDeg));
  }

  function updateZoneOverride(zoneId, nextType) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      zoneOverrides: {
        ...(currentRoom.zoneOverrides || {}),
        [zoneId]: nextType
      }
    }));
  }

  async function handleUpload(file) {
    setIsAnalysing(true);
    setIsSandboxMode(false);
    setError("");

    try {
      const {
        originalDataUrl,
        analysisDataUrl,
        analysisBounds,
        preprocessingNotes,
        detectedWalls
      } = await prepareImageForAnalysis(file);

      const response = await fetch(`${API_BASE_URL}/analyse-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: analysisDataUrl })
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        const reasonText = Array.isArray(failure?.reasons) && failure.reasons.length
          ? ` ${failure.reasons.join(" | ")}`
          : "";
        throw new Error(`${failure?.error || "Room analysis failed."}${reasonText}`);
      }

      const data = await response.json();
      const remappedRoom = remapRoomToOriginalBounds(normalizeRoomData(data), analysisBounds);
      const usedClientWallFallback = false;
      const normalizedRoom = normalizeRoomLayout(
        chooseBestWalls(
          remappedRoom,
          detectedWalls
        )
      );
      setImagePreview(originalDataUrl);
      setShowReferenceImage(false);
      setShowZones(true);
      setWallToolMode("select");
      setScaleToolActive(false);
      setRoom(normalizedRoom, { recordHistory: false, resetHistory: true });
      setBaseRoom(normalizedRoom);
      setScoreExplanation(null);
      setRoomNotes([
        ...(Array.isArray(data.notes) ? data.notes : []),
        ...(normalizedRoom.wallIssues?.length
          ? normalizedRoom.wallIssues.map((issue) => `Wall validation: ${issue}`)
          : []),
        ...(usedClientWallFallback ? ["WorkspaceIQ used browser-side wall-line fallback because the backend returned too little wall geometry."] : []),
        ...preprocessingNotes
      ]);
      setLayoutNotes([]);
    } catch (uploadError) {
      setError(uploadError.message || "We couldn't analyse that image. Please try again.");
    } finally {
      setIsAnalysing(false);
    }
  }

  async function handleGenerateLayout() {
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/generate-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room,
          num_people: preferences.numPeople,
          work_style: preferences.workStyle || "balanced"
        })
      });

      if (!response.ok) {
        throw new Error("Layout generation failed.");
      }

      const { desks, notes } = normalizeDeskData(await response.json());
      setRoom((currentRoom) => ({
        ...currentRoom,
        desks
      }));
      setScoreExplanation(null);
      setLayoutNotes(notes);
    } catch (generationError) {
      setError(generationError.message || "We couldn't generate a layout right now.");
    } finally {
      setIsGenerating(false);
    }
  }

  function resetWorkspace() {
    setConfirmDialogMode("reset");
  }

  function confirmResetWorkspace() {
    setConfirmDialogMode(null);

    if (imagePreview) {
      setRoom(baseRoom, { recordHistory: false, resetHistory: true });
      setPreferences(defaultPreferences);
      setShowReferenceImage(false);
      setShowZones(true);
      setWallToolMode("select");
      setScaleToolActive(false);
      setNorthToolActive(false);
      setError("");
      setLayoutNotes([]);
      setScoreExplanation(null);
      return;
    }

    if (isSandboxMode) {
      setRoom(DEFAULT_ROOM, { recordHistory: false, resetHistory: true });
      setBaseRoom(DEFAULT_ROOM);
      setPreferences(defaultPreferences);
      setShowReferenceImage(false);
      setWallToolMode("select");
      setScaleToolActive(false);
      setNorthToolActive(false);
      setError("");
      setRoomNotes(["Sandbox mode started. Add walls, doors, windows, desks, and objects from scratch."]);
      setLayoutNotes([]);
      setScoreExplanation(null);
      return;
    }

    setRoom(DEFAULT_ROOM, { recordHistory: false, resetHistory: true });
    setBaseRoom(DEFAULT_ROOM);
    setPreferences(defaultPreferences);
    setImagePreview("");
    setShowReferenceImage(false);
    setShowZones(true);
    setWallToolMode("select");
    setScaleToolActive(false);
    setNorthToolActive(false);
    setError("");
    setRoomNotes([]);
    setLayoutNotes([]);
    setScoreExplanation(null);
  }

  function cancelResetWorkspace() {
    setConfirmDialogMode(null);
    setPendingDiscardTarget("home");
  }

  function discardWorkspaceToHome(target = "home") {
    setConfirmDialogMode(null);
    setPendingDiscardTarget("home");
    setIsGenerating(false);
    setIsSandboxMode(false);
    setError("");
    setRoom(DEFAULT_ROOM, { recordHistory: false, resetHistory: true });
    setBaseRoom(DEFAULT_ROOM);
    setPreferences(defaultPreferences);
    setImagePreview("");
    setShowReferenceImage(false);
    setShowZones(true);
    setWallToolMode("select");
    setScaleToolActive(false);
    setNorthToolActive(false);
    setRoomNotes([]);
    setLayoutNotes([]);
    setScoreExplanation(null);
    setPendingScrollTarget(target);
  }

  function confirmDiscardWorkspace() {
    discardWorkspaceToHome(pendingDiscardTarget);
  }

  function goHome(target = "home") {
    if (hasWorkspace) {
      setPendingDiscardTarget(target);
      setConfirmDialogMode("discard");
      return;
    }

    discardWorkspaceToHome(target);
  }

  function startSandbox() {
    setConfirmDialogMode(null);
    setIsAnalysing(false);
    setIsGenerating(false);
    setIsSandboxMode(true);
    setError("");
    setRoom(DEFAULT_ROOM, { recordHistory: false, resetHistory: true });
    setBaseRoom(DEFAULT_ROOM);
    setPreferences(defaultPreferences);
    setImagePreview("");
    setShowReferenceImage(false);
    setWallToolMode("select");
    setScaleToolActive(false);
    setNorthToolActive(false);
    setRoomNotes(["Sandbox mode started. Add walls, doors, windows, desks, and objects from scratch."]);
    setLayoutNotes([]);
    setScoreExplanation(null);
  }

  const isDiscardConfirm = confirmDialogMode === "discard";

  return (
    <div className="app-shell">
      <header className={`app-header${headerHidden ? " app-header-hidden" : ""}`}>
        <button
          type="button"
          className="brand-lockup brand-home-button"
          onClick={() => goHome("home")}
          aria-label="Go to WorkspaceIQ home"
        >
          <span className="brand-mark">WIQ</span>
          <div>
            <p className="eyebrow">WorkspaceIQ</p>
            <h1>Plan a sharper room for focused work.</h1>
          </div>
        </button>
      </header>

      {isAnalysing ? <LoadingScreen /> : null}

      {!hasWorkspace ? (
        <HomePage
          uploadRef={uploadRef}
          onUpload={handleUpload}
          onStartSandbox={startSandbox}
          isLoading={isAnalysing}
          error={error}
          heroScene={heroScene}
          heroSceneIndex={heroSceneIndex}
        />
      ) : (
        <main className="workspace-layout">
          <section className="canvas-column">
            <FloorPlanEditorBoundary>
              <FloorPlanEditor
                room={room}
                displayRoom={activeRoom}
                setRoom={setRoom}
                onRoomPreviewChange={setRoomPreview}
                zones={showZones ? zoneAnalysis.zones : []}
                onZoneOverride={updateZoneOverride}
                wallToolMode={wallToolMode}
                setWallToolMode={setWallToolMode}
                scaleToolActive={scaleToolActive}
                setScaleToolActive={setScaleToolActive}
                northToolActive={northToolActive}
                setNorthToolActive={setNorthToolActive}
                onAddWall={addWall}
                onAddRectangleRoom={addRectangleRoom}
                onApplyScale={applyScale}
                onApplyNorthDirection={applyNorthAngle}
                imagePreview={imagePreview}
                showReferenceImage={showReferenceImage}
                setShowReferenceImage={setShowReferenceImage}
                showZones={showZones}
                setShowZones={setShowZones}
                canUndo={undoStack.length > 0}
                canRedo={redoStack.length > 0}
                onUndo={undoRoomChange}
                onRedo={redoRoomChange}
              />
            </FloorPlanEditorBoundary>
            <ScorePanel
              score={scoreResult.score}
              breakdown={scoreResult.breakdown}
              advice={scoreResult.advice}
              zones={zoneAnalysis.zones}
              explanation={!roomPreview ? scoreExplanation : null}
              isPreviewing={Boolean(roomPreview)}
              isLoadingExplanation={!roomPreview && isExplainingScore}
            />
            <FloorPlanPreview3D room={activeRoom} />
          </section>

          <aside className="sidebar-column">
            <ControlPanel
              preferences={preferences}
              setPreferences={setPreferences}
              onAddWindow={addWindow}
              onAddDoor={addDoor}
              wallToolMode={wallToolMode}
              setWallToolMode={setWallToolMode}
              scaleToolActive={scaleToolActive}
              setScaleToolActive={setScaleToolActive}
              northToolActive={northToolActive}
              setNorthToolActive={setNorthToolActive}
              onAddObject={addObject}
              onGenerateLayout={handleGenerateLayout}
              onReset={resetWorkspace}
              isGenerating={isGenerating}
            />
            {roomNotes.length ? (
              <div className="note-card">
                <p className="upload-kicker">Room notes</p>
                <ul className="note-list">
                  {roomNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {layoutNotes.length ? (
              <div className="note-card">
                <p className="upload-kicker">Layout notes</p>
                <ul className="note-list">
                  {layoutNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {error ? <p className="error-banner">{error}</p> : null}
          </aside>
        </main>
      )}
      {confirmDialogMode ? (
        <div className="modal-backdrop" role="presentation" onClick={cancelResetWorkspace}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="upload-kicker">{isDiscardConfirm ? "Discard workspace" : "Confirm reset"}</p>
            <h2 id="reset-confirm-title">
              {isDiscardConfirm
                ? "Leave this workspace?"
                : imagePreview
                  ? "Restore the analysed floor plan?"
                  : isSandboxMode
                    ? "Reset this sandbox?"
                    : "Reset this workspace?"}
            </h2>
            <p>
              {isDiscardConfirm
                ? "This will discard the current workspace and return to the home screen so you can upload a different photo."
                : imagePreview
                  ? "This will remove your current edits and bring the layout back to the analysed starting point."
                  : isSandboxMode
                    ? "This will clear the current sandbox and return it to a blank default workspace."
                    : "This will clear the current workspace and return to the default starting state."}
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button modal-button" onClick={cancelResetWorkspace}>
                Keep editing
              </button>
              <button
                type="button"
                className="primary-button modal-button"
                onClick={isDiscardConfirm ? confirmDiscardWorkspace : confirmResetWorkspace}
              >
                {isDiscardConfirm ? "Yes, discard" : "Yes, reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);
  const message = LOADING_MESSAGES[messageIndex % LOADING_MESSAGES.length];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="loading-screen" aria-live="polite" aria-label="Analysing uploaded floor plan">
      <div className="loading-panel">
        <div className="loading-visual" aria-hidden="true">
          <div className="loading-plan">
            <span className="loading-room" />
            <span className="loading-desk desk-a" />
            <span className="loading-desk desk-b" />
            <span className="loading-path" />
          </div>
          {LOADING_FLOATING_OBJECTS.map((item) => {
            return (
              <div
                key={item.id}
                className={`loading-float loading-float--${item.type}`}
                style={{
                  width: `${item.size}px`,
                  height: `${item.size}px`,
                  top: item.top,
                  right: item.right,
                  bottom: item.bottom,
                  left: item.left,
                  ["--float-rotate"]: `${item.rotate}deg`,
                  ["--float-delay"]: item.delay
                }}
              >
                <svg viewBox={`0 0 ${item.size} ${item.size}`} role="presentation">
                  <FloorPlanObjectIcon
                    item={{ type: item.type, rotation_deg: 0 }}
                    width={item.size}
                    height={item.size}
                    fill="#b08968"
                    stroke="#6f4e37"
                    strokeWidth={2}
                  />
                </svg>
              </div>
            );
          })}
        </div>
        <p className="eyebrow">Analysing image</p>
        <h2>{message.title}</h2>
        <p>{message.detail}</p>
        <div className="loading-steps" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

function HomePage({ uploadRef, onUpload, onStartSandbox, isLoading, error, heroScene, heroSceneIndex }) {
  const [pointerLight, setPointerLight] = useState({ x: 50, y: 50, active: false });

  function handlePlanPointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    setPointerLight({
      x: clampPercent(x),
      y: clampPercent(y),
      active: true
    });
  }

  return (
    <main className="home-page">
      <section className="hero-section" id="home">
        <div className="hero-copy">
          <p className="eyebrow">Workspace planning assistant</p>
          <h2>Design a workspace that works back.</h2>
          <p>
            Upload a room photo, get an editable floor plan, and tune desk placement around light,
            flow, collaboration, and focus.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="primary-link"
              onClick={() => uploadRef.current?.openPicker()}
              disabled={isLoading}
            >
              {isLoading ? "Analysing..." : "Start with a photo"}
            </button>
            <button
              type="button"
              className="secondary-link"
              onClick={onStartSandbox}
              disabled={isLoading}
            >
              Start sandbox
            </button>
          </div>
        </div>

        <div className="hero-visual" aria-label="WorkspaceIQ floor plan preview">
          <div className="mini-toolbar">
            <span />
            <span />
            <strong>Score {heroScene.score}</strong>
          </div>
          <div
            className="mini-plan"
            onMouseMove={handlePlanPointerMove}
            onMouseEnter={() => setPointerLight((current) => ({ ...current, active: true }))}
            onMouseLeave={() => setPointerLight((current) => ({ ...current, active: false }))}
          >
            <div
              className={`mini-cursor-light${pointerLight.active ? " is-active" : ""}`}
              style={{
                left: `${pointerLight.x}%`,
                top: `${pointerLight.y}%`
              }}
            />
            {heroScene.windows.map((windowItem, index) => (
              <span
                key={`${heroScene.id}-window-${index}`}
                className="mini-opening mini-window"
                style={{ left: windowItem.left, width: windowItem.width }}
              />
            ))}
            {heroScene.doors.map((doorItem, index) => (
              <span
                key={`${heroScene.id}-door-${index}`}
                className="mini-opening mini-door"
                style={doorItem.side === "right"
                  ? { right: "-4px", top: doorItem.top, height: doorItem.height }
                  : { left: "-4px", top: doorItem.top, height: doorItem.height }}
              />
            ))}
            {heroScene.objects.map((item) => (
              item.kind === "plant" ? (
                <span
                  key={item.id}
                  className="mini-object mini-object--plant-icon"
                  style={{
                    "--plant-delay": item.id.endsWith("b") ? "900ms" : "0ms",
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    height: item.height,
                    opacity: item.opacity,
                    transform: item.rotate ? `rotate(${item.rotate})` : undefined
                  }}
                >
                  <svg viewBox="0 0 32 38" aria-hidden="true">
                    <FloorPlanObjectIcon
                      item={{ type: "plant" }}
                      width={32}
                      height={38}
                      fill={getObjectDefinition("plant").tone}
                      stroke={getObjectDefinition("plant").stroke}
                      strokeWidth={1.8}
                    />
                  </svg>
                </span>
              ) : (
                <span
                  key={item.id}
                  className={`mini-object mini-object--${item.kind}`}
                  style={{
                    left: item.left,
                    top: item.top,
                    width: item.width,
                    height: item.height,
                    opacity: item.opacity,
                    transform: item.rotate ? `rotate(${item.rotate})` : undefined
                  }}
                />
              )
            ))}
          </div>
          <div className="mini-scene-pips" aria-hidden="true">
            {HERO_LAYOUT_SCENES.map((scene, index) => (
              <span
                key={scene.id}
                className={index === heroSceneIndex ? "is-active" : ""}
              />
            ))}
          </div>
          <div className="mini-insights">
            {heroScene.insights.map((insight) => (
              <span key={insight}>{insight}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="feature-section" id="features">
        <article>
          <span>01</span>
          <h3>Analyze the room</h3>
          <p>Estimate room size, walls, windows, doors, and obstacles from a simple workspace photo.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Generate layouts</h3>
          <p>Create desk arrangements based on headcount and the practical flow your space needs to support.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Score decisions</h3>
          <p>See how each arrangement performs for daylight, circulation, quiet areas, and usable space.</p>
        </article>
      </section>

      <div id="upload">
        <UploadScreen ref={uploadRef} onUpload={onUpload} isLoading={isLoading} error={error} />
      </div>
    </main>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the uploaded image."));
    image.src = dataUrl;
  });
}

function findNonBackgroundBounds(imageData, width, height) {
  const pixels = imageData.data;

  function samplePixel(x, y) {
    const offset = (y * width + x) * 4;
    return {
      r: pixels[offset],
      g: pixels[offset + 1],
      b: pixels[offset + 2]
    };
  }

  const cornerSamples = [
    samplePixel(0, 0),
    samplePixel(Math.max(0, width - 1), 0),
    samplePixel(0, Math.max(0, height - 1)),
    samplePixel(Math.max(0, width - 1), Math.max(0, height - 1))
  ];

  const background = cornerSamples.reduce(
    (accumulator, sample) => ({
      r: accumulator.r + sample.r / cornerSamples.length,
      g: accumulator.g + sample.g / cornerSamples.length,
      b: accumulator.b + sample.b / cornerSamples.length
    }),
    { r: 0, g: 0, b: 0 }
  );

  function isForeground(x, y) {
    const { r, g, b } = samplePixel(x, y);
    const distance =
      Math.abs(r - background.r) +
      Math.abs(g - background.g) +
      Math.abs(b - background.b);
    const brightness = (r + g + b) / 3;
    return distance > 45 || brightness < 220;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isForeground(x, y)) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const paddingX = Math.max(6, Math.round(width * 0.02));
  const paddingY = Math.max(6, Math.round(height * 0.02));

  return {
    x: Math.max(0, minX - paddingX),
    y: Math.max(0, minY - paddingY),
    width: Math.min(width, maxX - minX + 1 + paddingX * 2),
    height: Math.min(height, maxY - minY + 1 + paddingY * 2)
  };
}

async function cropImageToLikelyPlanBounds(dataUrl) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Could not prepare the uploaded image.");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = findNonBackgroundBounds(imageData, canvas.width, canvas.height);

  if (!bounds) {
    return {
      analysisDataUrl: dataUrl,
      analysisBounds: DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: []
    };
  }

  const areaRatio = (bounds.width * bounds.height) / Math.max(canvas.width * canvas.height, 1);
  const hugsEdge =
    bounds.x <= 2 &&
    bounds.y <= 2 &&
    bounds.x + bounds.width >= canvas.width - 2 &&
    bounds.y + bounds.height >= canvas.height - 2;

  if (areaRatio >= 0.94 || hugsEdge) {
    return {
      analysisDataUrl: dataUrl,
      analysisBounds: DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: []
    };
  }

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = bounds.width;
  croppedCanvas.height = bounds.height;
  const croppedContext = croppedCanvas.getContext("2d");

  if (!croppedContext) {
    throw new Error("Could not prepare the cropped analysis image.");
  }

  croppedContext.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height
  );

  return {
    analysisDataUrl: croppedCanvas.toDataURL("image/png"),
    analysisBounds: {
      x_percent: (bounds.x / canvas.width) * 100,
      y_percent: (bounds.y / canvas.height) * 100,
      width_percent: (bounds.width / canvas.width) * 100,
      height_percent: (bounds.height / canvas.height) * 100
    },
    preprocessingNotes: [
      "WorkspaceIQ cropped obvious outer margins before analysis so walls are less likely to snap to the image border."
    ]
  };
}
