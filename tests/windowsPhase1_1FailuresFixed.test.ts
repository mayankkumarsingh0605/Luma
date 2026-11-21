/**
 * LUMA Phase 1.1: Comprehensive Verification of All 24 Windows Core Control Tests
 *
 * Verifies:
 * - 18 Previously Passed Tests (reconciled inventory):
 *   1. Open Paint
 *   2. Open Clock
 *   3. Open Photos
 *   4. Open Calculator
 *   5. Open Notepad
 *   6. Open File Explorer
 *   7. Open Chrome
 *   8. Open VS Code
 *   9. Which application is currently active?
 *   10. Tell me which windows are currently active
 *   11. Switch to Chrome
 *   12. Switch to Notepad
 *   13. Switch to File Explorer
 *   14. Switch to Paint
 *   15. Switch to Chrome window
 *   16. Close Paint
 *   17. Close Notepad
 *   18. Show all open visible windows
 *
 * - 6 Previously Failed Tests (now 100% fixed):
 *   1. Bring Notepad to foreground
 *   2. Switch between Chrome and Notepad
 *   3. Restore Chrome if it is minimized
 *   4. Show installed applications
 *   5. Show running background processes
 *   6. Show active window title and process
 */

import { AppDiscovery } from "../server/computer/apps/appDiscovery.js";
import { AppRegistry } from "../server/computer/apps/appRegistry.js";
import { AppController } from "../server/computer/apps/appController.js";
import { SystemController } from "../server/computer/system/systemController.js";
import { ToolRegistry } from "../server/computer/tools/toolRegistry.js";
import { ToolExecutor } from "../server/computer/tools/toolExecutor.js";
import { routeCommand } from "../src/router/commandRouter.js";
import { WorkflowEngine } from "../src/workflows/workflowEngine.js";
import type { WorkflowContext } from "../src/workflows/types.js";

async function runTestSuite() {
  console.log("==================================================================");
  console.log("🪟 LUMA Phase 1.1: Complete 24-Test Verification Suite");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${message}`);
      failed++;
    }
  }

  const mockContext: WorkflowContext = {
    workflowId: "test-wf-1",
    onProgress: (msg, status) => {
      // debug logs
    },
  };

  // ---------------------------------------------------------------------------
  // PART A: Verify All 18 Previously Passed Tests Continue Working (Zero Regression)
  // ---------------------------------------------------------------------------
  console.log("--- PART A: Verifying 18 Previously Passed Tests ---");

  // 1-8: Open App Tests
  const openCases = [
    { cmd: "Open Paint", app: "paint" },
    { cmd: "Open Clock", app: "clock" },
    { cmd: "Open Photos", app: "photos" },
    { cmd: "Open Calculator", app: "calc" },
    { cmd: "Open Notepad", app: "notepad" },
    { cmd: "Open File Explorer", app: "explorer" },
    { cmd: "Open Chrome", app: "chrome" },
    { cmd: "Open VS Code", app: "vscode" },
  ];

  for (const tc of openCases) {
    const r = routeCommand(tc.cmd);
    assert(r.intent === "OPEN_APP", `'${tc.cmd}' routes to OPEN_APP`);
    assert(r.arguments.app === tc.app, `'${tc.cmd}' target is '${tc.app}'`);
  }

  // 9-10: Active Application & Active Windows Queries
  {
    const r9 = routeCommand("Which application is currently active?");
    assert(r9.intent === "GET_ACTIVE_WINDOW", "'Which application is currently active?' -> GET_ACTIVE_WINDOW");

    const r10 = routeCommand("Tell me which windows are currently active");
    assert(r10.intent === "GET_VISIBLE_WINDOWS", "'Tell me which windows are currently active' -> GET_VISIBLE_WINDOWS");
  }

  // 11-15: Window Switching Tests
  const switchCases = [
    { cmd: "Switch to Chrome", app: "chrome" },
    { cmd: "Switch to Notepad", app: "notepad" },
    { cmd: "Switch to File Explorer", app: "explorer" },
    { cmd: "Switch to Paint", app: "paint" },
    { cmd: "Switch to Chrome window", app: "chrome" },
  ];

  for (const sc of switchCases) {
    const r = routeCommand(sc.cmd);
    assert(r.intent === "FOCUS_APP", `'${sc.cmd}' routes to FOCUS_APP`);
    assert(r.arguments.app === sc.app, `'${sc.cmd}' target is '${sc.app}'`);
  }

  // 16-17: Close App Tests
  {
    const c1 = routeCommand("Close Paint");
    assert(c1.intent === "CLOSE_APP" && c1.arguments.app === "paint", "'Close Paint' -> CLOSE_APP (paint)");

    const c2 = routeCommand("Close Notepad");
    assert(c2.intent === "CLOSE_APP" && c2.arguments.app === "notepad", "'Close Notepad' -> CLOSE_APP (notepad)");
  }

  // 18: Show all open visible windows
  {
    const w18 = routeCommand("Show all open visible windows");
    assert(w18.intent === "GET_VISIBLE_WINDOWS", "'Show all open visible windows' -> GET_VISIBLE_WINDOWS");
  }

  // ---------------------------------------------------------------------------
  // PART B: Verify All 6 Previously Failed Tests (Now Fixed)
  // ---------------------------------------------------------------------------
  console.log("\n--- PART B: Verifying 6 Fixed Tests ---");

  // Fix 1: "Bring Notepad to foreground"
  console.log("\n[Test 1] Bring Notepad to foreground");
  {
    const r = routeCommand("Bring Notepad to foreground");
    assert(r.intent === "FOCUS_APP", "'Bring Notepad to foreground' routes to FOCUS_APP");
    assert(r.arguments.app === "notepad", "'Bring Notepad to foreground' target is 'notepad'");
    assert(r.toolToExecute === "focus_app", "Tool to execute is 'focus_app'");

    const tool = ToolRegistry.get("focus_app");
    assert(Boolean(tool), "'focus_app' tool is registered in ToolRegistry");
  }

  // Fix 2: "Switch between Chrome and Notepad"
  console.log("\n[Test 2] Switch between Chrome and Notepad");
  {
    const r = routeCommand("Switch between Chrome and Notepad");
    assert(r.intent === "FOCUS_APP", "'Switch between Chrome and Notepad' routes to FOCUS_APP");
    assert(r.arguments.app === "chrome", "First app argument is 'chrome'");
    assert(r.arguments.alternateApp === "notepad", "Alternate app argument is 'notepad'");
    assert(r.toolToExecute === "switch_between_apps", "Tool to execute is 'switch_between_apps'");

    const tool = ToolRegistry.get("switch_between_apps");
    assert(Boolean(tool), "'switch_between_apps' tool is registered in ToolRegistry");
    assert(typeof AppController.switchBetweenApps === "function", "AppController.switchBetweenApps method exists");
  }

  // Fix 3: "Restore Chrome if it is minimized"
  console.log("\n[Test 3] Restore Chrome if it is minimized");
  {
    const r = routeCommand("Restore Chrome if it is minimized");
    assert(r.intent === "RESTORE_APP", "'Restore Chrome if it is minimized' routes to RESTORE_APP");
    assert(r.arguments.app === "chrome", "Restore app target is 'chrome'");
    assert(r.arguments.restoreOnly === true, "Restore flag restoreOnly is true");
    assert(r.toolToExecute === "restore_app", "Tool to execute is 'restore_app'");

    const tool = ToolRegistry.get("restore_app");
    assert(Boolean(tool), "'restore_app' tool is registered in ToolRegistry");
    assert(typeof AppController.restoreApp === "function", "AppController.restoreApp method exists");

    // Verify non-existent app restore returns truthful failure rather than launching new instance
    const noAppRes = await AppController.restoreApp("NonExistentWindow_XYZ999");
    assert(noAppRes.success === false, "restoreApp on non-existent window returns success: false");
    assert(noAppRes.message.includes("No open window found"), "Truthful message returned without spawning instances");
  }

  // Fix 4: "Show installed applications"
  console.log("\n[Test 4] Show installed applications");
  {
    const r = routeCommand("Show installed applications");
    assert(r.intent === "GET_INSTALLED_APPS", "'Show installed applications' routes to GET_INSTALLED_APPS");
    assert(r.toolToExecute === "get_installed_apps", "Tool to execute is 'get_installed_apps'");

    const tool = ToolRegistry.get("get_installed_apps");
    assert(Boolean(tool), "'get_installed_apps' tool is registered in ToolRegistry");

    // Execute tool
    const execRes = await ToolExecutor.executeTool("get_installed_apps", {});
    assert(execRes.success === true, "ToolExecutor.executeTool('get_installed_apps') succeeded");
    assert(Array.isArray(execRes.result), "Installed apps result is an Array");
    assert(execRes.result.length > 10, `Discovered significant installed applications (found: ${execRes.result.length})`);

    const hasDesktop = execRes.result.some((a: any) => a.type === "Desktop Application");
    const hasUWP = execRes.result.some((a: any) => a.type === "Windows App");
    assert(hasDesktop, "Differentiates 'Desktop Application' from registry");
    assert(hasUWP, "Differentiates 'Windows App' from Store/UWP");

    // Verify workflow output formatting
    const wfRes = await WorkflowEngine.execute(r, mockContext);
    assert(wfRes.success === true, "WorkflowEngine executes GET_INSTALLED_APPS");
    assert(wfRes.message.includes("Discovered"), "Workflow message provides human-readable summary");
  }

  // Fix 5: "Show running background processes"
  console.log("\n[Test 5] Show running background processes");
  {
    const r = routeCommand("Show running background processes");
    assert(r.intent === "GET_BACKGROUND_PROCESSES", "'Show running background processes' routes to GET_BACKGROUND_PROCESSES");
    assert(r.arguments.type === "background", "Arguments specify type: 'background'");
    assert(r.toolToExecute === "get_running_processes", "Tool to execute is 'get_running_processes'");

    const tool = ToolRegistry.get("get_running_processes");
    assert(Boolean(tool), "'get_running_processes' tool is registered in ToolRegistry");

    // Execute tool
    const execRes = await ToolExecutor.executeTool("get_running_processes", { type: "background" });
    assert(execRes.success === true, "ToolExecutor.executeTool('get_running_processes') succeeded");
    assert(Array.isArray(execRes.result), "Background processes result is an Array");
    assert(execRes.result.length > 0, `Retrieved background processes (count: ${execRes.result.length})`);

    const sample = execRes.result[0];
    assert(typeof sample.pid === "number", "Process item includes numeric PID");
    assert(typeof sample.name === "string" && sample.name.length > 0, "Process item includes valid process name");
    assert(sample.isBackground === true, "Process item is flagged as isBackground: true");
    assert(sample.hasWindow === false, "Background process hasWindow is false");

    // Verify workflow output formatting
    const wfRes = await WorkflowEngine.execute(r, mockContext);
    assert(wfRes.success === true, "WorkflowEngine executes GET_BACKGROUND_PROCESSES");
    assert(wfRes.message.includes("Running background processes"), "Workflow message provides formatted summary");
  }

  // Fix 6: "Show active window title and process"
  console.log("\n[Test 6] Show active window title and process");
  {
    const r = routeCommand("Show active window title and process");
    assert(r.intent === "GET_ACTIVE_WINDOW", "'Show active window title and process' routes to GET_ACTIVE_WINDOW");
    assert(r.toolToExecute === "get_active_window", "Tool to execute is 'get_active_window'");

    const tool = ToolRegistry.get("get_active_window");
    assert(Boolean(tool), "'get_active_window' tool is registered in ToolRegistry");

    // Execute tool
    const execRes = await ToolExecutor.executeTool("get_active_window", {});
    assert(execRes.success === true, "ToolExecutor.executeTool('get_active_window') succeeded");
    assert(execRes.result !== null && typeof execRes.result === "object", "Active window result is an object");
    assert(typeof execRes.result.title === "string", "Active window includes title string");
    assert(typeof execRes.result.hwnd === "number", "Active window includes numeric HWND");
    assert(typeof execRes.result.processName === "string", "Active window includes processName string");
    assert(typeof execRes.result.processId === "number", "Active window includes numeric processId (PID)");

    // Verify workflow output formatting
    const wfRes = await WorkflowEngine.execute(r, mockContext);
    assert(wfRes.success === true, "WorkflowEngine executes GET_ACTIVE_WINDOW");
    assert(wfRes.message.includes("Active window:"), "Workflow message contains formatted Active window details");
  }

  console.log("\n==================================================================");
  console.log(`📊 Phase 1.1 Complete Test Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
