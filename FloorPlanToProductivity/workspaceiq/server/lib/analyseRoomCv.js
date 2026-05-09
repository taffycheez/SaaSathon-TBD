import fs from "node:fs";
import { spawn } from "node:child_process";
import {
  cvMinWallSegments,
  cvPipelineScript,
  cvPythonBin,
  cvSegmentationModel
} from "../config.js";
import { normalizeAnalysisResult } from "./analyseRoomHelpers.js";

function runPythonAnalyzer(image) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(cvPipelineScript)) {
      reject(new Error(`CV pipeline script not found at ${cvPipelineScript}`));
      return;
    }

    const child = spawn(
      cvPythonBin,
      [cvPipelineScript],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          CV_SEGMENTATION_MODEL: cvSegmentationModel
        }
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        const message = stderr.trim() || `CV pipeline exited with status ${code}`;

        if (message.includes("No module named 'cv2'")) {
          reject(new Error("OpenCV for Python is missing. Run `npm.cmd run cv:setup` from `FloorPlanToProductivity/workspaceiq`, or `python -m pip install -r server/cv_pipeline/requirements-cv.txt`."));
          return;
        }

        if (message.includes("No module named 'numpy'") || message.includes("No module named 'PIL'")) {
          reject(new Error("Python CV dependencies are missing. Run `npm.cmd run cv:setup` from `FloorPlanToProductivity/workspaceiq`."));
          return;
        }

        if (message.includes("No module named 'ultralytics'")) {
          reject(new Error("Ultralytics is missing for segmentation. Run `npm.cmd run cv:setup` from `FloorPlanToProductivity/workspaceiq`."));
          return;
        }

        reject(new Error(message));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`CV pipeline returned invalid JSON. ${error.message}`));
      }
    });

    child.stdin.write(JSON.stringify({ image }));
    child.stdin.end();
  });
}

export async function analyseRoomWithCv(image) {
  const raw = await runPythonAnalyzer(image);
  return normalizeAnalysisResult(raw);
}

export function cvAnalysisLooksUsable(analysis) {
  const room = analysis?.room;
  if (!analysis?.is_valid_room || !room) {
    return false;
  }

  const wallCount = Array.isArray(room.walls) ? room.walls.length : 0;
  const furnitureCount = Array.isArray(room.furniture) ? room.furniture.length : 0;

  return wallCount >= cvMinWallSegments || furnitureCount > 0;
}
