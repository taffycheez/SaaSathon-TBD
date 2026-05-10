import { createAiClient, openRouterApiKey, openRouterLayoutModel } from "@/lib/server/ai";
import { extractJson } from "@/lib/server/json";
import {
  buildFallbackRoomLayout,
  buildLayoutNotes,
  optimizeRoomLayout
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

    if (!openRouterApiKey) {
      throw new Error("OPENROUTER_API_KEY is missing. Using fallback layout.");
    }

    const response = await client.responses.create({
      model: openRouterLayoutModel,
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
              text: `Given this office floor plan and constraints, return JSON only as an object with desks and furniture arrays.

Each desk item must be {x_percent, y_percent, rotation_deg}.
The furniture array should keep the existing furniture order from floor_plan.furniture and only propose updated {type, x_percent, y_percent, rotation_deg} values for movable non-desk objects.
Do not move toilets, sinks, showers, fridges, or kitchenettes unless the floor plan clearly has them floating in the middle of the room.

Optimise against these same productivity-score rules:
- command position: desks can see the main door diagonally without sitting directly in the entry path
- support: desks have a wall/edge behind them
- flow: keep the door-to-center path open and maintain circulation between seats
- light: shift desks toward windows, but not directly against glass
- harmony: ${workStyle === "collaborative" ? "cluster desks around meeting tables or whiteboards" : workStyle === "focus" ? "keep focus desks away from noisy/social/utility objects" : "balance a quieter focus edge with a collaboration anchor"}
- nature/clutter: plants near work zones, trash/clutter/utility objects away from desks
- zoning: keep focus, collaboration, social, and utility areas legible and separated

floor_plan=${JSON.stringify(room)}
num_people=${numPeople}
work_style=${workStyle}`
            }
          ]
        }
      ]
    });

    const parsed = extractJson(response.output_text);
    const layout = optimizeRoomLayout(room, parsed, numPeople, workStyle);
    return Response.json({
      ...layout,
      notes: buildLayoutNotes(layout, false),
      fallback: false
    });
  } catch (error) {
    console.error("generate-layout error", error);
    const { room, num_people: numPeople, work_style: workStyle } = body;
    const layout = buildFallbackRoomLayout(room, numPeople, workStyle);

    return Response.json({
      ...layout,
      notes: buildLayoutNotes(layout, true),
      fallback: true
    });
  }
}
