import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { WindowsBridge, type InstalledAppItem } from "../native/windowsBridge.js";
import type { AppDefinition } from "../types.js";

const execAsync = promisify(exec);

export interface DiscoveredApp {
  id: string;
  name: string;
  displayName: string;
  appId?: string;
  protocolUri?: string;
  executablePath?: string;
  executableName?: string;
  processNames: string[];
  isUWP: boolean;
  category?: string;
}

export interface LaunchTarget {
  type: "protocol" | "aumid" | "file" | "command";
  target: string;
  args?: string[];
  processNames: string[];
  displayName: string;
}

/**
 * Well-known core applications with tested protocols, AUMIDs, and process names.
 */
const KNOWN_CORE_APPS: Record<string, DiscoveredApp> = {
  paint: {
    id: "paint",
    name: "paint",
    displayName: "Paint",
    appId: "Microsoft.Paint_8wekyb3d8bbwe!App",
    protocolUri: "ms-paint:",
    executableName: "mspaint.exe",
    processNames: ["mspaint", "Paint"],
    isUWP: true,
    category: "Graphics",
  },
  clock: {
    id: "clock",
    name: "clock",
    displayName: "Clock",
    appId: "Microsoft.WindowsAlarms_8wekyb3d8bbwe!App",
    protocolUri: "ms-clock:",
    executableName: "Time.exe",
    processNames: ["Time", "Clock", "ApplicationFrameHost"],
    isUWP: true,
    category: "Utilities",
  },
  photos: {
    id: "photos",
    name: "photos",
    displayName: "Photos",
    appId: "Microsoft.Windows.Photos_8wekyb3d8bbwe!App",
    protocolUri: "ms-photos:",
    executableName: "Photos.exe",
    processNames: ["Photos", "Microsoft.Photos", "ApplicationFrameHost"],
    isUWP: true,
    category: "Media",
  },
  calc: {
    id: "calc",
    name: "calc",
    displayName: "Calculator",
    appId: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
    protocolUri: "calculator:",
    executableName: "CalculatorApp.exe",
    processNames: ["CalculatorApp", "calc", "ApplicationFrameHost"],
    isUWP: true,
    category: "Utilities",
  },
  calculator: {
    id: "calculator",
    name: "calculator",
    displayName: "Calculator",
    appId: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
    protocolUri: "calculator:",
    executableName: "CalculatorApp.exe",
    processNames: ["CalculatorApp", "calc", "ApplicationFrameHost"],
    isUWP: true,
    category: "Utilities",
  },
  chrome: {
    id: "chrome",
    name: "chrome",
    displayName: "Google Chrome",
    appId: "Chrome",
    executableName: "chrome.exe",
    processNames: ["chrome"],
    isUWP: false,
    category: "Web Browser",
  },
  vscode: {
    id: "vscode",
    name: "vscode",
    displayName: "Visual Studio Code",
    appId: "Microsoft.VisualStudioCode",
    executableName: "Code.exe",
    processNames: ["Code"],
    isUWP: false,
    category: "Development",
  },
  notepad: {
    id: "notepad",
    name: "notepad",
    displayName: "Notepad",
    appId: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App",
    executableName: "notepad.exe",
    processNames: ["Notepad", "notepad"],
    isUWP: true,
    category: "Utilities",
  },
  explorer: {
    id: "explorer",
    name: "explorer",
    displayName: "File Explorer",
    executableName: "explorer.exe",
    processNames: ["explorer"],
    isUWP: false,
    category: "System",
  },
  terminal: {
    id: "terminal",
    name: "terminal",
    displayName: "Windows PowerShell",
    executableName: "powershell.exe",
    processNames: ["powershell", "pwsh", "WindowsTerminal"],
    isUWP: false,
    category: "System",
  },
  cmd: {
    id: "cmd",
    name: "cmd",
    displayName: "Command Prompt",
    executableName: "cmd.exe",
    processNames: ["cmd"],
    isUWP: false,
    category: "System",
  },
  edge: {
    id: "edge",
    name: "edge",
    displayName: "Microsoft Edge",
    appId: "Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!App",
    protocolUri: "microsoft-edge:",
    executableName: "msedge.exe",
    processNames: ["msedge"],
    isUWP: false,
    category: "Web Browser",
  },
};

/**
 * AppDiscovery scans and dynamically resolves installed applications on Windows,
 * including modern packaged / UWP apps and Win32 applications.
 */
export class AppDiscovery {
  private static cachedApps: Map<string, DiscoveredApp> = new Map();
  private static lastScanTime: number = 0;
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  static {
    // Seed with known core applications
    for (const [key, app] of Object.entries(KNOWN_CORE_APPS)) {
      this.cachedApps.set(key.toLowerCase(), { ...app });
    }
  }

  /**
   * Scans installed applications using Get-StartApps and Registry App Paths.
   */
  static async scanInstalledApps(force: boolean = false): Promise<DiscoveredApp[]> {
    const now = Date.now();
    if (!force && this.cachedApps.size > Object.keys(KNOWN_CORE_APPS).length && now - this.lastScanTime < this.CACHE_TTL_MS) {
      return Array.from(this.cachedApps.values());
    }

    try {
      // Use PowerShell to discover modern packaged apps and start menu items
      const script = `
Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress
`;
      const startApps = await WindowsBridge.runPowerShellJson<Array<{ Name: string; AppID: string }>>(script);
      const items = Array.isArray(startApps) ? startApps : startApps ? [startApps] : [];

      for (const item of items) {
        if (!item || !item.Name || !item.AppID) continue;
        const rawName = item.Name.trim();
        const appId = item.AppID.trim();
        const cleanKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");

        // Determine if packaged UWP app
        const isUWP = appId.includes("!") || appId.includes("_8wekyb3d8bbwe");

        // Infer executable or process name
        let inferredProc = rawName.replace(/\s+/g, "");
        if (appId.toLowerCase().endsWith(".exe")) {
          inferredProc = path.basename(appId, ".exe");
        } else if (isUWP) {
          const match = appId.match(/^([^!_]+)/);
          if (match) inferredProc = match[1];
        }

        const discovered: DiscoveredApp = {
          id: cleanKey,
          name: rawName.toLowerCase(),
          displayName: rawName,
          appId,
          isUWP,
          processNames: [inferredProc, rawName],
          category: isUWP ? "Windows App" : "Desktop Application",
        };

        // Attach known protocols if applicable
        if (rawName.toLowerCase() === "paint") {
          discovered.protocolUri = "ms-paint:";
          discovered.processNames.push("mspaint", "Paint");
        } else if (rawName.toLowerCase() === "clock") {
          discovered.protocolUri = "ms-clock:";
          discovered.processNames.push("Time", "Clock", "ApplicationFrameHost");
        } else if (rawName.toLowerCase() === "photos") {
          discovered.protocolUri = "ms-photos:";
          discovered.processNames.push("Photos", "Microsoft.Photos", "ApplicationFrameHost");
        } else if (rawName.toLowerCase() === "calculator") {
          discovered.protocolUri = "calculator:";
          discovered.processNames.push("CalculatorApp", "calc", "ApplicationFrameHost");
        }

        // Cache under clean key and full name
        this.cachedApps.set(cleanKey, discovered);
        this.cachedApps.set(rawName.toLowerCase(), discovered);
      }

      this.lastScanTime = now;
    } catch (err: any) {
      console.warn("[AppDiscovery] StartApps scan warning:", err?.message);
    }

    return Array.from(this.cachedApps.values());
  }

  /**
   * Scans and returns all installed applications from Windows Uninstall Registry keys
   * and modern packaged / UWP Store applications.
   */
  static async getInstalledApplications(): Promise<InstalledAppItem[]> {
    return await WindowsBridge.getInstalledApplications();
  }

  /**
   * Finds an application by name, canonical ID, or alias.
   */
  static async findApp(query: string): Promise<DiscoveredApp | null> {
    if (!query || typeof query !== "string") return null;
    const clean = query.trim().toLowerCase();
    const alphanumeric = clean.replace(/[^a-z0-9]/g, "");

    // 1. Direct match in known core apps
    if (KNOWN_CORE_APPS[clean]) {
      return KNOWN_CORE_APPS[clean];
    }
    if (KNOWN_CORE_APPS[alphanumeric]) {
      return KNOWN_CORE_APPS[alphanumeric];
    }

    // 2. Direct match in cached apps
    if (this.cachedApps.has(clean)) {
      return this.cachedApps.get(clean)!;
    }
    if (this.cachedApps.has(alphanumeric)) {
      return this.cachedApps.get(alphanumeric)!;
    }

    // 3. Search cached apps by display name or partial match
    for (const app of this.cachedApps.values()) {
      const dName = app.displayName.toLowerCase();
      if (dName === clean || dName.replace(/[^a-z0-9]/g, "") === alphanumeric) {
        return app;
      }
    }

    // Substring match
    for (const app of this.cachedApps.values()) {
      const dName = app.displayName.toLowerCase();
      if (dName.includes(clean) || clean.includes(dName)) {
        return app;
      }
    }

    // 4. If not found, trigger scan and search again
    await this.scanInstalledApps(false);

    if (this.cachedApps.has(clean)) return this.cachedApps.get(clean)!;
    if (this.cachedApps.has(alphanumeric)) return this.cachedApps.get(alphanumeric)!;

    for (const app of this.cachedApps.values()) {
      const dName = app.displayName.toLowerCase();
      if (dName === clean || dName.includes(clean) || clean.includes(dName)) {
        return app;
      }
    }

    return null;
  }

  /**
   * Resolves the exact launch target and mechanism (protocol, AUMID, file, or command).
   */
  static async resolveLaunch(app: DiscoveredApp | AppDefinition): Promise<LaunchTarget> {
    // Check if it's DiscoveredApp
    const dApp = app as DiscoveredApp;

    // 1. Preferred: Protocol URI (e.g. ms-paint:, ms-clock:, calculator:)
    if (dApp.protocolUri) {
      return {
        type: "protocol",
        target: dApp.protocolUri,
        processNames: dApp.processNames || [dApp.executableName || dApp.name],
        displayName: dApp.displayName,
      };
    }

    // 2. AUMID Launch: explorer.exe shell:AppsFolder\<AppID>
    if (dApp.appId && (dApp.isUWP || dApp.appId.includes("!"))) {
      return {
        type: "aumid",
        target: `shell:AppsFolder\\${dApp.appId}`,
        processNames: dApp.processNames || ["ApplicationFrameHost", dApp.name],
        displayName: dApp.displayName,
      };
    }

    // 3. Executable Path
    if (dApp.executablePath && fs.existsSync(dApp.executablePath)) {
      return {
        type: "file",
        target: dApp.executablePath,
        processNames: dApp.processNames || [path.basename(dApp.executablePath, ".exe")],
        displayName: dApp.displayName,
      };
    }

    // Check standard paths if AppDefinition
    const defApp = app as AppDefinition;
    if (defApp.standardPaths) {
      for (const p of defApp.standardPaths) {
        if (fs.existsSync(p)) {
          return {
            type: "file",
            target: p,
            processNames: [path.basename(p, ".exe")],
            displayName: defApp.displayName,
          };
        }
      }
    }

    // 4. Executable in system PATH via where.exe
    const searchName = dApp.executableName || (dApp as any).commandName || `${dApp.name}.exe`;
    if (searchName) {
      try {
        const { stdout } = await execAsync(`where.exe ${searchName}`);
        const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0 && fs.existsSync(lines[0])) {
          return {
            type: "file",
            target: lines[0],
            processNames: [path.basename(lines[0], ".exe")],
            displayName: dApp.displayName,
          };
        }
      } catch {
        // Not found in PATH
      }
    }

    // 5. Fallback: Shell command
    return {
      type: "command",
      target: searchName,
      processNames: [searchName.replace(".exe", "")],
      displayName: dApp.displayName,
    };
  }
}
