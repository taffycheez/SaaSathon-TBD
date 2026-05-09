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

export const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
export const openRouterBaseUrl = usingOpenRouter
  ? normalizedOpenRouterBaseUrl || "https://openrouter.ai/api/v1"
  : normalizedOpenAiBaseUrl || undefined;
export const openRouterModel =
  process.env.OPENROUTER_MODEL ||
  process.env.OPENAI_MODEL ||
  (usingOpenRouter ? "openai/gpt-4o" : "gpt-4o");

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
