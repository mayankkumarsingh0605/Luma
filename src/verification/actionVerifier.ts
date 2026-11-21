/**
 * LUMA Action Verifier
 *
 * Checks whether actions actually succeeded before declaring completion.
 * Implements a single safe retry if verification fails.
 */

export class ActionVerifier {
  /**
   * Helper sleep for async wait
   */
  static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Checks whether a target process is running.
   */
  static async verifyAppRunning(appName: string): Promise<boolean> {
    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "is_app_running",
          arguments: { app: appName },
        }),
      });
      const data = await res.json();
      return Boolean(data.success && data.result?.isRunning);
    } catch {
      return false;
    }
  }

  /**
   * Checks whether the active window matches or contains expected title/process.
   */
  static async verifyActiveWindow(expectedSnippet: string): Promise<boolean> {
    try {
      const res = await fetch("/api/computer/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "get_active_window",
          arguments: {},
        }),
      });
      const data = await res.json();
      if (!data.success || !data.result) return false;

      const title = (data.result.title || "").toLowerCase();
      const processName = (data.result.processName || "").toLowerCase();
      const target = expectedSnippet.toLowerCase();

      return title.includes(target) || processName.includes(target);
    } catch {
      return false;
    }
  }

  /**
   * Executes an action with verification and a single safe retry.
   */
  static async executeWithRetry<T>(
    actionName: string,
    executeFn: () => Promise<T>,
    verifyFn: () => Promise<boolean>,
    onRetry?: (message: string) => void,
    waitMs: number = 800
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    // Attempt 1
    const result = await executeFn();
    await this.sleep(waitMs);

    const verified = await verifyFn();
    if (verified) {
      return { success: true, result };
    }

    // Single retry if verification failed
    if (onRetry) {
      onRetry(`${actionName} didn't respond as expected. Retrying once...`);
    }

    await this.sleep(500);
    const retryResult = await executeFn();
    await this.sleep(waitMs);

    const retryVerified = await verifyFn();
    if (retryVerified) {
      return { success: true, result: retryResult };
    }

    return {
      success: false,
      error: `Verification failed for ${actionName} after retry.`,
      result: retryResult,
    };
  }
}
