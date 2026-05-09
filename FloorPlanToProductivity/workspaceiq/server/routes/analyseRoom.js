import express from "express";
import { analysisPipeline, createAiClient, openRouterModel } from "../config.js";
import {
  buildRoomNotes,
  mergeRoomAnalyses,
  fallbackRoom,
  normalizeRoomDescription
} from "../lib/analyseRoomHelpers.js";
import { analyseRoomWithCv, cvAnalysisLooksUsable, cvOpeningsLookUsable } from "../lib/analyseRoomCv.js";
import { analyseRoomImage } from "../lib/analyseRoomVision.js";

const router = express.Router();

const client = createAiClient();

router.post("/", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required." });
    }

    let analysis = null;

    if (analysisPipeline === "cv") {
      analysis = await analyseRoomWithCv(image);
    } else if (analysisPipeline === "hybrid") {
      let cvAnalysis = null;
      let visionAnalysis = null;

      try {
        cvAnalysis = await analyseRoomWithCv(image);
      } catch (cvError) {
        console.warn("analyse-room cv pipeline unavailable, falling back to llm", cvError.message);
      }

      if (cvAnalysisLooksUsable(cvAnalysis)) {
        if (!cvOpeningsLookUsable(cvAnalysis)) {
          try {
            visionAnalysis = await analyseRoomImage(client, image, openRouterModel);
          } catch (visionError) {
            console.warn("analyse-room vision opening pass unavailable, keeping cv analysis", visionError.message);
          }
        }

        analysis = visionAnalysis ? mergeRoomAnalyses(cvAnalysis, visionAnalysis) : cvAnalysis;
      } else {
        analysis = await analyseRoomImage(client, image, openRouterModel);
      }
    } else {
      analysis = await analyseRoomImage(client, image, openRouterModel);
    }

    if (!analysis.is_valid_room) {
      return res.status(422).json({
        error: analysis.rejection_reason,
        rejected: true
      });
    }

    const room = analysis.room;
    return res.json({
      ...room,
      notes: buildRoomNotes(room, false),
      fallback: false
    });
  } catch (error) {
    console.error("analyse-room error", error);
    const room = normalizeRoomDescription(fallbackRoom);
    return res.json({
      ...room,
      notes: buildRoomNotes(room, true),
      fallback: true
    });
  }
});

export default router;
