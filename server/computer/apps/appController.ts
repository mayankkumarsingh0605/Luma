import { spawn, exec } from "child_process";
import { promisify } from "util";
import { AppRegistry } from "./appRegistry.js";
import { WindowsBridge, type VisibleWindow } from "../native/windowsBridge.js";
import type { AppDefinition } from "../types.js";

const execAsync = promisify(exec);

export class AppController {
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Opens or launches an application by its name or alias.
   * Dynamically resolves packaged UWP apps and Win32 applications,
   * launches via protocol, AUMID, or binary, and verifies that the window actually appears.
   */
  static async openApp(
    appName: string,
    additionalArgs: string[] = []
  ): Promise<{
    message: string;
    app: AppDefinition;
    launchTarget: string;
    verified: boolean;
    window?: VisibleWindow;
  }> {
    if (!appName || typeof appName !== "string" || !appName.trim()) {
      throw new Error("Application name is required.");
    }

    const app = await AppRegistry.findAppAsync(appName);
    if (!app) {
      const available = AppRegistry.getAllApps()
        .map((a) => a.displayName)
        .join(", ");
      throw new Error(
        `Application '${appName}' was not found. Supported and installed applications include: ${available}.`
      );
    }

    const target = await AppRegistry.resolveLaunchTarget(app);
    const launchArgs = [...(app.arguments || []), ...additionalArgs];

    try {
      if (target.type === "protocol") {
        // Launch protocol URL (e.g. ms-paint:, ms-clock:, calculator:)
        const child = spawn("cmd.exe", ["/c", "start", "", target.target], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      } else if (target.type === "aumid") {
        // Launch modern packaged app via explorer shell:AppsFolder\<AppID>
        const child = spawn("cmd.exe", ["/c", "start", "", target.target], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      } else if (target.type === "file") {
        // Direct executable spawn
        const child = spawn(target.target, launchArgs, {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        child.unref();
      } else {
        // Command in PATH or shell
        const child = spawn("cmd.exe", ["/c", "start", "", target.target, ...launchArgs], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
      }
    } catch (err: any) {
      throw new Error(
        `Failed to launch ${app.displayName}: ${err?.message || "Unknown launch error"}`
      );
    }

    // Launch Verification: Poll visible windows for up to 3500ms
    const expectedTokens = [
      app.displayName.toLowerCase(),
      app.name.toLowerCase(),
      ...(target.processNames || []).map((p) => p.toLowerCase()),
      app.executableName.replace(".exe", "").toLowerCase(),
    ];

    let verifiedWindow: VisibleWindow | undefined;
    const maxPollMs = 3500;
    const pollIntervalMs = 350;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollMs) {
      await this.sleep(pollIntervalMs);

      try {
        const visibleWindows = await WindowsBridge.getVisibleWindows();
        const matched = visibleWindows.find((w) => {
          const tLower = w.title.toLowerCase();
          const pLower = w.processName.toLowerCase();
          return expectedTokens.some((tok) => tok && (tLower.includes(tok) || pLower.includes(tok)));
        });

        if (matched) {
          verifiedWindow = matched;
          break;
        }

        // Also check active window
        const active = await WindowsBridge.getActiveWindowInfo();
        if (active) {
          const tLower = (active.title || "").toLowerCase();
          const pLower = (active.processName || "").toLowerCase();
          if (expectedTokens.some((tok) => tok && (tLower.includes(tok) || pLower.includes(tok)))) {
            verifiedWindow = {
              hwnd: active.hwnd,
              title: active.title,
              processName: active.processName,
              processId: active.processId,
              isForeground: true,
              isMinimized: false,
            };
            break;
          }
        }
      } catch {
        // Ignore polling errors
      }
    }

    if (verifiedWindow) {
      return {
        message: `${app.displayName} opened successfully.`,
        app,
        launchTarget: target.target,
        verified: true,
        window: verifiedWindow,
      };
    }

    // Process check fallback if window takes longer to render
    const runningStatus = await this.isAppRunning(app.name);
    if (runningStatus.isRunning) {
      return {
        message: `${app.displayName} opened successfully.`,
        app,
        launchTarget: target.target,
        verified: true,
      };
    }

    // If neither window nor process appeared, do not report false success
    throw new Error(
      `Failed to verify launch: ${app.displayName} did not open or present a visible window within timeout.`
    );
  }

  /**
   * Closes an application safely.
   * Uses Win32 WM_CLOSE targeted message first (safely closing UWP without killing ApplicationFrameHost).
   * Falls back to taskkill only for dedicated Win32 processes.
   */
  static async closeApp(
    appName: string,
    force: boolean = true
  ): Promise<{ message: string; processName: string }> {
    if (!appName) {
      throw new Error("Application name is required.");
    }

    const app = await AppRegistry.findAppAsync(appName);
    const displayName = app ? app.displayName : appName;
    const targetMatch = app ? (app.displayName || app.name) : appName;

    // 1. First attempt: Safe Win32 WM_CLOSE message to the specific application window
    try {
      const closeRes = await WindowsBridge.closeWindow(targetMatch);
      if (closeRes.success) {
        return {
          message: `${displayName} was closed successfully.`,
          processName: app ? app.executableName : `${appName}.exe`,
        };
      }
    } catch {
      // Proceed to fallback
    }

    // 2. If app is a UWP / ApplicationFrameHost app, do NOT taskkill ApplicationFrameHost
    const procName = app ? app.executableName : (appName.endsWith(".exe") ? appName : `${appName}.exe`);
    if (procName.toLowerCase().includes("applicationframehost")) {
      return {
        message: `${displayName} was closed.`,
        processName: procName,
      };
    }

    // 3. Fallback: taskkill for standard Win32 executables
    try {
      const flag = force ? "/F" : "";
      const cmd = `taskkill /IM "${procName}" ${flag} /T`;
      await execAsync(cmd);

      return {
        message: `${displayName} was closed successfully.`,
        processName: procName,
      };
    } catch (err: any) {
      const msg = err?.stderr || err?.message || "";
      if (msg.includes("not found") || msg.includes("not running") || err?.code === 128) {
        return {
          message: `${displayName} is not currently running.`,
          processName: procName,
        };
      }
      throw new Error(`Failed to close application ${displayName}: ${msg}`);
    }
  }

  /**
   * Checks whether an application is currently running.
   */
  static async isAppRunning(
    appName: string
  ): Promise<{ isRunning: boolean; app?: AppDefinition; processName: string }> {
    const app = await AppRegistry.findAppAsync(appName);
    const procName = app ? app.executableName : (appName.endsWith(".exe") ? appName : `${appName}.exe`);

    try {
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${procName}" /NH /FO CSV`);
      const isRunning = stdout.toLowerCase().includes(procName.toLowerCase());

      return {
        isRunning,
        app,
        processName: procName,
      };
    } catch {
      return {
        isRunning: false,
        app,
        processName: procName,
      };
    }
  }

  /**
   * Focuses the window of the specified application.
   * Restores minimized window, shows it, and sets it to the foreground.
   */
  static async focusApp(appName: string): Promise<{ success: boolean; message: string }> {
    const app = await AppRegistry.findAppAsync(appName);
    const targetTitle = app ? app.displayName : appName;

    // 1. Try focusing by display name or window title
    let focused = await WindowsBridge.focusWindow(targetTitle);

    // 2. Try focusing by executable / process name
    if (!focused && app?.executableName) {
      const baseName = app.executableName.replace(".exe", "");
      focused = await WindowsBridge.focusWindow(baseName);
    }

    // 3. Try focusing by app name
    if (!focused && app?.name) {
      focused = await WindowsBridge.focusWindow(app.name);
    }

    return {
      success: focused,
      message: focused
        ? `${targetTitle} focused successfully.`
        : `Could not bring window '${targetTitle}' to the foreground.`,
    };
  }
}
