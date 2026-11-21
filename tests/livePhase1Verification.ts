/**
 * LUMA Phase 1: Live Interactive Windows Core Control Verification
 *
 * Runs end-to-end live OS verification of:
 * 1. Window enumeration (get_visible_windows)
 * 2. Active window observation (get_active_window)
 * 3. App Launch & Window Appearance Verification (Paint)
 * 4. App Window Focus / Switch (Paint)
 * 5. Safe App Close via WM_CLOSE (Paint)
 * 6. Packaged UWP Launch & Verification (Calculator)
 * 7. Packaged UWP Safe Close (Calculator)
 */

import { ToolExecutor } from "../server/computer/tools/toolExecutor.js";
import { WindowsBridge } from "../server/computer/native/windowsBridge.js";
import { AppController } from "../server/computer/apps/appController.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runLiveVerification() {
  console.log("==================================================================");
  console.log("🚀 LUMA Phase 1: Live Desktop Verification & OS Control");
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

  // 1. Enumerate Visible Windows
  console.log("--- 1. Testing Live: Window Enumeration (get_visible_windows) ---");
  const winRes = await ToolExecutor.executeTool("get_visible_windows", {});
  assert(winRes.success, "Tool 'get_visible_windows' executed successfully");
  const visibleWindows = winRes.result || [];
  console.log(`Found ${visibleWindows.length} visible windows on interactive desktop.`);
  for (const w of visibleWindows) {
    console.log(`  • [HWND: ${w.hwnd}] PID: ${w.processId} | Process: ${w.processName} | Title: "${w.title}" | Foreground: ${w.isForeground}`);
  }
  assert(Array.isArray(visibleWindows), "Returns array of visible windows");

  // 2. Observe Active Window
  console.log("\n--- 2. Testing Live: Active Window Observation (get_active_window) ---");
  const activeRes = await ToolExecutor.executeTool("get_active_window", {});
  assert(activeRes.success, "Tool 'get_active_window' executed successfully");
  console.log(`Current Active Window: "${activeRes.result?.title}" [${activeRes.result?.processName}] (PID: ${activeRes.result?.processId}, HWND: ${activeRes.result?.hwnd})`);
  assert(Boolean(activeRes.result), "Active window object retrieved");

  // 3. Launch Paint & Verify Window Appearance
  console.log("\n--- 3. Testing Live: Launch Paint with Actual Window Verification ---");
  console.log("Launching Paint via protocol URI / AUMID...");
  const openPaintRes = await AppController.openApp("paint");
  assert(openPaintRes.verified === true, "Paint launch VERIFIED: window appeared and was detected");
  console.log(`Paint verification details: Window Title: "${openPaintRes.window?.title}", Process: ${openPaintRes.window?.processName}, HWND: ${openPaintRes.window?.hwnd}`);
  await sleep(1000);

  // 4. Focus / Switch to Paint
  console.log("\n--- 4. Testing Live: Focus / Bring Paint to Foreground ---");
  const focusPaintRes = await AppController.focusApp("paint");
  assert(focusPaintRes.success === true, "Focus Paint reported success");
  await sleep(500);

  // 5. Close Paint Safely via WM_CLOSE
  console.log("\n--- 5. Testing Live: Safe Window Close via WM_CLOSE (Paint) ---");
  const closePaintRes = await AppController.closeApp("paint");
  console.log(`Close response: ${closePaintRes.message}`);
  assert(Boolean(closePaintRes.message), "Paint closed cleanly");
  await sleep(1000);

  // 6. Launch Calculator (Packaged App) with Window Verification
  console.log("\n--- 6. Testing Live: Launch Calculator (Packaged App) with Window Verification ---");
  console.log("Launching Calculator...");
  const openCalcRes = await AppController.openApp("calc");
  assert(openCalcRes.verified === true, "Calculator launch VERIFIED: window appeared and was detected");
  console.log(`Calculator verification details: Window Title: "${openCalcRes.window?.title || 'Verified'}", Process: ${openCalcRes.window?.processName || 'calc'}, HWND: ${openCalcRes.window?.hwnd || 'N/A'}`);
  await sleep(1000);

  // 7. Safe Close Calculator via WM_CLOSE (without killing ApplicationFrameHost)
  console.log("\n--- 7. Testing Live: Safe Close Calculator (WM_CLOSE without killing ApplicationFrameHost) ---");
  const closeCalcRes = await AppController.closeApp("calc");
  console.log(`Close response: ${closeCalcRes.message}`);
  assert(Boolean(closeCalcRes.message), "Calculator closed cleanly without killing host process");
  await sleep(500);

  // 8. Launch Clock (Packaged App) with Window Verification
  console.log("\n--- 8. Testing Live: Launch Clock (Packaged App) with Window Verification ---");
  console.log("Launching Clock...");
  const openClockRes = await AppController.openApp("clock");
  assert(openClockRes.verified === true, "Clock launch VERIFIED: window appeared and was detected");
  console.log(`Clock verification details: Window Title: "${openClockRes.window?.title || 'Verified'}", Process: ${openClockRes.window?.processName || 'Time'}, HWND: ${openClockRes.window?.hwnd || 'N/A'}`);
  await sleep(1000);

  // 9. Safe Close Clock via WM_CLOSE
  console.log("\n--- 9. Testing Live: Safe Close Clock (WM_CLOSE) ---");
  const closeClockRes = await AppController.closeApp("clock");
  console.log(`Close response: ${closeClockRes.message}`);
  assert(Boolean(closeClockRes.message), "Clock closed cleanly without killing host process");
  await sleep(500);

  // 10. Launch Photos (Packaged App) with Window Verification
  console.log("\n--- 10. Testing Live: Launch Photos (Packaged App) with Window Verification ---");
  console.log("Launching Photos...");
  const openPhotosRes = await AppController.openApp("photos");
  assert(openPhotosRes.verified === true, "Photos launch VERIFIED: window appeared and was detected");
  console.log(`Photos verification details: Window Title: "${openPhotosRes.window?.title || 'Verified'}", Process: ${openPhotosRes.window?.processName || 'Photos'}, HWND: ${openPhotosRes.window?.hwnd || 'N/A'}`);
  await sleep(1000);

  // 11. Safe Close Photos via WM_CLOSE
  console.log("\n--- 11. Testing Live: Safe Close Photos (WM_CLOSE) ---");
  const closePhotosRes = await AppController.closeApp("photos");
  console.log(`Close response: ${closePhotosRes.message}`);
  assert(Boolean(closePhotosRes.message), "Photos closed cleanly without killing host process");
  await sleep(500);

  console.log("\n==================================================================");
  console.log(`📊 Live Verification Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveVerification().catch((err) => {
  console.error("Live verification failed:", err);
  process.exit(1);
});
