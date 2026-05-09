import { extractJson } from "./json.js";
import { normalizeAnalysisResult } from "./analyseRoomHelpers.js";

export const analyseRoomPrompt =
  "Analyse this image as an office or floor-plan extraction task. Do a wall-first pass before identifying furniture: look inside the image for thick/dark boundary lines, thin plan lines, exterior walls, interior partition walls, room outlines, corridors, corners, door gaps, window breaks, and any visible perimeter. The outer rectangular edge of the image, screenshot, paper, crop, or canvas is not a wall. Never use the image border as the room boundary unless there are actual drawn wall lines directly on that border. Treat visible drawn wall lines around rooms as the primary structure, even when they sit inside a larger blank image area. Return wall segments even if they are imperfect, partial, skewed, hand drawn, low contrast, rotated, cropped, missing labels, or mixed with furniture symbols. Set is_valid_room to true if the image has any credible room or floor-plan evidence such as wall lines, room boundaries, doors, windows, dimensions, furniture symbols, desks, rooms, corridors, or a real workspace/interior photo. Prefer accepting borderline floor plans and returning your best editable approximation. Reject only images that are clearly unrelated to rooms or floor plans, such as fruit, people-only photos, memes, animals, product shots, abstract art, and screenshots unrelated to rooms. Return JSON only with: is_valid_room (boolean), rejection_reason (string, empty if valid), estimated_width_m, estimated_height_m, walls (array of wall segments in clockwise order where each item is {x1_percent, y1_percent, x2_percent, y2_percent}), windows (array of {wall_index, position_percent}), doors (array of {wall_index, position_percent}), furniture (array of items with {type, shape_kind, x_percent, y_percent, width_percent, height_percent, rotation_deg, footprint_points}). Allowed type values: desk, l_shaped_desk, meeting_table, armchair, table, plant, office_equipment, toilet, sink, shower. Use armchair for any chair, office chair, task chair, seat, sofa chair, lounge chair, or chair symbol. Use plant for potted plants, planters, indoor plants, plant circles, tree symbols, or leafy/green plant icons. Allowed shape_kind values: rect, ellipse, polygon. footprint_points is only required for polygon shapes and should be a list of at least 3 local points with {x_percent, y_percent} in the range -50..50 relative to the object centre. Use percentages from 0 to 100 relative to the detected room or floor-plan lines, not relative to the whole image canvas. Ignore empty margins, photo borders, paper edges, screenshot UI, and the outer image frame. For walls, prioritize visible wall geometry over furniture placement. If there are interior partition walls, include them as additional wall segments after the exterior boundary. If only two or three wall edges are clear, return those clear walls and complete the likely perimeter from the actual drawn room lines, not the image edge. For windows, return a window only when a visible window symbol, glazing line, labeled window, or clear wall opening is present on a wall. Do not invent windows, do not spread windows evenly, and return windows: [] when no window is visible. For doors, actively inspect every wall for swing arcs, quarter-circle arcs, doorway gaps, hinge marks, door leaf lines, labels, or clear wall openings; return a door at the nearest wall_index and position_percent only when one of those visible door cues is present. For furniture, explicitly detect existing desks, L-shaped desks, meeting tables with chairs, individual chairs, office chairs, armchairs, tables, plants, potted plants, toilets, sinks, showers, and similar office or bathroom objects when visible. If multiple chairs or plants are visible, return each one separately. If multiple objects are visible, return each one separately. If unsure, choose the closest allowed type and a simple footprint. If the exact room shape cannot be inferred, still set is_valid_room to true and return a simple rectangular wall outline around the likely drawn room area. Set is_valid_room to false only when there is no credible room, interior, workspace, or floor-plan evidence.";

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
