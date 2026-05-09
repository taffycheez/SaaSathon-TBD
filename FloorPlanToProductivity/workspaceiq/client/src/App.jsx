import { useEffect, useMemo, useRef, useState } from "react";
import UploadScreen from "./components/UploadScreen";
import FloorPlanEditor from "./components/FloorPlanEditor";
import ControlPanel from "./components/ControlPanel";
import ScorePanel from "./components/ScorePanel";
import { getObjectDefinition } from "./objectCatalog";
import {
  addObjectToRoom,
  clampPercent,
  isDeskLikeFurniture,
  normalizeFootprintPoints,
  normalizeFurnitureItem,
  normalizeRotation,
  normalizeShapeKind
} from "./lib/roomState";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

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

function normalizeWallIndex(value, wallsLength) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || wallsLength <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(wallsLength - 1, numeric));
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
      ? safeData.windows.map((item) => ({
          wall_index: normalizeWallIndex(item?.wall_index, walls.length),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    doors: Array.isArray(safeData.doors)
      ? safeData.doors.map((item) => ({
          wall_index: normalizeWallIndex(item?.wall_index, walls.length),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    furniture: furniture.filter((item) => !isDeskLikeFurniture(item)),
    desks: detectedDesks,
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
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
  const wall = walls[edgeItem.wall_index];
  if (!wall) {
    return { x: 50, y: 50 };
  }

  const ratio = clampPercent(edgeItem.position_percent) / 100;
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

export default function App() {
  const uploadRef = useRef(null);
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [imagePreview, setImagePreview] = useState("");
  const [showReferenceImage, setShowReferenceImage] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [roomNotes, setRoomNotes] = useState([]);
  const [layoutNotes, setLayoutNotes] = useState([]);

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

  async function handleUpload(file) {
    setIsAnalysing(true);
    setError("");

    try {
      const base64 = await fileToBase64(file);

      const response = await fetch(`${API_BASE_URL}/analyse-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error || "Room analysis failed.");
      }

      const data = await response.json();
      setImagePreview(base64);
      setShowReferenceImage(false);
      setRoom(normalizeRoomData(data));
      setRoomNotes(Array.isArray(data.notes) ? data.notes : []);
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
    setRoom(DEFAULT_ROOM);
    setPreferences(defaultPreferences);
    setImagePreview("");
    setShowReferenceImage(false);
    setError("");
    setRoomNotes([]);
    setLayoutNotes([]);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="brand-lockup brand-home-button"
          onClick={resetWorkspace}
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
            <FloorPlanEditor
              room={room}
              setRoom={setRoom}
              imagePreview={imagePreview}
              showReferenceImage={showReferenceImage}
            />
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
