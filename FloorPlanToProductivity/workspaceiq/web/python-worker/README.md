# WorkspaceIQ Python CV Worker

This service handles image-first room analysis for the deployed app.

## What it does

- detects the room contour instead of assuming the image border is the room
- extracts wall-line candidates with OpenCV
- runs segmentation/object detection for desks and other supported objects
- returns room JSON to the Next.js app at `web/app/api/analyse-room/route.ts`

## Endpoints

- `GET /health`
- `POST /analyse-room`

Request body:

```json
{
  "image": "data:image/png;base64,..."
}
```

## Deployment

The easiest hosted path for this worker is a separate Docker web service.

This repo already includes:

- `Dockerfile`
- `requirements.txt`
- `render.yaml` in `workspaceiq/`

If you deploy with Render, set the Blueprint path to:

```text
FloorPlanToProductivity/workspaceiq/render.yaml
```

Then set the resulting public URL as `ANALYSIS_WORKER_URL` in Vercel.

## Environment

```env
CV_SEGMENTATION_MODEL=yolov8n-seg.pt
```
