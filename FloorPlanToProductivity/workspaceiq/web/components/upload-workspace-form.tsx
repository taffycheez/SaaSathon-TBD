"use client";

import { useState } from "react";
import type { LayoutResult, RoomAnalysis } from "@/lib/types";

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the uploaded file."));
    reader.readAsDataURL(file);
  });
}

export default function UploadWorkspaceForm() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(null);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyse() {
    if (!file) {
      setError("Choose an image first.");
      return;
    }

    setError("");
    setLayout(null);
    setIsAnalysing(true);

    try {
      const image = await fileToBase64(file);
      const response = await fetch("/api/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Analysis failed.");
      }

      setAnalysis(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsAnalysing(false);
    }
  }

  async function handleGenerateLayout() {
    if (!analysis) {
      setError("Analyse a room first.");
      return;
    }

    setError("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/layout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          room: analysis,
          num_people: 8,
          work_style: "balanced"
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Layout generation failed.");
      }

      setLayout(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Layout generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <>
      <aside className="hero-card upload-panel">
        <label>
          Upload a room image or floor plan
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="button" onClick={handleAnalyse} disabled={isAnalysing}>
          {isAnalysing ? "Analysing..." : "Analyse workspace"}
        </button>
        <button
          type="button"
          className="layout-button"
          onClick={handleGenerateLayout}
          disabled={!analysis || isGenerating}
        >
          {isGenerating ? "Generating..." : "Generate starter layout"}
        </button>
        <div className="info-strip">
          <span className="info-chip">TypeScript API layer</span>
          <span className="info-chip">Next.js App Router</span>
          <span className="info-chip">Vercel-ready route handlers</span>
        </div>
        {error ? <div className="error-banner">{error}</div> : null}
      </aside>

      {(analysis || layout) ? (
        <section className="results-grid">
          <article className="result-card">
            <h2>Analysis Output</h2>
            {analysis?.notes?.length ? (
              <ul className="note-list">
                {analysis.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <div className="status-banner">Run analysis to see the structured room payload.</div>
            )}
            {analysis ? <pre>{JSON.stringify(analysis, null, 2)}</pre> : null}
          </article>

          <article className="result-card">
            <h2>Layout Output</h2>
            {layout?.notes?.length ? (
              <ul className="note-list">
                {layout.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <div className="status-banner">Generate a layout to see desk placement output.</div>
            )}
            {layout ? <pre>{JSON.stringify(layout, null, 2)}</pre> : null}
          </article>
        </section>
      ) : null}
    </>
  );
}
