import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { WindowsBridge } from "../native/windowsBridge.js";
import type {
  SystemInfo,
  ScreenInfo,
  MousePosition,
  ActiveWindowInfo,
} from "../types.js";

const execAsync = promisify(exec);

export class SystemController {
  /**
   * Retrieves operating system and host machine specifications.
   */
  static async getOsInfo(): Promise<SystemInfo> {
    return {
      platform: "Windows",
      osRelease: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      uptimeSeconds: Math.round(os.uptime()),
    };
  }

  /**
   * Retrieves the current primary display resolution.
   */
  static async getScreenSize(): Promise<ScreenInfo> {
    const bounds = await WindowsBridge.getScreenBounds();
    return {
      width: bounds.width,
      height: bounds.height,
      primary: true,
    };
  }

  /**
   * Retrieves current cursor position.
   */
  static async getMousePosition(): Promise<MousePosition> {
    return await WindowsBridge.getMousePosition();
  }

  /**
   * Retrieves metadata about the currently active foreground window.
   */
  static async getActiveWindow(): Promise<ActiveWindowInfo> {
    return await WindowsBridge.getActiveWindowInfo();
  }

  /**
   * Checks whether a specific process name is currently running.
   */
  static async isProcessRunning(
    processName: string
  ): Promise<{ isRunning: boolean; processName: string; count: number }> {
    if (!processName || typeof processName !== "string") {
      throw new Error("Process name is required.");
    }

    const clean = processName.endsWith(".exe") ? processName : `${processName}.exe`;
    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${clean}" /FO CSV /NH`);
      const lines = stdout.split(/\r?\n/).filter((l) => l.toLowerCase().includes(clean.toLowerCase()));

      return {
        isRunning: lines.length > 0,
        processName: clean,
        count: lines.length,
      };
    } catch {
      return {
        isRunning: false,
        processName: clean,
        count: 0,
      };
    }
  }

  /**
   * Captures the primary screen as a Base64-encoded image for LUMA visual monitoring.
   */
  static async takeScreenshot(): Promise<{
    dataUrl: string;
    width: number;
    height: number;
    timestamp: string;
    byteSize: number;
  }> {
    const shot = await WindowsBridge.captureScreenshot();
    const dataUrl = `data:image/jpeg;base64,${shot.base64}`;

    return {
      dataUrl,
      width: shot.width,
      height: shot.height,
      timestamp: new Date().toISOString(),
      byteSize: Math.round((shot.base64.length * 3) / 4),
    };
  }
}
