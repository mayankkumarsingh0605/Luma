import { Router } from "express";
import { StartupManager } from "../runtime/startupManager.js";
import { InstanceLockManager } from "../runtime/instanceLock.js";

export const systemRouter = Router();

/**
 * GET /api/system/startup
 * Checks if Windows startup launch is enabled.
 */
systemRouter.get("/startup", async (_req, res) => {
  const enabled = await StartupManager.isStartupEnabled();
  res.json({ success: true, enabled });
});

/**
 * POST /api/system/startup
 * Enables or disables Windows startup launch.
 */
systemRouter.post("/startup", async (req, res) => {
  const { enable } = req.body;
  if (typeof enable !== "boolean") {
    return res.status(400).json({ success: false, error: "Parameter 'enable' must be a boolean." });
  }

  const result = enable
    ? await StartupManager.enableStartup()
    : await StartupManager.disableStartup();

  return res.json(result);
});

/**
 * POST /api/system/open-ui
 * Opens the LUMA web interface in the default browser.
 */
systemRouter.post("/open-ui", async (_req, res) => {
  const result = await StartupManager.openUserInterface();
  return res.json(result);
});

/**
 * POST /api/system/restart
 * Gracefully restarts the background LUMA runtime.
 */
systemRouter.post("/restart", (_req, res) => {
  res.json({ success: true, message: "Restarting LUMA runtime..." });
  StartupManager.restart();
});

/**
 * POST /api/system/shutdown
 * Gracefully shuts down the background LUMA runtime.
 */
systemRouter.post("/shutdown", (_req, res) => {
  res.json({ success: true, message: "Shutting down LUMA..." });
  InstanceLockManager.releaseLock();
  StartupManager.shutdown();
});
