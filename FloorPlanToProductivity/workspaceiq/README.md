# WorkspaceIQ Local Setup

## Prerequisites

- Node.js 18+ installed
- npm installed
- An OpenAI API key

## Project Location

Run commands from:

```powershell
cd "C:\Users\...\SaaSathon-TBD\FloorPlanToProductivity\workspaceiq"
```

## First-Time Setup

Install dependencies before trying to start the app:

```powershell
npm.cmd install
```

The local env file should exist at `.env`. It should contain:

```env
OPENAI_API_KEY=your_key_here
PORT=3001
RUN_OPENAI_IMAGE_TESTS=0
```

## Start The Server

To run only the backend:

```powershell
npm.cmd run dev:server
```

The backend will start on:

- `http://localhost:3001`

## Start The Full App

To run frontend and backend together:

```powershell
npm.cmd run dev
```

Expected local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Why `concurrently` was not recognized

If you see:

```text
'concurrently' is not recognized as an internal or external command
```

that usually means the workspace dependencies have not been installed yet. `concurrently` is a dev dependency from this project's `package.json`, so run:

```powershell
npm.cmd install
```

and then try:

```powershell
npm.cmd run dev
```

## How To Test

1. Open `http://localhost:5173`
2. Upload a photo of an office or room
3. Confirm the reference image appears inside the canvas
4. Confirm the app shows room notes in the sidebar after upload
5. Adjust room dimensions or move doors/windows if needed
6. Click `Generate Layout`
7. Confirm desks appear on the canvas
8. Confirm layout notes appear in the sidebar
9. Drag desks around and verify the productivity score updates

## Test Commands

Run server tests:

```powershell
npm.cmd test
```

Run OpenAI-backed image tests:

```powershell
npm.cmd run test:images
```

To enable the image tests, set this in `.env`:

```env
RUN_OPENAI_IMAGE_TESTS=1
```

## Expected Behavior

- If AI room analysis succeeds, the app should estimate room size, walls, windows, doors, and desk-like furniture
- If AI room analysis fails, the app should still return a starter room and show fallback notes
- If AI layout generation fails, the app should still place a basic fallback desk layout and show fallback notes
- The uploaded image should remain visible inside the floor plan editor

## Troubleshooting

### `ENOENT: could not read package.json`

You are probably in the wrong folder. Make sure you are inside:

```powershell
cd "C:\Users\varya\Documents\Uni\2026S1\SaaSathon-TBD\FloorPlanToProductivity\workspaceiq"
```

### `EADDRINUSE: address already in use :::3001`

Port `3001` is already taken.

Option 1: change `.env`:

```env
PORT=3002
```

Then restart the server.

Option 2: find the process using the port:

```powershell
netstat -ano | findstr :3001
```

### Upload works but analysis/generation fails

Check:

- `.env` exists
- `OPENAI_API_KEY` is set correctly
- the backend is running
- the API key has billing/access enabled

Even on failure, the app should still show fallback notes and a starter layout.

## Notes For The Team

- `.env` is currently not ignored in this repo, so be careful not to commit a real secret by accident
- `.env.example` should stay safe for sharing
- The frontend proxies `/api` requests to the backend during local development
