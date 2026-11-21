import { ComputerStateManager } from "../state/computerState.js";
import { BrowserAgent } from "../agent/browserAgent.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Deterministic Media Control Workflow
 */
export async function executeMediaWorkflow(
  action: string,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const cleanAction = action.toLowerCase().trim();

  // 1. If play, pause, or resume, try direct browser in-tab video control first
  if (cleanAction === "pause" || cleanAction === "resume" || cleanAction === "play") {
    try {
      const browserRes = await BrowserAgent.control_playback(cleanAction as any);
      if (browserRes.success) {
        context.onProgress(browserRes.message, "completed");
        ComputerStateManager.update({
          last_action: browserRes.message,
          last_action_status: "success",
        });
        return {
          success: true,
          message: browserRes.message,
        };
      }
    } catch {
      // Non-fatal, fallback to system media key
    }
  }

  const labels: Record<string, string> = {
    play: "Starting media playback...",
    pause: "Pausing media...",
    play_pause: "Toggling media playback...",
    resume: "Resuming playback...",
    stop: "Stopping playback...",
    next: "Skipping to next track...",
    previous: "Returning to previous track...",
    volume_up: "Increasing volume...",
    volume_down: "Decreasing volume...",
    mute: "Toggling mute...",
  };

  context.onProgress(labels[cleanAction] || `Executing ${cleanAction}...`, "in-progress");

  try {
    const res = await fetch("/api/computer/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "media_control",
        arguments: { action: cleanAction },
      }),
    });

    const data = await res.json();
    if (data.success) {
      const finishMsg = data.result?.message || `Media action executed.`;
      context.onProgress(finishMsg, "completed");

      ComputerStateManager.update({
        last_action: finishMsg,
        last_action_status: "success",
      });

      return {
        success: true,
        message: finishMsg,
        data: data.result,
      };
    } else {
      context.onProgress(`Media command failed`, "failed");
      return {
        success: false,
        message: `Could not control media: ${data.error || "Execution error"}`,
        error: data.error,
      };
    }
  } catch (err: any) {
    context.onProgress(`Failed to communicate with system`, "failed");
    return {
      success: false,
      message: `Error controlling media: ${err?.message || "Unknown error"}`,
      error: err?.message,
    };
  }
}
