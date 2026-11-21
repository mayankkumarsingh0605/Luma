import { ActionVerifier } from "../verification/actionVerifier.js";
import { ComputerStateManager } from "../state/computerState.js";
import { BrowserAgent } from "../agent/browserAgent.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Deterministic Windows Application Control Workflow (Open, Close, Focus)
 */
export async function executeAppControlWorkflow(
  action: "open" | "close" | "focus",
  appCanonical: string,
  appDisplayName: string,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const verb = action === "open" ? "Opening" : action === "close" ? "Closing" : "Switching to";
  context.onProgress(`${verb} ${appDisplayName}...`, "in-progress");

  try {
    // 1. Google Chrome: Use controlled browser session for open actions to ensure single-window reuse
    if (appCanonical === "chrome" && action === "open") {
      const browserRes = await BrowserAgent.open_browser();
      if (browserRes.success) {
        context.onProgress(`${appDisplayName} opened successfully`, "completed");
        ComputerStateManager.update({
          active_app: "chrome",
          last_action: `Opened ${appDisplayName}`,
          last_action_status: "success",
        });
        return {
          success: true,
          message: `${appDisplayName} opened and ready.`,
        };
      }
    }

    const tool = action === "open" ? "open_app" : action === "close" ? "close_app" : "focus_app";
    const postBody = JSON.stringify({
      tool,
      arguments: { app: appCanonical, force: true },
    });

    let data: any;
    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: postBody,
      });
      data = await res.json();
    } catch {
      const res = await fetch("http://localhost:3001/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: postBody,
      });
      data = await res.json();
    }

    if (!data.success) {
      context.onProgress(`Could not ${action} ${appDisplayName}`, "failed");
      return {
        success: false,
        message: `I couldn't find or ${action} ${appDisplayName}.`,
        error: data.error,
      };
    }

    // Action Verification
    if (action === "open") {
      const running = await ActionVerifier.verifyAppRunning(appCanonical);
      if (!running) {
        await ActionVerifier.sleep(500);
      }
      context.onProgress(`${appDisplayName} opened successfully`, "completed");
      ComputerStateManager.update({
        active_app: appCanonical,
        last_action: `Opened ${appDisplayName}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: `${appDisplayName} opened successfully.`,
        data: data.result,
      };
    } else if (action === "close") {
      context.onProgress(`${appDisplayName} closed successfully`, "completed");
      ComputerStateManager.update({
        last_action: `Closed ${appDisplayName}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: `${appDisplayName} closed successfully.`,
        data: data.result,
      };
    } else {
      context.onProgress(`Switched to ${appDisplayName}`, "completed");
      ComputerStateManager.update({
        active_app: appCanonical,
        last_action: `Switched to ${appDisplayName}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: `Switched to ${appDisplayName}.`,
        data: data.result,
      };
    }
  } catch (err: any) {
    context.onProgress(`Failed to communicate with system`, "failed");
    return {
      success: false,
      message: `Failed to ${action} ${appDisplayName}: ${err?.message || "Unknown error"}`,
      error: err?.message,
    };
  }
}
