# WorkspaceIQ

`web/` is the only active application in this repo.

## Active app

- `web/`: Next.js app deployed on Vercel
- `web/python-worker/`: Python CV worker deployed separately and called by the web app

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

For local web development, use this file:

```text
web/.env.local
```

This file now exists in the repo folder on your machine already.

Use this as your template/reference:

```text
web/.env.local.example
```

Ignore these old paths:

```text
workspaceiq/.env
workspaceiq/.env.example
repo-root .env.local
```

They are legacy or stray files and are not part of the active app workflow anymore.

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

For local development, edit `web/.env.local`.

For the Vercel web app, set these in the Vercel dashboard instead of a file:

```env
ANALYSIS_WORKER_URL=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-5.5
OPENROUTER_ANALYSIS_MODEL=openai/gpt-5.5
ANALYSIS_PIPELINE_MODE=hybrid
LLM_ANALYSIS_TIMEOUT_MS=45000
LLM_REFINEMENT_TIMEOUT_MS=25000
NEXT_PUBLIC_APP_URL=https://saa-sathon-tbd.vercel.app
```

Use `ANALYSIS_PIPELINE_MODE=llm` to test LLM-only image analysis against the Python CV worker. Use `ANALYSIS_PIPELINE_MODE=cv` to test Python-only analysis without LLM fallback. The default `hybrid` mode tries CV first and only uses the LLM when fallback/refinement is useful.

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
