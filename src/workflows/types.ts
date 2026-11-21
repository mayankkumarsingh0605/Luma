/**
 * Workflow Types & Contexts
 */

export type WorkflowStatus = "in-progress" | "completed" | "failed";

export type WorkflowProgressCallback = (message: string, status: WorkflowStatus) => void;

export interface WorkflowContext {
  commandId: string;
  rawCommand: string;
  onProgress: WorkflowProgressCallback;
}

export interface WorkflowResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}
