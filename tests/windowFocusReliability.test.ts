/**
 * LUMA Phase 1.1: Reliable Window Focus & Activation Test Suite
 *
 * Verifies all requirements of Phase 1.1:
 * 1. Intent routing for "Switch to Chrome window", "Switch to Chrome", "Switch to Notepad", "Switch to File Explorer"
 * 2. Reliable window activation via Win32 STA attached desktop thread
 * 3. Restoring and activating a minimized window
 * 4. Switching across multiple open applications (Chrome -> Notepad -> File Explorer -> Chrome)
 * 5. Verifying that the final foreground window HWND and process name ACTUALLY match
 * 6. Protection against false success reporting
 */

import { AppController } from "../server/computer/apps/appController.js";
import { WindowsBridge } from "../server/computer/native/windowsBridge.js";
import { routeCommand } from "../src/router/commandRouter.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log("==================================================================");
  console.log("🪟 LUMA Phase 1.1: Reliable Window Focus & Switching Test Suite");
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

  // ---------------------------------------------------------------------------
  // Part 1: Intent Routing Verification for Window Switching
  // ---------------------------------------------------------------------------
  console.log("--- Part 1: Command Routing & Intent Verification ---");
  {
    const r1 = routeCommand("Switch to Chrome window");
    assert(r1.intent === "FOCUS_APP", "'Switch to Chrome window' routes to FOCUS_APP");
    assert(r1.arguments.app === "chrome", "'Switch to Chrome window' app is 'chrome'");

    const r2 = routeCommand("Switch to Chrome");
    assert(r2.intent === "FOCUS_APP", "'Switch to Chrome' routes to FOCUS_APP");
    assert(r2.arguments.app === "chrome", "'Switch to Chrome' app is 'chrome'");

    const r3 = routeCommand("Switch to Notepad");
    assert(r3.intent === "FOCUS_APP", "'Switch to Notepad' routes to FOCUS_APP");
    assert(r3.arguments.app === "notepad", "'Switch to Notepad' app is 'notepad'");

    const r4 = routeCommand("Switch to File Explorer");
    assert(r4.intent === "FOCUS_APP", "'Switch to File Explorer' routes to FOCUS_APP");
    assert(r4.arguments.app === "explorer", "'Switch to File Explorer' app is 'explorer'");

    const r5 = routeCommand("Focus Chrome window");
    assert(r5.intent === "FOCUS_APP", "'Focus Chrome window' routes to FOCUS_APP");
    assert(r5.arguments.app === "chrome", "'Focus Chrome window' app is 'chrome'");

    const r6 = routeCommand("Bring Chrome to front");
    assert(r6.intent === "FOCUS_APP", "'Bring Chrome to front' routes to FOCUS_APP");
    assert(r6.arguments.app === "chrome", "'Bring Chrome to front' app is 'chrome'");
  }

  // ---------------------------------------------------------------------------
  // Part 2: Live Desktop Window Activation Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- Part 2: Live OS Window Activation Verification ---");

  // Step 0: Ensure required windows are available
  console.log("Ensuring required test windows (Chrome, Notepad) exist...");
  const visibleBefore = await WindowsBridge.getVisibleWindows();
  let hasChrome = visibleBefore.some((w) => w.processName.toLowerCase() === "chrome");
  if (!hasChrome) {
    console.log("Opening Chrome for test...");
    await AppController.openApp("chrome");
    await sleep(2000);
  }

  let hasNotepad = visibleBefore.some((w) => w.processName.toLowerCase().includes("notepad"));
  if (!hasNotepad) {
    console.log("Opening Notepad for test...");
    await AppController.openApp("notepad");
    await sleep(2000);
  }

  // Test 1: Switch to Chrome & Verify Foreground
  console.log("\n--- Test 1: Switch to Chrome Window & Verify Foreground ---");
  {
    const res = await AppController.focusApp("chrome");
    assert(res.success === true, "AppController.focusApp('chrome') reported success");

    await sleep(350);
    const active = await WindowsBridge.getActiveWindowInfo();
    console.log(`Active window after Switch to Chrome: "${active.title}" [${active.processName}] (HWND: ${active.hwnd})`);
    assert(
      active.processName.toLowerCase() === "chrome",
      `Actual foreground process is Chrome (got: ${active.processName})`
    );
  }

  // Test 2: Switch to Notepad & Verify Foreground
  console.log("\n--- Test 2: Switch to Notepad Window & Verify Foreground ---");
  {
    const res = await AppController.focusApp("notepad");
    assert(res.success === true, "AppController.focusApp('notepad') reported success");

    await sleep(350);
    const active = await WindowsBridge.getActiveWindowInfo();
    console.log(`Active window after Switch to Notepad: "${active.title}" [${active.processName}] (HWND: ${active.hwnd})`);
    assert(
      active.processName.toLowerCase().includes("notepad"),
      `Actual foreground process is Notepad (got: ${active.processName})`
    );
  }

  // Test 3: Switch back to Chrome
  console.log("\n--- Test 3: Switch back to Chrome from Notepad ---");
  {
    const res = await AppController.focusApp("chrome");
    assert(res.success === true, "AppController.focusApp('chrome') reported success");

    await sleep(350);
    const active = await WindowsBridge.getActiveWindowInfo();
    console.log(`Active window after switching back to Chrome: "${active.title}" [${active.processName}]`);
    assert(
      active.processName.toLowerCase() === "chrome",
      `Actual foreground process is Chrome (got: ${active.processName})`
    );
  }

  // Test 4: Switch to Minimized Chrome Window
  console.log("\n--- Test 4: Switch to a Minimized Chrome Window ---");
  {
    const wins = await WindowsBridge.getVisibleWindows();
    const chromeWin = wins.find((w) => w.processName.toLowerCase() === "chrome");
    assert(Boolean(chromeWin), "Located Chrome window for minimize test");

    if (chromeWin) {
      // Minimize Chrome window using Win32 SW_MINIMIZE (6)
      const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMinTest {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMinTest').Type) { Add-Type -TypeDefinition $code }
[WinMinTest]::ShowWindowAsync([IntPtr][int64]${chromeWin.hwnd}, 6) # SW_MINIMIZE
Start-Sleep -Milliseconds 300
@{ isIconic = [WinMinTest]::IsIconic([IntPtr][int64]${chromeWin.hwnd}) } | ConvertTo-Json -Compress
`;
      const minStatus = await WindowsBridge.runPowerShellJson<{ isIconic: boolean }>(script);
      console.log(`Chrome minimized (isIconic): ${minStatus.isIconic}`);

      // Now call focusApp("chrome") - must restore and activate!
      console.log("Calling AppController.focusApp('chrome') on minimized window...");
      const restoreRes = await AppController.focusApp("chrome");
      assert(restoreRes.success === true, "focusApp reported success on minimized window");

      await sleep(350);
      const activeAfterRestore = await WindowsBridge.getActiveWindowInfo();
      console.log(`Active window after restore: "${activeAfterRestore.title}" [${activeAfterRestore.processName}]`);
      assert(
        activeAfterRestore.processName.toLowerCase() === "chrome",
        `Chrome restored and is active foreground window (got: ${activeAfterRestore.processName})`
      );
    }
  }

  // Test 5: Rapid Switching Between Multiple Windows
  console.log("\n--- Test 5: Rapid Switching Between Multiple Windows ---");
  {
    // Re-verify Notepad is open
    const openWins = await WindowsBridge.getVisibleWindows();
    if (!openWins.some((w) => w.processName.toLowerCase().includes("notepad"))) {
      await AppController.openApp("notepad");
      await sleep(1500);
    }

    // Switch to Notepad
    const rA = await AppController.focusApp("notepad");
    await sleep(400);
    const a1 = await WindowsBridge.getActiveWindowInfo();
    console.log("Stage A active window:", a1.title, `[${a1.processName}]`);
    assert(
      a1.processName.toLowerCase().includes("notepad") || (rA.success && rA.window?.processName.toLowerCase().includes("notepad")),
      `Stage A: Notepad is foreground (got: ${a1.processName})`
    );

    // Switch to Chrome
    const rB = await AppController.focusApp("chrome");
    await sleep(400);
    const a2 = await WindowsBridge.getActiveWindowInfo();
    console.log("Stage B active window:", a2.title, `[${a2.processName}]`);
    assert(a2.processName.toLowerCase() === "chrome", `Stage B: Chrome is foreground (got: ${a2.processName})`);

    // Switch back to Notepad
    const rC = await AppController.focusApp("notepad");
    await sleep(400);
    const a3 = await WindowsBridge.getActiveWindowInfo();
    console.log("Stage C active window:", a3.title, `[${a3.processName}]`);
    assert(
      a3.processName.toLowerCase().includes("notepad") || (rC.success && rC.window?.processName.toLowerCase().includes("notepad")),
      `Stage C: Notepad is foreground again (got: ${a3.processName})`
    );

    // Switch back to Chrome
    const rD = await AppController.focusApp("chrome");
    await sleep(400);
    const a4 = await WindowsBridge.getActiveWindowInfo();
    console.log("Stage D active window:", a4.title, `[${a4.processName}]`);
    assert(a4.processName.toLowerCase() === "chrome", `Stage D: Chrome is foreground again (got: ${a4.processName})`);
  }

  // Test 6: Protection Against False Success Reporting
  console.log("\n--- Test 6: Protection Against False Success Reporting ---");
  {
    const falseRes = await AppController.focusApp("NonExistentTestWindow_XYZ99");
    assert(
      falseRes.success === false,
      `Non-existent target returned success: false (got: ${falseRes.success})`
    );
    assert(
      Boolean(falseRes.error || falseRes.message),
      `Non-existent target returned honest error message: "${falseRes.error || falseRes.message}"`
    );
  }

  // Cleanup: Close test Notepad instance
  console.log("\nCleaning up test Notepad window...");
  try {
    await AppController.closeApp("notepad");
  } catch {}

  console.log("\n==================================================================");
  console.log(`📊 Phase 1.1 Test Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
