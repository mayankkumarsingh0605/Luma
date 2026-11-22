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
      let data: any;
      if (typeof window === "undefined") {
        try {
          const res = await fetch("http://localhost:3001/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tool: pending.tool,
              arguments: pending.args,
            }),
          });
          data = await res.json();
        } catch {
          const modPath = "../../server/computer/tools/toolExecutor.js";
          const mod = await (Function("m", "return import(m)")(modPath));
          const execRes = await mod.ToolExecutor.executeTool(pending.tool, pending.args);
          data = { success: execRes.success, result: execRes.result, error: execRes.error };
        }
      } else {
        const res = await fetch("/api/computer/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: pending.tool,
            arguments: pending.args,
          }),
        });
        data = await res.json();
      }

      ComputerStateManager.clearPendingConfirmation();

      if (data.success) {
        let msg = data.result?.message;
        if (!msg) {
          if (data.result?.event && pending.tool === "calendar_create_event") {
            const e = data.result.event;
            const meet = e.hasMeetLink ? `\n🔗 Google Meet: ${e.meetUrl || e.htmlLink}` : "";
            msg = `Event created successfully: "${e.summary}" on ${e.formattedDate} at ${e.formattedTime}.${meet}`;
          } else if (data.result?.deletedEvent && pending.tool === "calendar_delete_event") {
            msg = `Event "${data.result.deletedEvent.summary}" deleted successfully from Google Calendar.`;
          } else if (data.result?.event && pending.tool === "calendar_update_event") {
            msg = `Event updated successfully: "${data.result.event.summary}" (${data.result.event.formattedDate} at ${data.result.event.formattedTime}).`;
          } else if (data.result?.event && pending.tool === "calendar_duplicate_event") {
            msg = `Event duplicated successfully: "${data.result.event.summary}" on ${data.result.event.formattedDate} at ${data.result.event.formattedTime}.`;
          }
        }
        return {
          success: true,
          message: msg || `Confirmed: "${pending.target}" executed successfully.`,
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
        message: `Error executing confirmed action: ${err?.message || "Unknown error"}`,
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

    let message = "Action cancelled.";
    if (pending) {
      if (pending.tool === "calendar_auth_logout") {
        message = "Calendar disconnection cancelled. Your Google Calendar remains connected.";
      } else if (pending.tool?.startsWith("calendar_") || pending.action?.toLowerCase().includes("calendar")) {
        message = "Calendar action cancelled. No changes were made to your Google Calendar.";
      } else {
        message = `Action cancelled. "${pending.target}" was not deleted.`;
      }
    }

    return {
      success: true,
      message,
    };
  }
}
