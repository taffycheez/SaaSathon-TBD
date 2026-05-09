import { OBJECT_PALETTE, getObjectDefinition } from "../objectCatalog";

export default function ControlPanel({
  preferences,
  setPreferences,
  room,
  updateRoomDimensions,
  showReferenceImage,
  setShowReferenceImage,
  onAddWindow,
  onAddDoor,
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

      <div className="field-row">
        <label className="field">
          <span>Width (m)</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={room.estimated_width_m}
            onChange={(event) => updateRoomDimensions("estimated_width_m", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Height (m)</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={room.estimated_height_m}
            onChange={(event) => updateRoomDimensions("estimated_height_m", event.target.value)}
          />
        </label>
      </div>

      <div className="field">
        <span>Quick add</span>
        <div className="quick-add-row">
          <button type="button" className="object-chip quick-add-chip" onClick={onAddWindow}>
            Add Window
          </button>
          <button type="button" className="object-chip quick-add-chip" onClick={onAddDoor}>
            Add Door
          </button>
        </div>
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

      <button type="button" className="primary-button" onClick={onGenerateLayout} disabled={isGenerating}>
        {isGenerating ? "Generating..." : "Generate Layout"}
      </button>
      <button type="button" className="secondary-button" onClick={onReset}>
        Reset Edits
      </button>
    </div>
  );
}
