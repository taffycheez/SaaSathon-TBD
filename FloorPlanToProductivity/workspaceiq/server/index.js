import express from "express";
import cors from "cors";
import { port } from "./config.js";
import analyseRoomRouter from "./routes/analyseRoom.js";
import generateLayoutRouter from "./routes/generateLayout.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/analyse-room", analyseRoomRouter);
app.use("/generate-layout", generateLayoutRouter);

const server = app.listen(port, () => {
  console.log(`WorkspaceIQ server running on port ${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Change PORT in .env or stop the other process using that port.`);
    process.exit(1);
  }

  throw error;
});
