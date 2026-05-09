import express from "express";
import { analysisPipeline, createAiClient, openRouterModel } from "../config.js";
import {
  buildRoomNotes,
  fallbackRoom,
  normalizeRoomDescription
} from "../lib/analyseRoomHelpers.js";
import { analyseRoomWithCv, cvAnalysisLooksUsable } from "../lib/analyseRoomCv.js";
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
      try {
        analysis = await analyseRoomWithCv(image);
      } catch (cvError) {
        console.warn("analyse-room cv pipeline unavailable, falling back to llm", cvError.message);
      }

      if (!cvAnalysisLooksUsable(analysis)) {
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
