import { ConfirmationManager } from "../confirmation/confirmationManager.js";
import { ComputerStateManager } from "../state/computerState.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * Deterministic File & Folder Operations Workflow
 */
export async function executeFileWorkflow(
  action: "open_folder" | "open_file" | "create_folder" | "delete",
  target: string,
  context: WorkflowContext,
  confirmed: boolean = false
): Promise<WorkflowResult> {
  const cleanTarget = target.trim();

  // 1. Safe Delete Confirmation Check
  if (action === "delete") {
    if (!confirmed) {
      const { prompt } = ConfirmationManager.createConfirmationPrompt(
        cleanTarget,
        "delete",
        "delete_path",
        { path: cleanTarget }
      );

      context.onProgress(`Confirmation requested for deleting "${cleanTarget}"`, "completed");
      return {
        success: true,
        message: prompt,
        data: { requiresConfirmation: true },
      };
    } else {
      return await ConfirmationManager.executePending();
    }
  }

  // 2. Create Folder
  if (action === "create_folder") {
    context.onProgress(`Creating folder "${cleanTarget}"...`, "in-progress");

    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "create_folder",
          arguments: { folder: cleanTarget },
        }),
      });

      const data = await res.json();
      if (data.success) {
        context.onProgress(`Folder "${cleanTarget}" created`, "completed");
        ComputerStateManager.update({
          last_action: `Created folder "${cleanTarget}"`,
          last_action_status: "success",
        });
        return {
          success: true,
          message: data.result?.message || `Folder "${cleanTarget}" created successfully.`,
          data: data.result,
        };
      } else {
        context.onProgress(`Could not create folder`, "failed");
        return {
          success: false,
          message: `Failed to create folder: ${data.error || "Execution error"}`,
          error: data.error,
        };
      }
    } catch (err: any) {
      context.onProgress(`Failed to communicate with system`, "failed");
      return {
        success: false,
        message: `Error creating folder: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }

  // 3. Open Folder / Open File
  const label = action === "open_folder" ? `folder "${cleanTarget}"` : `file "${cleanTarget}"`;
  context.onProgress(`Opening ${label}...`, "in-progress");

  try {
    const res = await fetch("/api/computer/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "open_path",
        arguments: { path: cleanTarget },
      }),
    });

    const data = await res.json();
    if (data.success) {
      context.onProgress(`Opened ${label}`, "completed");
      ComputerStateManager.update({
        last_action: `Opened ${label}`,
        last_action_status: "success",
      });
      return {
        success: true,
        message: data.result?.message || `Opened ${label} successfully.`,
        data: data.result,
      };
    } else {
      context.onProgress(`Could not find or open ${label}`, "failed");
      return {
        success: false,
        message: `I couldn't find or open ${label}.`,
        error: data.error,
      };
    }
  } catch (err: any) {
    context.onProgress(`Failed to communicate with system`, "failed");
    return {
      success: false,
      message: `Error opening ${label}: ${err?.message || "Unknown error"}`,
      error: err?.message,
    };
  }
}
