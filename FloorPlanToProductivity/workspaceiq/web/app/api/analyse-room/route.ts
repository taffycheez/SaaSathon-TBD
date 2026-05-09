import { createAiClient, openRouterModel } from "@/lib/server/ai";
import {
  buildRoomNotes,
  fallbackRoom,
  normalizeRoomDescription
} from "@/lib/server/analyseRoomHelpers";
import { analyseRoomImage } from "@/lib/server/analyseRoomVision";

export const dynamic = "force-dynamic";

type AnalyseRequest = {
  image?: string;
};

const client = createAiClient();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyseRequest;
    if (!body.image) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }

    const analysis = await analyseRoomImage(client, body.image, openRouterModel);

    if (!analysis.is_valid_room) {
      return Response.json(
        {
          error: analysis.rejection_reason,
          rejected: true
        },
        { status: 422 }
      );
    }

    const room = analysis.room;
    return Response.json({
      ...room,
      notes: buildRoomNotes(room, false),
      fallback: false
    });
  } catch (error) {
    console.error("analyse-room error", error);
    const room = normalizeRoomDescription(fallbackRoom);
    return Response.json({
      ...room,
      notes: buildRoomNotes(room, true),
      fallback: true
    });
  }
}
