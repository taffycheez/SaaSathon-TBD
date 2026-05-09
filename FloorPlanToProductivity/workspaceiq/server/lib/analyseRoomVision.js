import { extractJson } from "./json.js";
import { normalizeAnalysisResult } from "./analyseRoomHelpers.js";

export const analyseRoomPrompt =
  "Analyse this image. First decide whether it is a real office room, workspace interior, or floor plan that can support workspace layout planning. Reject fruit, people-only photos, memes, animals, product shots, abstract art, screenshots unrelated to rooms, and any image that is not clearly a room or floor plan. Return JSON only with: is_valid_room (boolean), rejection_reason (string, empty if valid), estimated_width_m, estimated_height_m, walls (array of wall segments in clockwise order where each item is {x1_percent, y1_percent, x2_percent, y2_percent}), windows (array of {wall_index, position_percent}), doors (array of {wall_index, position_percent}), furniture (array focused on desks for now, each item {type, x_percent, y_percent, width_percent, height_percent, rotation_deg}). Use percentages from 0 to 100 relative to the room. If unsure, prefer a simple rectangular wall outline. If the image is not a valid room or floor plan, set is_valid_room to false and explain why in rejection_reason.";

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
