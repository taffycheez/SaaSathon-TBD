import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRuleBasedScoreExplanation,
  buildScoreExplanationPrompt,
  normalizeScoreExplanation
} from "./scoreExplanation.js";

const SCORE_RESULT = {
  score: 78,
  breakdown: [
    "Command position: 3/4 desk(s) can see the entry without sitting in its direct line: +24",
    "Support: 2/4 desk(s) have a solid wall or edge behind them: +14",
    "Flow: circulation works but could open up more; average desk spacing is 18.0 grid units: +11"
  ],
  advice: [
    "Rotate desks so people can see the door diagonally instead of facing a wall or sitting directly in the entry line.",
    "Clear the path from the door to the center of the room by pulling desks out of the entry lane and leaving more space between seats."
  ]
};

const ROOM = {
  estimated_width_m: 8,
  estimated_height_m: 6,
  walls: [{}, {}, {}, {}],
  windows: [{}, {}],
  doors: [{}],
  furniture: [{}, {}],
  desks: [{}, {}, {}]
};

test("buildRuleBasedScoreExplanation produces a usable fallback explanation", () => {
  const explanation = buildRuleBasedScoreExplanation(SCORE_RESULT, ROOM, { workStyle: "balanced" });

  assert.match(explanation.summary, /workable|strong|decent|needs/i);
  assert.equal(explanation.insights.length, 3);
  assert.ok(explanation.recommendations.length > 0);
  assert.equal(explanation.source, "rules");
});

test("buildScoreExplanationPrompt includes deterministic score context", () => {
  const prompt = buildScoreExplanationPrompt(SCORE_RESULT, ROOM, { workStyle: "focus", numPeople: 6 });

  assert.match(prompt, /deterministically/i);
  assert.match(prompt, /"score":78/);
  assert.match(prompt, /"work_style":"focus"/);
  assert.match(prompt, /"desk_count":3/);
});

test("normalizeScoreExplanation falls back cleanly when payload is incomplete", () => {
  const fallback = buildRuleBasedScoreExplanation(SCORE_RESULT, ROOM, { workStyle: "balanced" });
  const normalized = normalizeScoreExplanation(
    {
      summary: "  AI summary here. ",
      insights: ["One", "", "Two", "Three", "Four"],
      recommendations: []
    },
    fallback
  );

  assert.equal(normalized.summary, "AI summary here.");
  assert.deepEqual(normalized.insights, ["One", "Two", "Three"]);
  assert.deepEqual(normalized.recommendations, fallback.recommendations);
  assert.equal(normalized.source, "rules");
});
