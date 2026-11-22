import type { TaskPlan } from "../agent/agentTypes.js";

export type CommandStatus = "idle" | "processing" | "completed" | "failed";

export interface ActivityEvent {
  id: string;
  timestamp: string;
  message: string;
  status: "pending" | "in-progress" | "completed" | "failed";
}

export interface RouterDebugInfo {
  rawCommand: string;
  normalizedCommand: string;
  matchedRule?: string;
  matchedIntent: string;
  arguments: Record<string, any>;
  tool?: string;
  result?: "success" | "failure" | "unsupported" | "validation_failed";
}

export interface UserCommand {
  id: string;
  text: string;
  timestamp: string;
  status: CommandStatus;
  response?: string;
  activities?: ActivityEvent[];
  debugInfo?: RouterDebugInfo;
  taskPlan?: TaskPlan;
  error?: string;
  data?: any;
}
