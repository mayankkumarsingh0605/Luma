import { ActionVerifier } from "../verification/actionVerifier.js";
import { ComputerStateManager } from "../state/computerState.js";
import { BrowserAgent } from "../agent/browserAgent.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Deterministic Windows Application Control Workflow (Open, Close, Focus, Restore, Switch)
 */
export async function executeAppControlWorkflow(
  action: "open" | "close" | "focus" | "restore" | "switch_between",
  appCanonical: string,
  appDisplayName: string,
  context: WorkflowContext,
  extraArgs?: Record<string, any>
): Promise<WorkflowResult> {
  const verb =
    action === "open"
      ? "Opening"
      : action === "close"
      ? "Closing"
      : action === "restore"
      ? "Restoring"
      : action === "switch_between"
      ? "Switching between windows of"
      : "Switching to";
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

    let tool = "focus_app";
    let args: Record<string, any> = { app: appCanonical, force: true };

    if (action === "open") {
      tool = "open_app";
    } else if (action === "close") {
      tool = "close_app";
    } else if (action === "restore") {
      tool = "restore_app";
      args = { app: appCanonical };
    } else if (action === "switch_between") {
      tool = "switch_between_apps";
      args = { app: appCanonical, alternateApp: extraArgs?.alternateApp || "notepad" };
    }

    const postBody = JSON.stringify({
      tool,
      arguments: args,
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
      try {
        const res = await fetch("http://localhost:3001/api/computer/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: postBody,
        });
        data = await res.json();
      } catch {
        // Fallback for Node.js scripts when standalone
        if (typeof window === "undefined") {
          const modPath = "../../server/computer/tools/toolExecutor.js";
          const mod = await (Function("m", "return import(m)")(modPath));
          data = await mod.ToolExecutor.executeTool(tool, args);
        } else {
          data = { success: false, error: "Backend server unreachable." };
        }
      }
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
      if (!data.result?.verified) {
        const running = await ActionVerifier.verifyAppRunning(appCanonical);
        if (!running) {
          await ActionVerifier.sleep(500);
        }
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
    } else if (action === "restore") {
      if (!data.success || !data.result?.success) {
        const errorMsg = data.result?.message || data.result?.error || data.error || `Could not restore ${appDisplayName}.`;
        context.onProgress(errorMsg, "failed");
        return {
          success: false,
          message: errorMsg,
          error: data.result?.error || data.error,
        };
      }

      const successMsg = data.result?.message || `Restored ${appDisplayName} window.`;
      context.onProgress(successMsg, "completed");
      ComputerStateManager.update({
        active_app: appCanonical,
        last_action: `Restored ${appDisplayName}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: successMsg,
        data: data.result,
      };
    } else if (action === "switch_between") {
      if (!data.success || !data.result?.success) {
        const errorMsg = data.result?.message || data.result?.error || data.error || `Could not switch between ${appDisplayName} and ${extraArgs?.alternateApp}.`;
        context.onProgress(errorMsg, "failed");
        return {
          success: false,
          message: errorMsg,
          error: data.result?.error || data.error,
        };
      }

      const successMsg = data.result?.message || `Switched to ${data.result?.window?.title || appDisplayName}.`;
      context.onProgress(successMsg, "completed");
      ComputerStateManager.update({
        active_app: data.result?.window?.processName || appCanonical,
        last_action: `Switched between windows`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: successMsg,
        data: data.result,
      };
    } else {
      // Focus action: verify activation succeeded
      if (!data.success || !data.result?.success) {
        const errorMsg = data.result?.message || data.result?.error || data.error || `Could not switch to ${appDisplayName}.`;
        context.onProgress(errorMsg, "failed");
        return {
          success: false,
          message: errorMsg,
          error: data.result?.error || data.error,
        };
      }

      const successMsg = data.result?.message || `Switched to ${appDisplayName}.`;
      context.onProgress(successMsg, "completed");
      ComputerStateManager.update({
        active_app: appCanonical,
        last_action: `Switched to ${appDisplayName}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: successMsg,
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
