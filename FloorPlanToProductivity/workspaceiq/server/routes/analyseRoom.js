import express from "express";
import OpenAI from "openai";
import { openAiApiKey } from "../config.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: openAiApiKey
});

const systemPrompt =
  "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting.";

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
    const parsed = JSON.parse(rawOutput);
    return res.json(normalizeRoomDescription(parsed));
  } catch (error) {
    console.error("analyse-room error", error);
    return res.status(500).json({
      error: "We couldn't analyse the room image. Please try another photo."
    });
  }
});

export default router;
