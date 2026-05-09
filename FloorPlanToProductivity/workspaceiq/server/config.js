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
