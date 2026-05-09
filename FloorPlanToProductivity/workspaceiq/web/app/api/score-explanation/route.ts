import { createAiClient, openRouterApiKey, openRouterModel } from "@/lib/server/ai";
import {
  buildRuleBasedScoreExplanation,
  explainScoreWithAi
} from "@/lib/server/scoreExplanation";

export const dynamic = "force-dynamic";

type ScoreExplanationRequest = {
  room?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  scoreResult?: Record<string, unknown>;
};

const client = createAiClient();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScoreExplanationRequest;
    const room = body?.room || {};
    const preferences = body?.preferences || {};
    const scoreResult = body?.scoreResult || {};

    const fallback = buildRuleBasedScoreExplanation(scoreResult, room, preferences);

    if (!openRouterApiKey) {
      return Response.json(fallback);
    }

    try {
      const explanation = await explainScoreWithAi(client, openRouterModel, scoreResult, room, preferences);
      return Response.json(explanation);
    } catch (error) {
      console.warn("score-explanation ai error, falling back to rules", error);
      return Response.json(fallback);
    }
  } catch {
    return Response.json(
      {
        summary: "WorkspaceIQ could not generate an AI explanation for this score yet.",
        insights: [],
        recommendations: [],
        source: "rules"
      },
      { status: 200 }
    );
  }
}
