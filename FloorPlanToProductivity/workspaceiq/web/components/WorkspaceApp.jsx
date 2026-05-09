"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UploadScreen from "@/components/UploadScreen";
import ControlPanel from "@/components/ControlPanel";
import FloorPlanEditor from "@/components/FloorPlanEditor";
import FloorPlanEditorBoundary from "@/components/FloorPlanEditorBoundary";
import ScorePanel from "@/components/ScorePanel";
import { getObjectDefinition } from "@/lib/objectCatalog";
import {
  addObjectToRoom,
  clampPercent,
  isDeskLikeFurniture,
  normalizeFootprintPoints,
  normalizeFurnitureItem,
  normalizeRotation,
  normalizeShapeKind
} from "@/lib/roomState";

const API_BASE_URL = "/api";

const DEFAULT_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [
    { x1_percent: 0, y1_percent: 0, x2_percent: 100, y2_percent: 0 },
    { x1_percent: 100, y1_percent: 0, x2_percent: 100, y2_percent: 100 },
    { x1_percent: 100, y1_percent: 100, x2_percent: 0, y2_percent: 100 },
    { x1_percent: 0, y1_percent: 100, x2_percent: 0, y2_percent: 0 }
  ],
  windows: [],
  doors: [],
  furniture: [],
  desks: []
};

const defaultPreferences = {
  numPeople: 8
};

const DEFAULT_ANALYSIS_BOUNDS = {
  x_percent: 0,
  y_percent: 0,
  width_percent: 100,
  height_percent: 100
};

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
    ? safeData.furniture.map(normalizeFurnitureItem)
    : [];
  const detectedDesks = furniture.filter(isDeskLikeFurniture).map(normalizeFurnitureItem);

  return {
    ...DEFAULT_ROOM,
    estimated_width_m: Math.max(1, Number(safeData.estimated_width_m) || DEFAULT_ROOM.estimated_width_m),
    estimated_height_m: Math.max(1, Number(safeData.estimated_height_m) || DEFAULT_ROOM.estimated_height_m),
    walls,
    windows: Array.isArray(safeData.windows)
      ? safeData.windows.map((item) => edgeItemFromLegacy(item, walls))
      : [],
    doors: Array.isArray(safeData.doors)
      ? safeData.doors.map((item) => edgeItemFromLegacy(item, walls))
      : [],
    furniture: furniture.filter((item) => !isDeskLikeFurniture(item)),
    desks: detectedDesks,
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
}

function remapPercentIntoOriginal(value, startPercent, sizePercent) {
  return clampPercent(startPercent + (clampPercent(value) / 100) * sizePercent);
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
      ? room.walls.map((wall) => ({
          ...wall,
          x1_percent: remapPercentIntoOriginal(wall.x1_percent, startX, safeWidthScale),
          y1_percent: remapPercentIntoOriginal(wall.y1_percent, startY, safeHeightScale),
          x2_percent: remapPercentIntoOriginal(wall.x2_percent, startX, safeWidthScale),
          y2_percent: remapPercentIntoOriginal(wall.y2_percent, startY, safeHeightScale)
        }))
      : room.walls,
    windows: Array.isArray(room.windows)
      ? room.windows.map((item) =>
          item && item.x_percent != null && item.y_percent != null
            ? {
                ...item,
                x_percent: remapPercentIntoOriginal(item.x_percent, startX, safeWidthScale),
                y_percent: remapPercentIntoOriginal(item.y_percent, startY, safeHeightScale)
              }
            : item
        )
      : room.windows,
    doors: Array.isArray(room.doors)
      ? room.doors.map((item) =>
          item && item.x_percent != null && item.y_percent != null
            ? {
                ...item,
                x_percent: remapPercentIntoOriginal(item.x_percent, startX, safeWidthScale),
                y_percent: remapPercentIntoOriginal(item.y_percent, startY, safeHeightScale)
              }
            : item
        )
      : room.doors,
    furniture: Array.isArray(room.furniture)
      ? room.furniture.map((item) => ({
          ...item,
          x_percent: remapPercentIntoOriginal(item.x_percent, startX, safeWidthScale),
          y_percent: remapPercentIntoOriginal(item.y_percent, startY, safeHeightScale),
          width_percent: clampPercent((Number(item.width_percent) || 0) * (safeWidthScale / 100)),
          height_percent: clampPercent((Number(item.height_percent) || 0) * (safeHeightScale / 100))
        }))
      : room.furniture,
    desks: Array.isArray(room.desks)
      ? room.desks.map((item) => ({
          ...item,
          x_percent: remapPercentIntoOriginal(item.x_percent, startX, safeWidthScale),
          y_percent: remapPercentIntoOriginal(item.y_percent, startY, safeHeightScale),
          width_percent: clampPercent((Number(item.width_percent) || 0) * (safeWidthScale / 100)),
          height_percent: clampPercent((Number(item.height_percent) || 0) * (safeHeightScale / 100))
        }))
      : room.desks
  };
}

async function prepareImageForAnalysis(file) {
  const originalDataUrl = await fileToBase64(file);

  try {
    const processed = await cropImageToLikelyPlanBounds(originalDataUrl);
    return {
      originalDataUrl,
      analysisDataUrl: processed?.analysisDataUrl || originalDataUrl,
      analysisBounds: processed?.analysisBounds || DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: processed?.preprocessingNotes || []
    };
  } catch {
    return {
      originalDataUrl,
      analysisDataUrl: originalDataUrl,
      analysisBounds: DEFAULT_ANALYSIS_BOUNDS,
      preprocessingNotes: []
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
        rotation_deg: normalizeRotation(desk?.rotation_deg),
        footprint_points: normalizeFootprintPoints(desk?.footprint_points, definition.footprint_points)
      };
    }),
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointOnWall(edgeItem, walls) {
  if (edgeItem && edgeItem.x_percent != null && edgeItem.y_percent != null) {
    return {
      x: clampPercent(edgeItem.x_percent),
      y: clampPercent(edgeItem.y_percent)
    };
  }
  const wall = walls[edgeItem?.wall_index];
  if (!wall) {
    return { x: 50, y: 50 };
  }
  const ratio = clampPercent(edgeItem?.position_percent) / 100;
  return {
    x: wall.x1_percent + (wall.x2_percent - wall.x1_percent) * ratio,
    y: wall.y1_percent + (wall.y2_percent - wall.y1_percent) * ratio
  };
}

function isNearWindow(desk, windows, walls) {
  return windows.some((windowItem) => {
    const anchor = pointOnWall(windowItem, walls);
    return distance({ x: desk.x_percent, y: desk.y_percent }, anchor) <= 28;
  });
}

function isFacingWall(desk, walls) {
  const rotation = ((desk.rotation_deg % 360) + 360) % 360;
  const angleVector = rotation >= 315 || rotation < 45
    ? { x: 1, y: 0 }
    : rotation < 135
      ? { x: 0, y: 1 }
      : rotation < 225
        ? { x: -1, y: 0 }
        : { x: 0, y: -1 };

  return walls.some((wall) => {
    const midPoint = {
      x: (wall.x1_percent + wall.x2_percent) / 2,
      y: (wall.y1_percent + wall.y2_percent) / 2
    };
    const toWall = {
      x: midPoint.x - desk.x_percent,
      y: midPoint.y - desk.y_percent
    };
    const dot = angleVector.x * toWall.x + angleVector.y * toWall.y;
    return dot > 0 && Math.abs(toWall.x) + Math.abs(toWall.y) < 36;
  });
}

function hasCorridor(desks) {
  if (desks.length < 2) {
    return false;
  }
  const sorted = [...desks].sort((a, b) => a.y_percent - b.y_percent);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].y_percent - sorted[index - 1].y_percent >= 18) {
      return true;
    }
  }
  return false;
}

function hasQuietZone(desks, doors, walls) {
  if (!desks.length || !doors.length) {
    return false;
  }
  const doorPoint = pointOnWall(doors[0], walls);
  const farDesks = desks.filter(
    (desk) => distance({ x: desk.x_percent, y: desk.y_percent }, doorPoint) >= 40
  );
  return farDesks.length >= Math.max(2, Math.ceil(desks.length / 2));
}

function computeScore(room) {
  const desks = room.desks || [];
  const walls = room.walls || [];
  const windows = room.windows || [];
  const doors = room.doors || [];
  const breakdown = [];
  let score = 0;

  const nearWindowCount = desks.filter((desk) => isNearWindow(desk, windows, walls)).length;
  const windowPoints = Math.min(30, nearWindowCount * 10);
  score += windowPoints;
  breakdown.push(`${nearWindowCount} desk(s) benefit from natural light: +${windowPoints}`);

  const notFacingWallCount = desks.filter((desk) => !isFacingWall(desk, walls)).length;
  const facingPoints = Math.min(20, notFacingWallCount * 10);
  score += facingPoints;
  breakdown.push(`${notFacingWallCount} desk(s) avoid direct wall-facing orientation: +${facingPoints}`);

  const corridorPoints = hasCorridor(desks) ? 15 : 0;
  score += corridorPoints;
  breakdown.push(`${corridorPoints ? "Clear" : "Insufficient"} corridor between desk rows: +${corridorPoints}`);

  const quietPoints = hasQuietZone(desks, doors, walls) ? 15 : 0;
  score += quietPoints;
  breakdown.push(`${quietPoints ? "Quiet zone present" : "Quiet zone missing"}: +${quietPoints}`);

  const areaPerDesk =
    desks.length > 0
      ? (room.estimated_width_m * room.estimated_height_m) / desks.length
      : room.estimated_width_m * room.estimated_height_m;
  const areaPoints = areaPerDesk >= 4 ? 10 : 0;
  score += areaPoints;
  breakdown.push(`${areaPerDesk.toFixed(1)} sqm per desk: +${areaPoints}`);

  return {
    score: clamp(score, 0, 100),
    breakdown
  };
}

export default function WorkspaceApp() {
  const uploadRef = useRef(null);
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [baseRoom, setBaseRoom] = useState(DEFAULT_ROOM);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [imagePreview, setImagePreview] = useState("");
  const [showReferenceImage, setShowReferenceImage] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [roomNotes, setRoomNotes] = useState([]);
  const [layoutNotes, setLayoutNotes] = useState([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const scoreResult = useMemo(() => computeScore(room), [room]);

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setError("");
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [error]);

  function addObject(type) {
    setRoom((currentRoom) => addObjectToRoom(currentRoom, type));
  }

  function addWindow() {
    setRoom((currentRoom) => ({
      ...currentRoom,
      windows: [
        ...(currentRoom.windows || []),
        { x_percent: 50, y_percent: 12, rotation_deg: 0 }
      ]
    }));
  }

  function addTable() {
    addObject("table");
  }

  async function handleUpload(file) {
    setIsAnalysing(true);
    setError("");

    try {
      const {
        originalDataUrl,
        analysisDataUrl,
        analysisBounds,
        preprocessingNotes
      } = await prepareImageForAnalysis(file);

      const response = await fetch(`${API_BASE_URL}/analyse-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: analysisDataUrl })
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || "Room analysis failed.");
      }

      const data = await response.json();
      const normalizedRoom = remapRoomToOriginalBounds(normalizeRoomData(data), analysisBounds);
      setImagePreview(originalDataUrl);
      setShowReferenceImage(false);
      setRoom(normalizedRoom);
      setBaseRoom(normalizedRoom);
      setRoomNotes([
        ...(Array.isArray(data.notes) ? data.notes : []),
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
          work_style: "balanced"
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
      setLayoutNotes(notes);
    } catch (generationError) {
      setError(generationError.message || "We couldn't generate a layout right now.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateRoomDimensions(dimension, value) {
    setRoom((currentRoom) => ({
      ...currentRoom,
      [dimension]: Number(value) || 0
    }));
  }

  function resetWorkspace() {
    setShowResetConfirm(true);
  }

  function confirmResetWorkspace() {
    setShowResetConfirm(false);

    if (imagePreview) {
      setRoom(baseRoom);
      setPreferences(defaultPreferences);
      setShowReferenceImage(false);
      setError("");
      setLayoutNotes([]);
      return;
    }

    setRoom(DEFAULT_ROOM);
    setBaseRoom(DEFAULT_ROOM);
    setPreferences(defaultPreferences);
    setImagePreview("");
    setShowReferenceImage(false);
    setError("");
    setRoomNotes([]);
    setLayoutNotes([]);
  }

  function cancelResetWorkspace() {
    setShowResetConfirm(false);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="brand-lockup brand-home-button"
          onClick={() => {
            if (!imagePreview) {
              resetWorkspace();
            }
          }}
          aria-label="Go to WorkspaceIQ home"
        >
          <span className="brand-mark">WIQ</span>
          <div>
            <p className="eyebrow">WorkspaceIQ</p>
            <h1>Plan a sharper room for focused work.</h1>
          </div>
        </button>
        {!imagePreview ? (
          <button
            type="button"
            className="header-upload-button"
            onClick={() => uploadRef.current?.openPicker()}
            disabled={isAnalysing}
          >
            {isAnalysing ? "Analysing..." : "Upload image"}
          </button>
        ) : null}
      </header>

      {isAnalysing ? <LoadingScreen /> : null}

      {!imagePreview ? (
        <HomePage
          uploadRef={uploadRef}
          onUpload={handleUpload}
          isLoading={isAnalysing}
          error={error}
        />
      ) : (
        <main className="workspace-layout">
          <section className="canvas-column">
            <FloorPlanEditorBoundary>
              <FloorPlanEditor
                room={room}
                setRoom={setRoom}
                imagePreview={imagePreview}
                showReferenceImage={showReferenceImage}
              />
            </FloorPlanEditorBoundary>
            <ScorePanel score={scoreResult.score} breakdown={scoreResult.breakdown} />
          </section>

          <aside className="sidebar-column">
            <ControlPanel
              preferences={preferences}
              setPreferences={setPreferences}
              room={room}
              updateRoomDimensions={updateRoomDimensions}
              showReferenceImage={showReferenceImage}
              setShowReferenceImage={setShowReferenceImage}
              onAddWindow={addWindow}
              onAddTable={addTable}
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
      <Footer />
      {showResetConfirm ? (
        <div className="modal-backdrop" role="presentation" onClick={cancelResetWorkspace}>
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="upload-kicker">Confirm reset</p>
            <h2 id="reset-confirm-title">
              {imagePreview ? "Restore the analysed floor plan?" : "Reset this workspace?"}
            </h2>
            <p>
              {imagePreview
                ? "This will remove your current edits and bring the layout back to the analysed starting point."
                : "This will clear the current workspace and return to the default starting state."}
            </p>
            <div className="confirm-actions">
              <button type="button" className="secondary-button modal-button" onClick={cancelResetWorkspace}>
                Keep editing
              </button>
              <button type="button" className="primary-button modal-button" onClick={confirmResetWorkspace}>
                Yes, reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingScreen() {
  return (
    <section className="loading-screen" aria-live="polite" aria-label="Analysing uploaded floor plan">
      <div className="loading-panel">
        <div className="loading-plan" aria-hidden="true">
          <span className="loading-room" />
          <span className="loading-desk desk-a" />
          <span className="loading-desk desk-b" />
          <span className="loading-path" />
        </div>
        <p className="eyebrow">Analysing image</p>
        <h2>Checking the floor plan</h2>
        <p>
          WorkspaceIQ is reading walls, doors, windows, and existing objects before opening the editor.
        </p>
        <div className="loading-steps" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

function HomePage({ uploadRef, onUpload, isLoading, error }) {
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
          </div>
        </div>

        <div className="hero-visual" aria-label="WorkspaceIQ floor plan preview">
          <div className="mini-toolbar">
            <span />
            <span />
            <strong>Score 82</strong>
          </div>
          <div className="mini-plan">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={`desk-${index}`} className={`mini-desk desk-${index + 1}`} />
            ))}
            <span className="mini-window" />
            <span className="mini-door" />
          </div>
          <div className="mini-insights">
            <span>Light +24</span>
            <span>Flow +15</span>
            <span>Focus +18</span>
          </div>
        </div>
      </section>

      <section className="feature-section" id="features">
        <article>
          <span>01</span>
          <h3>Read the room</h3>
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

function Footer() {
  return (
    <footer className="site-footer" id="footer">
      <div className="footer-links">
        <div className="brand-lockup">
          <span className="brand-mark">WIQ</span>
          <div>
            <p className="eyebrow">WorkspaceIQ</p>
            <h2>Quick links</h2>
          </div>
        </div>
        <nav aria-label="Footer quick links">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#upload">Upload</a>
          <a href="mailto:hello@workspaceiq.local">Contact</a>
        </nav>
      </div>
      <p className="copyright">&copy; {new Date().getFullYear()} WorkspaceIQ. All rights reserved.</p>
    </footer>
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
