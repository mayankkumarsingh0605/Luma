import { Router, type Request, type Response } from "express";
import { ToolExecutor } from "../computer/tools/toolExecutor.js";
import { ToolRegistry } from "../computer/tools/toolRegistry.js";
import { AppRegistry } from "../computer/apps/appRegistry.js";
import { SystemController } from "../computer/system/systemController.js";
import { ActionLogger } from "../computer/logging/actionLogger.js";
import { ObservationManager } from "../observation/observationManager.js";

export const computerRouter = Router();

/**
 * POST /api/computer/execute
 * Execute any registered computer tool with given arguments.
 */
computerRouter.post("/execute", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tool, arguments: args } = req.body;

    if (!tool || typeof tool !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing required parameter 'tool' in request body.",
      });
      return;
    }

    const response = await ToolExecutor.executeTool(tool, args || {});

    // Return 200 with success/error in body so client can handle cleanly
    res.json(response);
  } catch (error: any) {
    console.error("[Computer Execute Error]:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Internal server error executing computer tool.",
    });
  }
});

/**
 * GET /api/computer/tools
 * List all available tool definitions, categories, and parameters.
 */
computerRouter.get("/tools", (_req: Request, res: Response): void => {
  try {
    const tools = ToolRegistry.getAllDefinitions();
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to retrieve tools." });
  }
});

/**
 * GET /api/computer/apps
 * List all registered applications.
 */
computerRouter.get("/apps", (_req: Request, res: Response): void => {
  try {
    const apps = AppRegistry.getAllApps();
    res.json({ apps });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to retrieve apps." });
  }
});

/**
 * GET /api/computer/observe
 * Retrieve a unified, read-only observation of active window, processes, browser session, and screen.
 */
computerRouter.get("/observe", async (req: Request, res: Response): Promise<void> => {
  try {
    const testScreenshot = req.query.test_screenshot === "true";
    const observation = await ObservationManager.observeComputerState({ testScreenshot });
    res.json(observation);
  } catch (error: any) {
    console.error("[Observation Error]:", error);
    res.status(500).json({
      timestamp: new Date().toISOString(),
      windows: {
        active_window: null,
        process_name: null,
        process_id: null,
        window_available: false,
      },
      browser: {
        running: false,
        connected: false,
        current_url: null,
        page_title: null,
        page_status: "UNAVAILABLE",
      },
      screen: {
        available: false,
        width: null,
        height: null,
        screenshot_available: false,
      },
      observation_status: "ERROR",
      errors: [error?.message || "Internal server error during computer observation."],
    });
  }
});

/**
 * GET /api/computer/state
 * Get current snapshot of system state (OS info, active window, resolution, mouse position).
 */
computerRouter.get("/state", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [osInfo, activeWindow, screenSize, mousePos] = await Promise.all([
      SystemController.getOsInfo().catch(() => ({
        platform: "Windows",
        osRelease: "unknown",
        arch: "x64",
        hostname: "localhost",
        username: "user",
        uptimeSeconds: 0,
      })),
      SystemController.getActiveWindow().catch(() => ({
        title: "Desktop",
        processName: "explorer",
        processId: 0,
      })),
      SystemController.getScreenSize().catch(() => ({
        width: 1920,
        height: 1080,
        primary: true,
      })),
      SystemController.getMousePosition().catch(() => ({
        x: 0,
        y: 0,
      })),
    ]);

    res.json({
      os: osInfo,
      activeWindow,
      screen: screenSize,
      mouse: mousePos,
      lastAction: ActionLogger.getLastAction(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get computer state." });
  }
});

/**
 * GET /api/computer/screenshot
 * Capture and return current primary screen image.
 */
computerRouter.get("/screenshot", async (_req: Request, res: Response): Promise<void> => {
  try {
    const screenshot = await SystemController.takeScreenshot();
    res.json({
      success: true,
      screenshot,
    });
  } catch (error: any) {
    console.error("[Screenshot Error]:", error);
    res.status(500).json({
      success: false,
      error: error?.message || "Failed to capture screen.",
    });
  }
});

/**
 * GET /api/computer/logs
 * Retrieve recent action logs.
 */
computerRouter.get("/logs", (req: Request, res: Response): void => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = ActionLogger.getLogs(limit);
    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get logs." });
  }
});

/**
 * POST /api/computer/logs/clear
 * Clears the action log history.
 */
computerRouter.post("/logs/clear", (_req: Request, res: Response): void => {
  try {
    ActionLogger.clearLogs();
    res.json({ success: true, message: "Action logs cleared successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to clear logs." });
  }
});
