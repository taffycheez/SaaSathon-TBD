# WorkspaceIQ / FloorPlanToProductivity

WorkspaceIQ is an MVP web app for turning a room photo or floor plan into an editable office layout with productivity feedback. The current implementation focuses on a practical loop:

1. Upload an image of a workspace or floor plan.
2. Use OpenAI vision to estimate the room shape and important features.
3. Render that room in an interactive editor.
4. Generate an initial desk layout based on headcount and work style.
5. Let the user drag desks, adjust doors/windows, and see a live productivity score.

This aligns closely with the ideas in [brief.md](./brief.md): affordable office optimization, editable floor plans, productivity scoring, and AI-assisted layout suggestions for small businesses.

## What the current code does

The implemented MVP supports:

- Image upload with drag-and-drop or file picker.
- AI-based room analysis for:
  - estimated room width/height
  - windows
  - doors
  - furniture anchors
- Rejection of clearly invalid images that are not rooms/floor plans.
- An interactive 2D floor plan editor built on `react-konva`.
- AI-generated desk placement based on:
  - analysed room geometry
  - number of people
  - work style (`focus`, `balanced`, `collaborative`)
- A browser-side productivity score with a visible scoring breakdown.
- Fallback room analysis and fallback desk generation if OpenAI fails.
- Unit tests for normalization, JSON parsing, and fallback helper logic.
- Optional integration tests for image classification against fixture images.

The brief mentions larger future ideas such as 2.5D/3D walkthroughs, affiliate furniture links, wall textures, budgeting, and wishlist features. Those are not implemented yet, but this repo already establishes the core AI-to-layout workflow they would build on.

## Architecture

The real app lives in `FloorPlanToProductivity/workspaceiq/` and is split into two workspaces:

- `client/`: Vite + React frontend
- `server/`: Express API that calls OpenAI

At a high level, the flow is:

1. The frontend converts an uploaded image to base64.
2. The client posts that image to `POST /api/analyse-room`.
3. The server sends the image to OpenAI vision and normalizes the returned JSON.
4. The client renders an editable floor plan from the normalized room data.
5. The user sets layout preferences and calls `POST /api/generate-layout`.
6. The server asks OpenAI for desk coordinates, normalizes the response, and returns desk positions.
7. The client overlays desks on the canvas and computes a productivity score locally.

## File structure

```text
SaaSathon-TBD/
|-- brief.md
|-- research.md
|-- focusspace_ai_mvp_nextjs_react_app.jsx
|-- focusspace_backend_nextjs_api_architecture.md
|-- FloorPlanToProductivity/
|   `-- workspaceiq/
|       |-- package.json
|       |-- README.md
|       |-- client/
|       |   |-- package.json
|       |   |-- vite.config.js
|       |   `-- src/
|       |       |-- main.jsx
|       |       |-- App.jsx
|       |       |-- styles.css
|       |       `-- components/
|       |           |-- UploadScreen.jsx
|       |           |-- FloorPlanEditor.jsx
|       |           |-- ControlPanel.jsx
|       |           `-- ScorePanel.jsx
|       `-- server/
|           |-- package.json
|           |-- index.js
|           |-- config.js
|           |-- routes/
|           |   |-- analyseRoom.js
|           |   `-- generateLayout.js
|           |-- lib/
|           |   |-- analyseRoomVision.js
|           |   |-- analyseRoomHelpers.js
|           |   |-- generateLayoutHelpers.js
|           |   `-- json.js
|           `-- test/
|               |-- analyseRoomHelpers.test.js
|               |-- generateLayoutHelpers.test.js
|               |-- json.test.js
|               |-- imageClassification.integration.test.js
|               `-- image_tests/
```

## Key files explained

### Root-level project docs

- [brief.md](./brief.md): product vision, target users, commercial model, and staged feature list.
- [research.md](./research.md): supporting notes and research for the concept.
- `focusspace_ai_mvp_nextjs_react_app.jsx`: a standalone prototype/mock implementation artifact.
- `focusspace_backend_nextjs_api_architecture.md`: architecture notes for a backend/API concept.

These root files are mainly planning and prototype material. The runnable app is the `workspaceiq` project.

### Frontend

- [FloorPlanToProductivity/workspaceiq/client/src/main.jsx](./FloorPlanToProductivity/workspaceiq/client/src/main.jsx): boots the React app.
- [FloorPlanToProductivity/workspaceiq/client/src/App.jsx](./FloorPlanToProductivity/workspaceiq/client/src/App.jsx): main orchestration layer. It:
  - stores room/layout/preferences state
  - uploads images
  - calls the backend
  - normalizes API data
  - computes the live productivity score
  - renders upload, editor, controls, notes, and scoring UI
- [FloorPlanToProductivity/workspaceiq/client/src/components/UploadScreen.jsx](./FloorPlanToProductivity/workspaceiq/client/src/components/UploadScreen.jsx): upload UI with drag-and-drop support.
- [FloorPlanToProductivity/workspaceiq/client/src/components/FloorPlanEditor.jsx](./FloorPlanToProductivity/workspaceiq/client/src/components/FloorPlanEditor.jsx): interactive Konva canvas that renders:
  - the room boundary
  - the uploaded image as a semi-transparent reference
  - windows and doors on room edges
  - furniture blocks
  - draggable, rotatable desks
- [FloorPlanToProductivity/workspaceiq/client/src/components/ControlPanel.jsx](./FloorPlanToProductivity/workspaceiq/client/src/components/ControlPanel.jsx): controls for number of people, work style, room dimensions, layout generation, and reset.
- [FloorPlanToProductivity/workspaceiq/client/src/components/ScorePanel.jsx](./FloorPlanToProductivity/workspaceiq/client/src/components/ScorePanel.jsx): displays the score and the scoring breakdown.
- [FloorPlanToProductivity/workspaceiq/client/src/styles.css](./FloorPlanToProductivity/workspaceiq/client/src/styles.css): all frontend styling, responsive layout, and visual treatment.
- [FloorPlanToProductivity/workspaceiq/client/vite.config.js](./FloorPlanToProductivity/workspaceiq/client/vite.config.js): Vite config and dev proxy from `/api` to the Express backend.

### Backend

- [FloorPlanToProductivity/workspaceiq/server/index.js](./FloorPlanToProductivity/workspaceiq/server/index.js): Express server entry point. Sets up CORS, JSON parsing, `/health`, and mounts API routes.
- [FloorPlanToProductivity/workspaceiq/server/config.js](./FloorPlanToProductivity/workspaceiq/server/config.js): loads `.env` and exposes `OPENAI_API_KEY` and `PORT`.
- [FloorPlanToProductivity/workspaceiq/server/routes/analyseRoom.js](./FloorPlanToProductivity/workspaceiq/server/routes/analyseRoom.js): API route for image analysis.
  - Validates the request has an image.
  - Calls the vision helper.
  - Rejects invalid non-room images.
  - Returns normalized room data plus human-readable notes.
  - Falls back to a starter room if analysis fails.
- [FloorPlanToProductivity/workspaceiq/server/routes/generateLayout.js](./FloorPlanToProductivity/workspaceiq/server/routes/generateLayout.js): API route for desk generation.
  - Validates room, people count, and work style.
  - Calls OpenAI to generate desk coordinates.
  - Parses and normalizes the JSON.
  - Falls back to a deterministic desk grid if generation fails.

### Backend helpers

- [FloorPlanToProductivity/workspaceiq/server/lib/analyseRoomVision.js](./FloorPlanToProductivity/workspaceiq/server/lib/analyseRoomVision.js): contains the vision prompt and the OpenAI image-analysis call.
- [FloorPlanToProductivity/workspaceiq/server/lib/analyseRoomHelpers.js](./FloorPlanToProductivity/workspaceiq/server/lib/analyseRoomHelpers.js): normalizes room geometry, clamps bad values, defines a fallback room, and builds user-facing room notes.
- [FloorPlanToProductivity/workspaceiq/server/lib/generateLayoutHelpers.js](./FloorPlanToProductivity/workspaceiq/server/lib/generateLayoutHelpers.js): normalizes desk arrays, creates fallback layouts, and builds layout notes.
- [FloorPlanToProductivity/workspaceiq/server/lib/json.js](./FloorPlanToProductivity/workspaceiq/server/lib/json.js): extracts valid JSON from model output, even if the model wraps it in prose.

### Tests

- [FloorPlanToProductivity/workspaceiq/server/test/analyseRoomHelpers.test.js](./FloorPlanToProductivity/workspaceiq/server/test/analyseRoomHelpers.test.js): checks room normalization and fallback notes.
- [FloorPlanToProductivity/workspaceiq/server/test/generateLayoutHelpers.test.js](./FloorPlanToProductivity/workspaceiq/server/test/generateLayoutHelpers.test.js): checks desk normalization, fallback layout generation, and notes.
- [FloorPlanToProductivity/workspaceiq/server/test/json.test.js](./FloorPlanToProductivity/workspaceiq/server/test/json.test.js): checks JSON extraction robustness.
- [FloorPlanToProductivity/workspaceiq/server/test/imageClassification.integration.test.js](./FloorPlanToProductivity/workspaceiq/server/test/imageClassification.integration.test.js): optional OpenAI-backed integration test for image classification.

## API behavior

### `POST /analyse-room`

Request body:

```json
{
  "image": "data:image/png;base64,..."
}
```

Typical success response:

```json
{
  "estimated_width_m": 8,
  "estimated_height_m": 6,
  "windows": [{ "wall": "top", "position_percent": 25 }],
  "doors": [{ "wall": "left", "position_percent": 70 }],
  "furniture": [{ "type": "desk", "x_percent": 40, "y_percent": 55 }],
  "notes": ["Estimated room size is 8m by 6m."],
  "fallback": false
}
```

Important behavior:

- Returns `422` if the image is clearly not a room/floor plan.
- Returns a fallback editable room if the AI call fails for technical reasons.
- Normalizes wall names and clamps coordinates to safe ranges.

### `POST /generate-layout`

Request body:

```json
{
  "room": { "...": "room data" },
  "num_people": 8,
  "work_style": "balanced"
}
```

Typical success response:

```json
{
  "desks": [
    { "x_percent": 25, "y_percent": 30, "rotation_deg": 0 }
  ],
  "notes": ["Generated 1 desk position(s) from the analysed room and preferences."],
  "fallback": false
}
```

Important behavior:

- Falls back to a simple evenly spaced desk layout if generation fails.
- Rotations are normalized into `0-359`.
- Desk positions are clamped to `0-100` percent.

## Productivity scoring logic

The score is calculated in the frontend inside `App.jsx`, not on the server. This means the score updates immediately when the user drags desks around.

Current scoring factors are:

- natural light: desks near windows
- orientation: reward desks that are not directly facing walls
- circulation: reward a corridor between desk rows
- quiet zone: reward desks placed away from the door
- collaboration fit: extra check for collaborative layouts
- space efficiency: reward at least `4 sqm` per desk

The total is clamped to a `0-100` score and shown with a visible breakdown so the user can understand why the room scored the way it did.

## Running the project

From the runnable app folder:

```bash
cd FloorPlanToProductivity/workspaceiq
npm install
```

Create `.env` in `FloorPlanToProductivity/workspaceiq/`:

```env
OPENAI_API_KEY=your_key_here
PORT=3001
```

Start both client and server:

```bash
npm run dev
```

Expected local URLs:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

## Test commands

Run server tests:

```bash
npm test
```

Run image integration tests:

```bash
npm run test:images
```

The image integration suite only runs when both of these are true:

- `RUN_OPENAI_IMAGE_TESTS=1`
- `OPENAI_API_KEY` is set

## Design choices in the MVP

- **AI at the edges, normalization in code**: OpenAI generates room/layout data, but helpers sanitize the result before the UI uses it.
- **Fallback-first behavior**: the app still works even if model calls fail.
- **Editable output**: the AI suggestion is never final; the user can manually adjust the workspace.
- **Fast feedback loop**: the productivity score is computed locally so drag interactions feel immediate.
- **Simple extensibility**: new scoring rules, furniture types, or additional room constraints can be added without redesigning the whole app.

## Gaps between the brief and the current MVP

Implemented now:

- interactive floor plan editing
- AI room analysis from an uploaded image
- AI desk layout suggestion
- productivity score with explanatory notes
- customizable work-style preferences

Planned but not yet built:

- 3D/2.5D visualization and walkthroughs
- furniture catalog and affiliate links
- wall color and flooring swaps
- budgeting and wishlist features
- richer desk/furniture categories
- hover-based room annotations
- chat-driven criteria changes

## Suggested next steps

If this project continues, the most natural next improvements would be:

1. Move from desks-only layout generation to a richer furniture/object model.
2. Add persistent save/load for workspace versions.
3. Push scoring rules into shared server/domain logic for easier auditing and future analytics.
4. Add explicit wall/window/door creation and deletion tools in the editor.
5. Introduce user-defined optimization criteria such as feng shui, collaboration, privacy, or budget.

