import { WindowsBridge } from "../computer/native/windowsBridge.js";
import type { ScreenObservation } from "./models.js";

/**
 * ScreenObserver
 * Observes primary screen dimensions and screenshot capture capability.
 *
 * Rules:
 * - Does NOT continuously capture screenshots.
 * - Test capture occurs only when explicitly requested.
 * - Captures errors gracefully without crashing the observation engine.
 */
export class ScreenObserver {
  private static readonly TIMEOUT_MS = 3000;

  /**
   * Observe screen metrics and screenshot availability.
   *
   * @param testScreenshot - If true, performs a test capture to verify screenshot pipeline.
   */
  static async observe(
    testScreenshot: boolean = false
  ): Promise<{ observation: ScreenObservation; error?: string }> {
    try {
      const result = await Promise.race([
        this.fetchScreen(testScreenshot),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Screen observer timed out")), this.TIMEOUT_MS)
        ),
      ]);

      return { observation: result };
    } catch (err: any) {
      const errorMsg = `ScreenObserver error: ${err?.message || "Unknown error"}`;
      return {
        observation: {
          available: false,
          width: null,
          height: null,
          screenshot_available: false,
          error: errorMsg,
        },
        error: errorMsg,
      };
    }
  }

  private static async fetchScreen(testScreenshot: boolean): Promise<ScreenObservation> {
    let width: number | null = null;
    let height: number | null = null;
    let screenshotAvailable = false;
    let captureError: string | null = null;

    // 1. Retrieve screen dimensions
    try {
      const bounds = await WindowsBridge.getScreenBounds();
      if (bounds && typeof bounds.width === "number" && bounds.width > 0) {
        width = bounds.width;
        height = bounds.height;
      }
    } catch (err: any) {
      captureError = `Could not get screen bounds: ${err?.message || "Unknown"}`;
    }

    // 2. Determine screenshot availability
    if (testScreenshot) {
      // Actively verify by performing a test capture
      try {
        const shot = await WindowsBridge.captureScreenshot();
        if (shot && typeof shot.base64 === "string" && shot.base64.length > 0) {
          screenshotAvailable = true;
          if (!width) width = shot.width;
          if (!height) height = shot.height;
        } else {
          screenshotAvailable = false;
          captureError = "Screenshot returned empty data.";
        }
      } catch (err: any) {
        screenshotAvailable = false;
        captureError = `Screenshot capture failed: ${err?.message || "Unknown"}`;
      }
    } else {
      // Passive check: if screen bounds are accessible on Windows, GDI+ capture capability is available
      screenshotAvailable = Boolean(width && height && width > 0 && height > 0);
    }

    return {
      available: Boolean(width && height && width > 0 && height > 0),
      width,
      height,
      screenshot_available: screenshotAvailable,
      error: captureError,
    };
  }
}
