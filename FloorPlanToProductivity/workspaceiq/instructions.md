# WorkspaceIQ Local Testing Instructions

## Prerequisites

- Node.js 18+ installed
- npm installed
- An OpenAI API key

## Project Location

Run everything from:

```bash
cd /home/peterl/Projects/SaaSathon-TBD/FloorPlanToProductivity/workspaceiq
```

## First-Time Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local env file if you do not already have one:

```bash
cp .env.example .env
```

3. Open `.env` and set your real OpenAI key:

```env
OPENAI_API_KEY=your_key_here
PORT=3001
```

## Run the App

Start both frontend and backend:

```bash
npm run dev
```

Expected local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## How to Test

1. Open `http://localhost:5173`
2. Upload a photo of an office or room
3. Confirm the reference image appears inside the canvas
4. Confirm the app shows room notes in the sidebar after upload
5. Adjust room dimensions or move doors/windows if needed
6. Click `Generate Layout`
7. Confirm desks appear on the canvas
8. Confirm layout notes appear in the sidebar
9. Drag desks around and verify the productivity score updates

## Expected Behavior

- If AI room analysis succeeds, the app should estimate room size, windows, doors, and furniture
- If AI room analysis fails, the app should still return a starter room and show fallback notes
- If AI layout generation fails, the app should still place a basic fallback desk layout and show fallback notes
- The uploaded image should remain visible inside the floor plan editor

## Troubleshooting

### `ENOENT: could not read package.json`

You are probably in the wrong folder. Make sure you are inside:

```bash
/home/peterl/Projects/SaaSathon-TBD/FloorPlanToProductivity/workspaceiq
```

### `EADDRINUSE: address already in use :::3001`

Port `3001` is already taken.

Option 1: change `.env`:

```env
PORT=3002
```

Then restart `npm run dev`.

Option 2: find and stop the process already using the port:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

### Upload works but analysis/generation fails

Check:

- `.env` exists
- `OPENAI_API_KEY` is set correctly
- the backend is running
- the API key has billing/access enabled

Even on failure, the app should now show fallback notes and a starter layout instead of stopping completely.

## Clean Restart

If things get weird:

```bash
rm -rf node_modules
npm install
npm run dev
```

## Notes for the Team

- Do not commit your real `.env`
- Only commit `.env.example`
- The frontend proxies API calls to the backend automatically during local dev
