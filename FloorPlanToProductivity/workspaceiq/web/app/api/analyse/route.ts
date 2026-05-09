import { analyseRoomWithConfiguredBackend } from "@/lib/api";

export const dynamic = "force-dynamic";

type AnalyseRequest = {
  image?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyseRequest;
    if (!body.image) {
      return Response.json({ error: "Image is required." }, { status: 400 });
    }

    const analysis = await analyseRoomWithConfiguredBackend(body.image);
    return Response.json(analysis);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Analyse route failed."
      },
      { status: 500 }
    );
  }
}
