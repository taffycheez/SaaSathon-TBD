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
ANALYSIS_MODE=backend
ANALYSIS_BACKEND_URL=http://127.0.0.1:3001
ANALYSIS_WORKER_URL=
```

### Modes

- `ANALYSIS_MODE=backend`
  - `app/api/analyse` proxies to the existing Express backend
- `ANALYSIS_MODE=worker`
  - `app/api/analyse` proxies to the Python worker endpoint

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
2. Point `ANALYSIS_WORKER_URL` at a separately deployed Python worker endpoint if you want CV analysis.
3. Keep the Node route handlers as the public API boundary for the app.

## Notes

- `app/api/analyse/route.ts` is the public analysis endpoint for the web app.
- `app/api/layout/route.ts` proxies layout generation.
- The heavy Python CV worker is intentionally not bundled into this Vercel app.
- Deploy the worker separately and set `ANALYSIS_WORKER_URL` to that public endpoint.
