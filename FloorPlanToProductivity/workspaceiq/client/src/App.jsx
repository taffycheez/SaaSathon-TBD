import { useMemo, useRef, useState } from "react";
import UploadScreen from "./components/UploadScreen";
import FloorPlanEditor from "./components/FloorPlanEditor";
import ControlPanel from "./components/ControlPanel";
import ScorePanel from "./components/ScorePanel";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const DEFAULT_ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  windows: [],
  doors: [],
  furniture: [],
  desks: []
};

const defaultPreferences = {
  numPeople: 8,
  workStyle: "balanced"
};

function normalizeRoomData(data) {
  const safeData = data && typeof data === "object" ? data : {};

  return {
    ...DEFAULT_ROOM,
    estimated_width_m: Math.max(1, Number(safeData.estimated_width_m) || DEFAULT_ROOM.estimated_width_m),
    estimated_height_m: Math.max(1, Number(safeData.estimated_height_m) || DEFAULT_ROOM.estimated_height_m),
    windows: Array.isArray(safeData.windows) ? safeData.windows : [],
    doors: Array.isArray(safeData.doors) ? safeData.doors : [],
    furniture: Array.isArray(safeData.furniture) ? safeData.furniture : [],
    desks: [],
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
}

function normalizeDeskData(data) {
  const safeData = data && typeof data === "object" ? data : {};
  const rawDesks = Array.isArray(data) ? data : Array.isArray(safeData.desks) ? safeData.desks : [];

  return {
    desks: rawDesks.map((desk) => ({
      x_percent: Number(desk?.x_percent) || 0,
      y_percent: Number(desk?.y_percent) || 0,
      rotation_deg: Number(desk?.rotation_deg) || 0
    })),
    notes: Array.isArray(safeData.notes) ? safeData.notes : []
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isNearWindow(desk, windows) {
  return windows.some((windowItem) => {
    const anchor =
      windowItem.wall === "top"
        ? { x: windowItem.position_percent, y: 0 }
        : windowItem.wall === "bottom"
          ? { x: windowItem.position_percent, y: 100 }
          : windowItem.wall === "left"
            ? { x: 0, y: windowItem.position_percent }
            : { x: 100, y: windowItem.position_percent };
    return distance({ x: desk.x_percent, y: desk.y_percent }, anchor) <= 28;
  });
}

function isFacingWall(desk) {
  const rotation = ((desk.rotation_deg % 360) + 360) % 360;
  const closeToTop = desk.y_percent < 18 && rotation >= 225 && rotation <= 315;
  const closeToBottom = desk.y_percent > 82 && (rotation <= 45 || rotation >= 315 || (rotation >= 0 && rotation <= 45));
  const closeToLeft = desk.x_percent < 18 && rotation >= 135 && rotation <= 225;
  const closeToRight = desk.x_percent > 82 && (rotation >= 315 || rotation <= 45);
  return closeToTop || closeToBottom || closeToLeft || closeToRight;
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

function hasQuietZone(desks, doors) {
  if (!desks.length || !doors.length) {
    return false;
  }
  const doorway = doors[0];
  const doorPoint =
    doorway.wall === "top"
      ? { x: doorway.position_percent, y: 0 }
      : doorway.wall === "bottom"
        ? { x: doorway.position_percent, y: 100 }
        : doorway.wall === "left"
          ? { x: 0, y: doorway.position_percent }
          : { x: 100, y: doorway.position_percent };
  const farDesks = desks.filter(
    (desk) => distance({ x: desk.x_percent, y: desk.y_percent }, doorPoint) >= 40
  );
  return farDesks.length >= Math.max(2, Math.ceil(desks.length / 2));
}

function hasCollaborationZone(desks, workStyle) {
  if (workStyle !== "collaborative") {
    return true;
  }
  if (desks.length < 3) {
    return false;
  }
  let clusteredPairs = 0;
  for (let i = 0; i < desks.length; i += 1) {
    for (let j = i + 1; j < desks.length; j += 1) {
      if (distance(
        { x: desks[i].x_percent, y: desks[i].y_percent },
        { x: desks[j].x_percent, y: desks[j].y_percent }
      ) < 16) {
        clusteredPairs += 1;
      }
    }
  }
  return clusteredPairs >= 2;
}

function computeScore(room, preferences) {
  const desks = room.desks || [];
  const windows = room.windows || [];
  const doors = room.doors || [];
  const breakdown = [];
  let score = 0;

  const nearWindowCount = desks.filter((desk) => isNearWindow(desk, windows)).length;
  const windowPoints = Math.min(30, nearWindowCount * 10);
  score += windowPoints;
  breakdown.push(`${nearWindowCount} desk(s) benefit from natural light: +${windowPoints}`);

  const notFacingWallCount = desks.filter((desk) => !isFacingWall(desk)).length;
  const facingPoints = Math.min(20, notFacingWallCount * 10);
  score += facingPoints;
  breakdown.push(`${notFacingWallCount} desk(s) avoid direct wall-facing orientation: +${facingPoints}`);

  const corridorPoints = hasCorridor(desks) ? 15 : 0;
  score += corridorPoints;
  breakdown.push(`${corridorPoints ? "Clear" : "Insufficient"} corridor between desk rows: +${corridorPoints}`);

  const quietPoints = hasQuietZone(desks, doors) ? 15 : 0;
  score += quietPoints;
  breakdown.push(`${quietPoints ? "Quiet zone present" : "Quiet zone missing"}: +${quietPoints}`);

  const collaborationPoints = hasCollaborationZone(desks, preferences.workStyle) ? 10 : 0;
  score += collaborationPoints;
  breakdown.push(`${preferences.workStyle === "collaborative" ? "Collaboration zone check" : "Collaboration bonus not required"}: +${collaborationPoints}`);

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
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [roomNotes, setRoomNotes] = useState([]);
  const [layoutNotes, setLayoutNotes] = useState([]);

  const scoreResult = useMemo(() => computeScore(room, preferences), [room, preferences]);

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
          work_style: preferences.workStyle
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
            <FloorPlanEditor room={room} setRoom={setRoom} imagePreview={imagePreview} />
            <ScorePanel score={scoreResult.score} breakdown={scoreResult.breakdown} />
          </section>

          <aside className="sidebar-column">
            <ControlPanel
              preferences={preferences}
              setPreferences={setPreferences}
              room={room}
              updateRoomDimensions={updateRoomDimensions}
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

function HomePage({ uploadRef, onUpload, isLoading, error }) {
  const marqueeItems = [
    "Room photo analysis",
    "Desk placement",
    "Natural light scoring",
    "Quiet zones",
    "Corridor checks",
    "Editable floor plans"
  ];

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
            <a className="secondary-link" href="#features">View features</a>
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

      <section className="marquee-section" aria-label="WorkspaceIQ capabilities">
        <div className="marquee-track">
          {[...marqueeItems, ...marqueeItems].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
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
          <p>Create desk arrangements based on headcount and the work style your space needs to support.</p>
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
      <div>
        <p className="eyebrow">WorkspaceIQ</p>
        <h2>Quick links</h2>
      </div>
      <nav aria-label="Footer quick links">
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#upload">Upload</a>
        <a href="mailto:hello@workspaceiq.local">Contact</a>
      </nav>
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
