/**
 * Workflow Types & Contexts
 */

export type WorkflowStatus = "in-progress" | "completed" | "failed";

export type WorkflowProgressCallback = (message: string, status: WorkflowStatus) => void;

export interface WorkflowContext {
  commandId?: string;
  workflowId?: string;
  rawCommand?: string;
  onProgress: WorkflowProgressCallback;
  compactContext?: any;
}

export interface WorkflowResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}
