import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiClient, openRouterApiKey, openRouterModel } from "../config.js";
import { analyseRoomImage } from "../lib/analyseRoomVision.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "image_tests");
const shouldRun = process.env.RUN_OPENAI_IMAGE_TESTS === "1" && Boolean(openRouterApiKey);

const client = shouldRun ? createAiClient() : null;

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

async function fileToDataUrl(filePath) {
  const buffer = await fs.readFile(filePath);
  const mimeType = getMimeType(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function listFixtureFiles(subfolder) {
  const folder = path.join(fixturesDir, subfolder);
  const entries = await fs.readdir(folder);
  return entries.map((entry) => path.join(folder, entry)).sort();
}

test(
  "room classifier accepts pass fixtures and rejects fail fixtures",
  { skip: !shouldRun },
  async () => {
    const passingImages = await listFixtureFiles("pass");
    const failingImages = await listFixtureFiles("fails");

    for (const filePath of passingImages) {
      const result = await analyseRoomImage(client, await fileToDataUrl(filePath), openRouterModel);
      assert.equal(
        result.is_valid_room,
        true,
        `Expected pass fixture to be accepted: ${path.basename(filePath)}`
      );
    }

    for (const filePath of failingImages) {
      const result = await analyseRoomImage(client, await fileToDataUrl(filePath), openRouterModel);
      assert.equal(
        result.is_valid_room,
        false,
        `Expected fail fixture to be rejected: ${path.basename(filePath)}`
      );
      assert.equal(Boolean(result.rejection_reason), true);
    }
  }
);

test(
  "opening detection returns non-stacked openings for a floor-plan fixture",
  { skip: !shouldRun },
  async () => {
    const filePath = path.join(fixturesDir, "pass", "small-office-layout.jpg");
    const result = await analyseRoomImage(client, await fileToDataUrl(filePath), openRouterModel);
    const openings = [...result.room.windows, ...result.room.doors];
    const uniqueOpenings = new Set(
      openings.map((item) => `${item.wall_index}:${Math.round(item.position_percent)}`)
    );

    assert.equal(result.is_valid_room, true);
    assert.equal(openings.length > 0, true, "Expected at least one detected door or window");
    assert.equal(uniqueOpenings.size, openings.length, "Expected detected openings not to stack on one wall location");
  }
);
