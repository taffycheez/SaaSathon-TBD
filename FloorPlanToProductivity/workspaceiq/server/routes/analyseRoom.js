import express from "express";
import OpenAI from "openai";
import { openAiApiKey } from "../config.js";
import { extractJson } from "../lib/json.js";
import { buildRoomNotes, fallbackRoom, normalizeRoomDescription } from "../lib/analyseRoomHelpers.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: openAiApiKey
});

const systemPrompt =
  "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting.";

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
