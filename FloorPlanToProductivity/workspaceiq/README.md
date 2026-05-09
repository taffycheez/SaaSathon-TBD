# WorkspaceIQ

`web/` is the only active application in this repo.

## Active app

- `web/`: Next.js app deployed on Vercel
- `web/python-worker/`: Python CV worker deployed separately and called by the web app

## Legacy code

- `client/` and `server/` are legacy prototype folders kept only for reference while the team finishes migration work.
- Do not build, run, or extend them.
- All new work should happen in `web/`.

## Start the active app

From this folder:

```powershell
npm.cmd install
npm.cmd run dev
```

That starts the single supported app:

- `http://localhost:3000`

## Build and test

```powershell
npm.cmd run build
npm.cmd test
```

## Environment variables

For the Vercel web app:

```env
ANALYSIS_WORKER_URL=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4o
NEXT_PUBLIC_APP_URL=https://saa-sathon-tbd.vercel.app
```

For the Render Python worker:

```env
CV_SEGMENTATION_MODEL=yolov8n-seg.pt
```

## Deployment shape

1. Deploy `web/` to Vercel.
2. Deploy `web/python-worker/` to Render.
3. Set `ANALYSIS_WORKER_URL` in Vercel to the Render worker URL.

## Team rule

If a change does not affect `web/` or `web/python-worker/`, it is probably touching the wrong stack.
