import type { RoutedCommand } from "../router/commandRouter.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";
import { executeBrowserSearchWorkflow } from "./browserSearchWorkflow.js";
import { executeWebsiteOpenWorkflow } from "./websiteOpenWorkflow.js";
import { executeAppControlWorkflow } from "./appControlWorkflow.js";
import { executeFileWorkflow } from "./fileWorkflow.js";
import { executeMediaWorkflow } from "./mediaWorkflow.js";
import { executeCompoundWorkflow } from "./compoundWorkflow.js";
import { executeYouTubeWorkflow } from "./youtubeWorkflow.js";
import { ConfirmationManager } from "../confirmation/confirmationManager.js";
import { ComputerStateManager } from "../state/computerState.js";

/**
 * LUMA Workflow Engine
 *
 * Central dispatcher that executes user-level intents by selecting, planning,
 * verifying, and coordinating deterministic workflows and tool calls.
 */
export class WorkflowEngine {
  static async execute(routed: RoutedCommand, context: WorkflowContext): Promise<WorkflowResult> {
    const { intent, arguments: args } = routed;

    switch (intent) {
      // 1. Web & Product Search Workflows
      case "SEARCH":
      case "OPEN_OR_SEARCH_WEBSITE":
      case "SEARCH_PRODUCT":
      case "SEARCH_WEB": {
        const target = args.target || args.site || "google";
        const siteName = args.siteDisplayName || target.toUpperCase();
        const query = args.query ?? null;
        const searchUrl = args.searchUrl;

        return await executeBrowserSearchWorkflow(target, siteName, query, searchUrl, context);
      }

      // 2. Website Open Workflow
      case "OPEN_WEBSITE": {
        const url = args.url || "https://www.google.com";
        const displayName = args.displayName || "Website";

        return await executeWebsiteOpenWorkflow(url, displayName, context);
      }

      // 3. Application Control Workflows
      case "OPEN_APP": {
        const app = args.app || "chrome";
        const displayName = args.appDisplayName || app;
        return await executeAppControlWorkflow("open", app, displayName, context);
      }

      case "CLOSE_APP": {
        const app = args.app || "chrome";
        const displayName = args.appDisplayName || app;
        return await executeAppControlWorkflow("close", app, displayName, context);
      }

      case "FOCUS_APP": {
        const app = args.app || "chrome";
        const displayName = args.appDisplayName || app;
        if (routed.toolToExecute === "switch_between_apps") {
          return await executeAppControlWorkflow("switch_between", app, displayName, context, {
            alternateApp: args.alternateApp,
          });
        }
        return await executeAppControlWorkflow("focus", app, displayName, context);
      }

      case "RESTORE_APP": {
        const app = args.app || "chrome";
        const displayName = args.appDisplayName || app;
        return await executeAppControlWorkflow("restore", app, displayName, context);
      }

      // 4. File & Folder Operations Workflows
      case "OPEN_FOLDER": {
        const path = args.path || args.folder || "downloads";
        return await executeFileWorkflow("open_folder", path, context);
      }

      case "OPEN_FILE": {
        const path = args.path || "";
        return await executeFileWorkflow("open_file", path, context);
      }

      case "CREATE_FOLDER": {
        const folder = args.folder || "New Folder";
        return await executeFileWorkflow("create_folder", folder, context);
      }

      case "DELETE": {
        const target = args.target || "";
        return await executeFileWorkflow("delete", target, context, false);
      }

      // 5. Confirmation Gates
      case "CONFIRM_ACTION": {
        context.onProgress("Processing confirmation...", "in-progress");
        const res = await ConfirmationManager.executePending();
        context.onProgress(res.message, res.success ? "completed" : "failed");
        return res;
      }

      case "CANCEL_ACTION": {
        const res = ConfirmationManager.cancelPending();
        context.onProgress(res.message, "completed");
        return res;
      }

      // 6. Multi-Step Compound Goals
      case "COMPOUND_GOAL": {
        const subCommands = routed.subCommands || [];
        return await executeCompoundWorkflow(subCommands, context);
      }

      // 7. Media Controls
      case "PLAY_MEDIA":
      case "PAUSE_MEDIA":
      case "RESUME_MEDIA":
      case "STOP_MEDIA":
      case "NEXT_MEDIA":
      case "PREV_MEDIA":
      case "VOLUME_UP":
      case "VOLUME_DOWN":
      case "MUTE_MEDIA": {
        const action = args.action || intent.toLowerCase().replace("_media", "");
        return await executeMediaWorkflow(action, context);
      }

      // 7B. YouTube Video Playback & Playlist Management
      case "PLAY_FIRST_RESULT":
      case "YOUTUBE_CREATE_PLAYLIST":
      case "YOUTUBE_ADD_TO_PLAYLIST":
      case "YOUTUBE_PLAY_PLAYLIST":
      case "YOUTUBE_OPEN_PLAYLIST":
      case "YOUTUBE_REMOVE_FROM_PLAYLIST": {
        return await executeYouTubeWorkflow(intent, args, context);
      }

      // 8. System Inspection & Tools
      case "INSPECT_COMPUTER": {
        context.onProgress("Observing computer state...", "in-progress");
        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "observe_computer_state", arguments: {} }),
          });
          const data = await res.json();
          if (data.success && data.result) {
            const obs = data.result;
            const win = obs.windows || {};
            const browser = obs.browser || {};
            const screen = obs.screen || {};

            const activeApp = win.active_window || "None";
            const proc = win.process_name || "None";
            const chromeRunning = browser.running ? "Yes" : "No";
            const browserConn = browser.connected ? "Connected" : "Unavailable";
            const currentUrl = browser.current_url || "Unknown";
            const pageTitle = browser.page_title || "Unknown";
            const pageStatus = browser.page_status || "UNAVAILABLE";
            const screenDim = screen.width && screen.height ? `${screen.width} x ${screen.height}` : "Unavailable";
            const screenshot = screen.screenshot_available ? "Available" : "Unavailable";
            const obsStatus = obs.observation_status || "PARTIAL";

            const lines = [
              "COMPUTER OBSERVATION",
              "",
              `Active application: ${activeApp}`,
              `Process: ${proc}`,
              `Chrome running: ${chromeRunning}`,
              `Browser connection: ${browserConn}`,
              `Current URL: ${currentUrl}`,
              `Page title: ${pageTitle}`,
              `Page status: ${pageStatus}`,
              `Screen: ${screenDim}`,
              `Screenshot: ${screenshot}`,
              "",
              `Observation status: ${obsStatus}`,
            ];

            const formattedMessage = lines.join("\n");
            context.onProgress("Computer state observed", "completed");

            return {
              success: true,
              message: formattedMessage,
              data: obs,
            };
          }

          context.onProgress("Failed to observe computer state", "failed");
          return { success: false, message: "Could not observe computer state.", error: data.error };
        } catch (err: any) {
          context.onProgress("Observation communication error", "failed");
          return { success: false, message: "Could not observe computer state.", error: err?.message };
        }
      }

      case "TAKE_SCREENSHOT": {
        context.onProgress("Capturing screenshot...", "in-progress");
        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "take_screenshot", arguments: {} }),
          });
          const data = await res.json();
          if (data.success) {
            context.onProgress("Screenshot captured successfully", "completed");
            return { success: true, message: "Screenshot captured successfully.", data: data.result };
          }
          context.onProgress("Failed to capture screenshot", "failed");
          return { success: false, message: "Could not capture screenshot.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not capture screenshot.", error: err?.message };
        }
      }

      case "GET_VISIBLE_WINDOWS": {
        context.onProgress("Enumerating open windows...", "in-progress");
        try {
          let data: any;
          try {
            const res = await fetch("/api/computer/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: "get_visible_windows", arguments: {} }),
            });
            data = await res.json();
          } catch {
            if (typeof window === "undefined") {
              const modPath = "../../server/computer/tools/toolExecutor.js";
              const mod = await (Function("m", "return import(m)")(modPath));
              data = await mod.ToolExecutor.executeTool("get_visible_windows", {});
            } else {
              throw new Error("Backend server unreachable.");
            }
          }

          if (data.success && Array.isArray(data.result)) {
            const windows: any[] = data.result;
            const fg = windows.find((w) => w.isForeground);
            const others = windows.filter((w) => !w.isForeground);

            const lines: string[] = [];
            lines.push(`Total visible windows: ${windows.length}`);
            lines.push("");

            if (fg) {
              const state = fg.isMinimized ? "Minimized" : "Visible";
              lines.push(`ACTIVE / FOREGROUND WINDOW:`);
              lines.push(`• "${fg.title}" [${fg.processName}] (PID: ${fg.processId}, HWND: ${fg.hwnd}, State: ${state})`);
              lines.push("");
            }

            if (others.length > 0) {
              lines.push(`OTHER OPEN WINDOWS:`);
              for (const w of others) {
                const state = w.isMinimized ? "Minimized" : "Visible";
                lines.push(`• "${w.title}" [${w.processName}] (PID: ${w.processId}, HWND: ${w.hwnd}, State: ${state})`);
              }
            } else if (!fg) {
              lines.push("No visible application windows currently open.");
            }

            const formattedMsg = lines.join("\n");
            context.onProgress(`Found ${windows.length} open windows`, "completed");
            return {
              success: true,
              message: formattedMsg,
              data: {
                count: windows.length,
                activeWindow: fg || null,
                windows,
              },
            };
          }

          context.onProgress("Failed to enumerate windows", "failed");
          return { success: false, message: "Could not enumerate open windows.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not enumerate open windows.", error: err?.message };
        }
      }

      case "GET_ACTIVE_WINDOW": {
        context.onProgress("Inspecting active window...", "in-progress");
        try {
          let data: any;
          try {
            const res = await fetch("/api/computer/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: "get_active_window", arguments: {} }),
            });
            data = await res.json();
          } catch {
            if (typeof window === "undefined") {
              const modPath = "../../server/computer/tools/toolExecutor.js";
              const mod = await (Function("m", "return import(m)")(modPath));
              data = await mod.ToolExecutor.executeTool("get_active_window", {});
            } else {
              throw new Error("Backend server unreachable.");
            }
          }

          if (data.success && data.result) {
            const title = data.result.title || "Desktop";
            const proc = data.result.processName || "System";
            const pid = data.result.processId ? ` (PID: ${data.result.processId})` : "";
            const hwnd = data.result.hwnd ? ` [HWND: ${data.result.hwnd}]` : "";
            const msg = `Active window: "${title}" [${proc}]${pid}${hwnd}.`;
            context.onProgress(msg, "completed");
            ComputerStateManager.update({ active_window: title, active_app: proc });
            return { success: true, message: msg, data: data.result };
          }
          context.onProgress("Failed to inspect active window", "failed");
          return { success: false, message: "Could not read active window.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not read active window.", error: err?.message };
        }
      }

      case "GET_INSTALLED_APPS": {
        context.onProgress("Scanning installed applications...", "in-progress");
        try {
          let data: any;
          try {
            const res = await fetch("/api/computer/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: "get_installed_apps", arguments: {} }),
            });
            data = await res.json();
          } catch {
            if (typeof window === "undefined") {
              const modPath = "../../server/computer/tools/toolExecutor.js";
              const mod = await (Function("m", "return import(m)")(modPath));
              data = await mod.ToolExecutor.executeTool("get_installed_apps", {});
            } else {
              throw new Error("Backend server unreachable.");
            }
          }

          if (data.success && Array.isArray(data.result)) {
            const apps: any[] = data.result;
            const lines: string[] = [];
            lines.push(`Discovered ${apps.length} installed applications:`);
            lines.push("");
            const displayLimit = Math.min(apps.length, 25);
            for (let i = 0; i < displayLimit; i++) {
              const a = apps[i];
              const ver = a.version ? ` (${a.version})` : "";
              const pub = a.publisher ? ` by ${a.publisher}` : "";
              lines.push(`• ${a.displayName}${ver}${pub} [${a.type}]`);
            }
            if (apps.length > displayLimit) {
              lines.push(`... and ${apps.length - displayLimit} more applications.`);
            }

            const formattedMsg = lines.join("\n");
            context.onProgress(`Found ${apps.length} installed applications`, "completed");
            return {
              success: true,
              message: formattedMsg,
              data: {
                count: apps.length,
                apps,
              },
            };
          }

          context.onProgress("Failed to scan installed applications", "failed");
          return { success: false, message: "Could not scan installed applications.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not scan installed applications.", error: err?.message };
        }
      }

      case "GET_BACKGROUND_PROCESSES": {
        context.onProgress("Scanning running background processes...", "in-progress");
        try {
          let data: any;
          try {
            const res = await fetch("/api/computer/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: "get_running_processes", arguments: { type: "background" } }),
            });
            data = await res.json();
          } catch {
            if (typeof window === "undefined") {
              const modPath = "../../server/computer/tools/toolExecutor.js";
              const mod = await (Function("m", "return import(m)")(modPath));
              data = await mod.ToolExecutor.executeTool("get_running_processes", { type: "background" });
            } else {
              throw new Error("Backend server unreachable.");
            }
          }

          if (data.success && Array.isArray(data.result)) {
            const procs: any[] = data.result;
            const lines: string[] = [];
            lines.push(`Running background processes (${procs.length} total):`);
            lines.push("");
            const displayLimit = Math.min(procs.length, 25);
            for (let i = 0; i < displayLimit; i++) {
              const p = procs[i];
              const mem = p.memoryMB ? `, ${p.memoryMB} MB` : "";
              lines.push(`• ${p.name} (PID: ${p.pid}${mem}) [Background]`);
            }
            if (procs.length > displayLimit) {
              lines.push(`... and ${procs.length - displayLimit} more background processes.`);
            }

            const formattedMsg = lines.join("\n");
            context.onProgress(`Found ${procs.length} background processes`, "completed");
            return {
              success: true,
              message: formattedMsg,
              data: {
                count: procs.length,
                processes: procs,
              },
            };
          }

          context.onProgress("Failed to scan background processes", "failed");
          return { success: false, message: "Could not retrieve background processes.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not retrieve background processes.", error: err?.message };
        }
      }

      case "CHECK_SYSTEM": {
        context.onProgress("Checking system information...", "in-progress");
        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "get_os_info", arguments: {} }),
          });
          const data = await res.json();
          if (data.success && data.result) {
            const { platform, osRelease, arch, hostname } = data.result;
            const msg = `System Info: ${platform} ${osRelease} (${arch}) on ${hostname}.`;
            context.onProgress(msg, "completed");
            return { success: true, message: msg, data: data.result };
          }
          context.onProgress("Could not retrieve system information", "failed");
          return { success: false, message: "Could not retrieve system details.", error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: "Could not retrieve system details.", error: err?.message };
        }
      }

      // 9. Hotkeys & Standard Editing
      case "COPY":
      case "PASTE":
      case "SELECT": {
        const keys = args.keys || ["ctrl", "c"];
        const label = intent === "COPY" ? "Copied" : intent === "PASTE" ? "Pasted" : "Selected all";
        context.onProgress(`Executing ${label.toLowerCase()}...`, "in-progress");

        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "hotkey", arguments: { keys } }),
          });
          const data = await res.json();
          if (data.success) {
            context.onProgress(`${label} successfully`, "completed");
            return { success: true, message: `${label} successfully.` };
          }
          context.onProgress(`Failed to execute ${label.toLowerCase()}`, "failed");
          return { success: false, message: `Could not execute ${label.toLowerCase()}.`, error: data.error };
        } catch (err: any) {
          context.onProgress("System communication error", "failed");
          return { success: false, message: `Could not execute ${label.toLowerCase()}.`, error: err?.message };
        }
      }

      case "SCROLL": {
        const amount = args.amount ?? -3;
        const dir = amount > 0 ? "up" : "down";
        context.onProgress(`Scrolling ${dir}...`, "in-progress");

        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "scroll", arguments: { amount } }),
          });
          const data = await res.json();
          if (data.success) {
            context.onProgress(`Scrolled ${dir}`, "completed");
            return { success: true, message: `Scrolled page ${dir}.` };
          }
          return { success: false, message: "Could not scroll page.", error: data.error };
        } catch (err: any) {
          return { success: false, message: "Could not scroll page.", error: err?.message };
        }
      }

      // 10. Low-level Keyboard & Text typing
      case "TYPE_TEXT": {
        const text = args.text || "";
        context.onProgress(`Typing text...`, "in-progress");
        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "type_text", arguments: { text } }),
          });
          const data = await res.json();
          if (data.success) {
            context.onProgress(`Typed text successfully`, "completed");
            return { success: true, message: `Typed text successfully.` };
          }
          return { success: false, message: "Could not type text.", error: data.error };
        } catch (err: any) {
          return { success: false, message: "Could not type text.", error: err?.message };
        }
      }

      case "PRESS_KEY": {
        const key = args.key || "enter";
        context.onProgress(`Pressing ${key.toUpperCase()}...`, "in-progress");
        try {
          const res = await fetch("/api/computer/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: "press_key", arguments: { key } }),
          });
          const data = await res.json();
          if (data.success) {
            context.onProgress(`Pressed ${key.toUpperCase()} successfully`, "completed");
            return { success: true, message: `Pressed ${key.toUpperCase()} successfully.` };
          }
          return { success: false, message: `Could not press key ${key}.`, error: data.error };
        } catch (err: any) {
          return { success: false, message: `Could not press key ${key}.`, error: err?.message };
        }
      }

      // 11. UNKNOWN / Future LLM Fallback (Prepared but zero external calls in this phase)
      default: {
        context.onProgress("Command unrecognized by deterministic rules", "completed");
        return {
          success: false,
          message: "LUMA doesn't know this command yet. Try asking to open an app, search a website, or control media.",
        };
      }
    }
  }
}
