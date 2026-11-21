import { ComputerStateManager, type PendingConfirmation } from "../state/computerState.js";
import type { WorkflowResult } from "../workflows/types.js";

/**
 * LUMA Confirmation Manager
 *
 * Enforces safety gates for destructive and sensitive computer operations (file/folder deletion).
 */
export class ConfirmationManager {
  /**
   * Prepares a confirmation gate and returns the confirmation prompt.
   */
  static createConfirmationPrompt(
    target: string,
    action: string,
    tool: string,
    args: Record<string, any>
  ): { prompt: string; pending: PendingConfirmation } {
    const prompt = `You're asking me to delete "${target}". This action cannot be undone. Should I continue? (Reply 'yes' to proceed or 'no' to cancel)`;

    const pending: PendingConfirmation = {
      action,
      target,
      description: prompt,
      tool,
      args,
      timestamp: new Date().toISOString(),
    };

    ComputerStateManager.setPendingConfirmation(pending);
    return { prompt, pending };
  }

  /**
   * Executes the pending confirmed action.
   */
  static async executePending(): Promise<WorkflowResult> {
    const pending = ComputerStateManager.getPendingConfirmation();
    if (!pending) {
      return {
        success: false,
        message: "No pending action was awaiting confirmation.",
      };
    }

    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: pending.tool,
          arguments: pending.args,
        }),
      });

      const data = await res.json();
      ComputerStateManager.clearPendingConfirmation();

      if (data.success) {
        return {
          success: true,
          message: data.result?.message || `Confirmed: "${pending.target}" deleted successfully.`,
          data: data.result,
        };
      } else {
        return {
          success: false,
          message: `Failed to execute: ${data.error || "Execution error"}`,
          error: data.error,
        };
      }
    } catch (err: any) {
      ComputerStateManager.clearPendingConfirmation();
      return {
        success: false,
        message: `Network error executing confirmed action: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }

  /**
   * Cancels the pending action safely.
   */
  static cancelPending(): WorkflowResult {
    const pending = ComputerStateManager.getPendingConfirmation();
    ComputerStateManager.clearPendingConfirmation();

    return {
      success: true,
      message: pending
        ? `Action cancelled. "${pending.target}" was not deleted.`
        : "Action cancelled.",
    };
  }
}
