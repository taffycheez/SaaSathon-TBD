import { forwardRef, useImperativeHandle, useRef } from "react";

const UploadScreen = forwardRef(function UploadScreen({
  onUpload,
  isLoading,
  error,
  analysisMode = "hybrid",
  onAnalysisModeChange
}, ref) {
  const inputRef = useRef(null);

  function openPicker() {
    if (!inputRef.current) {
      return;
    }

    // Allow re-selecting the same file by clearing the prior value first.
    inputRef.current.value = "";
    inputRef.current.click();
  }

  useImperativeHandle(ref, () => ({
    openPicker
  }));

  function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onUpload(file);
    }
  }

  return (
    <section className="upload-screen">
      <div
        className="upload-card"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className="upload-icon" aria-hidden="true">+</div>
        <p className="upload-kicker">Step 1</p>
        <h2>Upload a floor plan</h2>
        <p>Drop an image here or click to browse. WorkspaceIQ estimates the room and opens an editable floor plan.</p>
        <label
          className="analysis-mode-picker"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span>Analysis mode</span>
          <select
            value={analysisMode}
            disabled={isLoading}
            onChange={(event) => onAnalysisModeChange?.(event.target.value)}
          >
            <option value="hybrid">Hybrid: CV first, AI refine</option>
            <option value="llm">LLM only: best AI read</option>
            <option value="cv">Python CV only</option>
          </select>
        </label>
        <button
          type="button"
          className="primary-button"
          disabled={isLoading}
          onClick={(event) => {
            event.stopPropagation();
            openPicker();
          }}
        >
          {isLoading ? "Analysing..." : "Choose Image"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileSelection}
        />
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
});

export default UploadScreen;
