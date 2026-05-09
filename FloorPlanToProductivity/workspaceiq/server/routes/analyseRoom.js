import express from "express";
import OpenAI from "openai";
import { openAiApiKey } from "../config.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: openAiApiKey
});

const systemPrompt =
  "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting.";

const fallbackRoom = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  windows: [
    { wall: "top", position_percent: 25 },
    { wall: "top", position_percent: 75 }
  ],
  doors: [{ wall: "left", position_percent: 70 }],
  furniture: []
};

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(100, numeric));
}

function normalizeWall(value) {
  const validWalls = ["top", "bottom", "left", "right"];
  return validWalls.includes(value) ? value : "top";
}

function normalizeRoomDescription(payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};

  return {
    estimated_width_m: Math.max(1, Number(safePayload.estimated_width_m) || 8),
    estimated_height_m: Math.max(1, Number(safePayload.estimated_height_m) || 6),
    windows: Array.isArray(safePayload.windows)
      ? safePayload.windows.map((item) => ({
          wall: normalizeWall(item?.wall),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    doors: Array.isArray(safePayload.doors)
      ? safePayload.doors.map((item) => ({
          wall: normalizeWall(item?.wall),
          position_percent: clampPercent(item?.position_percent)
        }))
      : [],
    furniture: Array.isArray(safePayload.furniture)
      ? safePayload.furniture.map((item) => ({
          type: typeof item?.type === "string" ? item.type : "furniture",
          x_percent: clampPercent(item?.x_percent),
          y_percent: clampPercent(item?.y_percent)
        }))
      : []
  };
}

function extractJson(text) {
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

function buildRoomNotes(room, isFallback) {
  const notes = [];
  const windowCount = room.windows.length;
  const doorCount = room.doors.length;
  const furnitureCount = room.furniture.length;

  notes.push(
    isFallback
      ? "Automatic vision analysis did not complete, so WorkspaceIQ created a starter room you can edit manually."
      : `Estimated room size is ${room.estimated_width_m}m by ${room.estimated_height_m}m.`
  );
  notes.push(`${windowCount} window(s), ${doorCount} door(s), and ${furnitureCount} furniture item(s) were mapped.`);

  if (windowCount === 0) {
    notes.push("No windows were confidently detected, so daylight scoring may be conservative until you add them.");
  }

  return notes;
}

router.post("/", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required." });
    }

    const response = await client.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: 'Analyse this office photo. Return JSON only with: estimated_width_m, estimated_height_m, windows (array of {wall, position_percent}), doors (array of {wall, position_percent}), furniture (array of {type, x_percent, y_percent})'
            },
            {
              type: "input_image",
              image_url: image
            }
          ]
        }
      ]
    });

    const rawOutput = response.output_text;
    const parsed = extractJson(rawOutput);
    const room = normalizeRoomDescription(parsed);
    return res.json({
      ...room,
      notes: buildRoomNotes(room, false),
      fallback: false
    });
  } catch (error) {
    console.error("analyse-room error", error);
    const room = normalizeRoomDescription(fallbackRoom);
    return res.json({
      ...room,
      notes: buildRoomNotes(room, true),
      fallback: true
    });
  }
});

export default router;
