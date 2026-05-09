import { getCvWorkerUrl } from "@/lib/config";
import { createAiClient, openRouterModel } from "@/lib/server/ai";
import {
  buildRoomNotes,
  fallbackRoom,
  normalizeRoomDescription
} from "@/lib/server/analyseRoomHelpers";
import { analyseRoomImage } from "@/lib/server/analyseRoomVision";

export const dynamic = "force-dynamic";

type AnalyseRequest = {
  image?: string;
};

const client = createAiClient();

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function buildWorkerAnalyseUrl(workerUrl: string) {
  return workerUrl.endsWith("/analyse-room") ? workerUrl : `${workerUrl}/analyse-room`;
}

async function analyseRoomWithWorker(image: string) {
  const workerUrl = getCvWorkerUrl();
  if (!workerUrl) {
    return null;
  }

  const response = await fetch(buildWorkerAnalyseUrl(workerUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ image }),
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    throw new Error(payload?.detail || payload?.error || `CV worker failed with ${response.status}.`);
  }

  return response.json();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyseRequest;
    if (!body.image) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }

    let analysisSource = "llm";
    let analysis = null;

    try {
      analysis = await analyseRoomWithWorker(body.image);
      if (analysis) {
        analysisSource = "cv_worker";
      }
    } catch (workerError) {
      console.warn("analyse-room cv-worker error, falling back to llm", workerError);
    }

    if (!analysis) {
      analysis = await analyseRoomImage(client, body.image, openRouterModel);
    }

    if (!analysis.is_valid_room) {
      return Response.json(
        {
          error: analysis.rejection_reason,
          rejected: true
        },
        { status: 422 }
      );
    }

    const room = analysis.room;
    return Response.json({
      ...room,
      notes: [
        ...(analysisSource === "cv_worker" ? ["Python CV backend analysed this image first before any fallback logic."] : []),
        ...buildRoomNotes(room, false)
      ],
      fallback: false
    });
  } catch (error) {
    console.error("analyse-room error", error);
    const room = normalizeRoomDescription(fallbackRoom);
    return Response.json({
      ...room,
      notes: buildRoomNotes(room, true),
      fallback: true
    });
  }
}
