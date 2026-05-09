import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import analyseRoomRouter from "./routes/analyseRoom.js";
import generateLayoutRouter from "./routes/generateLayout.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/analyse-room", analyseRoomRouter);
app.use("/generate-layout", generateLayoutRouter);

app.listen(port, () => {
  console.log(`WorkspaceIQ server running on port ${port}`);
});
