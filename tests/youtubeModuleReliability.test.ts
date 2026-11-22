import { routeCommand } from "../src/router/commandRouter.js";
import { splitCompoundCommand } from "../src/router/normalizer.js";
import { TaskPlanner } from "../src/agent/taskPlanner.js";
import { ComputerStateManager } from "../src/state/computerState.js";
import { YouTubeModule } from "../server/computer/browser/modules/youtubeModule.js";
import { ToolRegistry } from "../server/computer/tools/toolRegistry.js";
import { BrowserController } from "../server/computer/browser/browserController.js";
import { BrowserAgent } from "../src/agent/browserAgent.js";

console.log("==================================================================");
console.log("  LUMA YouTube Module Reliability & Task Planning Isolation Suite");
console.log("==================================================================");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✓ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`✗ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  // =========================================================================
  // PART 1: MANDATORY TASK-PLAN ISOLATION TESTS
  // =========================================================================
  console.log("\n--- PART 1: Task Planning & Execution State Isolation ---");

  // Mandatory Test A: "Open Chrome, open a new tab, and visit GitHub."
  const cmdA = "Open Chrome, open a new tab, and visit GitHub.";
  const isAgentGoalA = TaskPlanner.isAgentGoal(cmdA);
  assert(!isAgentGoalA, "Test A: 'Open Chrome, open a new tab, and visit GitHub.' is NOT an agent goal");

  const subCmdsA = splitCompoundCommand(cmdA);
  assert(subCmdsA.length === 3, `Test A: Splits into 3 sequential sub-commands (found: ${subCmdsA.length})`);
  assert(subCmdsA[0].toLowerCase().includes("chrome"), "Test A: Sub-command 1 targets Chrome");
  assert(subCmdsA[1].toLowerCase().includes("tab"), "Test A: Sub-command 2 targets new tab");
  assert(subCmdsA[2].toLowerCase().includes("github"), "Test A: Sub-command 3 targets GitHub");

  const routedA1 = routeCommand(subCmdsA[0]);
  const routedA2 = routeCommand(subCmdsA[1]);
  const routedA3 = routeCommand(subCmdsA[2]);
  assert(routedA1.intent === "OPEN_APP", "Test A1 routes to OPEN_APP");
  assert(routedA2.intent === "NEW_TAB", "Test A2 routes to NEW_TAB");
  assert(routedA3.intent === "OPEN_WEBSITE", "Test A3 routes to OPEN_WEBSITE");

  // Verify zero search, zero Amazon, zero keyboards
  const allArgsA = JSON.stringify([routedA1, routedA2, routedA3]).toLowerCase();
  assert(!allArgsA.includes("search"), "Test A: 0 search actions generated");
  assert(!allArgsA.includes("amazon"), "Test A: 0 Amazon actions generated");
  assert(!allArgsA.includes("keyboard"), "Test A: 0 wireless keyboard actions generated");

  // Mandatory Test B: "Open Google and search for Python tutorials."
  const cmdB = "Open Google and search for Python tutorials.";
  const subCmdsB = splitCompoundCommand(cmdB);
  assert(subCmdsB.length === 2, `Test B: Splits into 2 sub-commands (found: ${subCmdsB.length})`);

  const routedB1 = routeCommand(subCmdsB[0]);
  assert(routedB1.intent === "OPEN_WEBSITE" && routedB1.arguments.target === "google", "Test B1: Opens Google");

  ComputerStateManager.update({ active_app: "chrome", current_url: "https://www.google.com" });
  const routedB2 = routeCommand(subCmdsB[1]);
  assert(routedB2.intent === "SEARCH_WEB", "Test B2: routes to SEARCH_WEB");
  assert(routedB2.arguments.target === "google", "Test B2: target is Google (NOT YouTube, NOT Amazon)");
  assert(routedB2.arguments.query === "python tutorials", "Test B2: query preserved exactly");

  // Mandatory Test C: "Open YouTube and search for Python tutorials."
  const cmdC = "Open YouTube and search for Python tutorials.";
  const subCmdsC = splitCompoundCommand(cmdC);
  assert(subCmdsC.length === 2, `Test C: Splits into 2 sub-commands (found: ${subCmdsC.length})`);

  const routedC1 = routeCommand(subCmdsC[0]);
  assert(routedC1.intent === "OPEN_WEBSITE" && routedC1.arguments.target === "youtube", "Test C1: Opens YouTube");

  ComputerStateManager.update({ active_app: "chrome", current_url: "https://www.youtube.com" });
  const routedC2 = routeCommand(subCmdsC[1]);
  assert(routedC2.intent === "SEARCH_WEB", "Test C2: routes to SEARCH_WEB");
  assert(routedC2.arguments.target === "youtube", "Test C2: target is YouTube (NOT Google, NOT Amazon)");
  assert(routedC2.arguments.query === "python tutorials", "Test C2: query preserved exactly");

  // Test D: Consecutive execution verifying zero state leakage
  ComputerStateManager.reset();
  const planCheck1 = TaskPlanner.planTask("Find wireless keyboards on Amazon");
  assert(planCheck1.steps.length > 0, "Legitimate search creates plan");
  const searchStep = planCheck1.steps.find((s) => s.actionType === "search" || s.goal.toLowerCase().includes("search"));
  assert(searchStep?.params?.query === "wireless keyboards", "Query is wireless keyboards");

  // Immediately route an unrelated command
  const unrelatedCmd = "Open notepad";
  const routedUnrelated = routeCommand(unrelatedCmd);
  assert(routedUnrelated.intent === "OPEN_APP" && routedUnrelated.arguments.app === "notepad", "Unrelated command has zero residual state from prior search");

  // =========================================================================
  // PART 2: YOUTUBE VIDEO SEEKING (FORWARD & BACKWARD)
  // =========================================================================
  console.log("\n--- PART 2: YouTube Video Seeking (English & Hinglish) ---");

  const seekTests = [
    { cmd: "Fast forward 10 seconds", expectedSeconds: 10 },
    { cmd: "Skip ahead 30 seconds", expectedSeconds: 30 },
    { cmd: "Forward 15s", expectedSeconds: 15 },
    { cmd: "Skip ahead 1 minute", expectedSeconds: 60 },
    { cmd: "Rewind 20 seconds", expectedSeconds: -20 },
    { cmd: "Go back 1 minute", expectedSeconds: -60 },
    { cmd: "Skip back 10s", expectedSeconds: -10 },
    { cmd: "10 second aage karo", expectedSeconds: 10 },
    { cmd: "20 second peeche karo", expectedSeconds: -20 },
    { cmd: "aage 10 second", expectedSeconds: 10 },
    { cmd: "peeche 15 second", expectedSeconds: -15 },
  ];

  for (const t of seekTests) {
    const r = routeCommand(t.cmd);
    assert(r.intent === "YOUTUBE_SEEK", `Seek routing: "${t.cmd}" -> YOUTUBE_SEEK`);
    assert(r.arguments.seconds === t.expectedSeconds, `Seek offset matches: ${t.expectedSeconds}s`);
  }

  // Unit Test YouTubeModule.seek on a mock page
  const ytMod = new YouTubeModule();
  const mockVideoState = { currentTime: 40, duration: 200 };
  const mockPage: any = {
    dismissPopups: async () => {},
    evaluate: async (fn: any, arg: any) => {
      // Simulate evaluate with mockVideoState
      const delta = arg;
      const oldTime = mockVideoState.currentTime;
      let newTime = oldTime + delta;
      if (newTime < 0) newTime = 0;
      if (mockVideoState.duration > 0 && newTime > mockVideoState.duration) newTime = mockVideoState.duration;
      mockVideoState.currentTime = newTime;
      return {
        success: true,
        oldTime: Math.round(oldTime),
        newTime: Math.round(newTime),
        duration: Math.round(mockVideoState.duration),
      };
    },
    locator: () => ({
      first: () => ({ isVisible: async () => false, click: async () => {} }),
    }),
  };

  const seekResult = await ytMod.seek(mockPage, 15);
  assert(seekResult.success, "seek() executes successfully");
  assert(seekResult.newTime === 55, `seek(+15) updated time from 40 to 55 (got ${seekResult.newTime})`);
  assert(seekResult.message.includes("55"), "seek message formats new time correctly");

  // Test backward seek with bounds clamping
  const seekClamp = await ytMod.seek(mockPage, -100);
  assert(seekClamp.success, "seek(-100) executes with boundary protection");
  assert(seekClamp.newTime === 0, `seek(-100) clamped to 0 boundary (got ${seekClamp.newTime})`);

  // =========================================================================
  // PART 3: PLAYING VIDEO METADATA INFO
  // =========================================================================
  console.log("\n--- PART 3: Playing Video Metadata Info ---");

  const infoTests = [
    "What is playing right now?",
    "What's playing?",
    "Which song is this?",
    "Tell me the video title",
    "Current video title",
    "Kaun sa gana chal raha hai",
    "Ye kaunsa song hai",
    "Video ka naam batao",
  ];

  for (const cmd of infoTests) {
    const r = routeCommand(cmd);
    assert(r.intent === "YOUTUBE_GET_VIDEO_INFO", `Video Info routing: "${cmd}" -> YOUTUBE_GET_VIDEO_INFO`);
  }

  // Unit Test YouTubeModule.getVideoInfo
  const mockWatchPage: any = {
    url: () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    evaluate: async () => ({
      title: "Rick Astley - Never Gonna Give You Up",
      channel: "Rick Astley",
      currentTime: 65,
      duration: 213,
      formattedProgress: "1:05 / 3:33",
    }),
  };

  const infoRes = await ytMod.getVideoInfo(mockWatchPage);
  assert(infoRes.success, "getVideoInfo() succeeds on watch page");
  assert(infoRes.title.includes("Never Gonna Give You Up"), "getVideoInfo extracts exact title");
  assert(infoRes.channel === "Rick Astley", "getVideoInfo extracts channel name");
  assert(infoRes.formattedProgress === "1:05 / 3:33", "getVideoInfo formats progress");

  // Negative test: non-watch page
  const mockHome: any = { url: () => "https://www.youtube.com/" };
  const infoFail = await ytMod.getVideoInfo(mockHome);
  assert(!infoFail.success, "getVideoInfo returns false when not on a watch page");
  assert(infoFail.message.includes("not a YouTube watch page"), "Truthful explanation message returned");

  // =========================================================================
  // PART 4: PLAYBACK STATE DETECTION
  // =========================================================================
  console.log("\n--- PART 4: Playback State Detection ---");

  const stateTests = [
    "Playback state",
    "Playback status",
    "Is video playing",
    "Is the video paused",
    "Video status",
    "Video chal raha hai ya ruka hua hai",
  ];

  for (const cmd of stateTests) {
    const r = routeCommand(cmd);
    assert(r.intent === "YOUTUBE_GET_PLAYBACK_STATE", `Playback State routing: "${cmd}" -> YOUTUBE_GET_PLAYBACK_STATE`);
  }

  // Unit Test YouTubeModule.getPlaybackState
  const mockStatePage = (state: string, paused: boolean): any => ({
    evaluate: async () => ({
      state,
      currentTime: 30,
      duration: 120,
      percentPlayed: 25,
      isMuted: false,
      volume: 80,
    }),
  });

  const stateRes1 = await ytMod.getPlaybackState(mockStatePage("PLAYING", false));
  assert(stateRes1.success && stateRes1.state === "PLAYING", "Detects PLAYING state");
  assert(stateRes1.percentPlayed === 25, "Calculates percentPlayed");

  const stateRes2 = await ytMod.getPlaybackState(mockStatePage("PAUSED", true));
  assert(stateRes2.success && stateRes2.state === "PAUSED", "Detects PAUSED state");

  // =========================================================================
  // PART 5: FULLSCREEN TOGGLE
  // =========================================================================
  console.log("\n--- PART 5: Fullscreen Mode Control ---");

  const fsTests = [
    { cmd: "Fullscreen", expectedEnable: true },
    { cmd: "Enter fullscreen", expectedEnable: true },
    { cmd: "Badi screen karo", expectedEnable: true },
    { cmd: "Screen badi karo", expectedEnable: true },
    { cmd: "Exit fullscreen", expectedEnable: false },
    { cmd: "Leave fullscreen", expectedEnable: false },
    { cmd: "Fullscreen band karo", expectedEnable: false },
  ];

  for (const t of fsTests) {
    const r = routeCommand(t.cmd);
    assert(r.intent === "YOUTUBE_SET_FULLSCREEN", `Fullscreen routing: "${t.cmd}" -> YOUTUBE_SET_FULLSCREEN`);
    assert(r.arguments.enable === t.expectedEnable, `Fullscreen enable flag: ${t.expectedEnable}`);
  }

  // =========================================================================
  // PART 6: STOP VIDEO & RESET TO START
  // =========================================================================
  console.log("\n--- PART 6: Stop Video & Reset ---");

  const stopTests = [
    "Stop video",
    "Stop playing",
    "Stop youtube",
    "Video stop karo",
    "Video band karo",
    "Video rok do",
  ];

  for (const cmd of stopTests) {
    const r = routeCommand(cmd);
    assert(r.intent === "YOUTUBE_STOP", `Stop routing: "${cmd}" -> YOUTUBE_STOP`);
  }

  // Compound stop & reset phrase test
  const compoundStop = routeCommand("Video rok do aur shuru me jao");
  assert(compoundStop.intent === "COMPOUND_GOAL", "Compound stop phrase detected as COMPOUND_GOAL");
  assert(compoundStop.subCommands?.[0].toLowerCase().includes("video rok do"), "First sub-command is video rok do");
  const subRoutedStop = routeCommand(compoundStop.subCommands![0]);
  assert(subRoutedStop.intent === "YOUTUBE_STOP", "First sub-command routes to YOUTUBE_STOP");

  let stoppedPaused = false;
  let stoppedTime = 999;
  const mockStopPage: any = {
    evaluate: async (fn: any) => {
      stoppedPaused = true;
      stoppedTime = 0;
    },
  };
  const stopRes = await ytMod.stopVideo(mockStopPage);
  assert(stopRes.success, "stopVideo() executes successfully");
  assert(stoppedPaused && stoppedTime === 0, "stopVideo pauses video and resets currentTime to 0");

  // =========================================================================
  // PART 7: AD SKIPPING DETECTION
  // =========================================================================
  console.log("\n--- PART 7: Ad Skipping Detection ---");

  const adTests = [
    "Skip ad",
    "Skip the ad",
    "Skip this ad",
    "Skip advertisement",
    "Ad skip karo",
    "Advertisement skip karo",
    "Ad hatao",
    "Add skip karo",
  ];

  for (const cmd of adTests) {
    const r = routeCommand(cmd);
    assert(r.intent === "YOUTUBE_SKIP_AD", `Skip Ad routing: "${cmd}" -> YOUTUBE_SKIP_AD`);
  }

  // Unit Test YouTubeModule.skipAd
  // Scenario 1: No ad playing
  const mockNoAdPage: any = {
    evaluate: async () => ({ isAdShowing: false, hasSkipBtn: false, skipBtnClickable: false, countdownText: "" }),
  };
  const noAdRes = await ytMod.skipAd(mockNoAdPage);
  assert(!noAdRes.success && !noAdRes.isAd, "Reports truthfully when no advertisement is present");
  assert(noAdRes.message.includes("No advertisement"), "Truthful message returned");

  // Scenario 2: Unskippable ad / Countdown active
  const mockCountdownPage: any = {
    evaluate: async () => ({
      isAdShowing: true,
      hasSkipBtn: true,
      skipBtnClickable: false,
      countdownText: "Ad will end in 5",
    }),
  };
  const countdownRes = await ytMod.skipAd(mockCountdownPage);
  assert(countdownRes.isAd && !countdownRes.skippable, "Detects active unskippable countdown");
  assert(countdownRes.message.includes("cannot be skipped yet"), "Reports countdown state truthfully");

  // Scenario 3: Skippable ad
  let clickedSkip = false;
  const mockSkippablePage: any = {
    evaluate: async (fn: any) => {
      // First call evaluates adStatus, second call evaluates stillAd
      if (!clickedSkip) {
        return { isAdShowing: true, hasSkipBtn: true, skipBtnClickable: true, countdownText: "" };
      }
      return false; // Ad dismissed
    },
    locator: () => ({
      first: () => ({
        click: async () => {
          clickedSkip = true;
        },
      }),
    }),
    waitForTimeout: async () => {},
  };
  const skippableRes = await ytMod.skipAd(mockSkippablePage);
  assert(skippableRes.success && skippableRes.skipped, "Clicks skip button and verifies dismissal");

  // =========================================================================
  // PART 8: REAL YOUTUBE UI PLAYLIST MANAGEMENT & SIGN-IN SAFETY
  // =========================================================================
  console.log("\n--- PART 8: Real UI Playlist Management & Sign-in Gates ---");

  // Routing verification for listing playlist videos
  const rList = routeCommand("List videos in playlist Coding Music");
  assert(rList.intent === "YOUTUBE_LIST_PLAYLIST_VIDEOS", "List playlist videos -> YOUTUBE_LIST_PLAYLIST_VIDEOS");
  assert(rList.arguments.name === "Coding Music", "Playlist name extracted");

  // Test sign-in check on logged-out profile
  const mockSignedOutPage: any = {
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => {
          if (sel.includes("accounts.google.com") || sel.includes("Sign in")) return true;
          return false;
        },
      }),
    }),
    url: () => "https://www.youtube.com",
    title: async () => "YouTube",
  };
  const signedIn = await ytMod.isUserSignedIn(mockSignedOutPage);
  assert(!signedIn, "isUserSignedIn correctly detects signed-out Chrome profile");

  // Test playlist creation on logged-out profile: truthful reporting
  const createResLoggedOut = await ytMod.createPlaylistUI(mockSignedOutPage, "My Playlist");
  assert(!createResLoggedOut.success, "Playlist creation rejected when user is not signed in");
  assert(createResLoggedOut.message.includes(".chrome_profile"), "Honest error instructs user to sign in to .chrome_profile");

  // Test removal confirmation gate: must NOT execute if confirmed is false
  const removeWithoutConfirm = await ytMod.removeVideoFromPlaylistUI(
    mockSignedOutPage,
    "Coding Music",
    "Intro Video",
    false
  );
  assert(removeWithoutConfirm.requiresConfirmation === true, "Video removal requires explicit user confirmation");
  assert(removeWithoutConfirm.message.includes("Are you sure"), "Confirmation prompt returned");

  // =========================================================================
  // PART 9: TOOL REGISTRY VERIFICATION
  // =========================================================================
  console.log("\n--- PART 9: ToolRegistry Registration Verification ---");

  const expectedTools = [
    "youtube_seek",
    "youtube_get_video_info",
    "youtube_get_playback_state",
    "youtube_set_fullscreen",
    "youtube_stop_video",
    "youtube_skip_ad",
    "youtube_open_playlist_ui",
    "youtube_list_playlist_videos_ui",
    "youtube_remove_from_playlist_ui",
  ];

  for (const toolName of expectedTools) {
    const tool = ToolRegistry.get(toolName);
    assert(tool !== undefined, `Tool '${toolName}' is registered in ToolRegistry`);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n==================================================================");
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
