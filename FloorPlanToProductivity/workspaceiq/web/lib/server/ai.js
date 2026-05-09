import OpenAI from "openai";

function sanitizeBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "..." || trimmed === "http://" || trimmed === "https://") {
    return "";
  }

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const normalizedOpenRouterBaseUrl = sanitizeBaseUrl(process.env.OPENROUTER_BASE_URL);
const normalizedOpenAiBaseUrl = sanitizeBaseUrl(process.env.OPENAI_BASE_URL);
const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || normalizedOpenRouterBaseUrl);
const defaultOpenRouterModel = "openai/gpt-5.5";
const defaultOpenAiModel = "gpt-5.5";

export const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
export const openRouterBaseUrl = usingOpenRouter
  ? normalizedOpenRouterBaseUrl || "https://openrouter.ai/api/v1"
  : normalizedOpenAiBaseUrl || undefined;
export const openRouterModel =
  process.env.OPENROUTER_MODEL ||
  process.env.OPENAI_MODEL ||
  (usingOpenRouter ? defaultOpenRouterModel : defaultOpenAiModel);
export const openRouterAnalysisModel =
  process.env.OPENROUTER_ANALYSIS_MODEL ||
  process.env.OPENAI_ANALYSIS_MODEL ||
  process.env.ANALYSIS_MODEL ||
  openRouterModel;
export const openRouterLayoutModel =
  process.env.OPENROUTER_LAYOUT_MODEL ||
  process.env.OPENAI_LAYOUT_MODEL ||
  openRouterModel;
export const openRouterExplanationModel =
  process.env.OPENROUTER_EXPLANATION_MODEL ||
  process.env.OPENAI_EXPLANATION_MODEL ||
  openRouterModel;

export function createAiClient() {
  return new OpenAI({
    apiKey: openRouterApiKey,
    baseURL: openRouterBaseUrl,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://workspaceiq.app",
      "X-Title": "WorkspaceIQ"
    }
  });
}
