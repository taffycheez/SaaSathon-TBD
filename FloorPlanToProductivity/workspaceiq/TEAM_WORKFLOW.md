# WorkspaceIQ Team Workflow

## The three versions, explained

### 1. `localhost:3000`

This is a developer's local copy of the active app in `web/`.

It can run in two ways:

- **Production-match local**
  - run `npm.cmd run dev`
  - `web/.env.local` points `ANALYSIS_WORKER_URL` at the shared Render worker
  - this is the preferred local mode for day-to-day work

- **Full local stack**
  - run `npm.cmd run dev:full`
  - web app uses the local Python worker on `127.0.0.1:8001`
  - use this only when working directly on the Python worker or debugging CV locally

### 2. "One on network"

This is an ad-hoc LAN/shared machine copy.

It is **not** an official environment.
It is easy for it to drift from both localhost and the deployed website.

Do **not** use it as a source of truth.
Do **not** compare behavior against it when debugging.
If someone needs to share work, use a GitHub branch + Vercel preview instead.

### 3. The website

This is the real deployed app:

- Vercel hosts `web/`
- Render hosts `web/python-worker/`

This is the official demo/review environment.

## Supported environments

Only these environments are supported:

1. **Production website**
2. **Local production-match** via `npm.cmd run dev`
3. **Full local stack** via `npm.cmd run dev:full`

Anything else is unofficial.

## Source of truth

Only these folders are active:

- `web/`
- `web/python-worker/`

## Recommended day-to-day workflow

1. Pull latest `main`.
2. Create a branch.
3. Run `npm.cmd run dev` for production-match local development.
4. If you need to touch CV internals, switch to `npm.cmd run dev:full`.
5. Push your branch.
6. Check the Vercel preview before merging.
7. Merge to `main`.
8. Let Vercel and Render deploy from `main`.

## Environment rules

### For most teammates

Use `web/.env.local` like this:

```env
ANALYSIS_WORKER_URL=https://your-render-worker-url
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-5.5
OPENROUTER_ANALYSIS_MODEL=openai/gpt-5.5
ANALYSIS_PIPELINE_MODE=hybrid
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Then run:

```powershell
npm.cmd run dev
```

This keeps localhost as close as possible to the deployed website.

### For worker debugging

Leave `ANALYSIS_WORKER_URL` blank in `web/.env.local`, then run:

```powershell
npm.cmd run dev:full
```

This uses the local Python worker instead of Render.

## Team rules

- Do not use a LAN/network copy as the reference environment.
- Do not commit secrets.
- If behavior differs, first confirm whether the app is using Render or the local worker.
- If a change affects production behavior, verify it in a Vercel preview before merging.
