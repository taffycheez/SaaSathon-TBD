# WorkspaceIQ

WorkspaceIQ turns a room photo or floor plan into an editable workspace layout with AI-assisted analysis, desk generation, productivity scoring, zones, and a 3D preview.

## Active App

The runnable app is in:

```text
FloorPlanToProductivity/workspaceiq
```

That project contains:

- `web/`: Next.js app, API routes, editor UI, scoring, zones, and 3D preview
- `web/python-worker/`: Docker-ready Python CV worker for image-first room analysis
- `render.yaml`: Render Blueprint for the Python worker

The old Vite/Express client-server stack is no longer part of the active app.

## Common Commands

Run these from the repo root:

```bash
npm run dev
npm run build
npm test
```

Or from `FloorPlanToProductivity/workspaceiq`:

```bash
npm run dev
npm run dev:full
npm run build
npm test
```

`npm run dev` starts the Next.js app. `npm run dev:full` also starts the local Python worker.

## Environment

For local web development, use:

```text
FloorPlanToProductivity/workspaceiq/web/.env.local
```

Useful local template:

```env
ANALYSIS_WORKER_URL=https://your-render-worker-url
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Leave `ANALYSIS_WORKER_URL` blank when using `npm run dev:full`.

## More Detail

- [WorkspaceIQ app README](./FloorPlanToProductivity/workspaceiq/README.md)
- [Team workflow](./FloorPlanToProductivity/workspaceiq/TEAM_WORKFLOW.md)
- [Python worker README](./FloorPlanToProductivity/workspaceiq/web/python-worker/README.md)
- [Product brief](./brief.md)
