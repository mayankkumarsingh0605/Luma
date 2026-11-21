import { routeCommand } from "../src/router/commandRouter.js";
import { InstanceLockManager } from "../server/runtime/instanceLock.js";
import { StartupManager } from "../server/runtime/startupManager.js";
import { VoiceRuntimeManager } from "../server/voice/voiceRuntime.js";
import fs from "fs";
import path from "path";

console.log("=================================================");
console.log("  LUMA Phase 4: Voice Assistant Test Suite");
console.log("=================================================");

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✓ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`✗ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  // ---------------------------------------------------------------------------
  // 1. Wake Word & Embedded Command Parsing
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. Wake-Word Detection & Embedded Command Parsing ---");
  const parseUtterance = (raw: string) => {
    const isWake = /\b(hey\s+)?(luma|luna)\b/i.test(raw);
    const cleanCommand = raw.replace(/^(?:hey\s+)?(?:luma|luna)[,.]?\s*/i, "").trim();
    return { isWake, cleanCommand };
  };

  const u1 = parseUtterance("Hey Luma");
  assert(u1.isWake && u1.cleanCommand === "", "Detects standalone 'Hey Luma'");

  const u2 = parseUtterance("Luma");
  assert(u2.isWake && u2.cleanCommand === "", "Detects standalone 'Luma'");

  const u3 = parseUtterance("Hey Luma, search keyboard on Amazon");
  assert(u3.isWake && u3.cleanCommand === "search keyboard on Amazon", "Extracts command from 'Hey Luma, search keyboard on Amazon'");

  const u4 = parseUtterance("Hey Luma, open Flipkart and search kurti");
  assert(u4.isWake && u4.cleanCommand === "open Flipkart and search kurti", "Extracts command from 'Hey Luma, open Flipkart and search kurti'");

  const u5 = parseUtterance("Hey Luma, search music on YouTube");
  assert(u5.isWake && u5.cleanCommand === "search music on YouTube", "Extracts command from 'Hey Luma, search music on YouTube'");

  const u6 = parseUtterance("open chrome");
  assert(!u6.isWake && u6.cleanCommand === "open chrome", "Regular command without wake word not flagged as wake");

  // ---------------------------------------------------------------------------
  // 2. Deterministic Routing for Spoken Commands
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Deterministic Routing for Spoken Commands ---");

  // Command A: "Hey Luma, search keyboard on Amazon"
  const rA = routeCommand(parseUtterance("Hey Luma, search keyboard on Amazon").cleanCommand);
  assert(rA.intent === "SEARCH_PRODUCT", "Cmd A: Intent is SEARCH_PRODUCT");
  assert(rA.arguments.target === "amazon", "Cmd A: Target is Amazon");
  assert(rA.arguments.query === "keyboard", "Cmd A: Query is keyboard");

  // Command B: "Hey Luma, open Flipkart and search kurti"
  const rB = routeCommand(parseUtterance("Hey Luma, open Flipkart and search kurti").cleanCommand);
  assert(rB.intent === "COMPOUND_GOAL", "Cmd B: Intent is COMPOUND_GOAL");
  assert(rB.subCommands?.length === 2, "Cmd B: Splits into 2 sub-commands");
  const rB_step1 = routeCommand(rB.subCommands![0]);
  const rB_step2 = routeCommand(rB.subCommands![1], "flipkart");
  assert(rB_step1.intent === "OPEN_WEBSITE" && rB_step1.arguments.target === "flipkart", "Cmd B Step 1: Open Flipkart");
  assert(rB_step2.intent === "SEARCH_PRODUCT" && rB_step2.arguments.target === "flipkart" && rB_step2.arguments.query === "kurti", "Cmd B Step 2: Search kurti on Flipkart (never Amazon)");

  // Command C: "Hey Luma, search music on YouTube"
  const rC = routeCommand(parseUtterance("Hey Luma, search music on YouTube").cleanCommand);
  assert(rC.intent === "SEARCH_WEB", "Cmd C: Intent is SEARCH_WEB");
  assert(rC.arguments.target === "youtube", "Cmd C: Target is YouTube (never Amazon)");
  assert(rC.arguments.query === "music", "Cmd C: Query is music");

  // Command D: "Hey Luma, open Chrome and search Chrome Web Store"
  const rD = routeCommand(parseUtterance("Hey Luma, open Chrome and search Chrome Web Store").cleanCommand);
  assert(rD.intent === "COMPOUND_GOAL", "Cmd D: Intent is COMPOUND_GOAL");
  assert(rD.subCommands?.length === 2, "Cmd D: Splits into 2 sub-commands");
  const rD_step1 = routeCommand(rD.subCommands![0]);
  const rD_step2 = routeCommand(rD.subCommands![1]);
  assert(rD_step1.intent === "OPEN_APP" && rD_step1.arguments.app === "chrome", "Cmd D Step 1: Open Chrome");
  assert(rD_step2.intent === "SEARCH_WEB" && rD_step2.arguments.target === "google" && rD_step2.arguments.query === "chrome web store", "Cmd D Step 2: General Google search for 'chrome web store' (never Amazon)");

  // ---------------------------------------------------------------------------
  // 3. Spoken Response Generation (Verified Results Only)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Spoken Response Generation ---");
  const runtime = VoiceRuntimeManager.getInstance();

  // Test price response generation
  const mockPriceResult = {
    success: true,
    message: "Product inspected",
    data: {
      title: "Zebronics Wireless Gaming Keyboard",
      price: "₹1,299",
      productUrl: "https://www.amazon.in/dp/B08XXXXX",
    },
  };
  const spokenPrice = (runtime as any).generateSpokenResponse(rA, mockPriceResult);
  assert(spokenPrice.includes("1,299"), "Spoken response includes exact verified price");
  assert(spokenPrice.includes("Zebronics Wireless Gaming Keyboard"), "Spoken response includes verified product title");

  // Test video playback response generation
  const mockVideoResult = {
    success: true,
    message: "Playing video",
    data: {
      title: "Relaxing Music - Deep Sleep 🌿",
      url: "https://www.youtube.com/watch?v=123",
    },
  };
  const spokenVideo = (runtime as any).generateSpokenResponse(
    { intent: "PLAY_FIRST_RESULT", arguments: {} },
    mockVideoResult
  );
  assert(spokenVideo.includes("Relaxing Music"), "Spoken video response includes verified track title");

  // Test failed action feedback
  const mockFailedResult = {
    success: false,
    message: "Could not find any products matching 'xyz987invalid'.",
  };
  const spokenFail = (runtime as any).generateSpokenResponse(rA, mockFailedResult);
  assert(spokenFail.includes("Could not find any products"), "Spoken response explains failure accurately");

  // ---------------------------------------------------------------------------
  // 4. Privacy & Microphone Mute Controls
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Microphone Privacy & Mute Controls ---");
  runtime.setMute(true);
  const statusMuted = runtime.getStatus();
  assert(statusMuted.isMuted === true, "Voice runtime state reflects isMuted = true");
  assert(statusMuted.state === "MUTED", "Voice runtime state transitions to MUTED");

  runtime.setMute(false);
  const statusUnmuted = runtime.getStatus();
  assert(statusUnmuted.isMuted === false, "Voice runtime state reflects isMuted = false");
  assert(statusUnmuted.state === "LISTENING", "Voice runtime state transitions back to LISTENING");

  // TTS mute toggle
  runtime.setTtsMute(true);
  assert(runtime.getStatus().isTtsMuted === true, "TTS mute set to true");
  runtime.setTtsMute(false);
  assert(runtime.getStatus().isTtsMuted === false, "TTS mute set to false");

  // ---------------------------------------------------------------------------
  // 5. Single-Instance Runtime Lock
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Single-Instance Runtime Lock ---");
  const lockAcquired = await InstanceLockManager.acquireLock(3001);
  assert(lockAcquired.acquired === true, "Acquired single-instance lock for current process");

  const lockFile = path.resolve(process.cwd(), ".luma_runtime.lock");
  assert(fs.existsSync(lockFile), "Lock file created on disk (.luma_runtime.lock)");

  const lockContent = JSON.parse(fs.readFileSync(lockFile, "utf-8"));
  assert(lockContent.pid === process.pid, "Lock file records current process PID");
  assert(lockContent.port === 3001, "Lock file records port 3001");

  InstanceLockManager.releaseLock();
  assert(!fs.existsSync(lockFile), "Lock file released and removed on clean exit");

  // ---------------------------------------------------------------------------
  // 6. Windows Startup Configuration
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Windows Startup Configuration ---");
  const vbsPath = path.resolve(process.cwd(), "scripts", "start-background.vbs");
  assert(fs.existsSync(vbsPath), "Silent background startup script exists (start-background.vbs)");

  const trayPath = path.resolve(process.cwd(), "scripts", "lumaTray.ps1");
  assert(fs.existsSync(trayPath), "System tray daemon script exists (lumaTray.ps1)");

  // Summary
  console.log("\n=================================================");
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test threw error:", err);
  process.exit(1);
});
