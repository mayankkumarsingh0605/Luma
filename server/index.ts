import "dotenv/config";
import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chatRoutes.js";
import { computerRouter } from "./routes/computerRoutes.js";
import { voiceRouter } from "./routes/voiceRoutes.js";
import { systemRouter } from "./routes/systemRoutes.js";
import { InstanceLockManager } from "./runtime/instanceLock.js";
import { VoiceRuntimeManager } from "./voice/voiceRuntime.js";

const PORT = Number(process.env.PORT) || 3001;

// Enforce single-instance background lock
(async () => {
  const lockResult = await InstanceLockManager.acquireLock(PORT);
  if (!lockResult.acquired) {
    console.log(`[LUMA] Instance already active (PID: ${lockResult.existingPid}). Focusing existing instance.`);
    process.exit(0);
  }
})();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Health Check Endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Luma Backend",
    hasApiKey: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "your_groq_api_key_here"),
  });
});

// API Routes
app.use("/api", chatRouter);
app.use("/api/computer", computerRouter);
app.use("/api/voice", voiceRouter);
app.use("/api/system", systemRouter);

// Start server with port error resilience and lifecycle logging
const server = app.listen(PORT, () => {
  console.log(`🚀 Luma Backend is running on http://localhost:${PORT}`);
  // Start native background voice engine
  VoiceRuntimeManager.getInstance().start();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ [Port Conflict] Port ${PORT} is already in use by another process.`);
    console.error(`   To free port ${PORT}, run: netstat -ano | findstr :${PORT}`);
  } else {
    console.error(`❌ [Server Error]:`, err);
  }
  InstanceLockManager.releaseLock();
  process.exit(1);
});

// Graceful shutdown handling
process.on("SIGINT", () => {
  VoiceRuntimeManager.getInstance().shutdown();
  InstanceLockManager.releaseLock();
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  VoiceRuntimeManager.getInstance().shutdown();
  InstanceLockManager.releaseLock();
  server.close(() => {
    process.exit(0);
  });
});

// Global crash handlers to prevent silent backend exits
process.on("uncaughtException", (err) => {
  console.error("❌ [Backend Uncaught Exception]:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ [Backend Unhandled Rejection]:", reason);
});
