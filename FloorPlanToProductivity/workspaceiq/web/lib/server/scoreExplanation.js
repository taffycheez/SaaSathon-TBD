import { extractJson } from "./json.js";

function clampCount(value, max) {
  return Math.max(0, Math.min(max, Number(value) || 0));
}

function safeList(items, max = 3) {
  return Array.isArray(items)
    ? items
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, max)
    : [];
}

export function buildRuleBasedScoreExplanation(scoreResult, room, preferences = {}) {
  const score = Number(scoreResult?.score) || 0;
  const desks = Array.isArray(room?.desks) ? room.desks.length : 0;
  const furniture = Array.isArray(room?.furniture) ? room.furniture.length : 0;
  const windows = Array.isArray(room?.windows) ? room.windows.length : 0;
  const doors = Array.isArray(room?.doors) ? room.doors.length : 0;
  const workStyle = preferences?.workStyle || "balanced";

  let summary = "This workspace needs more structure before it will support productive work well.";
  if (score >= 85) {
    summary = "This layout is strong overall, with good support, circulation, and a clear sense of purpose.";
  } else if (score >= 70) {
    summary = "This layout is workable and promising, but a few adjustments could noticeably improve comfort and flow.";
  } else if (score >= 55) {
    summary = "This layout has a decent base, but the room still feels compromised in a few important ways.";
  }

  const insights = [
    `${desks} desk(s), ${furniture} other object(s), ${windows} window(s), and ${doors} door(s) are currently shaping a ${workStyle} layout.`,
    ...safeList(scoreResult?.breakdown, 2)
  ].slice(0, 3);

  const recommendations = safeList(scoreResult?.advice, 3);

  return {
    summary,
    insights,
    recommendations,
    source: "rules"
  };
}

export function buildScoreExplanationPrompt(scoreResult, room, preferences = {}) {
  const payload = {
    score: Number(scoreResult?.score) || 0,
    breakdown: safeList(scoreResult?.breakdown, 6),
    advice: safeList(scoreResult?.advice, 3),
    work_style: preferences?.workStyle || "balanced",
    num_people: Number(preferences?.numPeople) || 0,
    room: {
      estimated_width_m: Number(room?.estimated_width_m) || 0,
      estimated_height_m: Number(room?.estimated_height_m) || 0,
      desk_count: clampCount(room?.desks?.length, 200),
      furniture_count: clampCount(room?.furniture?.length, 200),
      wall_count: clampCount(room?.walls?.length, 200),
      window_count: clampCount(room?.windows?.length, 200),
      door_count: clampCount(room?.doors?.length, 200)
    }
  };

  return [
    "You are WorkspaceIQ's workplace design explainer.",
    "The numeric productivity score has already been calculated deterministically by code.",
    "Do not change, reinterpret, or contradict the numeric score.",
    "Only explain what the score means and suggest practical next moves based on the provided data.",
    "Be concise, specific, and professional.",
    "Return JSON only with this shape:",
    '{"summary":"string","insights":["string","string","string"],"recommendations":["string","string","string"]}',
    "Each string should be one short sentence.",
    "Do not mention missing hidden data, confidence scores, or model limitations unless the supplied data explicitly implies it.",
    `Input: ${JSON.stringify(payload)}`
  ].join(" ");
}

export function normalizeScoreExplanation(payload, fallbackExplanation) {
  const fallback = fallbackExplanation || {
    summary: "",
    insights: [],
    recommendations: [],
    source: "rules"
  };

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  return {
    summary: typeof payload.summary === "string" && payload.summary.trim()
      ? payload.summary.trim()
      : fallback.summary,
    insights: safeList(payload.insights, 3).length ? safeList(payload.insights, 3) : fallback.insights,
    recommendations: safeList(payload.recommendations, 3).length
      ? safeList(payload.recommendations, 3)
      : fallback.recommendations,
    source: payload.source === "ai" ? "ai" : fallback.source
  };
}

export async function explainScoreWithAi(client, model, scoreResult, room, preferences = {}) {
  const fallback = buildRuleBasedScoreExplanation(scoreResult, room, preferences);
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "Return valid JSON only. No markdown and no extra commentary."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildScoreExplanationPrompt(scoreResult, room, preferences)
          }
        ]
      }
    ]
  });

  return normalizeScoreExplanation(
    {
      ...extractJson(response.output_text),
      source: "ai"
    },
    fallback
  );
}
