import { ActiveWindowObserver } from "./activeWindowObserver.js";
import { ProcessObserver } from "./processObserver.js";
import { BrowserObserver } from "./browserObserver.js";
import { ScreenObserver } from "./screenObserver.js";
import type {
  ComputerObservationResult,
  ObservationStatus,
  WindowsObservation,
  BrowserObservation,
  ScreenObservation,
} from "./models.js";

export interface ObserveOptions {
  testScreenshot?: boolean;
}

/**
 * ObservationManager
 * Central coordinator that gathers, isolates, and combines read-only computer observations.
 */
export class ObservationManager {
  /**
   * Observe complete computer state safely without mutating or taking control of any window.
   */
  static async observeComputerState(
    options: ObserveOptions = {}
  ): Promise<ComputerObservationResult> {
    const timestamp = new Date().toISOString();
    const errors: string[] = [];

    // Run ProcessObserver, ActiveWindowObserver, and ScreenObserver concurrently
    const [processResult, windowResult, screenResult] = await Promise.allSettled([
      ProcessObserver.observe(),
      ActiveWindowObserver.observe(),
      ScreenObserver.observe(Boolean(options.testScreenshot)),
    ]);

    // 1. Process Observation
    let chromeRunning = false;
    if (processResult.status === "fulfilled") {
      if (processResult.value.error) {
        errors.push(processResult.value.error);
      }
      chromeRunning = processResult.value.observation.chrome_running;
    } else {
      errors.push(`Process observer failed: ${processResult.reason?.message || "Unknown error"}`);
    }

    // 2. Active Window Observation
    let windowsObs: WindowsObservation;
    if (windowResult.status === "fulfilled") {
      windowsObs = windowResult.value.observation;
      if (windowResult.value.error) {
        errors.push(windowResult.value.error);
      }
    } else {
      errors.push(`Active window observer failed: ${windowResult.reason?.message || "Unknown error"}`);
      windowsObs = {
        active_window: null,
        process_name: null,
        process_id: null,
        window_available: false,
        hwnd: null,
        visibility: "unknown",
      };
    }

    // 3. Browser Observation (depends on whether Chrome process is running)
    let browserObs: BrowserObservation;
    try {
      const browserRes = await BrowserObserver.observe(chromeRunning);
      browserObs = browserRes.observation;
      if (browserRes.error) {
        errors.push(browserRes.error);
      }
    } catch (err: any) {
      errors.push(`Browser observer failed: ${err?.message || "Unknown error"}`);
      browserObs = {
        running: chromeRunning,
        connected: false,
        current_url: null,
        page_title: null,
        page_status: "UNAVAILABLE",
      };
    }

    // 4. Screen Observation
    let screenObs: ScreenObservation;
    if (screenResult.status === "fulfilled") {
      screenObs = screenResult.value.observation;
      if (screenResult.value.error) {
        errors.push(screenResult.value.error);
      }
    } else {
      errors.push(`Screen observer failed: ${screenResult.reason?.message || "Unknown error"}`);
      screenObs = {
        available: false,
        width: null,
        height: null,
        screenshot_available: false,
      };
    }

    // 5. Determine Overall Observation Status
    const status = this.determineOverallStatus(windowsObs, browserObs, screenObs, errors);

    return {
      timestamp,
      windows: windowsObs,
      browser: browserObs,
      screen: screenObs,
      observation_status: status,
      errors,
    };
  }

  /**
   * Computes the aggregated observation status:
   * - UNAVAILABLE: Both windows and screen could not be observed.
   * - ERROR: Catastrophic failure across all components.
   * - PARTIAL: Chrome running but browser inspection is unavailable, or some observer produced an error.
   * - SUCCESS: Full observation succeeded cleanly.
   */
  private static determineOverallStatus(
    windows: WindowsObservation,
    browser: BrowserObservation,
    screen: ScreenObservation,
    errors: string[]
  ): ObservationStatus {
    if (!windows.window_available && !screen.available) {
      return "UNAVAILABLE";
    }

    // If Chrome is running but browser connection is unavailable, it is PARTIAL by definition
    if (browser.running && !browser.connected) {
      return "PARTIAL";
    }

    if (errors.length > 0) {
      return "PARTIAL";
    }

    if (windows.window_available && screen.available) {
      return "SUCCESS";
    }

    return "PARTIAL";
  }
}
