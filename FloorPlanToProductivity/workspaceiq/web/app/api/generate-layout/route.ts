import { createAiClient, openRouterModel } from "@/lib/server/ai";
import { extractJson } from "@/lib/server/json";
import {
  buildFallbackLayout,
  buildLayoutNotes,
  normalizeDeskArray
} from "@/lib/server/generateLayoutHelpers";

export const dynamic = "force-dynamic";

const client = createAiClient();

const systemPrompt =
  "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting.";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  try {
    const { room, num_people: numPeople, work_style: workStyle } = body;

    if (!room || !numPeople || !workStyle) {
      return Response.json(
        { error: "Room, number of people, and work style are required." },
        { status: 400 }
      );
    }

    const response = await client.responses.create({
      model: openRouterModel,
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

    const parsed = extractJson(response.output_text);
    const desks = normalizeDeskArray(parsed);
    return Response.json({
      desks,
      notes: buildLayoutNotes(desks, false),
      fallback: false
    });
  } catch (error) {
    console.error("generate-layout error", error);
    const { room, num_people: numPeople, work_style: workStyle } = body;
    const desks = buildFallbackLayout(room, numPeople, workStyle);

    return Response.json({
      desks,
      notes: buildLayoutNotes(desks, true),
      fallback: true
    });
  }
}
