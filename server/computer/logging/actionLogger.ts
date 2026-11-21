import type { ActionLogEntry } from "../types.js";

export class ActionLogger {
  private static maxEntries = 100;
  private static logs: ActionLogEntry[] = [];

  /**
   * Records a completed tool execution into the action history.
   */
  static logAction(entry: Omit<ActionLogEntry, "id" | "timestamp">): ActionLogEntry {
    const fullEntry: ActionLogEntry = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };

    this.logs.unshift(fullEntry);

    // Keep log length constrained to avoid memory leak
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(0, this.maxEntries);
    }

    // Format readable log for server console output
    const time = fullEntry.timestamp.split("T")[1].slice(0, 8);
    const statusIcon = fullEntry.status === "SUCCESS" ? "✓" : "✗";
    console.log(
      `[ActionLog] ${time} ${statusIcon} ${fullEntry.tool} (${fullEntry.durationMs}ms) - ` +
      `${fullEntry.status === "SUCCESS" ? JSON.stringify(fullEntry.result) : fullEntry.error}`
    );

    return fullEntry;
  }

  /**
   * Retrieves log entries, most recent first.
   */
  static getLogs(limit: number = 50): ActionLogEntry[] {
    return this.logs.slice(0, limit);
  }

  /**
   * Clears the log history.
   */
  static clearLogs(): void {
    this.logs = [];
  }

  /**
   * Retrieves the most recent action log entry.
   */
  static getLastAction(): ActionLogEntry | undefined {
    return this.logs[0];
  }
}
