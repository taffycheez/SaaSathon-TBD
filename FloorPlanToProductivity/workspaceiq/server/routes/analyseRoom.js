import express from "express";
import OpenAI from "openai";
import { openAiApiKey } from "../config.js";
import {
  buildRoomNotes,
  fallbackRoom,
  normalizeRoomDescription
} from "../lib/analyseRoomHelpers.js";
import { analyseRoomImage } from "../lib/analyseRoomVision.js";

const router = express.Router();

const client = new OpenAI({
  apiKey: openAiApiKey
});

router.post("/", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "Image is required." });
    }

    const analysis = await analyseRoomImage(client, image);

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
