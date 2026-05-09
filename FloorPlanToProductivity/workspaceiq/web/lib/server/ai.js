import OpenAI from "openai";

const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_BASE_URL);

export const openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "";
export const openRouterBaseUrl = usingOpenRouter
  ? process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
  : process.env.OPENAI_BASE_URL;
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
