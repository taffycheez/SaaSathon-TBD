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

That starts the preferred local mode:

- `http://localhost:3000` for the Next.js web app

To make localhost use the same analysis source as the deployed site, put this in `web/.env.local`:

```env
ANALYSIS_WORKER_URL=https://your-render-worker-url
```

This mode is the recommended day-to-day setup for the team.

If you want the full stack locally instead, run:

```powershell
npm.cmd run dev:full
```

That starts:

- `http://localhost:3000` for the Next.js web app
- `http://127.0.0.1:8001` for the local Python CV worker

This means local development and deployed development both use the same active source tree:

- `web/`
- `web/python-worker/`

If someone edits the local app through this workflow, they are editing the same files that get deployed later.

## Build and test

```powershell
npm.cmd run build
npm.cmd test
```

## Local environment

For local web development, put app secrets in:

```text
web/.env.local
```

Start from:

```text
web/.env.local.example
```

Use `ANALYSIS_WORKER_URL=https://your-render-worker-url` in `web/.env.local` if you want localhost to match production.

Use `npm.cmd run dev:full` if you want localhost to use the local Python worker instead.

## Supported environments

There are only three environments you should care about:

1. **Production website**: Vercel + Render
2. **Local production-match**: `npm.cmd run dev` with `ANALYSIS_WORKER_URL` set to Render
3. **Full local stack**: `npm.cmd run dev:full`

Do not use an ad-hoc LAN/network copy as a reference environment.

For the detailed team workflow, see:

```text
TEAM_WORKFLOW.md
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
