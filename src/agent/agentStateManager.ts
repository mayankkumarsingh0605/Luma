import type { AgentState, TaskPlan, TaskStep, FinalTaskResult } from "./agentTypes.js";

type StateListener = (state: AgentState, plan: TaskPlan | null) => void;

const initialAgentState: AgentState = {
  task_id: "",
  user_goal: "",
  current_step: 0,
  total_steps: 0,
  step_goal: "",
  status: "idle",
  active_app: null,
  active_window: null,
  current_url: null,
  last_action: null,
  last_action_status: null,
  observation: null,
  retry_count: 0,
};

export class AgentStateManager {
  private static currentState: AgentState = { ...initialAgentState };
  private static currentPlan: TaskPlan | null = null;
  private static listeners: Set<StateListener> = new Set();
  private static abortController: AbortController | null = null;

  static getState(): Readonly<AgentState> {
    return { ...this.currentState };
  }

  static getPlan(): Readonly<TaskPlan> | null {
    return this.currentPlan ? { ...this.currentPlan } : null;
  }

  static subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    // Emit initial snapshot
    listener(this.getState(), this.getPlan());
    return () => this.listeners.delete(listener);
  }

  private static notify(): void {
    const s = this.getState();
    const p = this.getPlan();
    for (const listener of this.listeners) {
      try {
        listener(s, p);
      } catch (err) {
        console.error("[AgentStateManager Listener Error]:", err);
      }
    }
  }

  static initTask(plan: TaskPlan): AbortSignal {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.currentPlan = { ...plan };
    this.currentState = {
      task_id: plan.id,
      user_goal: plan.goal,
      current_step: 1,
      total_steps: plan.steps.length,
      step_goal: plan.steps[0]?.goal || "",
      status: "running",
      active_app: null,
      active_window: null,
      current_url: null,
      last_action: "Starting task execution",
      last_action_status: "success",
      observation: null,
      retry_count: 0,
    };

    this.notify();
    return this.abortController.signal;
  }

  static setCurrentAction(actionText: string): void {
    if (this.currentPlan) {
      this.currentPlan.currentAction = actionText;
    }
    this.currentState.last_action = actionText;
    this.notify();
  }

  static updateStep(stepNumber: number, partial: Partial<TaskStep>): void {
    if (this.currentPlan) {
      const stepIdx = this.currentPlan.steps.findIndex((s) => s.step === stepNumber);
      if (stepIdx !== -1) {
        this.currentPlan.steps[stepIdx] = {
          ...this.currentPlan.steps[stepIdx],
          ...partial,
        };
      }
    }
    this.notify();
  }

  static updateState(partial: Partial<AgentState>): void {
    this.currentState = {
      ...this.currentState,
      ...partial,
    };
    this.notify();
  }

  static setObservation(obs: Record<string, any>): void {
    this.currentState.observation = {
      ...(this.currentState.observation || {}),
      ...obs,
    };
    this.notify();
  }

  static setFinalResult(result: FinalTaskResult): void {
    if (this.currentPlan) {
      this.currentPlan.finalResult = result;
      this.currentPlan.currentAction = undefined;
    }
    this.currentState.status = "completed";
    this.notify();
  }

  static stopTask(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentState.status = "stopped";
    this.currentState.last_action = "Task stopped by user";
    this.currentState.last_action_status = "failed";
    if (this.currentPlan) {
      this.currentPlan.currentAction = "Task stopped by user";
      // Mark any running step as failed
      for (const step of this.currentPlan.steps) {
        if (step.status === "running") {
          step.status = "failed";
          step.error = "Stopped by user";
        }
      }
    }
    this.notify();
  }

  static isStopRequested(): boolean {
    return this.abortController?.signal.aborted || this.currentState.status === "stopped";
  }

  static reset(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentState = { ...initialAgentState };
    this.currentPlan = null;
    this.notify();
  }
}
