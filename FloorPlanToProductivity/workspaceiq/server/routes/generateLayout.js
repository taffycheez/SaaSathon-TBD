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

function normalizeRotation(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return ((numeric % 360) + 360) % 360;
}

function normalizeDeskArray(payload) {
  const desks = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.desks)
      ? payload.desks
      : [];

  return desks.map((item) => ({
    x_percent: clampPercent(item?.x_percent),
    y_percent: clampPercent(item?.y_percent),
    rotation_deg: normalizeRotation(item?.rotation_deg)
  }));
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

function buildFallbackLayout(room, numPeople, workStyle) {
  const deskCount = Math.max(1, Number(numPeople) || 1);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(deskCount))));
  const rows = Math.ceil(deskCount / columns);
  const desks = [];

  for (let index = 0; index < deskCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const xPercent = 18 + ((column + 0.5) * 64) / columns;
    const yPercent = 18 + ((row + 0.5) * 60) / Math.max(rows, 1);

    desks.push({
      x_percent: clampPercent(xPercent),
      y_percent: clampPercent(yPercent),
      rotation_deg: workStyle === "focus" ? 0 : column % 2 === 0 ? 90 : 0
    });
  }

  return desks;
}

function buildLayoutNotes(desks, isFallback) {
  const notes = [];
  notes.push(
    isFallback
      ? "AI layout generation did not complete, so WorkspaceIQ created a basic evenly spaced desk plan."
      : `Generated ${desks.length} desk position(s) from the analysed room and preferences.`
  );
  notes.push("You can drag desks, rotate them, and adjust doors or windows before reviewing the score.");
  return notes;
}

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
