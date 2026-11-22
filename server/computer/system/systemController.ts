import os from "os";
import {
  WindowsBridge,
  type VisibleWindow,
  type RunningProcessItem,
  type InstalledAppItem,
} from "../native/windowsBridge.js";
import type {
  SystemInfo,
  ScreenInfo,
  MousePosition,
  ActiveWindowInfo,
} from "../types.js";

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
   * Enumerates all visible application windows on the desktop.
   */
  static async getVisibleWindows(): Promise<VisibleWindow[]> {
    return await WindowsBridge.getVisibleWindows();
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
    const cleanProc = clean.replace(/\.exe$/i, "");
    try {
      const res = await WindowsBridge.runPowerShell(
        `@(Get-Process -Name "${cleanProc}" -ErrorAction SilentlyContinue).Count`
      );
      const count = parseInt(res.trim(), 10) || 0;

      return {
        isRunning: count > 0,
        processName: clean,
        count,
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
   * Enumerates running background processes (or all/visible processes).
   */
  static async getRunningProcesses(
    filter: "all" | "background" | "visible" = "background"
  ): Promise<RunningProcessItem[]> {
    return await WindowsBridge.getRunningProcesses(filter);
  }

  /**
   * Discovers installed applications on the Windows system.
   */
  static async getInstalledApps(): Promise<InstalledAppItem[]> {
    return await WindowsBridge.getInstalledApplications();
  }

  /**
   * Searches installed applications for a matching application name or publisher.
   */
  static async findInstalledApp(query: string): Promise<{
    found: boolean;
    query: string;
    matches: InstalledAppItem[];
    message: string;
  }> {
    const apps = await WindowsBridge.getInstalledApplications();
    const qLower = query.toLowerCase().trim();
    const matches = apps.filter((a) => {
      const name = (a.displayName || a.name || "").toLowerCase();
      const pub = (a.publisher || "").toLowerCase();
      return name.includes(qLower) || pub.includes(qLower);
    });

    if (matches.length > 0) {
      const best = matches[0];
      const ver = best.version ? ` (v${best.version})` : "";
      const pub = best.publisher ? ` by ${best.publisher}` : "";
      const msg = `Found installed application: ${best.displayName}${ver}${pub} [${best.type}].`;
      return { found: true, query, matches, message: msg };
    }

    return {
      found: false,
      query,
      matches: [],
      message: `No installed application found matching "${query}".`,
    };
  }

  /**
   * Searches running processes for a process name or executable.
   */
  static async findProcess(query: string): Promise<{
    found: boolean;
    query: string;
    matches: RunningProcessItem[];
    message: string;
  }> {
    const procs = await WindowsBridge.getRunningProcesses("all");
    const qLower = query.toLowerCase().trim();
    const qClean = qLower.replace(/\.exe$/i, "");

    const matches = procs.filter((p) => {
      const pName = p.name.toLowerCase();
      const pClean = pName.replace(/\.exe$/i, "");
      return pClean === qClean || pName === qLower || pClean.includes(qClean);
    });

    if (matches.length > 0) {
      const lines = matches.map((m) => {
        const type = m.hasWindow ? "Visible Window" : "Background";
        const mem = m.memoryMB ? `, Memory: ${m.memoryMB} MB` : "";
        return `• ${m.name} (PID: ${m.pid}${mem}) [${type}]`;
      });
      const msg = `Found ${matches.length} running process(es) matching "${query}":\n` + lines.join("\n");
      return { found: true, query, matches, message: msg };
    }

    return {
      found: false,
      query,
      matches: [],
      message: `No running process found matching "${query}".`,
    };
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

  /**
   * Opens a web URL in the user's default browser as an independent detached process.
   */
  static async openUrl(url: string): Promise<{ success: boolean; error?: string }> {
    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return { success: false, error: "Invalid URL provided." };
    }

    if (process.env.NODE_ENV === "test") {
      return { success: true };
    }

    try {
      // Primary: WindowsBridge.runPowerShell with Start-Process
      const script = `$url = ${JSON.stringify(url)}; Start-Process $url;`;
      await WindowsBridge.runPowerShell(script);
      return { success: true };
    } catch (psErr: any) {
      try {
        const { spawn } = await import("child_process");
        const child = spawn("cmd.exe", ["/c", "start", "", url], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        return { success: true };
      } catch (cmdErr: any) {
        return {
          success: false,
          error: psErr?.message || cmdErr?.message || "Failed to open URL in default browser.",
        };
      }
    }
  }
}
