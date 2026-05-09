import { OBJECT_PALETTE, getObjectDefinition } from "@/lib/objectCatalog";

export default function ControlPanel({
  preferences,
  setPreferences,
  canShowReferenceImage = false,
  showReferenceImage,
  setShowReferenceImage,
  onAddWindow,
  onAddDoor,
  wallToolMode,
  setWallToolMode,
  scaleToolActive,
  setScaleToolActive,
  onAddObject,
  onGenerateLayout,
  onReset,
  isGenerating
}) {
  return (
    <div className="panel-card">
      <p className="upload-kicker">Step 3</p>
      <h2>Layout controls</h2>

      <label className="field">
        <span className="field-label">
          Number of people
          <strong>{preferences.numPeople}</strong>
        </span>
        <input
          type="range"
          min="1"
          max="50"
          value={preferences.numPeople}
          onChange={(event) =>
            setPreferences((current) => ({
              ...current,
              numPeople: Number(event.target.value)
            }))
          }
        />
      </label>

      <div className="field">
        <span>Quick add</span>
        <div className="quick-add-row">
          <button type="button" className="object-chip quick-add-chip" onClick={onAddWindow}>
            Add Window
          </button>
          <button type="button" className="object-chip quick-add-chip" onClick={onAddDoor}>
            Add Door
          </button>
          <button
            type="button"
            className={`object-chip quick-add-chip${wallToolMode === "add" ? " active" : ""}`}
            onClick={() => {
              setScaleToolActive(false);
              setWallToolMode((current) => (current === "add" ? "select" : "add"));
            }}
          >
            {wallToolMode === "add" ? "Exit Draw Walls" : "Draw Walls"}
          </button>
          <button
            type="button"
            className={`object-chip quick-add-chip${wallToolMode === "rect" ? " active" : ""}`}
            onClick={() => {
              setScaleToolActive(false);
              setWallToolMode((current) => (current === "rect" ? "select" : "rect"));
            }}
          >
            {wallToolMode === "rect" ? "Exit Rect Room" : "Rectangle Room"}
          </button>
          <button
            type="button"
            className={`object-chip quick-add-chip${scaleToolActive ? " active" : ""}`}
            onClick={() => {
              setWallToolMode("select");
              setScaleToolActive((current) => !current);
            }}
          >
            {scaleToolActive ? "Cancel Scale" : "Set Scale"}
          </button>
        </div>
        <small className="field-hint">Use Set Scale to calibrate the plan from a known real-world measurement.</small>
      </div>

      <div className="field">
        <span>Add office objects</span>
        <div className="object-palette">
          {OBJECT_PALETTE.map((type) => (
            <button
              key={type}
              type="button"
              className="object-chip"
              onClick={() => onAddObject(type)}
            >
              {getObjectDefinition(type).label}
            </button>
          ))}
        </div>
      </div>

      {canShowReferenceImage ? (
        <label className="field toggle-field">
          <span>
            Show original floor plan
            <small>Overlay the uploaded reference image on the canvas.</small>
          </span>
          <button
            type="button"
            className={`toggle-button ${showReferenceImage ? "active" : ""}`}
            aria-pressed={showReferenceImage}
            onClick={() => setShowReferenceImage((current) => !current)}
          >
            {showReferenceImage ? "On" : "Off"}
          </button>
        </label>
      ) : null}
      <button type="button" className="primary-button" onClick={onGenerateLayout} disabled={isGenerating}>
        {isGenerating ? "Generating..." : "Generate Layout"}
      </button>
      <button type="button" className="secondary-button" onClick={onReset}>
        Reset Edits
      </button>
    </div>
  );
}
