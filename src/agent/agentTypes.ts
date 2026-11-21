/**
 * LUMA Computer Agent Types & State Structures
 */

export type AgentTaskStatus = "idle" | "running" | "completed" | "failed" | "stopped";

export type StepStatus = "pending" | "running" | "success" | "failed" | "retrying";

export type StepActionType =
  | "open_app"
  | "navigate"
  | "search_input"
  | "wait_results"
  | "open_first_result"
  | "extract_price"
  | "report_result"
  | "generic";

export interface TaskStep {
  step: number;
  goal: string;
  status: StepStatus;
  actionType: StepActionType;
  params?: Record<string, any>;
  resultMessage?: string;
  error?: string;
  durationMs?: number;
}

export interface FinalTaskResult {
  productTitle?: string;
  price?: string;
  currency?: string;
  url?: string;
  summary?: string;
}

export interface TaskPlan {
  id: string;
  goal: string;
  steps: TaskStep[];
  createdAt: string;
  currentAction?: string;
  finalResult?: FinalTaskResult;
}

export interface AgentState {
  task_id: string;
  user_goal: string;
  current_step: number;
  total_steps: number;
  step_goal: string;
  status: AgentTaskStatus;

  active_app: string | null;
  active_window: string | null;
  current_url: string | null;

  last_action: string | null;
  last_action_status: "success" | "failed" | null;

  observation: Record<string, any> | null;
  retry_count: number;
}
