export default function ControlPanel({
  preferences,
  setPreferences,
  room,
  updateRoomDimensions,
  onGenerateLayout,
  onReset,
  isGenerating
}) {
  return (
    <div className="panel-card">
      <p className="upload-kicker">Step 3</p>
      <h2>Layout controls</h2>

      <label className="field">
        <span>Number of people: {preferences.numPeople}</span>
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

      <label className="field">
        <span>Work style</span>
        <select
          value={preferences.workStyle}
          onChange={(event) =>
            setPreferences((current) => ({
              ...current,
              workStyle: event.target.value
            }))
          }
        >
          <option value="focus">Focus-heavy</option>
          <option value="balanced">Balanced</option>
          <option value="collaborative">Collaborative</option>
        </select>
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

      <button type="button" className="primary-button" onClick={onGenerateLayout} disabled={isGenerating}>
        {isGenerating ? "Generating..." : "Generate Layout"}
      </button>
      <button type="button" className="secondary-button" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}
