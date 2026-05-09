import express from "express";
import OpenAI from "openai";

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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
              text: `Given this office floor plan and constraints, return optimal desk positions as JSON array of {x_percent, y_percent, rotation_deg}. Prioritise natural light, avoid wall-facing orientations, maintain 1m corridors, group by work style.

floor_plan=${JSON.stringify(room)}
num_people=${numPeople}
work_style=${workStyle}`
            }
          ]
        }
      ]
    });

    const rawOutput = response.output_text;
    const parsed = JSON.parse(rawOutput);
    return res.json(parsed);
  } catch (error) {
    console.error("generate-layout error", error);
    return res.status(500).json({
      error: "We couldn't generate a layout right now. Please review the floor plan and try again."
    });
  }
});

export default router;
