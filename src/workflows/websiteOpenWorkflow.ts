import { ActionVerifier } from "../verification/actionVerifier.js";
import { ComputerStateManager } from "../state/computerState.js";
import { BrowserAgent } from "../agent/browserAgent.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Deterministic Website Open Workflow
 * Uses controlled Chrome session to navigate the active tab without spawning extra windows.
 */
export async function executeWebsiteOpenWorkflow(
  url: string,
  displayName: string,
  context: WorkflowContext
): Promise<WorkflowResult> {
  context.onProgress(`Opening ${displayName}...`, "in-progress");

  try {
    // 1. Connect to or focus the controlled Chrome session
    await BrowserAgent.open_browser();

    // 2. Real in-browser tab navigation with verification
    const navRes = await BrowserAgent.navigate_to_url(url);

    if (!navRes.success) {
      context.onProgress(`Failed to open ${displayName}`, "failed");
      return {
        success: false,
        message: `Failed to open ${displayName}: ${navRes.message}`,
        error: navRes.message,
      };
    }

    await ActionVerifier.sleep(300);
    context.onProgress(`${displayName} opened successfully`, "completed");

    const verifiedUrl = navRes.url || url;
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: verifiedUrl,
      last_action: `Opened ${displayName}`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `${displayName} opened successfully.`,
      data: { url: verifiedUrl, displayName },
    };
  } catch (err: any) {
    context.onProgress(`Failed to open ${displayName}`, "failed");
    return {
      success: false,
      message: `Failed to open ${displayName}: ${err?.message || "Unknown error"}`,
      error: err?.message,
    };
  }
}
