import type { UserCommand, ActivityEvent, RouterDebugInfo } from "../types/command.js";
import { routeCommand } from "../router/commandRouter.js";
import { WorkflowEngine } from "../workflows/workflowEngine.js";
import type { WorkflowContext, WorkflowStatus } from "../workflows/types.js";
import { TaskPlanner } from "../agent/taskPlanner.js";
import { AgentExecutionLoop } from "../agent/agentExecutionLoop.js";
import { ComputerStateManager } from "../state/computerState.js";
import { AgentStateManager } from "../agent/agentStateManager.js";

/**
 * ============================================================================
 * LUMA Command Handler (General Desktop Agent)
 * ============================================================================
 *
 * Architecture Flow:
 *   User Command
 *        ↓
 *   Autonomous Agent Goal Check (Multi-step Browser / Complex Goal)
 *        ↓ [If Agent Goal]
 *   Task Planner (Decomposes into ordered TaskSteps)
 *        ↓
 *   Agent Execution Loop (Plan -> Act -> Observe -> Verify -> Next Step)
 *        ↓ [Otherwise]
 *   Normalizer & Compound Goal Router
 *        ↓
 *   Workflow Selection (Browser Search, Website, App, File, Media, System)
 *        ↓
 *   Existing Tool Executor & Bridge
 *        ↓
 *   Action Verifier & Single Safe Retry
 *        ↓
 *   Report Clean Result & Telemetry
 *
 * Zero external LLM calls for deterministic computer control.
 */

export async function processUserCommand(
  text: string,
  onUpdate?: (updatedCommand: UserCommand) => void
): Promise<UserCommand> {
  // Reset task-specific context to ensure zero context leakage between commands
  ComputerStateManager.update({
    current_url: undefined,
    current_task: undefined,
    current_workflow: undefined,
    last_action: undefined,
    last_action_status: undefined,
  });
  AgentStateManager.reset();

  const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const activities: ActivityEvent[] = [
    {
      id: `act_${Date.now()}_start`,
      timestamp: timeString,
      message: "Command received",
      status: "completed",
    },
  ];

  let currentCommand: UserCommand = {
    id: commandId,
    text,
    timestamp: timeString,
    status: "processing",
    response: "Understanding command...",
    activities: [...activities],
  };

  if (onUpdate) {
    onUpdate({ ...currentCommand });
  }

  // 1. Check if user command is a multi-step autonomous agent goal
  if (TaskPlanner.isAgentGoal(text)) {
    const plan = TaskPlanner.planTask(text);
    currentCommand = {
      ...currentCommand,
      response: `Executing autonomous plan: ${plan.goal}`,
      taskPlan: plan,
    };
    if (onUpdate) onUpdate({ ...currentCommand });

    // Real-time synchronization of step updates to UI
    const unsubscribe = AgentStateManager.subscribe((_state, updatedPlan) => {
      if (updatedPlan) {
        currentCommand = {
          ...currentCommand,
          response: updatedPlan.currentAction || currentCommand.response,
          taskPlan: { ...updatedPlan },
        };
        if (onUpdate) onUpdate({ ...currentCommand });
      }
    });

    try {
      const loopResult = await AgentExecutionLoop.run(plan);
      unsubscribe();

      const finalPlan = loopResult.plan || AgentStateManager.getPlan() || plan;
      currentCommand = {
        ...currentCommand,
        status: loopResult.success ? "completed" : "failed",
        response: loopResult.message,
        taskPlan: finalPlan,
        error: loopResult.error,
      };
      if (onUpdate) onUpdate({ ...currentCommand });
      return currentCommand;
    } catch (loopErr: any) {
      unsubscribe();
      currentCommand = {
        ...currentCommand,
        status: "failed",
        response: loopErr?.message || "Autonomous execution encountered an error",
        error: loopErr?.message,
      };
      if (onUpdate) onUpdate({ ...currentCommand });
      return currentCommand;
    }
  }

  // 2. Otherwise route the command locally (Normalizer -> Intent Detection)
  const routed = routeCommand(text);

  // 2. Check for Validation Error
  if (routed.validationError) {
    const valTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    activities.push({
      id: `act_${Date.now()}_val_err`,
      timestamp: valTime,
      message: routed.validationError,
      status: "failed",
    });

    const debugInfo: RouterDebugInfo = {
      rawCommand: text,
      normalizedCommand: routed.normalizedCommand,
      matchedRule: routed.matchedRule,
      matchedIntent: routed.intent,
      arguments: routed.arguments,
      tool: routed.toolToExecute || "none",
      result: "validation_failed",
    };

    currentCommand = {
      ...currentCommand,
      status: "failed",
      response: routed.validationError,
      activities: [...activities],
      debugInfo,
      error: routed.validationError,
    };

    if (onUpdate) onUpdate({ ...currentCommand });
    return currentCommand;
  }

  // 3. Set up Workflow Context with real-time activity updates
  const workflowContext: WorkflowContext = {
    commandId,
    rawCommand: text,
    onProgress: (stepMessage: string, stepStatus: WorkflowStatus) => {
      const stepTime = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      // Update existing in-progress activity or append new one
      const existingInProgressIdx = activities.findIndex((a) => a.status === "in-progress");
      if (existingInProgressIdx !== -1 && stepStatus !== "in-progress") {
        activities[existingInProgressIdx] = {
          ...activities[existingInProgressIdx],
          status: stepStatus,
          message: stepMessage,
          timestamp: stepTime,
        };
      } else {
        // Mark any previous in-progress as completed
        for (let i = 0; i < activities.length; i++) {
          if (activities[i].status === "in-progress") {
            activities[i].status = "completed";
          }
        }

        activities.push({
          id: `act_${Date.now()}_${activities.length}`,
          timestamp: stepTime,
          message: stepMessage,
          status: stepStatus,
        });
      }

      currentCommand = {
        ...currentCommand,
        response: stepMessage,
        activities: [...activities],
      };

      if (onUpdate) onUpdate({ ...currentCommand });
    },
  };

  // 4. Dispatch through WorkflowEngine
  try {
    const result = await WorkflowEngine.execute(routed, workflowContext);

    // Finalize activities (ensure no dangling in-progress)
    const finalActivities = activities.map((a) =>
      a.status === "in-progress"
        ? { ...a, status: (result.success ? "completed" : "failed") as "completed" | "failed" }
        : a
    );

    const debugInfo: RouterDebugInfo = {
      rawCommand: text,
      normalizedCommand: routed.normalizedCommand,
      matchedRule: routed.matchedRule,
      matchedIntent: routed.intent,
      arguments: routed.arguments,
      tool: routed.toolToExecute || "workflow",
      result: result.success ? "success" : "failure",
    };

    currentCommand = {
      ...currentCommand,
      status: result.success ? "completed" : "failed",
      response: result.message,
      activities: finalActivities,
      debugInfo,
      error: result.error,
    };

    if (onUpdate) onUpdate({ ...currentCommand });
    return currentCommand;
  } catch (err: any) {
    const errorTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    activities.push({
      id: `act_${Date.now()}_fatal_err`,
      timestamp: errorTime,
      message: err?.message || "Unexpected execution error",
      status: "failed",
    });

    currentCommand = {
      ...currentCommand,
      status: "failed",
      response: "An error occurred while processing your request.",
      activities: [...activities],
      error: err?.message || "Unknown error",
      debugInfo: {
        rawCommand: text,
        normalizedCommand: routed.normalizedCommand,
        matchedRule: routed.matchedRule,
        matchedIntent: routed.intent,
        arguments: routed.arguments,
        result: "failure",
      },
    };

    if (onUpdate) onUpdate({ ...currentCommand });
    return currentCommand;
  }
}
