import { extractJson } from "./json.js";
import { normalizeAnalysisResult } from "./analyseRoomHelpers.js";

export const analyseRoomPrompt =
  "Analyse this image as an office or floor-plan extraction task. First decide whether it is a real office room, workspace interior, bathroom, or floor plan that can support layout planning. Reject fruit, people-only photos, memes, animals, product shots, abstract art, screenshots unrelated to rooms, and any image that is not clearly a room or floor plan. Return JSON only with: is_valid_room (boolean), rejection_reason (string, empty if valid), estimated_width_m, estimated_height_m, walls (array of wall segments in clockwise order where each item is {x1_percent, y1_percent, x2_percent, y2_percent}), windows (array of {wall_index, position_percent}), doors (array of {wall_index, position_percent}), furniture (array of items with {type, shape_kind, x_percent, y_percent, width_percent, height_percent, rotation_deg, footprint_points}). Allowed type values: desk, l_shaped_desk, meeting_table, armchair, table, plant, office_equipment, toilet, sink, shower. Allowed shape_kind values: rect, ellipse, polygon. footprint_points is only required for polygon shapes and should be a list of at least 3 local points with {x_percent, y_percent} in the range -50..50 relative to the object centre. Use percentages from 0 to 100 relative to the room or floor plan, not relative to the whole image canvas. Ignore empty margins, photo borders, and the outer image frame. Do not use the outline of the image itself as the room unless the room boundary truly matches it. For walls, prefer the visible interior room boundary or floor-plan wall lines. For furniture, explicitly detect existing desks, L-shaped desks, meeting tables with chairs, armchairs, tables, plants, toilets, sinks, showers, and similar office or bathroom objects when visible. If multiple objects are visible, return each one separately. If unsure, choose the closest allowed type and a simple footprint. Only fall back to a simple rectangular wall outline if the room shape truly cannot be inferred. If the image is not a valid room or floor plan, set is_valid_room to false and explain why in rejection_reason.";

export async function analyseRoomImage(client, imageUrl, model) {
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "You are an office space planning assistant. Always respond with valid JSON only, no prose, no markdown formatting."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: analyseRoomPrompt
          },
          {
            type: "input_image",
            image_url: imageUrl
          }
        ]
      }
    ]
  });

  const parsed = extractJson(response.output_text);
  return normalizeAnalysisResult(parsed);
}
