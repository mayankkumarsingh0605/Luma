import type { WorkflowContext, WorkflowResult } from "../types.js";

/**
 * Interface for target-specific browser search adapters.
 * Each adapter encapsulates site-specific search navigation, URL formulation, and verification.
 */
export interface SearchAdapter {
  target: string;
  displayName: string;
  open(context: WorkflowContext): Promise<WorkflowResult>;
  search(query: string, context: WorkflowContext): Promise<WorkflowResult>;
}
