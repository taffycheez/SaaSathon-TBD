# WorkspaceIQ

WorkspaceIQ turns an office photo or floor plan into an editable workspace layout with AI-assisted analysis, productivity scoring, generated desk arrangements, zone insights, and a live 3D preview.

It is built for small teams that want a better office layout but do not have the budget or time to hire a workplace designer.

<p align="center">
  <img src="./FloorPlanToProductivity/workspaceiq/web/app/icon.svg" alt="WorkspaceIQ logo" width="92" />
</p>

## The Problem

Smaller companies often make layout decisions by instinct: where desks fit, where the meeting table lands, and which corners become storage. But workspace design has a real effect on focus, collaboration, daylight, movement, comfort, and productivity.

Professional office planning can be expensive. WorkspaceIQ makes the first design pass accessible: upload a plan, understand the room, edit it visually, and generate a better arrangement in minutes.

## What It Does

WorkspaceIQ helps teams move from "we have a room" to "we have a smarter workspace plan."

- Upload a room image or floor plan.
- Analyse walls, room shape, openings, and furniture using a hybrid Python CV and LLM pipeline.
- Convert the result into an editable 2D floor plan.
- Move desks, furniture, doors, windows, and walls directly in the editor.
- Generate layout suggestions based on team size and work style.
- Score the workspace for productivity and feng shui inspired design principles.
- Detect and label collaboration, focus, circulation, and support zones.
- Preview the room in an interactive 3D scene.
- Continue working even when AI services fail, using a safe editable fallback room.

## Screenshots

No screenshots are committed yet, but the README is ready for them. Add captures with these filenames and they will appear below.

| Home and Upload | Editable Floor Plan |
| --- | --- |
| ![WorkspaceIQ home and upload screen](./docs/screenshots/home-upload.png) | ![WorkspaceIQ editable floor plan](./docs/screenshots/editor-floor-plan.png) |

| Productivity Score | 3D Room Preview |
| --- | --- |
| ![WorkspaceIQ productivity score panel](./docs/screenshots/productivity-score.png) | ![WorkspaceIQ 3D room preview](./docs/screenshots/3d-preview.png) |

Suggested screenshots:

- `docs/screenshots/home-upload.png`: the hero and upload flow.
- `docs/screenshots/editor-floor-plan.png`: the editable 2D floor plan with furniture and zones visible.
- `docs/screenshots/productivity-score.png`: the live score, advice, and room notes.
- `docs/screenshots/3d-preview.png`: the interactive 3D room beta.

## Core Features

### AI Room Analysis

WorkspaceIQ accepts uploaded room images or floor plans and routes them through a hybrid analysis pipeline. The app can use a Python computer vision worker first, then fall back to or refine with an LLM vision model through OpenRouter.

The result is normalized into room data the app can edit: walls, windows, doors, furniture, desks, dimensions, notes, and detected issues.

### Interactive Floor Plan Editor

The editor is the heart of the product. Users can drag furniture, resize the room, adjust walls, place doors and windows, calibrate scale, set north direction, delete objects, and toggle reference images or zones.

Instead of producing a static recommendation, WorkspaceIQ gives users a workspace they can keep shaping.

### Layout Generation

After analysis, users can choose team size and work style, then generate a desk arrangement. The layout engine combines AI output with rule-based fallback logic so the app remains usable during demos or temporary provider issues.

### Productivity and Feng Shui Scoring

WorkspaceIQ scores the current room based on practical layout and feng shui inspired criteria such as:

- command position and desk orientation
- doorway and window relationships
- circulation and clear walkways
- daylight access
- balance between focus and collaboration
- clutter and usable space
- greenery and supportive objects

The score updates as the workspace changes, making design tradeoffs visible.

### Zone Intelligence

The app identifies functional areas in the plan, including collaboration, focus, circulation, and support zones. Users can inspect zones, understand what each area is doing, and adjust zone intent when the default read is not quite right.

### 3D Preview

The 3D preview turns the edited floor plan into an orbitable room scene using Three.js. It gives users a faster visual feel for the arrangement than a flat plan alone.

## Goals

WorkspaceIQ was built around three goals:

1. Make office layout planning accessible to small companies.
2. Turn AI analysis into something editable, not just a text recommendation.
3. Help teams understand why a layout works through scoring, zones, and visual feedback.

The long-term vision is a lightweight workspace design assistant for small teams, office refreshes, coworking spaces, and furniture sellers who want to speed up early layout planning.

## How It Works

```text
Upload floor plan or room image
        |
        v
Next.js API route
        |
        +--> Python CV worker for geometry and visual detection
        |
        +--> OpenRouter / LLM fallback or refinement
        |
        v
Normalized room model
        |
        +--> Editable 2D floor plan
        +--> Generated desk layout
        +--> Productivity score
        +--> Zone detection
        +--> 3D preview
```

## Tech Stack

- Next.js App Router
- React
- TypeScript API routes
- Three.js for the 3D room preview
- Python FastAPI worker for computer vision
- OpenRouter / OpenAI-compatible API for LLM vision and layout assistance
- Render for the CV worker deployment
- Vercel for the web app deployment

## Project Structure

```text
FloorPlanToProductivity/workspaceiq
├── web
│   ├── app
│   │   └── api
│   │       ├── analyse-room
│   │       ├── generate-layout
│   │       └── score-explanation
│   ├── components
│   ├── lib
│   └── python-worker
├── render.yaml
└── package.json
```

The active app lives in:

```text
FloorPlanToProductivity/workspaceiq/web
```

The Python CV service lives in:

```text
FloorPlanToProductivity/workspaceiq/web/python-worker
```

## Running Locally

From the repo root:

```bash
npm run dev
```

Or from the WorkspaceIQ package:

```bash
cd FloorPlanToProductivity/workspaceiq
npm run dev
```

For the full local stack with the Python worker:

```bash
cd FloorPlanToProductivity/workspaceiq
npm run dev:full
```

## Environment Variables

Local web env file:

```text
FloorPlanToProductivity/workspaceiq/web/.env.local
```

Common values:

```env
ANALYSIS_WORKER_URL=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-5.5
OPENROUTER_ANALYSIS_MODEL=openai/gpt-5.5
ANALYSIS_PIPELINE_MODE=hybrid
LLM_ANALYSIS_TIMEOUT_MS=45000
LLM_REFINEMENT_TIMEOUT_MS=25000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Use `ANALYSIS_PIPELINE_MODE=hybrid` for the normal production-style flow. Use `llm` for LLM-only testing or `cv` for Python-worker-only testing.

## Testing

From the repo root:

```bash
npm test
npm run build
```

The tests cover scoring, room state normalization, analysis helpers, layout helpers, JSON extraction, score explanations, and zoning.

## Why It Matters

A better workspace can improve focus, movement, collaboration, and comfort. WorkspaceIQ does not try to replace expert designers. It gives smaller teams an intelligent starting point, a way to experiment, and a clearer understanding of how their physical space affects the way they work.

## Hackathon Summary

WorkspaceIQ is an AI-powered office layout assistant for small companies. It turns a floor plan or room image into an editable workspace, scores the layout, detects functional zones, generates desk arrangements, and previews the result in 3D. It combines Python computer vision, LLM APIs, and practical layout rules to make better workplace design more accessible.
