export function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Model returned empty output.");
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) {
    throw new Error("Could not find JSON in model output.");
  }

  return JSON.parse(match[1]);
}
