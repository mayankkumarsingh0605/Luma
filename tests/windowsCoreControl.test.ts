/**
 * LUMA Phase 1: Windows Core Control & Active Window Observation Test Suite
 *
 * Comprehensive automated verification for:
 * 1. Dynamic Application Discovery (Paint, Clock, Photos, Calculator, Chrome, VS Code)
 * 2. Protocol URIs & AUMID resolution
 * 3. Conversational Prefix Stripping & Command Normalization
 * 4. Deterministic Intent Routing (OPEN_APP, CLOSE_APP, FOCUS_APP, GET_VISIBLE_WINDOWS, GET_ACTIVE_WINDOW)
 * 5. Window Enumeration & Active Window Observation
 * 6. Protection of Browser & Web Search Routing
 */

import { AppDiscovery } from "../server/computer/apps/appDiscovery.js";
import { AppRegistry } from "../server/computer/apps/appRegistry.js";
import { ToolRegistry } from "../server/computer/tools/toolRegistry.js";
import { SystemController } from "../server/computer/system/systemController.js";
import { routeCommand } from "../src/router/commandRouter.js";
import { stripConversationalPrefixes, normalizeCommand } from "../src/router/normalizer.js";

async function runPhase1Tests() {
  console.log("==================================================================");
  console.log("🪟 LUMA Phase 1: Windows Core Control & Window Observation Tests");
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
  // 1. Dynamic Application Discovery & Protocol/AUMID Resolution
  // ---------------------------------------------------------------------------
  console.log("--- 1. Testing: Dynamic Application Discovery & Target Resolution ---");
  {
    // Paint
    const paint = await AppDiscovery.findApp("paint");
    assert(Boolean(paint), "Paint discovered dynamically");
    assert(paint?.displayName === "Paint", "Paint displayName matches 'Paint'");
    assert(paint?.protocolUri === "ms-paint:", "Paint resolves protocol URI 'ms-paint:'");
    const paintTarget = await AppDiscovery.resolveLaunch(paint!);
    assert(paintTarget.type === "protocol" && paintTarget.target === "ms-paint:", "Paint resolves launch target to 'ms-paint:'");

    // Clock
    const clock = await AppDiscovery.findApp("clock");
    assert(Boolean(clock), "Clock discovered dynamically");
    assert(clock?.displayName === "Clock", "Clock displayName matches 'Clock'");
    assert(clock?.protocolUri === "ms-clock:", "Clock resolves protocol URI 'ms-clock:'");
    const clockTarget = await AppDiscovery.resolveLaunch(clock!);
    assert(clockTarget.type === "protocol" && clockTarget.target === "ms-clock:", "Clock resolves launch target to 'ms-clock:'");

    // Photos
    const photos = await AppDiscovery.findApp("photos");
    assert(Boolean(photos), "Photos discovered dynamically");
    assert(photos?.displayName === "Photos", "Photos displayName matches 'Photos'");
    assert(photos?.protocolUri === "ms-photos:", "Photos resolves protocol URI 'ms-photos:'");
    const photosTarget = await AppDiscovery.resolveLaunch(photos!);
    assert(photosTarget.type === "protocol" && photosTarget.target === "ms-photos:", "Photos resolves launch target to 'ms-photos:'");

    // Calculator
    const calc = await AppDiscovery.findApp("calc");
    assert(Boolean(calc), "Calculator discovered dynamically via alias 'calc'");
    assert(calc?.displayName === "Calculator", "Calculator displayName matches 'Calculator'");
    assert(calc?.protocolUri === "calculator:", "Calculator resolves protocol URI 'calculator:'");

    // Google Chrome
    const chrome = await AppDiscovery.findApp("chrome");
    assert(Boolean(chrome), "Google Chrome discovered");
    assert(chrome?.displayName === "Google Chrome", "Chrome displayName matches 'Google Chrome'");

    // Visual Studio Code
    const vscode = await AppDiscovery.findApp("vscode");
    assert(Boolean(vscode), "Visual Studio Code discovered");
    assert(vscode?.displayName === "Visual Studio Code", "VS Code displayName matches 'Visual Studio Code'");
  }

  // ---------------------------------------------------------------------------
  // 2. Universal Conversational Prefix Stripping
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing: Universal Conversational Prefix Stripping ---");
  {
    assert(
      stripConversationalPrefixes("Please open Paint") === "open Paint",
      "Strips 'Please ' -> 'open Paint'"
    );
    assert(
      stripConversationalPrefixes("Can you open Paint for me?") === "open Paint",
      "Strips 'Can you ' and ' for me?' -> 'open Paint'"
    );
    assert(
      stripConversationalPrefixes("Could you please open Clock?") === "open Clock",
      "Strips 'Could you please ' -> 'open Clock'"
    );
    assert(
      stripConversationalPrefixes("Kindly show all open windows") === "show all open windows",
      "Strips 'Kindly ' -> 'show all open windows'"
    );
    assert(
      stripConversationalPrefixes("Luma, tell me which windows are active") === "tell me which windows are active",
      "Strips 'Luma, ' -> 'tell me which windows are active'"
    );
    assert(
      stripConversationalPrefixes("Hey Luma, open Calculator") === "open Calculator",
      "Strips 'Hey Luma, ' -> 'open Calculator'"
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Application Intent Routing
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing: Application Intent Routing ---");
  {
    // Natural language variations for Open
    const r1 = routeCommand("Please open Paint");
    assert(r1.intent === "OPEN_APP", "'Please open Paint' routes to OPEN_APP");
    assert(r1.arguments.app === "paint", "'Please open Paint' target is 'paint'");

    const r2 = routeCommand("Can you open Clock for me?");
    assert(r2.intent === "OPEN_APP", "'Can you open Clock for me?' routes to OPEN_APP");
    assert(r2.arguments.app === "clock", "'Can you open Clock for me?' target is 'clock'");

    const r3 = routeCommand("open photos");
    assert(r3.intent === "OPEN_APP", "'open photos' routes to OPEN_APP");
    assert(r3.arguments.app === "photos", "'open photos' target is 'photos'");

    const r4 = routeCommand("open calculator");
    assert(r4.intent === "OPEN_APP", "'open calculator' routes to OPEN_APP");
    assert(r4.arguments.app === "calc", "'open calculator' target is 'calc'");

    // Focus / Switch
    const r5 = routeCommand("switch to chrome");
    assert(r5.intent === "FOCUS_APP", "'switch to chrome' routes to FOCUS_APP");
    assert(r5.arguments.app === "chrome", "'switch to chrome' target is 'chrome'");

    const r6 = routeCommand("focus paint");
    assert(r6.intent === "FOCUS_APP", "'focus paint' routes to FOCUS_APP");
    assert(r6.arguments.app === "paint", "'focus paint' target is 'paint'");

    // Close
    const r7 = routeCommand("close paint");
    assert(r7.intent === "CLOSE_APP", "'close paint' routes to CLOSE_APP");
    assert(r7.arguments.app === "paint", "'close paint' target is 'paint'");

    const r8 = routeCommand("paint band karo");
    assert(r8.intent === "CLOSE_APP", "'paint band karo' (Hinglish) routes to CLOSE_APP");
  }

  // ---------------------------------------------------------------------------
  // 4. Window Observation Intent Routing
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing: Window Observation Intent Routing ---");
  {
    // All open visible windows (Plural)
    const w1 = routeCommand("Tell me which windows are currently active");
    assert(w1.intent === "GET_VISIBLE_WINDOWS", "'Tell me which windows are currently active' -> GET_VISIBLE_WINDOWS");

    const w2 = routeCommand("Show all open windows");
    assert(w2.intent === "GET_VISIBLE_WINDOWS", "'Show all open windows' -> GET_VISIBLE_WINDOWS");

    const w3 = routeCommand("What is running on my desktop?");
    assert(w3.intent === "GET_VISIBLE_WINDOWS", "'What is running on my desktop?' -> GET_VISIBLE_WINDOWS");

    const w4 = routeCommand("which windows are active");
    assert(w4.intent === "GET_VISIBLE_WINDOWS", "'which windows are active' -> GET_VISIBLE_WINDOWS");

    const w5 = routeCommand("open windows");
    assert(w5.intent === "GET_VISIBLE_WINDOWS", "'open windows' -> GET_VISIBLE_WINDOWS");

    // Single active/foreground window (Singular)
    const a1 = routeCommand("Which window is active?");
    assert(a1.intent === "GET_ACTIVE_WINDOW", "'Which window is active?' -> GET_ACTIVE_WINDOW");

    const a2 = routeCommand("What window is active?");
    assert(a2.intent === "GET_ACTIVE_WINDOW", "'What window is active?' -> GET_ACTIVE_WINDOW");

    const a3 = routeCommand("Which application is currently active?");
    assert(a3.intent === "GET_ACTIVE_WINDOW", "'Which application is currently active?' -> GET_ACTIVE_WINDOW");

    const a4 = routeCommand("active window");
    assert(a4.intent === "GET_ACTIVE_WINDOW", "'active window' -> GET_ACTIVE_WINDOW");
  }

  // ---------------------------------------------------------------------------
  // 5. Tool Registry Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Testing: Tool Registry Verification ---");
  {
    const winTool = ToolRegistry.get("get_visible_windows");
    assert(Boolean(winTool), "'get_visible_windows' tool registered");
    assert(winTool?.definition.safetyLevel === "SAFE", "'get_visible_windows' is SAFE");
    assert(winTool?.definition.category === "system", "'get_visible_windows' category is 'system'");

    const activeTool = ToolRegistry.get("get_active_window");
    assert(Boolean(activeTool), "'get_active_window' tool registered");

    const openTool = ToolRegistry.get("open_app");
    assert(Boolean(openTool), "'open_app' tool registered");

    const closeTool = ToolRegistry.get("close_app");
    assert(Boolean(closeTool), "'close_app' tool registered");

    const focusTool = ToolRegistry.get("focus_app");
    assert(Boolean(focusTool), "'focus_app' tool registered");
  }

  // ---------------------------------------------------------------------------
  // 6. Preservation of Browser Search & Navigation (Phase 2 Alignment)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Testing: Preservation of Browser Search & Navigation ---");
  {
    const s1 = routeCommand("Open Chrome and search Amazon for wireless keyboards");
    assert(s1.intent === "COMPOUND_GOAL", "Amazon search command splits into COMPOUND_GOAL");

    const s2 = routeCommand("Search Amazon for laptops");
    assert(s2.intent === "SEARCH" || s2.intent === "SEARCH_PRODUCT", "Search command not confused with app launch");

    const s3 = routeCommand("open youtube");
    assert(s3.intent === "OPEN_WEBSITE" || s3.intent === "OPEN_OR_SEARCH_WEBSITE", "Website open not confused with app launch");
  }

  console.log("\n==================================================================");
  console.log(`📊 Phase 1 Test Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
