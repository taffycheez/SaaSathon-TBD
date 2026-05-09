# WorkspaceIQ Web

This package is the cloud-ready Next.js + TypeScript app for WorkspaceIQ.

## What it is for

- App Router pages for the SaaS frontend
- Type-safe Route Handlers under `app/api`
- A thin orchestration layer that can call:
  - the existing Node/Express analysis service
  - a Python CV worker

## Environment variables

```env
ANALYSIS_WORKER_URL=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o
```

If `ANALYSIS_WORKER_URL` is set, `app/api/analyse-room` will try the Python CV backend first and fall back to the LLM route if the worker is unavailable.

## Local development

Run from the `workspaceiq` root:

```powershell
npm.cmd run dev:web
```

Then open:

- `http://localhost:3000`

## Vercel deployment shape

Set the Vercel project root to:

```text
FloorPlanToProductivity/workspaceiq/web
```

Recommended production setup:

1. Deploy this `web/` package to Vercel.
2. Deploy `web/python-worker/` as a separate Python service.
3. Point `ANALYSIS_WORKER_URL` at that public backend URL.
4. Keep the Node route handlers as the public API boundary for the app.

### Recommended backend host

Use a separate Docker web service for the Python worker. Render is a good fit for this CV backend in a monorepo because it can build Docker services and manage them from a Blueprint file.

This repo already includes a Render Blueprint at:

```text
FloorPlanToProductivity/workspaceiq/render.yaml
```

That Blueprint points Render at:

```text
FloorPlanToProductivity/workspaceiq/web/python-worker
```

and configures a `/health` health check for the worker.

## Notes

- `app/api/analyse/route.ts` is the public analysis endpoint for the web app.
- `app/api/layout/route.ts` proxies layout generation.
- The heavy Python CV worker is intentionally not bundled into this Vercel app.
- Deploy the worker separately and set `ANALYSIS_WORKER_URL` to that public endpoint.

## Python worker

The backend CV service lives in:

```text
web/python-worker
```

It exposes:

- `GET /health`
- `POST /analyse-room`

It is Docker-ready via:

```text
web/python-worker/Dockerfile
```

Example env for the worker:

```env
CV_SEGMENTATION_MODEL=yolov8n-seg.pt
CV_SEGMENTATION_MODE=auto
```

`CV_SEGMENTATION_MODE` options:

- `auto`: fast default, runs wall/opening CV first and only uses YOLO when the cropped room likely contains object-like regions
- `always`: always run YOLO segmentation for furniture
- `off`: disable YOLO segmentation entirely and use geometry-only CV

## Deploy the Python worker

1. In Render, create a new Blueprint from this repo.
2. Use `FloorPlanToProductivity/workspaceiq/render.yaml` as the Blueprint file path.
3. Let Render create the `workspaceiq-cv-worker` web service.
4. After the service is live, copy its public URL.
5. In Vercel, set:

```env
ANALYSIS_WORKER_URL=https://your-worker-url
```

6. Redeploy the Vercel app.

After that, uploads will try the Python CV backend first before falling back to the LLM route.
