/**
 * LUMA Computer Agent State
 *
 * Maintains a lightweight, deterministic snapshot of current computer context,
 * active application, pending confirmation gates, and last actions.
 * Strictly non-LLM computer state.
 */

export interface PendingConfirmation {
  action: string;
  target: string;
  description: string;
  tool: string;
  args: Record<string, any>;
  timestamp: string;
}

export interface ComputerAgentState {
  active_app: string;
  active_window: string;
  current_url?: string;
  current_task?: string;
  current_workflow?: string;
  last_action?: string;
  last_action_status?: "success" | "failed" | "pending";
  pendingConfirmation?: PendingConfirmation | null;
}

const defaultState: ComputerAgentState = {
  active_app: "desktop",
  active_window: "Desktop",
  current_url: undefined,
  current_task: undefined,
  current_workflow: undefined,
  last_action: undefined,
  last_action_status: undefined,
  pendingConfirmation: null,
};

let currentState: ComputerAgentState = { ...defaultState };

export class ComputerStateManager {
  /**
   * Retrieves the current agent state snapshot.
   */
  static getState(): Readonly<ComputerAgentState> {
    return { ...currentState };
  }

  /**
   * Updates state with new partial data.
   */
  static update(partial: Partial<ComputerAgentState>): void {
    currentState = {
      ...currentState,
      ...partial,
    };
  }

  /**
   * Sets a pending confirmation gate for a destructive action.
   */
  static setPendingConfirmation(conf: PendingConfirmation | null): void {
    currentState.pendingConfirmation = conf;
  }

  /**
   * Retrieves the currently active pending confirmation, if any.
   */
  static getPendingConfirmation(): PendingConfirmation | null {
    return currentState.pendingConfirmation || null;
  }

  /**
   * Clears any active pending confirmation.
   */
  static clearPendingConfirmation(): void {
    currentState.pendingConfirmation = null;
  }

  /**
   * Polls system state from the backend (/api/computer/state) to update active window/process.
   */
  static async syncWithSystem(): Promise<void> {
    try {
      const res = await fetch("/api/computer/state");
      if (res.ok) {
        const data = await res.json();
        if (data.activeWindow) {
          this.update({
            active_window: data.activeWindow.title || currentState.active_window,
            active_app: data.activeWindow.processName || currentState.active_app,
          });
        }
      }
    } catch {
      // Ignore background sync errors
    }
  }

  /**
   * Infers the currently active or contextual website target based on URL or window title.
   */
  static getCurrentTarget(): string | undefined {
    const url = currentState.current_url?.toLowerCase() || "";
    const win = currentState.active_window?.toLowerCase() || "";

    if (url.includes("youtube.com") || url.includes("youtu.be") || win.includes("youtube")) {
      return "youtube";
    }
    if (url.includes("amazon.") || win.includes("amazon")) {
      return "amazon";
    }
    if (url.includes("flipkart.com") || win.includes("flipkart")) {
      return "flipkart";
    }
    return undefined;
  }

  /**
   * Resets state back to default.
   */
  static reset(): void {
    currentState = { ...defaultState };
  }
}
