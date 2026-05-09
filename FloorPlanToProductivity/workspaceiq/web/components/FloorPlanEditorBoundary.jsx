"use client";

import { Component } from "react";

export default class FloorPlanEditorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "The floor plan editor could not be loaded."
    };
  }

  componentDidCatch(error) {
    console.error("floor-plan-editor error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="editor-card">
          <div className="editor-header">
            <div>
              <p className="upload-kicker">Step 2</p>
              <h2>Fine-tune the floor plan</h2>
            </div>
          </div>
          <p className="error-banner">
            We loaded the room analysis, but the interactive editor hit a browser error. Please refresh and try again.
            {this.state.message ? ` Details: ${this.state.message}` : ""}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
