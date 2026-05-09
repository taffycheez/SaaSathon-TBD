import { extractJson } from "./json.js";
import { normalizeAnalysisResult } from "./analyseRoomHelpers.js";

export const analyseRoomPrompt = [
  "Analyse this image as an office or floor-plan extraction task.",
  "Do a wall-first pass before identifying furniture: look inside the image for thick/dark boundary lines, thin plan lines, exterior walls, interior partition walls, room outlines, corridors, corners, door gaps, window breaks, and any visible perimeter.",
  "The outer rectangular edge of the image, screenshot, paper, crop, or canvas is not a wall.",
  "Never use the image border as the room boundary unless there are actual drawn wall lines directly on that border.",
  "Treat visible drawn wall lines around rooms as the primary structure, even when they sit inside a larger blank image area.",
  "Return wall segments even if they are imperfect, partial, skewed, hand drawn, low contrast, rotated, cropped, missing labels, or mixed with furniture symbols.",
  "Treat a floor plan as valid even when it is sparse, hand drawn, low contrast, rotated, cropped, missing labels, or only shows a partial room outline.",
  "Set is_valid_room to true if the image has any credible room or floor-plan evidence such as wall lines, room boundaries, doors, windows, dimensions, furniture symbols, desks, rooms, corridors, or a real workspace/interior photo.",
  "Prefer accepting borderline floor plans and returning your best editable approximation.",
  "Reject only images that are clearly unrelated to rooms or floor plans, such as fruit, people-only photos, memes, animals, product shots, abstract art, and screenshots unrelated to rooms.",
  "Return JSON only with: is_valid_room (boolean), rejection_reason (string, empty if valid), estimated_width_m, estimated_height_m, walls (array of wall segments in clockwise order where each item is {x1_percent, y1_percent, x2_percent, y2_percent}), windows (array of {wall_index, position_percent}), doors (array of {wall_index, position_percent}), furniture (array of items with {type, shape_kind, x_percent, y_percent, width_percent, height_percent, rotation_deg, footprint_points}).",
  "Allowed type values: desk, l_shaped_desk, meeting_table, armchair, table, filing_cabinet, whiteboard, plant, trashcan, office_equipment, toilet, sink, shower.",
  "Use armchair for any chair, office chair, task chair, seat, sofa chair, lounge chair, or chair symbol.",
  "Use plant for potted plants, planters, indoor plants, plant circles, tree symbols, or leafy/green plant icons.",
  "Use filing_cabinet for file cabinets, storage drawers, drawer units, or cabinets that belong in the workspace.",
  "Use whiteboard for marker boards, dry-erase boards, writing boards, or wall boards used for planning.",
  "Use trashcan for wastebaskets, recycle bins, rubbish bins, or office bins.",
  "Allowed shape_kind values: rect, ellipse, polygon.",
  "footprint_points is only required for polygon shapes and should be a list of at least 3 local points with {x_percent, y_percent} in the range -50..50 relative to the object centre.",
  "Use percentages from 0 to 100 relative to the detected room or floor-plan lines, not relative to the whole image canvas.",
  "Ignore empty margins, photo borders, paper edges, screenshot UI, and the outer image frame.",
  "Do not use the outline of the image itself as the room unless the room boundary truly matches it.",
  "For walls, prioritize visible wall geometry over furniture placement.",
  "If the plan has multiple rooms, trace the exterior perimeter plus every visible interior partition wall between rooms.",
  "Do not simplify a multi-room floor plan into one empty rectangle.",
  "If a bathroom, restroom, WC, toilet room, ensuite, or shower room is visible, include the enclosing bathroom partition walls and place visible bathroom fixtures as toilet, sink, and/or shower objects inside that room.",
  "If the bathroom is labeled but fixtures are unclear, place a conservative toilet or sink object near the center of that labeled bathroom room.",
  "If only some wall edges are clear, return the clear outer walls and any visible interior partition walls. Prefer partial but real geometry over inventing a full rectangle.",
  "After returning walls, do a second explicit opening pass wall by wall. For each returned wall, decide whether there are visible doors, windows, glazing strips, swing arcs, labeled openings, or clear wall gaps on that specific wall.",
  "If a floor plan already shows a gap or opening in a drawn wall, preserve it on the correct nearest wall instead of moving it to the top wall or clustering openings together.",
  "Do not default openings to wall_index 0. Spread openings across different wall_index values only when the image actually shows them on different walls.",
  "Return the actual outer perimeter and visible inner partition walls for multi-room plans, corridors, bathrooms, alcoves, and irregular shapes. Do not collapse them into one large rectangular room.",
  "Interior doors may be on interior partition walls. Windows are usually on exterior walls, but only return them where the plan visibly shows them.",
  "For windows, return a window only when a visible window symbol, glazing line, labeled window, or clear wall opening is present on a wall.",
  "Do not invent windows, do not spread windows evenly, and return windows: [] when no window is visible.",
  "For doors, actively inspect every wall for swing arcs, quarter-circle arcs, doorway gaps, hinge marks, door leaf lines, labels, or clear wall openings; return a door at the nearest wall_index and position_percent only when one of those visible door cues is present.",
  "If there are multiple doors or windows, return each one on the correct nearest wall_index with distinct position_percent values; do not stack them at the same wall/location unless the image truly shows that.",
  "For furniture, explicitly detect existing desks, L-shaped desks, meeting tables with chairs, individual chairs, office chairs, armchairs, tables, file cabinets, whiteboards, plants, potted plants, trashcans, toilets, sinks, showers, and similar office or bathroom objects when visible.",
  "If multiple chairs, plants, trashcans, bathroom fixtures, or room objects are visible, return each one separately.",
  "If unsure, choose the closest allowed type and a simple footprint.",
  "Never replace a visible irregular or multi-room plan with a single four-wall box just because the full shape is hard to infer.",
  "Set is_valid_room to false only when there is no credible room, interior, workspace, or floor-plan evidence."
].join(" ");

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
