import { exec } from "child_process";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

export class StartupManager {
  private static readonly REG_KEY = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  private static readonly REG_NAME = "LumaAssistant";

  /**
   * Checks whether LUMA is configured to run automatically when Windows starts.
   */
  static async isStartupEnabled(): Promise<boolean> {
    try {
      const script = `(Get-ItemProperty -Path "${this.REG_KEY}" -Name "${this.REG_NAME}" -ErrorAction SilentlyContinue).${this.REG_NAME}`;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`);
      return Boolean(stdout && stdout.trim().length > 0);
    } catch {
      return false;
    }
  }

  /**
   * Configures LUMA to start silently in the background on Windows login.
   */
  static async enableStartup(): Promise<{ success: boolean; message: string }> {
    try {
      const vbsPath = path.resolve(process.cwd(), "scripts", "start-background.vbs");
      const commandValue = `wscript.exe "${vbsPath}"`;
      const script = `Set-ItemProperty -Path "${this.REG_KEY}" -Name "${this.REG_NAME}" -Value '${commandValue}'`;
      await execAsync(`powershell -NoProfile -Command "${script}"`);

      return {
        success: true,
        message: "LUMA background runtime enabled on Windows startup.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to enable startup: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Disables LUMA from launching on Windows startup.
   */
  static async disableStartup(): Promise<{ success: boolean; message: string }> {
    try {
      const script = `Remove-ItemProperty -Path "${this.REG_KEY}" -Name "${this.REG_NAME}" -ErrorAction SilentlyContinue`;
      await execAsync(`powershell -NoProfile -Command "${script}"`);

      return {
        success: true,
        message: "LUMA background startup disabled.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to disable startup: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Opens the LUMA interface in the default web browser.
   */
  static async openUserInterface(url: string = "http://localhost:5173"): Promise<{ success: boolean }> {
    try {
      // Use explorer or start to launch default web browser
      await execAsync(`powershell -NoProfile -Command "Start-Process '${url}'"`);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /**
   * Gracefully restarts the LUMA backend process.
   */
  static restart(): void {
    console.log("[StartupManager] Restart requested. Spawning replacement process...");
    const { spawn } = require("child_process");
    const child = spawn("cmd.exe", ["/c", "npm", "run", "dev:server"], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.unref();
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }

  /**
   * Gracefully stops the LUMA backend process.
   */
  static shutdown(): void {
    console.log("[StartupManager] Shutdown requested. Cleaning up and exiting...");
    setTimeout(() => {
      process.exit(0);
    }, 500);
  }
}
