import { routeCommand } from '../src/router/commandRouter.js';
import { ComputerStateManager } from '../src/state/computerState.js';

console.log("=== Testing YouTube Stage A & B Command Routing ===");

const tests: Array<{ cmd: string; context?: string; expectedIntent: string; expectedTarget?: string; expectedQuery?: string }> = [
  { cmd: "Open YouTube.", expectedIntent: "OPEN_WEBSITE", expectedTarget: "youtube" },
  { cmd: "Search for music on YouTube.", expectedIntent: "SEARCH_WEB", expectedTarget: "youtube", expectedQuery: "music" },
  { cmd: "Search for relaxing music.", context: "youtube", expectedIntent: "SEARCH_WEB", expectedTarget: "youtube", expectedQuery: "relaxing music" },
  { cmd: "Play the first result.", expectedIntent: "PLAY_FIRST_RESULT", expectedTarget: "youtube" },
  { cmd: "Pause the video.", expectedIntent: "PAUSE_MEDIA" },
  { cmd: "Resume playback.", expectedIntent: "RESUME_MEDIA" },
  { cmd: "Create a playlist called Coding Music.", expectedIntent: "YOUTUBE_CREATE_PLAYLIST" },
  { cmd: "Search for Python tutorials and add the first three relevant videos to Coding Music.", expectedIntent: "COMPOUND_GOAL" },
  { cmd: "Play my Coding Music playlist.", expectedIntent: "YOUTUBE_PLAY_PLAYLIST" },
  { cmd: "Open playlist Coding Music.", expectedIntent: "YOUTUBE_OPEN_PLAYLIST" },
  { cmd: "Remove Python tutorials from Coding Music.", expectedIntent: "YOUTUBE_REMOVE_FROM_PLAYLIST" },
  { cmd: "Remove the first video from Coding Music.", expectedIntent: "YOUTUBE_REMOVE_FROM_PLAYLIST" },
];

let failed = 0;
for (const t of tests) {
  const routed = routeCommand(t.cmd, t.context);
  const okIntent = routed.intent === t.expectedIntent;
  const target = routed.arguments?.target || routed.arguments?.site;
  const okTarget = t.expectedTarget ? target === t.expectedTarget : true;
  const okQuery = t.expectedQuery ? routed.arguments?.query === t.expectedQuery : true;

  if (okIntent && okTarget && okQuery) {
    console.log(`PASS: "${t.cmd}" -> ${routed.intent} (target: ${target || 'N/A'}, query: ${routed.arguments?.query || 'N/A'})`);
  } else {
    console.error(`FAIL: "${t.cmd}" -> got intent ${routed.intent}, target ${target}, query ${routed.arguments?.query}`);
    failed++;
  }
}

// Test state-based context target
ComputerStateManager.update({ current_url: "https://www.youtube.com/watch?v=123" });
const contextualRouted = routeCommand("Search for relaxing music.");
if (contextualRouted.intent === "SEARCH_WEB" && (contextualRouted.arguments?.target === "youtube")) {
  console.log(`PASS: State-based context target successfully detected YouTube: target=${contextualRouted.arguments?.target}`);
} else {
  console.error(`FAIL: State-based context target failed: target=${contextualRouted.arguments?.target}`);
  failed++;
}

// Reset state
ComputerStateManager.reset();

if (failed === 0) {
  console.log("\nALL 13 ROUTING TESTS PASSED PERFECTLY!");
  process.exit(0);
} else {
  console.error(`\n${failed} TESTS FAILED.`);
  process.exit(1);
}
