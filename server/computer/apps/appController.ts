import { spawn, exec } from "child_process";
import { promisify } from "util";
import { AppRegistry } from "./appRegistry.js";
import { WindowsBridge } from "../native/windowsBridge.js";
import type { AppDefinition } from "../types.js";

const execAsync = promisify(exec);

export class AppController {
  /**
   * Opens or launches an application by its name or alias.
   */
  static async openApp(
    appName: string,
    additionalArgs: string[] = []
  ): Promise<{ message: string; app: AppDefinition; launchTarget: string }> {
    if (!appName || typeof appName !== "string" || !appName.trim()) {
      throw new Error("Application name is required.");
    }

    const app = AppRegistry.getApp(appName);
    if (!app) {
      const available = AppRegistry.getAllApps()
        .map((a) => a.displayName)
        .join(", ");
      throw new Error(
        `Application '${appName}' was not found in the registry. Supported applications include: ${available}.`
      );
    }

    const target = await AppRegistry.resolveLaunchTarget(app);
    const launchArgs = [...(app.arguments || []), ...additionalArgs];

    try {
      if (target.type === "protocol") {
        // Launch protocol URL safely via cmd start
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

      return {
        message: `${app.displayName} opened successfully.`,
        app,
        launchTarget: target.target,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to launch ${app.displayName}: ${err?.message || "Unknown launch error"}`
      );
    }
  }

  /**
   * Closes an application by process name.
   */
  static async closeApp(
    appName: string,
    force: boolean = true
  ): Promise<{ message: string; processName: string }> {
    if (!appName) {
      throw new Error("Application name is required.");
    }

    const app = AppRegistry.getApp(appName);
    const procName = app ? app.executableName : (appName.endsWith(".exe") ? appName : `${appName}.exe`);

    try {
      const flag = force ? "/F" : "";
      const cmd = `taskkill /IM "${procName}" ${flag} /T`;
      await execAsync(cmd);

      return {
        message: `${app ? app.displayName : procName} was closed successfully.`,
        processName: procName,
      };
    } catch (err: any) {
      const msg = err?.stderr || err?.message || "";
      if (msg.includes("not found") || msg.includes("not running") || err?.code === 128) {
        return {
          message: `${app ? app.displayName : procName} is not currently running.`,
          processName: procName,
        };
      }
      throw new Error(`Failed to close application ${procName}: ${msg}`);
    }
  }

  /**
   * Checks whether an application is currently running.
   */
  static async isAppRunning(
    appName: string
  ): Promise<{ isRunning: boolean; app?: AppDefinition; processName: string }> {
    const app = AppRegistry.getApp(appName);
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
   */
  static async focusApp(appName: string): Promise<{ success: boolean; message: string }> {
    const app = AppRegistry.getApp(appName);
    const targetTitle = app ? app.displayName : appName;

    const focused = await WindowsBridge.focusWindow(targetTitle);
    if (!focused && app?.executableName) {
      const baseName = app.executableName.replace(".exe", "");
      const fallbackFocused = await WindowsBridge.focusWindow(baseName);
      if (fallbackFocused) {
        return {
          success: true,
          message: `${targetTitle} focused successfully.`,
        };
      }
    }

    return {
      success: focused,
      message: focused
        ? `${targetTitle} focused successfully.`
        : `Could not bring window '${targetTitle}' to the foreground.`,
    };
  }
}
