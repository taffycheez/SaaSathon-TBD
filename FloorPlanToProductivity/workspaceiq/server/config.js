import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
export const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const openRouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o";
export const port = process.env.PORT || 3001;
export const analysisPipeline = process.env.ANALYSIS_PIPELINE || "hybrid";
export const cvPythonBin = process.env.CV_PYTHON_BIN || "python";
export const cvSegmentationModel = process.env.CV_SEGMENTATION_MODEL || "yolov8n-seg.pt";
export const cvMinWallSegments = Number(process.env.CV_MIN_WALL_SEGMENTS || 2);
export const cvPipelineScript = path.resolve(__dirname, "./cv_pipeline/analyse_room_cv.py");

export function createAiClient() {
  return new OpenAI({
    apiKey: openRouterApiKey,
    baseURL: openRouterBaseUrl,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "WorkspaceIQ"
    }
  });
}
