import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { AppDefinition } from "../types.js";

const execAsync = promisify(exec);

const localAppData = process.env.LOCALAPPDATA || "";
const appData = process.env.APPDATA || "";
const programFiles = process.env.ProgramFiles || "C:\\Program Files";
const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
const systemRoot = process.env.SystemRoot || "C:\\Windows";

/**
 * Built-in Application Registry
 */
const DEFAULT_APPS: AppDefinition[] = [
  {
    name: "vscode",
    displayName: "Visual Studio Code",
    category: "Development",
    executableName: "Code.exe",
    commandName: "code",
    standardPaths: [
      `${localAppData}\\Programs\\Microsoft VS Code\\Code.exe`,
      `${programFiles}\\Microsoft VS Code\\Code.exe`,
      `${programFilesX86}\\Microsoft VS Code\\Code.exe`,
    ],
    description: "Code editor for building and debugging modern web and cloud applications.",
  },
  {
    name: "chrome",
    displayName: "Google Chrome",
    category: "Web Browser",
    executableName: "chrome.exe",
    commandName: "chrome",
    protocolUri: "https://www.google.com",
    standardPaths: [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    description: "Fast and secure web browser developed by Google.",
  },
  {
    name: "whatsapp",
    displayName: "WhatsApp",
    category: "Communication",
    executableName: "WhatsApp.exe",
    protocolUri: "whatsapp:",
    standardPaths: [
      `${localAppData}\\WhatsApp\\WhatsApp.exe`,
      `${localAppData}\\Programs\\WhatsApp\\WhatsApp.exe`,
    ],
    description: "Instant messaging and voice/video calling application.",
  },
  {
    name: "notepad",
    displayName: "Notepad",
    category: "Utilities",
    executableName: "notepad.exe",
    commandName: "notepad",
    standardPaths: [
      `${systemRoot}\\System32\\notepad.exe`,
      `${systemRoot}\\notepad.exe`,
    ],
    description: "Basic text editor included with Microsoft Windows.",
  },
  {
    name: "calc",
    displayName: "Calculator",
    category: "Utilities",
    executableName: "calc.exe",
    commandName: "calc",
    protocolUri: "calculator:",
    standardPaths: [
      `${systemRoot}\\System32\\calc.exe`,
      `${systemRoot}\\calc.exe`,
    ],
    description: "Windows Calculator utility.",
  },
  {
    name: "explorer",
    displayName: "File Explorer",
    category: "System",
    executableName: "explorer.exe",
    commandName: "explorer",
    standardPaths: [
      `${systemRoot}\\explorer.exe`,
    ],
    description: "Windows File Explorer for browsing files and folders.",
  },
  {
    name: "terminal",
    displayName: "Windows PowerShell",
    category: "System",
    executableName: "powershell.exe",
    commandName: "powershell",
    standardPaths: [
      `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ],
    description: "Windows PowerShell command-line shell and scripting environment.",
  },
  {
    name: "spotify",
    displayName: "Spotify",
    category: "Media",
    executableName: "Spotify.exe",
    protocolUri: "spotify:",
    standardPaths: [
      `${appData}\\Spotify\\Spotify.exe`,
    ],
    description: "Digital music and podcast streaming service.",
  },
  {
    name: "edge",
    displayName: "Microsoft Edge",
    category: "Web Browser",
    executableName: "msedge.exe",
    commandName: "msedge",
    protocolUri: "microsoft-edge:",
    standardPaths: [
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    description: "Web browser developed by Microsoft.",
  },
  {
    name: "cmd",
    displayName: "Command Prompt",
    category: "System",
    executableName: "cmd.exe",
    commandName: "cmd",
    standardPaths: [
      `${systemRoot}\\System32\\cmd.exe`,
    ],
    description: "Windows Command Prompt shell.",
  },
  {
    name: "discord",
    displayName: "Discord",
    category: "Communication",
    executableName: "Discord.exe",
    commandName: "discord",
    protocolUri: "discord:",
    standardPaths: [
      `${localAppData}\\Discord\\Update.exe`,
      `${localAppData}\\Programs\\Discord\\Discord.exe`,
    ],
    description: "Voice, video, and text communication service.",
  },
  {
    name: "telegram",
    displayName: "Telegram",
    category: "Communication",
    executableName: "Telegram.exe",
    commandName: "telegram",
    protocolUri: "tg:",
    standardPaths: [
      `${appData}\\Telegram Desktop\\Telegram.exe`,
      `${programFiles}\\Telegram Desktop\\Telegram.exe`,
    ],
    description: "Cloud-based instant messaging service.",
  },
];

export class AppRegistry {
  private static apps: Map<string, AppDefinition> = new Map();

  static {
    // Initialize default registry
    for (const app of DEFAULT_APPS) {
      this.registerApp(app);
    }
  }

  /**
   * Registers or updates an application definition in the registry.
   */
  static registerApp(app: AppDefinition): void {
    const key = app.name.toLowerCase().trim();
    this.apps.set(key, app);
  }

  /**
   * Finds an application by name or alias.
   */
  static getApp(name: string): AppDefinition | undefined {
    if (!name) return undefined;
    const clean = name.toLowerCase().trim();
    
    // Direct match
    if (this.apps.has(clean)) {
      return this.apps.get(clean);
    }

    // Match by display name or partial name
    for (const app of this.apps.values()) {
      if (
        app.displayName.toLowerCase() === clean ||
        app.displayName.toLowerCase().includes(clean) ||
        app.executableName.toLowerCase().replace(".exe", "") === clean
      ) {
        return app;
      }
    }

    return undefined;
  }

  /**
   * Returns all registered applications.
   */
  static getAllApps(): AppDefinition[] {
    return Array.from(this.apps.values());
  }

  /**
   * Resolves the executable path or launch target for a given application.
   * Checks standard paths first, then `where.exe`, and falls back to command / protocol.
   */
  static async resolveLaunchTarget(app: AppDefinition): Promise<{
    type: "file" | "command" | "protocol";
    target: string;
  }> {
    // 1. Check known standard file paths
    if (app.standardPaths) {
      for (const p of app.standardPaths) {
        try {
          if (fs.existsSync(p)) {
            return { type: "file", target: p };
          }
        } catch {
          // ignore path check errors
        }
      }
    }

    // 2. Check executable in system PATH using `where.exe`
    const searchName = app.commandName || app.executableName;
    if (searchName) {
      try {
        const { stdout } = await execAsync(`where.exe ${searchName}`);
        const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0 && fs.existsSync(lines[0])) {
          return { type: "file", target: lines[0] };
        }
      } catch {
        // where command returned non-zero (not found in PATH)
      }
    }

    // 3. Fallback to protocol URI if defined (e.g. whatsapp:, calculator:)
    if (app.protocolUri) {
      return { type: "protocol", target: app.protocolUri };
    }

    // 4. Fallback to command name
    if (app.commandName) {
      return { type: "command", target: app.commandName };
    }

    throw new Error(
      `${app.displayName} could not be located on this system. Please ensure it is installed.`
    );
  }
}
