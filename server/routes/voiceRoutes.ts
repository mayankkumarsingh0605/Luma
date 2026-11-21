import { Router } from "express";
import { VoiceRuntimeManager } from "../voice/voiceRuntime.js";

export const voiceRouter = Router();
const voiceRuntime = VoiceRuntimeManager.getInstance();

/**
 * GET /api/voice/status
 * Retrieves current voice runtime state, mute settings, and last activity.
 */
voiceRouter.get("/status", (_req, res) => {
  res.json({
    success: true,
    ...voiceRuntime.getStatus(),
  });
});

/**
 * POST /api/voice/mute
 * Sets microphone mute status (stops or resumes wake-word detection).
 */
voiceRouter.post("/mute", (req, res) => {
  const { muted } = req.body;
  if (typeof muted !== "boolean") {
    return res.status(400).json({ success: false, error: "Parameter 'muted' must be a boolean." });
  }

  voiceRuntime.setMute(muted);
  return res.json({
    success: true,
    isMuted: muted,
    message: muted ? "Microphone muted. Wake-word detection paused." : "Microphone active. Listening for 'Hey Luma'.",
  });
});

/**
 * POST /api/voice/tts-mute
 * Sets spoken response mute status.
 */
voiceRouter.post("/tts-mute", (req, res) => {
  const { muted } = req.body;
  if (typeof muted !== "boolean") {
    return res.status(400).json({ success: false, error: "Parameter 'muted' must be a boolean." });
  }

  voiceRuntime.setTtsMute(muted);
  return res.json({
    success: true,
    isTtsMuted: muted,
    message: muted ? "Voice responses muted." : "Voice responses active.",
  });
});

/**
 * POST /api/voice/trigger
 * Simulates or triggers a wake-word event (useful for manual UI mic click or tests).
 */
voiceRouter.post("/trigger", async (req, res) => {
  const { keyword, embeddedCommand } = req.body;
  await voiceRuntime.handleWakeWord(keyword || "Hey Luma", embeddedCommand);
  return res.json({
    success: true,
    message: "Wake word event triggered.",
    status: voiceRuntime.getStatus(),
  });
});

/**
 * POST /api/voice/command
 * Directly executes a voice command through the voice runtime pipeline.
 */
voiceRouter.post("/command", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ success: false, error: "Parameter 'text' is required." });
  }

  const result = await voiceRuntime.handleCommand(text);
  return res.json({
    success: result.success,
    result,
    status: voiceRuntime.getStatus(),
  });
});

/**
 * POST /api/voice/speak
 * Speaks arbitrary text using the background Windows TTS engine.
 */
voiceRouter.post("/speak", (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ success: false, error: "Parameter 'text' is required." });
  }

  voiceRuntime.speak(text);
  return res.json({ success: true, message: `Speaking text: "${text}".` });
});

/**
 * GET /api/voice/events
 * Real-time Server-Sent Events (SSE) stream for frontend synchronization.
 */
voiceRouter.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial state snapshot
  res.write(`event: state\ndata: ${JSON.stringify(voiceRuntime.getStatus())}\n\n`);

  const unsubscribe = voiceRuntime.addSseClient((event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
  });
});
