import { useMemo, useState } from "react";
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
    desks: []
  };
}

function normalizeDeskData(data) {
  const desks = Array.isArray(data) ? data : Array.isArray(data?.desks) ? data.desks : [];
  return desks.map((desk) => ({
    x_percent: Number(desk?.x_percent) || 0,
    y_percent: Number(desk?.y_percent) || 0,
    rotation_deg: Number(desk?.rotation_deg) || 0
  }));
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
  const [room, setRoom] = useState(DEFAULT_ROOM);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [imagePreview, setImagePreview] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const scoreResult = useMemo(() => computeScore(room, preferences), [room, preferences]);

  async function handleUpload(file) {
    setIsAnalysing(true);
    setError("");

    try {
      const base64 = await fileToBase64(file);
      setImagePreview(base64);

      const response = await fetch(`${API_BASE_URL}/analyse-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });

      if (!response.ok) {
        throw new Error("Room analysis failed.");
      }

      const data = await response.json();
      setRoom(normalizeRoomData(data));
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

      const desks = normalizeDeskData(await response.json());
      setRoom((currentRoom) => ({
        ...currentRoom,
        desks
      }));
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
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">WorkspaceIQ</p>
          <h1>Turn an office photo into an editable productivity layout.</h1>
        </div>
      </header>

      {!imagePreview ? (
        <UploadScreen onUpload={handleUpload} isLoading={isAnalysing} error={error} />
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
            {error ? <p className="error-banner">{error}</p> : null}
          </aside>
        </main>
      )}
    </div>
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
