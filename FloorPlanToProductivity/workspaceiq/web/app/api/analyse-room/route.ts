import { getCvWorkerUrl } from "@/lib/config";
import { createAiClient, openRouterModel } from "@/lib/server/ai";
import {
  buildRoomNotes,
  normalizeAnalysisResult
} from "@/lib/server/analyseRoomHelpers";
import { analyseRoomImage } from "@/lib/server/analyseRoomVision";

export const dynamic = "force-dynamic";

type AnalyseRequest = {
  image?: string;
};

const client = createAiClient();
const WORKER_TIMEOUT_MS = 20000;
const LLM_TIMEOUT_MS = 30000;

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

function formatFailureReason(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
  return `${source}: ${message}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function analyseRoomWithWorker(image: string) {
  const workerUrl = getCvWorkerUrl();
  if (!workerUrl) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildWorkerAnalyseUrl(workerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ image }),
      cache: "no-store",
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`CV worker timed out after ${WORKER_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    throw new Error(payload?.detail || payload?.error || `CV worker failed with ${response.status}.`);
  }

  return normalizeAnalysisResult(await response.json());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyseRequest;
    if (!body.image) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }

    let analysisSource = "llm";
    let analysis = null;
    const failureReasons: string[] = [];

    try {
      analysis = await analyseRoomWithWorker(body.image);
      if (analysis) {
        analysisSource = "cv_worker";
      }
    } catch (workerError) {
      console.warn("analyse-room cv-worker error, falling back to llm", workerError);
      failureReasons.push(formatFailureReason("cv_worker", workerError));
    }

    if (!analysis) {
      try {
        analysis = await withTimeout(
          analyseRoomImage(client, body.image, openRouterModel),
          LLM_TIMEOUT_MS,
          "LLM analysis"
        );
      } catch (llmError) {
        failureReasons.push(formatFailureReason("llm", llmError));
        throw new Error(failureReasons.join(" | "));
      }
    }

    if (!analysis.is_valid_room) {
      return Response.json(
        {
          error: analysis.rejection_reason,
          reasons: failureReasons,
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
      reasons: failureReasons,
      fallback: false
    });
  } catch (error) {
    console.error("analyse-room error", error);
    return Response.json({
      error: "Room analysis failed.",
      reasons: [formatFailureReason("analyse-room", error)],
      fallback: false
    }, { status: 502 });
  }
}
