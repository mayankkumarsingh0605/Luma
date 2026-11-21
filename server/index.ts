import "dotenv/config";
import express from "express";
import cors from "cors";
import { chatRouter } from "./routes/chatRoutes.js";
import { computerRouter } from "./routes/computerRoutes.js";

const app = express();
const PORT = process.env.PORT || 3001;

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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Luma Backend is running on http://localhost:${PORT}`);
});
