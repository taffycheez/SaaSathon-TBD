import express from "express";
import OpenAI from "openai";
import { openAiApiKey } from "../config.js";
import { extractJson } from "../lib/json.js";
import {
  buildFallbackLayout,
  buildLayoutNotes,
  normalizeDeskArray
} from "../lib/generateLayoutHelpers.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: openAiApiKey
});

const systemPrompt =
  "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting.";

router.post("/", async (req, res) => {
  try {
    const { room, num_people: numPeople, work_style: workStyle } = req.body;

    if (!room || !numPeople || !workStyle) {
      return res.status(400).json({ error: "Room, number of people, and work style are required." });
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
              text: `Given this office floor plan and constraints, return JSON only. Use either a bare array or an object with a desks array. Each desk item must be {x_percent, y_percent, rotation_deg}. Prioritise natural light, avoid wall-facing orientations, maintain 1m corridors, group by work style.

floor_plan=${JSON.stringify(room)}
num_people=${numPeople}
work_style=${workStyle}`
            }
          ]
        }
      ]
    });

    const rawOutput = response.output_text;
    const parsed = extractJson(rawOutput);
    const desks = normalizeDeskArray(parsed);
    return res.json({
      desks,
      notes: buildLayoutNotes(desks, false),
      fallback: false
    });
  } catch (error) {
    console.error("generate-layout error", error);
    const { room, num_people: numPeople, work_style: workStyle } = req.body;
    const desks = buildFallbackLayout(room, numPeople, workStyle);

    return res.json({
      desks,
      notes: buildLayoutNotes(desks, true),
      fallback: true
    });
  }
});

export default router;
