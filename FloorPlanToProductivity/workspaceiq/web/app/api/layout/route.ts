import { generateLayoutWithConfiguredBackend } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const layout = await generateLayoutWithConfiguredBackend(body);
    return Response.json(layout);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Layout route failed."
      },
      { status: 500 }
    );
  }
}
