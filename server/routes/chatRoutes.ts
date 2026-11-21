import { Router, type Request, type Response } from "express";
import { aiService } from "../ai/aiService.js";

export const chatRouter = Router();

chatRouter.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      res.status(400).json({ error: "Message is required and must be a non-empty string." });
      return;
    }

    const response = await aiService.generateResponse(message);

    res.json({ response });
  } catch (error: any) {
    console.error("[Chat API Error]:", error);

    const status = error?.status || error?.statusCode;
    const rawError = error?.error?.error?.message || error?.error?.message || error?.message || "";

    // 401 Unauthorized / Invalid API key
    if (status === 401 || rawError.toLowerCase().includes("invalid api key") || rawError.toLowerCase().includes("invalid_api_key")) {
      res.status(401).json({
        error: "Invalid Groq API Key. Please verify your GROQ_API_KEY in the .env file (get a key at https://console.groq.com/keys).",
      });
      return;
    }

    // Missing API key in .env
    if (rawError.includes("GROQ_API_KEY is not set") || rawError.includes("GROQ_API_KEY")) {
      res.status(500).json({
        error: "Groq API key is not configured. Please set GROQ_API_KEY in your .env file.",
      });
      return;
    }

    // 429 Rate limit
    if (status === 429 || rawError.toLowerCase().includes("rate limit")) {
      res.status(429).json({
        error: "Groq API rate limit exceeded. Please wait a few moments and try again.",
      });
      return;
    }

    // 404 Model not found or deprecated
    if (status === 404 || rawError.toLowerCase().includes("model")) {
      res.status(404).json({
        error: rawError || "The specified Groq model was not found or is unavailable.",
      });
      return;
    }

    res.status(typeof status === "number" && status >= 400 && status < 600 ? status : 500).json({
      error: rawError || "Sorry, I couldn't process that request right now.",
    });
  }
});
