import { routeCommand } from "../src/router/commandRouter.js";
import { ToolRegistry } from "../server/computer/tools/toolRegistry.js";
import { BrowserController } from "../server/computer/browser/browserController.js";
import { BrowserSession } from "../server/computer/browser/browserSession.js";
import { YouTubePlaylistService } from "../server/computer/browser/modules/youtubePlaylistService.js";
import { YouTubeModule } from "../server/computer/browser/modules/youtubeModule.js";
import { getYouTubeCommands, formatYouTubeCommandsHelp } from "../server/computer/browser/modules/youtubeCommandCatalog.js";
import { TaskPlanner } from "../src/agent/taskPlanner.js";

console.log("==================================================================");
console.log("  LUMA Priority 1: YouTube Playlist Automation & Reload Fix Suite");
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

async function runPlaylistTests() {
  // =========================================================================
  // GROUP A: LOCALHOST RELOAD PREVENTION & PROTECTED-ORIGIN GUARD (P0)
  // =========================================================================
  console.log("\n--- GROUP A: Localhost Reload Prevention & Protected-Origin Guard (P0) ---");

  // A1: Test isProtectedUrl detection
  assert(BrowserSession.isProtectedUrl("http://localhost:5173"), "localhost:5173 recognized as protected");
  assert(BrowserSession.isProtectedUrl("http://localhost:5173/"), "localhost:5173/ recognized as protected");
  assert(BrowserSession.isProtectedUrl("http://127.0.0.1:5173/dashboard"), "127.0.0.1:5173 recognized as protected");
  assert(BrowserSession.isProtectedUrl("http://localhost:3001/api/computer/execute"), "localhost:3001 backend recognized as protected");
  assert(!BrowserSession.isProtectedUrl("https://www.youtube.com"), "youtube.com is NOT protected");
  assert(!BrowserSession.isProtectedUrl("https://www.amazon.com"), "amazon.com is NOT protected");

  // A2: Test Protected-Origin Guard throws when page points to LUMA
  const mockLumaPage: any = {
    url: () => "http://localhost:5173/",
  };

  try {
    await YouTubePlaylistService.createPlaylist(mockLumaPage, "Test Playlist");
    assert(false, "Protected-Origin Guard should block playlist creation on localhost:5173");
  } catch (err: any) {
    assert(err.message.includes("Protected-Origin Guard"), "Protected-Origin Guard blocked execution on LUMA tab");
  }

  try {
    await YouTubePlaylistService.openPlaylist(mockLumaPage, "Test Playlist");
    assert(false, "Protected-Origin Guard should block openPlaylist on localhost:5173");
  } catch (err: any) {
    assert(err.message.includes("Protected-Origin Guard"), "Protected-Origin Guard blocked openPlaylist on LUMA tab");
  }

  // =========================================================================
  // GROUP B: REAL YOUTUBE PLAYLIST CREATION & SIGN-IN GATES (P1)
  // =========================================================================
  console.log("\n--- GROUP B: Real YouTube Playlist Creation (P1) ---");

  // B1: Logged-out state detection & truthful failure
  const mockSignedOutPage: any = {
    url: () => "https://www.youtube.com",
    title: async () => "YouTube",
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => {
          if (sel.includes("Sign in")) return true;
          return false;
        },
      }),
    }),
    evaluate: async (fn: any) => false,
  };

  const signedOutState = await YouTubePlaylistService.isUserSignedIn(mockSignedOutPage);
  assert(!signedOutState, "User correctly identified as signed out");

  const createLoggedOutRes = await YouTubePlaylistService.createPlaylist(mockSignedOutPage, "LUMA Tutorial");
  assert(!createLoggedOutRes.success, "Playlist creation fails when signed out");
  assert(createLoggedOutRes.status === "BLOCKED_LOGIN", "Status is BLOCKED_LOGIN");
  assert(createLoggedOutRes.trace.finalStatus === "BLOCKED_LOGIN", "Trace status is BLOCKED_LOGIN");
  assert(createLoggedOutRes.message.includes(".chrome_profile"), "Error instructs user to sign in to .chrome_profile");

  // B2: Empty playlist name rejected
  const mockSignedInPage: any = {
    url: () => "https://www.youtube.com",
    title: async () => "YouTube",
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => {
          if (sel.includes("avatar-btn")) return true;
          return false;
        },
      }),
    }),
    evaluate: async (fn: any) => true,
  };

  const emptyRes = await YouTubePlaylistService.createPlaylist(mockSignedInPage, "   ");
  assert(!emptyRes.success, "Empty playlist name is rejected");
  assert(emptyRes.status === "FAILED", "Status is FAILED for empty name");

  // B3: Simulated signed-in successful creation & verification
  let visitedUrl = "https://www.youtube.com/watch?v=mock123";
  const mockCreationPage: any = {
    url: () => visitedUrl,
    title: async () => "LUMA Tutorial - YouTube",
    goto: async (dest: string) => { visitedUrl = dest; },
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        fill: async () => {},
        getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_MOCK_123" : null),
      }),
    }),
    evaluate: async () => true,
  };

  // Mock listPlaylists to return empty (no duplicate)
  const origList = YouTubePlaylistService.listPlaylists;
  YouTubePlaylistService.listPlaylists = async () => ({
    success: true,
    status: "SUCCESS_VERIFIED",
    playlists: [],
    message: "No playlists",
    trace: {} as any,
  });

  const createSuccessRes = await YouTubePlaylistService.createPlaylist(
    mockCreationPage,
    "LUMA Tutorial",
    "PRIVATE",
    "Create a playlist named LUMA Tutorial"
  );
  assert(createSuccessRes.success, "Playlist creation executes successfully");
  assert(createSuccessRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(createSuccessRes.playlistName === "LUMA Tutorial", "Playlist name preserved");
  assert(createSuccessRes.privacy === "PRIVATE", "Privacy is PRIVATE");
  assert(createSuccessRes.trace.verificationResult.includes("Verified in user playlists feed"), "Verified in playlists feed");

  // B4: Duplicate playlist detection
  YouTubePlaylistService.listPlaylists = async () => ({
    success: true,
    status: "SUCCESS_VERIFIED",
    playlists: [
      { name: "LUMA Tutorial", url: "https://www.youtube.com/playlist?list=PL_MOCK_123" },
    ],
    message: "1 playlist found",
    trace: {} as any,
  });

  const dupRes = await YouTubePlaylistService.createPlaylist(mockCreationPage, "LUMA Tutorial");
  assert(!dupRes.success, "Duplicate playlist creation is halted");
  assert(dupRes.status === "AMBIGUOUS", "Status is AMBIGUOUS for duplicate");
  assert(dupRes.duplicate === true, "duplicate flag is true");
  assert(dupRes.message.includes("already exists"), "Duplicate message warns user");

  // Restore original listPlaylists
  YouTubePlaylistService.listPlaylists = origList;

  // B5: TEST F: When creating a playlist from feed or home page (NOT on /watch) without active video context,
  // verify LUMA truthfully asks which video to use and ZERO navigation to "nature" search occurs!
  const navHistory: string[] = [];
  const mockFeedCreationPage: any = {
    url: () => "https://www.youtube.com/feed/playlists",
    title: async () => "Playlists - YouTube",
    goto: async (dest: string) => { navHistory.push(dest); },
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        fill: async () => {},
        getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_LUMA_VERIFIED" : null),
      }),
    }),
    evaluate: async () => true,
  };

  YouTubePlaylistService.listPlaylists = async () => ({
    success: true,
    status: "SUCCESS_VERIFIED",
    playlists: [],
    message: "No duplicates",
    trace: {} as any,
  });

  const feedCreateRes = await YouTubePlaylistService.createPlaylist(
    mockFeedCreationPage,
    "LUMA",
    "PRIVATE",
    "Create a playlist named LUMA."
  );
  assert(!feedCreateRes.success, "Missing video context halts automatic creation");
  assert(feedCreateRes.status === "AMBIGUOUS", "Missing video context status is AMBIGUOUS");
  assert(feedCreateRes.message.includes("Which video should I use to create this playlist?"), "Asks user which video to use");
  assert(!navHistory.some((u) => u.toLowerCase().includes("nature")), "ZERO navigation to 'nature' search occurred");
  assert(!navHistory.some((u) => u.toLowerCase().includes("search_query")), "ZERO search queries executed during playlist creation");

  YouTubePlaylistService.listPlaylists = origList;

  // =========================================================================
  // GROUP C: PLAYLIST DISCOVERY & OPENING (P1)
  // =========================================================================
  console.log("\n--- GROUP C: Playlist Discovery & Opening (P1) ---");

  // C1: Direct URL opening
  const mockUrlPage: any = {
    url: () => "https://www.youtube.com/playlist?list=PL123456",
    title: async () => "My Coding Music - YouTube",
    goto: async () => {},
  };
  const openUrlRes = await YouTubePlaylistService.openPlaylist(
    mockUrlPage,
    "https://www.youtube.com/playlist?list=PL123456"
  );
  assert(openUrlRes.success, "Direct playlist URL opened");
  assert(openUrlRes.status === "SUCCESS_VERIFIED", "Direct URL is SUCCESS_VERIFIED");

  // C2: Open latest playlist
  let openedTarget = "";
  const mockLatestPage: any = {
    url: () => "https://www.youtube.com/playlist?list=PL_LATEST",
    title: async () => "Latest Mix - YouTube",
    goto: async (url: string) => { openedTarget = url; },
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => {
          if (sel.includes("avatar-btn")) return true;
          return true;
        },
        click: async () => {},
        innerText: async () => "Latest Mix",
        getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_LATEST" : null),
      }),
    }),
    evaluate: async () => true,
  };

  const openLatestRes = await YouTubePlaylistService.openPlaylist(mockLatestPage, "latest");
  assert(openLatestRes.success, "Opened latest playlist");
  assert(openLatestRes.status === "SUCCESS_VERIFIED", "Latest playlist status is SUCCESS_VERIFIED");

  // =========================================================================
  // GROUP D: ADD VIDEO TO PLAYLIST (P1)
  // =========================================================================
  console.log("\n--- GROUP D: Add Video to Playlist (P1) ---");

  // D1: Add video when logged out
  const mockSignedOutWatchPage: any = {
    url: () => "https://www.youtube.com/watch?v=mock123",
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => sel.includes("Sign in"),
      }),
    }),
    evaluate: async () => false,
  };

  const addLoggedOut = await YouTubePlaylistService.addVideoToPlaylist(
    mockSignedOutWatchPage,
    "Python Tutorials"
  );
  assert(!addLoggedOut.success, "Add video rejected when logged out");
  assert(addLoggedOut.status === "BLOCKED_LOGIN", "Status is BLOCKED_LOGIN");

  // D2: Add video when signed in
  const mockAddPage: any = {
    url: () => "https://www.youtube.com/watch?v=abc1234",
    title: async () => "Python Crash Course - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    keyboard: { press: async () => {} },
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        innerText: async () => "Python Crash Course",
        getAttribute: async (attr: string) => (attr === "aria-checked" ? "false" : null),
      }),
    }),
    evaluate: async () => true,
  };

  const addSuccess = await YouTubePlaylistService.addVideoToPlaylist(
    mockAddPage,
    "Python Tutorials"
  );
  assert(addSuccess.success, "Video added to playlist successfully");
  assert(addSuccess.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(addSuccess.message.includes("Python Tutorials"), "Message confirms target playlist");

  // =========================================================================
  // GROUP E: PLAYLIST VIDEO LISTING & COUNTING (P1)
  // =========================================================================
  console.log("\n--- GROUP E: Playlist Video Listing & Counting (P1) ---");

  const mockPlaylistContentPage: any = {
    url: () => "https://www.youtube.com/playlist?list=PL_TEST",
    title: async () => "Python Tutorials - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    waitForSelector: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        innerText: async () => "14 videos",
        getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_TEST" : null),
      }),
    }),
    evaluate: async (fn: any) => {
      const fnStr = fn.toString();
      if (fnStr.includes("statEl")) {
        return "14 videos";
      }
      return [
        { index: 1, title: "Lesson 1: Intro", url: "https://www.youtube.com/watch?v=1", duration: "10:00" },
        { index: 2, title: "Lesson 2: Variables", url: "https://www.youtube.com/watch?v=2", duration: "12:30" },
        { index: 3, title: "Lesson 3: Functions", url: "https://www.youtube.com/watch?v=3", duration: "15:45" },
      ];
    },
  };

  const countRes = await YouTubePlaylistService.countPlaylistVideos(
    mockPlaylistContentPage,
    "https://www.youtube.com/playlist?list=PL_TEST"
  );
  assert(countRes.success, "Count playlist videos succeeds");
  assert(countRes.count === 14, `Extracted video count: 14 (got: ${countRes.count})`);
  assert(countRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");

  const listItemsRes = await YouTubePlaylistService.listPlaylistVideos(
    mockPlaylistContentPage,
    "https://www.youtube.com/playlist?list=PL_TEST"
  );
  assert(listItemsRes.success, "List playlist videos succeeds");
  assert(listItemsRes.videos.length === 3, `Found 3 loaded videos (got: ${listItemsRes.videos.length})`);
  assert(listItemsRes.videos[0].title === "Lesson 1: Intro", "First video title matches");

  // =========================================================================
  // GROUP F: REMOVE VIDEO FROM PLAYLIST (P1 - CONFIRMATION REQUIRED)
  // =========================================================================
  console.log("\n--- GROUP F: Remove Video from Playlist (P1) ---");

  // F1: Without confirmation
  const removeUnconfirmed = await YouTubePlaylistService.removeVideoFromPlaylist(
    mockPlaylistContentPage,
    "Python Tutorials",
    "Lesson 2: Variables",
    false
  );
  assert(!removeUnconfirmed.success, "Removal blocked without confirmation");
  assert(removeUnconfirmed.status === "CONFIRM_REQUIRED", "Status is CONFIRM_REQUIRED");
  assert(removeUnconfirmed.requiresConfirmation === true, "requiresConfirmation flag set");
  assert(removeUnconfirmed.message.includes("Are you sure"), "Confirmation message prompt provided");

  // F2: With confirmation
  let actionClicked = false;
  const mockItemLocator: any = {
    isVisible: async () => true,
    click: async () => {},
    innerText: async () => "Lesson 2: Variables",
    getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_TEST" : null),
    locator: (innerSel: string) => ({
      first: () => mockItemLocator,
      last: () => ({
        click: async () => { actionClicked = true; },
      }),
      innerText: async () => "Lesson 2: Variables",
      getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_TEST" : null),
    }),
  };

  const mockRemovePage: any = {
    url: () => "https://www.youtube.com/playlist?list=PL_TEST",
    title: async () => "Python Tutorials - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    waitForSelector: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        ...mockItemLocator,
        isVisible: async () => true,
        click: async () => { actionClicked = true; },
      }),
      last: () => mockItemLocator,
    }),
    evaluate: async () => true,
  };

  const removeConfirmed = await YouTubePlaylistService.removeVideoFromPlaylist(
    mockRemovePage,
    "Python Tutorials",
    "Lesson 2: Variables",
    true
  );
  if (!removeConfirmed.success) {
    console.error("removeConfirmed failed:", removeConfirmed);
  }
  assert(removeConfirmed.success, "Removal succeeded with confirmation");
  assert(removeConfirmed.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(actionClicked, "Clicked action menu and remove button");

  // =========================================================================
  // GROUP G: FULLSCREEN CONTROLS & QUERYING (P2)
  // =========================================================================
  console.log("\n--- GROUP G: Fullscreen & Exit Fullscreen (P2) ---");

  const ytModule = new YouTubeModule();

  // G1: Fullscreen when not on video page
  const nonVideoPage: any = {
    url: () => "https://www.youtube.com/feed/playlists",
    evaluate: async () => false,
  };
  const fsNoVideo = await ytModule.setFullscreen(nonVideoPage, true);
  assert(!fsNoVideo.success, "Fullscreen rejected when no video is playing");
  assert(fsNoVideo.message.includes("No video is currently playing"), "Truthful error reported");

  // G2: Query fullscreen state
  let isDocFs = false;
  const videoFsPage: any = {
    url: () => "https://www.youtube.com/watch?v=xyz",
    evaluate: async (fn: any) => isDocFs,
    locator: () => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => { isDocFs = !isDocFs; },
      }),
    }),
    keyboard: {
      press: async (k: string) => {
        if (k === "Escape") isDocFs = false;
        if (k === "f") isDocFs = !isDocFs;
      },
    },
    waitForTimeout: async () => {},
  };

  const queryFsNormal = await ytModule.getFullscreenState(videoFsPage);
  assert(queryFsNormal.success, "Query fullscreen state succeeds");
  assert(!queryFsNormal.isFullscreen, "Initially not in fullscreen");
  assert(queryFsNormal.isVideoPlaying, "Video is playing");

  // G3: Enter fullscreen
  const enterFsRes = await ytModule.setFullscreen(videoFsPage, true);
  assert(enterFsRes.success, "Enter fullscreen succeeds");
  assert(enterFsRes.isFullscreen, "Now in fullscreen mode");

  // G4: Query again while in fullscreen
  const queryFsActive = await ytModule.getFullscreenState(videoFsPage);
  assert(queryFsActive.isFullscreen, "Fullscreen query verifies fullscreen mode");

  // G5: Exit fullscreen (uses Escape key & verification)
  const exitFsRes = await ytModule.setFullscreen(videoFsPage, false);
  assert(exitFsRes.success, "Exit fullscreen succeeds");
  assert(!exitFsRes.isFullscreen, "Fullscreen successfully dismissed");

  // G6: Redundant exit returns already disabled
  const exitRedundant = await ytModule.setFullscreen(videoFsPage, false);
  assert(exitRedundant.success, "Redundant exit returns immediately");
  assert(exitRedundant.message.includes("already disabled"), "Message notes already disabled");

  // =========================================================================
  // GROUP H: NATURAL-LANGUAGE COMMAND CATALOG & ROUTING (P3)
  // =========================================================================
  console.log("\n--- GROUP H: Natural Language Command Interpretation (P3) ---");

  // H1: Command discovery help
  const rHelp1 = routeCommand("Show YouTube commands");
  assert(rHelp1.intent === "YOUTUBE_HELP_COMMANDS", "Route 'Show YouTube commands' -> YOUTUBE_HELP_COMMANDS");
  assert(rHelp1.toolToExecute === "youtube_help_commands", "Tool is youtube_help_commands");

  const rHelp2 = routeCommand("What YouTube actions are supported?");
  assert(rHelp2.intent === "YOUTUBE_HELP_COMMANDS", "Route 'What YouTube actions are supported?' -> YOUTUBE_HELP_COMMANDS");

  const rHelp3 = routeCommand("Show playlist commands");
  assert(rHelp3.intent === "YOUTUBE_HELP_COMMANDS", "Route 'Show playlist commands' -> YOUTUBE_HELP_COMMANDS");
  assert(rHelp3.arguments.category === "playlist", "Extracted category: playlist");

  const rHelp4 = routeCommand("How do I create a playlist?");
  assert(rHelp4.intent === "YOUTUBE_HELP_COMMANDS", "Route 'How do I create a playlist?' -> YOUTUBE_HELP_COMMANDS");

  // H2: Fullscreen queries & toggles
  const rFsQuery1 = routeCommand("Is the video currently fullscreen?");
  assert(rFsQuery1.intent === "YOUTUBE_GET_FULLSCREEN_STATE", "Route 'Is the video currently fullscreen?' -> YOUTUBE_GET_FULLSCREEN_STATE");

  const rFsQuery2 = routeCommand("Check fullscreen state");
  assert(rFsQuery2.intent === "YOUTUBE_GET_FULLSCREEN_STATE", "Route 'Check fullscreen state' -> YOUTUBE_GET_FULLSCREEN_STATE");

  const rFsEnter = routeCommand("Enter fullscreen");
  assert(rFsEnter.intent === "YOUTUBE_SET_FULLSCREEN", "Route 'Enter fullscreen' -> YOUTUBE_SET_FULLSCREEN");
  assert(rFsEnter.arguments.enable === true, "enable is true");

  const rFsExit = routeCommand("Exit fullscreen");
  assert(rFsExit.intent === "YOUTUBE_SET_FULLSCREEN", "Route 'Exit fullscreen' -> YOUTUBE_SET_FULLSCREEN");
  assert(rFsExit.arguments.enable === false, "enable is false");

  // H3: Ad skipping variants
  const rAd1 = routeCommand("Skip the ad if the Skip Ads button appears");
  assert(rAd1.intent === "YOUTUBE_SKIP_AD", "Route 'Skip the ad if the Skip Ads button appears' -> YOUTUBE_SKIP_AD");

  const rAd2 = routeCommand("Skip the advertisement when possible");
  assert(rAd2.intent === "YOUTUBE_SKIP_AD", "Route 'Skip the advertisement when possible' -> YOUTUBE_SKIP_AD");

  const rAd3 = routeCommand("Click Skip Ad when it becomes available");
  assert(rAd3.intent === "YOUTUBE_SKIP_AD", "Route 'Click Skip Ad when it becomes available' -> YOUTUBE_SKIP_AD");

  // H4: Playlist creation variants with privacy
  const rCreate1 = routeCommand("Create a playlist called Python Learning");
  assert(rCreate1.intent === "YOUTUBE_CREATE_PLAYLIST", "Route 'Create a playlist called Python Learning' -> YOUTUBE_CREATE_PLAYLIST");
  assert(rCreate1.arguments.name === "Python Learning", "Name is Python Learning");
  assert(rCreate1.arguments.privacy === "PRIVATE", "Default privacy is PRIVATE");

  const rCreate2 = routeCommand("Create a private playlist named AI Tutorials");
  assert(rCreate2.intent === "YOUTUBE_CREATE_PLAYLIST", "Route 'Create a private playlist named AI Tutorials' -> YOUTUBE_CREATE_PLAYLIST");
  assert(rCreate2.arguments.name === "AI Tutorials", "Name is AI Tutorials");
  assert(rCreate2.arguments.privacy === "PRIVATE", "Privacy is PRIVATE");

  const rCreate3 = routeCommand("Create a public playlist named Web Development");
  assert(rCreate3.intent === "YOUTUBE_CREATE_PLAYLIST", "Route 'Create a public playlist named Web Development' -> YOUTUBE_CREATE_PLAYLIST");
  assert(rCreate3.arguments.name === "Web Development", "Name is Web Development");
  assert(rCreate3.arguments.privacy === "PUBLIC", "Privacy is PUBLIC");

  const rCreate4 = routeCommand("Create an unlisted playlist named Project Demo");
  assert(rCreate4.intent === "YOUTUBE_CREATE_PLAYLIST", "Route 'Create an unlisted playlist named Project Demo' -> YOUTUBE_CREATE_PLAYLIST");
  assert(rCreate4.arguments.name === "Project Demo", "Name is Project Demo");
  assert(rCreate4.arguments.privacy === "UNLISTED", "Privacy is UNLISTED");

  // H5: Playlist discovery & opening
  const rListPl1 = routeCommand("Show my YouTube playlists");
  assert(rListPl1.intent === "YOUTUBE_LIST_PLAYLISTS", "Route 'Show my YouTube playlists' -> YOUTUBE_LIST_PLAYLISTS");

  const rListPl2 = routeCommand("List all my playlists");
  assert(rListPl2.intent === "YOUTUBE_LIST_PLAYLISTS", "Route 'List all my playlists' -> YOUTUBE_LIST_PLAYLISTS");

  const rListPl3 = routeCommand("Which playlists have I created?");
  assert(rListPl3.intent === "YOUTUBE_LIST_PLAYLISTS", "Route 'Which playlists have I created?' -> YOUTUBE_LIST_PLAYLISTS");

  const rOpenLatest = routeCommand("Open my latest playlist");
  assert(rOpenLatest.intent === "YOUTUBE_OPEN_PLAYLIST", "Route 'Open my latest playlist' -> YOUTUBE_OPEN_PLAYLIST");
  assert(rOpenLatest.arguments.name === "latest", "Target is 'latest'");

  const rOpenNamed = routeCommand("Open playlist Coding Music");
  assert(rOpenNamed.intent === "YOUTUBE_OPEN_PLAYLIST", "Route 'Open playlist Coding Music' -> YOUTUBE_OPEN_PLAYLIST");
  assert(rOpenNamed.arguments.name === "Coding Music", "Target is Coding Music");

  // H6: Count playlist videos
  const rCount1 = routeCommand("How many videos are in LUMA Tutorial?");
  assert(rCount1.intent === "YOUTUBE_COUNT_PLAYLIST_VIDEOS", "Route 'How many videos are in LUMA Tutorial?' -> YOUTUBE_COUNT_PLAYLIST_VIDEOS");
  assert(rCount1.arguments.playlist_name === "LUMA Tutorial", "Target playlist extracted");

  const rCount2 = routeCommand("Count the videos in Python Learning");
  assert(rCount2.intent === "YOUTUBE_COUNT_PLAYLIST_VIDEOS", "Route 'Count the videos in Python Learning' -> YOUTUBE_COUNT_PLAYLIST_VIDEOS");
  assert(rCount2.arguments.playlist_name === "Python Learning", "Target playlist extracted");

  // H7: Add video to playlist
  const rAdd1 = routeCommand("Add this video to Coding Music");
  assert(rAdd1.intent === "YOUTUBE_ADD_TO_PLAYLIST", "Route 'Add this video to Coding Music' -> YOUTUBE_ADD_TO_PLAYLIST");
  assert(rAdd1.arguments.playlist_name === "Coding Music", "Target playlist extracted");

  const rAdd2 = routeCommand("Add current video to Python Learning");
  assert(rAdd2.intent === "YOUTUBE_ADD_TO_PLAYLIST", "Route 'Add current video to Python Learning' -> YOUTUBE_ADD_TO_PLAYLIST");
  assert(rAdd2.arguments.playlist_name === "Python Learning", "Target playlist extracted");

  // H8: Remove video from playlist
  const rRem = routeCommand("Remove Python tutorials from Coding Music");
  assert(rRem.intent === "YOUTUBE_REMOVE_FROM_PLAYLIST", "Route 'Remove Python tutorials from Coding Music' -> YOUTUBE_REMOVE_FROM_PLAYLIST");
  assert(rRem.arguments.playlist_name === "Coding Music", "Target playlist is Coding Music");
  assert(rRem.arguments.video === "Python tutorials", "Target video is Python tutorials");

  // H9: Command catalog generation & structure
  const catCommands = getYouTubeCommands();
  assert(catCommands.length >= 15, `Command catalog contains ${catCommands.length} commands (expected >= 15)`);

  const helpText = formatYouTubeCommandsHelp();
  assert(helpText.includes("Playback Commands"), "Help text has Playback Commands");
  assert(helpText.includes("Fullscreen Commands"), "Help text has Fullscreen Commands");
  assert(helpText.includes("Playlist Commands"), "Help text has Playlist Commands");
  assert(helpText.includes("Ad Control Commands"), "Help text has Ad Control Commands");
  assert(helpText.includes(".chrome_profile"), "Help text notes .chrome_profile requirement");

  // =========================================================================
  // GROUP I: TOOL REGISTRY COMPLETENESS (ALL NEW + EXISTING TOOLS)
  // =========================================================================
  console.log("\n--- GROUP I: Tool Registry Completeness ---");

  const allExpectedTools = [
    "youtube_create_playlist",
    "youtube_open_playlist_ui",
    "youtube_list_playlists",
    "youtube_count_playlist_videos",
    "youtube_add_to_playlist",
    "youtube_list_playlist_videos_ui",
    "youtube_remove_from_playlist_ui",
    "youtube_rename_playlist",
    "youtube_update_playlist_privacy",
    "youtube_add_search_result_to_playlist",
    "youtube_get_playlist_details",
    "youtube_set_fullscreen",
    "youtube_get_fullscreen_state",
    "youtube_help_commands",
    "youtube_seek",
    "youtube_get_video_info",
    "youtube_get_playback_state",
    "youtube_stop_video",
    "youtube_skip_ad",
    "browser_play_first_video",
    "browser_play_video_rank",
  ];

  for (const t of allExpectedTools) {
    const reg = ToolRegistry.get(t);
    assert(reg !== undefined, `Tool '${t}' is properly registered in ToolRegistry`);
  }

  // =========================================================================
  // GROUP J: INTENT ISOLATION ACROSS 4-STEP USER COMMAND SEQUENCE (TEST 1)
  // =========================================================================
  console.log("\n--- GROUP J: Intent Isolation Across 4-Step Sequence (Phase 8 Test 1 & Test 7) ---");

  // Step 1: Search YouTube for Nature.
  const seq1 = routeCommand("Search YouTube for Nature.");
  assert(seq1.intent === "SEARCH_WEB", "Step 1 routes to SEARCH_WEB");
  assert(seq1.arguments.site === "youtube", "Step 1 site is youtube");
  assert(seq1.arguments.query.toLowerCase() === "nature", "Step 1 query is Nature");

  // Step 2: Create a playlist named LUMA.
  const seq2 = routeCommand("Create a playlist named LUMA.");
  assert(seq2.intent === "YOUTUBE_CREATE_PLAYLIST", "Step 2 routes to YOUTUBE_CREATE_PLAYLIST");
  assert(seq2.arguments.name === "LUMA", "Step 2 name is LUMA");
  assert(!JSON.stringify(seq2.arguments).toLowerCase().includes("nature"), "Step 2 has ZERO Nature references");
  assert(seq2.intent !== "SEARCH_WEB" && seq2.intent !== "SEARCH_INPUT", "Step 2 NEVER triggers search");

  // Step 3: Open my LUMA playlist.
  const seq3 = routeCommand("Open my LUMA playlist.");
  assert(seq3.intent === "YOUTUBE_OPEN_PLAYLIST", "Step 3 routes to YOUTUBE_OPEN_PLAYLIST");
  assert(seq3.arguments.name === "LUMA", "Step 3 target is LUMA");
  assert(!JSON.stringify(seq3.arguments).toLowerCase().includes("nature"), "Step 3 has ZERO Nature references");
  assert(seq3.intent !== "SEARCH_WEB", "Step 3 NEVER triggers search");

  // Step 4: Show me the videos in LUMA.
  const seq4 = routeCommand("Show me the videos in LUMA.");
  assert(seq4.intent === "YOUTUBE_LIST_PLAYLIST_VIDEOS", "Step 4 routes to YOUTUBE_LIST_PLAYLIST_VIDEOS");
  assert(seq4.arguments.name === "LUMA", "Step 4 target is LUMA");
  assert(!JSON.stringify(seq4.arguments).toLowerCase().includes("nature"), "Step 4 has ZERO Nature references");
  assert(seq4.intent !== "SEARCH_WEB", "Step 4 NEVER triggers search");

  // =========================================================================
  // GROUP K: RENAME PLAYLIST & PRIVACY UPDATE (PHASE 4.I)
  // =========================================================================
  console.log("\n--- GROUP K: Rename Playlist & Privacy Update (Phase 4.I) ---");

  // K1: Routing
  const rRename1 = routeCommand("Rename LUMA to LUMA Tutorials.");
  assert(rRename1.intent === "YOUTUBE_RENAME_PLAYLIST", "Route 'Rename LUMA to LUMA Tutorials' -> YOUTUBE_RENAME_PLAYLIST");
  assert(rRename1.arguments.old_name === "LUMA", "Old name is LUMA");
  assert(rRename1.arguments.new_name === "LUMA Tutorials", "New name is LUMA Tutorials");

  const rPriv1 = routeCommand("Make Python Learning private.");
  assert(rPriv1.intent === "YOUTUBE_UPDATE_PLAYLIST_PRIVACY", "Route 'Make Python Learning private' -> YOUTUBE_UPDATE_PLAYLIST_PRIVACY");
  assert(rPriv1.arguments.playlist_name === "Python Learning", "Target playlist is Python Learning");
  assert(rPriv1.arguments.privacy === "PRIVATE", "Privacy is PRIVATE");

  const rPriv2 = routeCommand("Make LUMA Tutorials unlisted.");
  assert(rPriv2.intent === "YOUTUBE_UPDATE_PLAYLIST_PRIVACY", "Route 'Make LUMA Tutorials unlisted' -> YOUTUBE_UPDATE_PLAYLIST_PRIVACY");
  assert(rPriv2.arguments.playlist_name === "LUMA Tutorials", "Target playlist is LUMA Tutorials");
  assert(rPriv2.arguments.privacy === "UNLISTED", "Privacy is UNLISTED");

  // K2: Execution of renamePlaylist
  const mockRenamePage: any = {
    url: () => "https://www.youtube.com/playlist?list=PL_TEST_RENAME",
    title: async () => "LUMA Tutorials - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        fill: async () => {},
      }),
    }),
    evaluate: async () => true,
  };

  const renameRes = await YouTubePlaylistService.renamePlaylist(
    mockRenamePage,
    "LUMA",
    "LUMA Tutorials"
  );
  assert(renameRes.success, "renamePlaylist executes successfully");
  assert(renameRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(renameRes.playlistName === "LUMA Tutorials", "New playlist name verified");

  // K3: Execution of updatePlaylistPrivacy
  const privRes = await YouTubePlaylistService.updatePlaylistPrivacy(
    mockRenamePage,
    "LUMA Tutorials",
    "UNLISTED"
  );
  assert(privRes.success, "updatePlaylistPrivacy executes successfully");
  assert(privRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(privRes.privacy === "UNLISTED", "Privacy is UNLISTED");

  // =========================================================================
  // GROUP L: SEARCH AND ADD TO PLAYLIST (PHASE 4.G)
  // =========================================================================
  console.log("\n--- GROUP L: Search and Add to Playlist (Phase 4.G) ---");

  const rSearchAdd1 = routeCommand("Search for Python tutorials and add the first video to LUMA.");
  assert(rSearchAdd1.intent === "YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST", "Route 'Search for Python tutorials and add the first video to LUMA' -> YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST");
  assert(rSearchAdd1.arguments.query === "Python tutorials", "Query is 'Python tutorials'");
  assert(rSearchAdd1.arguments.rank === 1, "Rank is 1");
  assert(rSearchAdd1.arguments.playlist_name === "LUMA", "Target playlist is LUMA");

  const rSearchAdd2 = routeCommand("Find the second LangChain video and add it to AI Tutorials.");
  assert(rSearchAdd2.intent === "YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST", "Route 'Find the second LangChain video and add it to AI Tutorials' -> YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST");
  assert(rSearchAdd2.arguments.query.toLowerCase() === "langchain" || rSearchAdd2.arguments.query.toLowerCase() === "langchain video", "Query is LangChain");
  assert(rSearchAdd2.arguments.rank === 2, "Rank is 2");
  assert(rSearchAdd2.arguments.playlist_name === "AI Tutorials", "Target playlist is AI Tutorials");

  // =========================================================================
  // GROUP M: TASK PLANNER ISOLATION (ZERO PLAYLIST CONTAMINATION)
  // =========================================================================
  console.log("\n--- GROUP M: TaskPlanner Isolation (Phase 2 & 6) ---");

  assert(!TaskPlanner.isAgentGoal("Create a playlist named LUMA."), "TaskPlanner rejects 'Create a playlist named LUMA.' as agent search goal");
  assert(!TaskPlanner.isAgentGoal("Open my LUMA playlist."), "TaskPlanner rejects 'Open my LUMA playlist.' as agent search goal");
  assert(!TaskPlanner.isAgentGoal("Show me the videos in LUMA."), "TaskPlanner rejects 'Show me the videos in LUMA.' as agent search goal");
  assert(!TaskPlanner.isAgentGoal("How many videos are in LUMA?"), "TaskPlanner rejects 'How many videos are in LUMA?' as agent search goal");
  assert(!TaskPlanner.isAgentGoal("Make Python Learning private."), "TaskPlanner rejects 'Make Python Learning private.' as agent search goal");

  // =========================================================================
  // GROUP N: ERROR HANDLING & TRUTHFUL REPORTING (PHASE 8 TEST 8)
  // =========================================================================
  console.log("\n--- GROUP N: Error Handling & Truthful Reporting (Phase 8 Test 8) ---");

  // N1: Open nonexistent playlist
  const mockNonexistentFeedPage: any = {
    url: () => "https://www.youtube.com/feed/playlists",
    title: async () => "Playlists - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => {
          if (sel.includes("avatar-btn")) return true;
          return false; // not visible
        },
      }),
    }),
    evaluate: async () => true,
  };

  const nonExistentRes = await YouTubePlaylistService.openPlaylist(mockNonexistentFeedPage, "TotallyNonExistentPlaylistXYZ");
  assert(!nonExistentRes.success, "Open nonexistent playlist returns false");
  assert(nonExistentRes.status === "FAILED", "Status is FAILED");
  assert(nonExistentRes.message.includes("was not found in your YouTube account"), "Truthful error returned for missing playlist");

  // N2: Video removal confirmation gate rejection
  const unconfirmedRemRes = await YouTubePlaylistService.removeVideoFromPlaylist(mockNonexistentFeedPage, "LUMA", "first", false);
  assert(!unconfirmedRemRes.success, "Removal without confirmation returns false");
  assert(unconfirmedRemRes.status === "CONFIRM_REQUIRED", "Status is CONFIRM_REQUIRED");
  assert(unconfirmedRemRes.requiresConfirmation === true, "requiresConfirmation flag is true");
  assert(unconfirmedRemRes.message.includes("Please confirm to proceed"), "Asks for confirmation");

  // =========================================================================
  // GROUP O: VIDEO CONTEXT RESOLUTION (PART 2)
  // =========================================================================
  console.log("\n--- GROUP O: Video Context Resolution (Part 2) ---");

  // O1: Priority 1 - Current playing video
  const mockWatchContextPage: any = {
    url: () => "https://www.youtube.com/watch?v=sample123",
    title: async () => "Building Autonomous Agents in TypeScript - YouTube",
    locator: (sel: string) => ({
      first: () => ({
        innerText: async () => "Building Autonomous Agents in TypeScript",
      }),
    }),
  };
  const resolvedPlaying = await YouTubePlaylistService.resolveVideoContext(mockWatchContextPage);
  assert(resolvedPlaying !== null, "Playing video context resolved");
  assert(resolvedPlaying?.type === "CURRENT_PLAYING", "Context type is CURRENT_PLAYING");
  assert(resolvedPlaying?.url?.includes("sample123") ?? false, "URL preserved in context");
  assert(resolvedPlaying?.title === "Building Autonomous Agents in TypeScript", "Title extracted correctly");

  // O2: Priority 2 - Visible search results
  const mockSearchContextPage: any = {
    url: () => "https://www.youtube.com/results?search_query=typescript",
    title: async () => "typescript - YouTube",
    locator: (sel: string) => ({
      count: async () => 5,
      nth: (idx: number) => ({
        locator: (sub: string) => ({
          innerText: async () => "TypeScript Full Course 2026",
          getAttribute: async () => "/watch?v=ts2026",
        }),
      }),
    }),
  };
  const resolvedSearch = await YouTubePlaylistService.resolveVideoContext(mockSearchContextPage, { rank: 1 });
  assert(resolvedSearch !== null, "Search result context resolved");
  assert(resolvedSearch?.type === "SEARCH_RESULT", "Context type is SEARCH_RESULT");
  assert(resolvedSearch?.rank === 1, "Rank preserved");
  assert(resolvedSearch?.title === "TypeScript Full Course 2026", "Search card title extracted");

  // O3: Priority 3 - Explicit search query
  const resolvedExplicit = await YouTubePlaylistService.resolveVideoContext(mockSearchContextPage, { explicitQuery: "Rust tutorials", rank: 2 });
  assert(resolvedExplicit !== null, "Explicit query context resolved");
  assert(resolvedExplicit?.searchQuery === "Rust tutorials", "Explicit query preserved");
  assert(resolvedExplicit?.rank === 2, "Explicit rank preserved");

  // O4: Priority 4 - Missing video context returns null
  const mockHomeContextPage: any = {
    url: () => "https://www.youtube.com/",
    title: async () => "YouTube",
    locator: (sel: string) => ({
      count: async () => 0,
    }),
  };
  const resolvedMissing = await YouTubePlaylistService.resolveVideoContext(mockHomeContextPage);
  assert(resolvedMissing === null, "Home page without video returns null context");

  // =========================================================================
  // GROUP P: REAL SAVE-TO-PLAYLIST WORKFLOW (PART 3 & 4)
  // =========================================================================
  console.log("\n--- GROUP P: Real Save-To-Playlist Workflow (Part 3 & 4) ---");

  // P1: createPlaylistFromVideo on watch page
  let creationActions: string[] = [];
  const mockWatchCreationPage: any = {
    url: () => "https://www.youtube.com/watch?v=seedVideo123",
    title: async () => "TypeScript Tutorial - YouTube",
    goto: async (url: string) => { creationActions.push(`goto:${url}`); },
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => { creationActions.push(`click:${sel}`); },
        fill: async (val: string) => { creationActions.push(`fill:${val}`); },
        getAttribute: async (attr: string) => (attr === "href" ? "/playlist?list=PL_TEST_SUITE" : null),
        innerText: async () => "TypeScript Tutorial",
      }),
    }),
    evaluate: async () => true,
  };

  const createFromVidRes = await YouTubePlaylistService.createPlaylistFromVideo(
    mockWatchCreationPage,
    { type: "CURRENT_PLAYING", url: "https://www.youtube.com/watch?v=seedVideo123", title: "TypeScript Tutorial" },
    "LUMA Automation Test",
    "PRIVATE",
    "Create a playlist named LUMA Automation Test using this video."
  );

  assert(createFromVidRes.success, "createPlaylistFromVideo succeeds on real watch page");
  assert(createFromVidRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(createFromVidRes.playlistName === "LUMA Automation Test", "Playlist name is preserved");
  assert(createFromVidRes.videoTitle === "TypeScript Tutorial", "Seed video title verified inside playlist");
  assert(creationActions.some((a) => a.includes("LUMA Automation Test")), "Filled playlist title input");

  // P2: addVideoToPlaylist with VideoContext
  const mockAddToPlaylistPage: any = {
    url: () => "https://www.youtube.com/watch?v=addVideo456",
    title: async () => "Advanced TypeScript - YouTube",
    goto: async () => {},
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        getAttribute: async (attr: string) => (attr === "aria-checked" ? "false" : null),
        innerText: async () => "Advanced TypeScript",
      }),
    }),
    keyboard: { press: async () => {} },
    evaluate: async () => true,
  };

  const addVidRes = await YouTubePlaylistService.addVideoToPlaylist(
    mockAddToPlaylistPage,
    "LUMA Automation Test",
    { type: "CURRENT_PLAYING", url: "https://www.youtube.com/watch?v=addVideo456" }
  );
  assert(addVidRes.success, "addVideoToPlaylist with VideoContext succeeds");
  assert(addVidRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(addVidRes.message.includes("LUMA Automation Test"), "Message confirms target playlist");

  // =========================================================================
  // GROUP Q: OPEN AND PLAY FROM PLAYLIST (PART 5)
  // =========================================================================
  console.log("\n--- GROUP Q: Open and Play from Playlist (Part 5) ---");

  // Q1: Open Watch Later direct navigation
  let wlVisitedUrl = "";
  const mockWatchLaterPage: any = {
    url: () => wlVisitedUrl || "https://www.youtube.com/playlist?list=WL",
    title: async () => "Watch Later - YouTube",
    goto: async (url: string) => { wlVisitedUrl = url; },
  };
  const openWlRes = await YouTubePlaylistService.openPlaylist(mockWatchLaterPage, "Watch Later");
  assert(openWlRes.success, "Open Watch Later succeeds");
  assert(openWlRes.status === "SUCCESS_VERIFIED", "Watch Later status is SUCCESS_VERIFIED");
  assert(wlVisitedUrl === "https://www.youtube.com/playlist?list=WL", "Navigated directly to list=WL");

  // Q2: Play specific video by index from playlist
  let playVideoVisited = "";
  let videoStarted = false;
  const mockPlayVideoPage: any = {
    url: () => playVideoVisited || "https://www.youtube.com/playlist?list=PL_TEST",
    title: async () => (playVideoVisited ? "Second Video - YouTube" : "LUMA Test Playlist - YouTube"),
    goto: async (url: string) => { playVideoVisited = url; },
    waitForSelector: async () => {},
    waitForTimeout: async () => {},
    evaluate: async (fn: any) => {
      const fnStr = fn.toString();
      if (fnStr.includes("querySelectorAll")) {
        // Return 3 mock videos
        return [
          { index: 1, title: "First Video", url: "https://www.youtube.com/watch?v=vid1", isUnavailable: false },
          { index: 2, title: "Second Video", url: "https://www.youtube.com/watch?v=vid2", isUnavailable: false },
          { index: 3, title: "[Deleted video]", url: "", isUnavailable: true },
        ];
      }
      if (fnStr.includes("paused")) {
        videoStarted = true;
      }
      return true;
    },
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => {},
        getAttribute: async (attr: string) => "/playlist?list=PL_TEST",
        innerText: async () => "LUMA Test Playlist",
      }),
    }),
  };

  const playSecondRes = await YouTubePlaylistService.playPlaylistVideo(mockPlayVideoPage, "LUMA Test Playlist", 2);
  assert(playSecondRes.success, "Play second video in playlist succeeds");
  assert(playSecondRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(playSecondRes.videoTitle === "Second Video", "Video title is Second Video");
  assert(playVideoVisited === "https://www.youtube.com/watch?v=vid2", "Navigated to second video URL");
  assert(videoStarted, "HTML5 video playback started");

  // Q3: Excludes deleted/unavailable videos
  const playThirdRes = await YouTubePlaylistService.playPlaylistVideo(mockPlayVideoPage, "LUMA Test Playlist", 3);
  assert(!playThirdRes.success, "Cannot play out-of-bounds video after filtering unavailable");
  assert(playThirdRes.message.includes("only contains 2 playable video(s)"), "Truthful explanation of playable video count");

  // Q4: Play next video in playlist
  let nextClicked = false;
  const mockNextVideoPage: any = {
    url: () => "https://www.youtube.com/watch?v=vid3&list=PL_TEST",
    title: async () => "Third Video - YouTube",
    waitForTimeout: async () => {},
    locator: (sel: string) => ({
      first: () => ({
        isVisible: async () => true,
        click: async () => { nextClicked = true; },
      }),
    }),
    evaluate: async () => true,
  };

  const playNextRes = await YouTubePlaylistService.playNextPlaylistVideo(mockNextVideoPage);
  assert(playNextRes.success, "Play next video in playlist succeeds");
  assert(playNextRes.status === "SUCCESS_VERIFIED", "Status is SUCCESS_VERIFIED");
  assert(nextClicked, "Next video button was clicked");

  // Q5: Natural language command routing for playlist playback
  const rPlaySecondWL = routeCommand("Play the second video in Watch Later.");
  assert(rPlaySecondWL.intent === "YOUTUBE_PLAY_PLAYLIST_VIDEO", "Route 'Play the second video in Watch Later.' -> YOUTUBE_PLAY_PLAYLIST_VIDEO");
  assert(rPlaySecondWL.arguments?.playlist_name === "Watch Later", "Target playlist is Watch Later");
  assert(rPlaySecondWL.arguments?.index === 2, "Index is 2");

  const rPlayFirstLuma = routeCommand("Play the first video in LUMA.");
  assert(rPlayFirstLuma.intent === "YOUTUBE_PLAY_PLAYLIST_VIDEO", "Route 'Play the first video in LUMA.' -> YOUTUBE_PLAY_PLAYLIST_VIDEO");
  assert(rPlayFirstLuma.arguments?.playlist_name === "LUMA", "Target playlist is LUMA");
  assert(rPlayFirstLuma.arguments?.index === 1, "Index is 1");

  const rPlayThirdPL = routeCommand("Play the third video from my Python Learning playlist.");
  assert(rPlayThirdPL.intent === "YOUTUBE_PLAY_PLAYLIST_VIDEO", "Route 'Play the third video from my Python Learning playlist.' -> YOUTUBE_PLAY_PLAYLIST_VIDEO");
  assert(rPlayThirdPL.arguments?.playlist_name === "Python Learning", "Target playlist is Python Learning");
  assert(rPlayThirdPL.arguments?.index === 3, "Index is 3");

  const rPlayNext = routeCommand("Play the next video in this playlist.");
  assert(rPlayNext.intent === "YOUTUBE_PLAY_PLAYLIST_VIDEO", "Route 'Play the next video in this playlist.' -> YOUTUBE_PLAY_PLAYLIST_VIDEO");
  assert(rPlayNext.arguments?.next === true, "next flag is true");

  const rOpenWL = routeCommand("Open Watch Later.");
  assert(rOpenWL.intent === "YOUTUBE_OPEN_PLAYLIST", "Route 'Open Watch Later.' -> YOUTUBE_OPEN_PLAYLIST");
  assert(rOpenWL.arguments?.name === "Watch Later", "Target is Watch Later");

  const rCreateWithVideo = routeCommand("Create a playlist named LUMA using this video.");
  assert(rCreateWithVideo.intent === "YOUTUBE_CREATE_PLAYLIST", "Route 'Create a playlist named LUMA using this video.' -> YOUTUBE_CREATE_PLAYLIST");
  assert(rCreateWithVideo.arguments?.name === "LUMA", "Playlist name extracted without 'using this video'");
  assert(rCreateWithVideo.arguments?.use_current_video === true, "use_current_video flag is true");

  const rAddSearchResult = routeCommand("Add the first search result to LUMA.");
  assert(rAddSearchResult.intent === "YOUTUBE_ADD_TO_PLAYLIST", "Route 'Add the first search result to LUMA.' -> YOUTUBE_ADD_TO_PLAYLIST");
  assert(rAddSearchResult.arguments?.playlist_name === "LUMA", "Target playlist is LUMA");
  assert(rAddSearchResult.arguments?.rank === 1, "Rank is 1");

  // =========================================================================
  // GROUP R: TOOL REGISTRY FOR NEW PLAYLIST TOOLS
  // =========================================================================
  console.log("\n--- GROUP R: Tool Registry For New Playlist Tools ---");
  assert(ToolRegistry.get("youtube_play_playlist_video") !== undefined, "Tool 'youtube_play_playlist_video' registered");
  assert(ToolRegistry.get("youtube_create_playlist_from_video") !== undefined, "Tool 'youtube_create_playlist_from_video' registered");

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

runPlaylistTests().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
