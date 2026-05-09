import { getCvWorkerUrl } from "@/lib/config";
import { createAiClient, openRouterAnalysisModel, openRouterApiKey } from "@/lib/server/ai";
import {
  buildRoomNotes,
  mergeRoomAnalyses,
  normalizeAnalysisResult
} from "@/lib/server/analyseRoomHelpers";
import { analyseRoomImage } from "@/lib/server/analyseRoomVision";

export const dynamic = "force-dynamic";

type AnalyseRequest = {
  image?: string;
  analysis_mode?: string;
};

const client = createAiClient();
type AnalysisPipelineMode = "hybrid" | "cv" | "llm";

const PIPELINE_MODES = new Set<AnalysisPipelineMode>(["hybrid", "cv", "llm"]);
const WORKER_TIMEOUT_MS = getEnvNumber("WORKER_TIMEOUT_MS", 20000, 5000, 120000);
const LLM_TIMEOUT_MS = getEnvNumber("LLM_ANALYSIS_TIMEOUT_MS", 45000, 10000, 120000);
const LLM_REFINEMENT_TIMEOUT_MS = getEnvNumber("LLM_REFINEMENT_TIMEOUT_MS", 25000, 5000, 120000);
const BATHROOM_FIXTURE_TYPES = new Set(["toilet", "sink", "shower"]);

function getEnvNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

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

function getAnalysisPipelineMode(value: unknown): AnalysisPipelineMode {
  const candidate = typeof value === "string" && value.trim()
    ? value.trim().toLowerCase()
    : (process.env.ANALYSIS_PIPELINE_MODE || process.env.NEXT_PUBLIC_ANALYSIS_PIPELINE_MODE || "hybrid").toLowerCase();

  return PIPELINE_MODES.has(candidate as AnalysisPipelineMode) ? candidate as AnalysisPipelineMode : "hybrid";
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

async function measureTiming<T>(
  timings: Record<string, number>,
  label: string,
  operation: () => Promise<T>
) {
  const startedAt = Date.now();

  try {
    return await operation();
  } finally {
    timings[label] = Date.now() - startedAt;
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

function shouldRunPostCvRefinement(analysis: Awaited<ReturnType<typeof analyseRoomWithWorker>>) {
  const room = analysis?.room;
  if (!room) {
    return false;
  }

  const openings = [...(room.windows || []), ...(room.doors || [])];
  const openingWallCount = new Set(openings.map((item) => item.wall_index)).size;
  const hasBathroomFixtures = Array.isArray(room.furniture) && room.furniture.some((item) => BATHROOM_FIXTURE_TYPES.has(item.type));

  return room.doors.length === 0 || room.windows.length === 0 || (openings.length >= 2 && openingWallCount <= 1) || hasBathroomFixtures;
}

async function refineCvAnalysisWithLlm(baseAnalysis: NonNullable<Awaited<ReturnType<typeof analyseRoomWithWorker>>>, image: string) {
  const llmAnalysis = await analyseRoomImage(client, image, openRouterAnalysisModel);
  if (!llmAnalysis?.is_valid_room) {
    return baseAnalysis;
  }

  return mergeRoomAnalyses(
    {
      ...llmAnalysis,
      room: {
        ...llmAnalysis.room,
        estimated_width_m: baseAnalysis.room.estimated_width_m,
        estimated_height_m: baseAnalysis.room.estimated_height_m,
        walls: baseAnalysis.room.walls
      }
    },
    baseAnalysis
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyseRequest;
    if (!body.image) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }

    const pipelineMode = getAnalysisPipelineMode(body.analysis_mode);
    let analysisSource = "none";
    let analysis: Awaited<ReturnType<typeof analyseRoomWithWorker>> = null;
    let usedLlmRefinement = false;
    const failureReasons: string[] = [];
    const timings: Record<string, number> = {};

    if (pipelineMode !== "llm") {
      try {
        analysis = await measureTiming(timings, "cv_worker", () => analyseRoomWithWorker(body.image as string));
        if (analysis) {
          analysisSource = "cv_worker";
        }
      } catch (workerError) {
        const message = formatFailureReason("cv_worker", workerError);
        console.warn(
          pipelineMode === "cv" ? "analyse-room cv-worker error" : "analyse-room cv-worker error, falling back to llm",
          workerError
        );
        failureReasons.push(message);
      }
    }

    if (pipelineMode === "hybrid" && analysisSource === "cv_worker" && analysis && shouldRunPostCvRefinement(analysis)) {
      const baseAnalysis = analysis;
      try {
        analysis = await measureTiming(
          timings,
          "llm_refinement",
          () => withTimeout(
            refineCvAnalysisWithLlm(baseAnalysis, body.image as string),
            LLM_REFINEMENT_TIMEOUT_MS,
            "LLM refinement"
          )
        );
        usedLlmRefinement = true;
      } catch (refinementError) {
        failureReasons.push(formatFailureReason("llm_refinement", refinementError));
      }
    }

    if (!analysis && pipelineMode !== "cv") {
      try {
        if (!openRouterApiKey) {
          throw new Error("OPENROUTER_API_KEY is missing. Add it to web/.env.local before running AI analysis locally.");
        }

        analysis = await measureTiming(
          timings,
          "llm",
          () => withTimeout(
            analyseRoomImage(client, body.image as string, openRouterAnalysisModel),
            LLM_TIMEOUT_MS,
            "LLM analysis"
          )
        );
        analysisSource = "llm";
      } catch (llmError) {
        failureReasons.push(formatFailureReason("llm", llmError));
        throw new Error(failureReasons.join(" | "));
      }
    }

    if (!analysis) {
      const reason = pipelineMode === "cv"
        ? "CV-only analysis did not return a result. Set ANALYSIS_WORKER_URL or switch ANALYSIS_PIPELINE_MODE to hybrid/llm."
        : "No analysis pipeline returned a result.";
      failureReasons.push(reason);
      throw new Error(failureReasons.join(" | "));
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
      analysis_source: usedLlmRefinement ? "cv_worker+llm_refinement" : analysisSource,
      analysis_model: analysisSource === "llm" || usedLlmRefinement ? openRouterAnalysisModel : null,
      analysis_pipeline_mode: pipelineMode,
      analysis_timings_ms: timings,
      notes: [
        ...(analysisSource === "cv_worker" ? ["Python CV backend analysed this image first before any fallback logic."] : []),
        ...(usedLlmRefinement ? ["A follow-up LLM pass refined openings and fixtures while keeping the CV wall geometry as the base."] : []),
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
