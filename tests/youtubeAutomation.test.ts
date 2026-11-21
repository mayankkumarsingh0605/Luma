import { YouTubePlaylistManager } from "../server/computer/browser/modules/youtubePlaylistManager.js";
import { YouTubeModule } from "../server/computer/browser/modules/youtubeModule.js";
import { routeCommand } from "../src/router/commandRouter.js";
import { ComputerStateManager } from "../src/state/computerState.js";
import fs from "fs";
import path from "path";

console.log("=================================================");
console.log("  LUMA Stage A & B YouTube Automation Tests");
console.log("=================================================");

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
  // --- 1. YouTubeModule URL Matching ---
  console.log("\n--- 1. YouTubeModule URL Matching ---");
  const ytMod = new YouTubeModule();
  assert(ytMod.matchesUrl("https://www.youtube.com/"), "Matches https://www.youtube.com/");
  assert(ytMod.matchesUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"), "Matches youtube.com/watch");
  assert(ytMod.matchesUrl("https://youtu.be/dQw4w9WgXcQ"), "Matches youtu.be shortlinks");
  assert(!ytMod.matchesUrl("https://www.amazon.in/"), "Does not match Amazon");
  assert(!ytMod.matchesUrl("https://www.google.com/"), "Does not match Google");

  // --- 2. YouTubePlaylistManager Operations ---
  console.log("\n--- 2. YouTubePlaylistManager Operations ---");
  // Clean up any test playlist before starting
  await YouTubePlaylistManager.deletePlaylist("Test Coding Music");

  // Create playlist
  const pl = await YouTubePlaylistManager.createPlaylist("Test Coding Music");
  assert(pl.name === "Test Coding Music", "Playlist created with correct name");
  assert(Array.isArray(pl.videos) && pl.videos.length === 0, "New playlist is initially empty");

  // Add videos
  const addRes1 = await YouTubePlaylistManager.addVideosToPlaylist("Test Coding Music", [
    { title: "Python Tutorial 1 - Beginner Basics", url: "https://www.youtube.com/watch?v=vid11111111", videoId: "vid11111111" },
    { title: "Python Tutorial 2 - Data Structures", url: "https://www.youtube.com/watch?v=vid22222222", videoId: "vid22222222" },
    { title: "Python Tutorial 3 - Web Development", url: "https://www.youtube.com/watch?v=vid33333333", videoId: "vid33333333" },
  ]);
  assert(addRes1.addedCount === 3, "Added 3 videos to playlist");
  assert(addRes1.playlist.videos.length === 3, "Playlist has 3 videos");

  // Test deduplication
  const addRes2 = await YouTubePlaylistManager.addVideosToPlaylist("Test Coding Music", [
    { title: "Python Tutorial 1 - Beginner Basics", url: "https://www.youtube.com/watch?v=vid11111111", videoId: "vid11111111" },
  ]);
  assert(addRes2.addedCount === 0, "Duplicate video was not added again");
  assert(addRes2.playlist.videos.length === 3, "Playlist size unchanged on duplicate addition");

  // Retrieve playlist
  const retrieved = await YouTubePlaylistManager.getPlaylist("Test Coding Music");
  assert(retrieved !== undefined && retrieved.videos.length === 3, "Retrieved playlist contains 3 videos");

  // Remove video by substring title
  const removeRes1 = await YouTubePlaylistManager.removeVideoFromPlaylist("Test Coding Music", "Data Structures");
  assert(removeRes1.success, "Removed video matching 'Data Structures'");
  assert(removeRes1.removedVideo?.title.includes("Data Structures") === true, "Removed correct item");
  const afterRemove1 = await YouTubePlaylistManager.getPlaylist("Test Coding Music");
  assert(afterRemove1?.videos.length === 2, "Playlist now contains 2 videos");

  // Remove video by ordinal ("first")
  const removeRes2 = await YouTubePlaylistManager.removeVideoFromPlaylist("Test Coding Music", "first");
  assert(removeRes2.success, "Removed first video from playlist");
  const afterRemove2 = await YouTubePlaylistManager.getPlaylist("Test Coding Music");
  assert(afterRemove2?.videos.length === 1, "Playlist now contains 1 video");

  // Clean up
  await YouTubePlaylistManager.deletePlaylist("Test Coding Music");
  const deletedPl = await YouTubePlaylistManager.getPlaylist("Test Coding Music");
  assert(deletedPl === undefined, "Playlist successfully deleted");

  // --- 3. Stage A Command Routing Verification ---
  console.log("\n--- 3. Stage A Command Routing Verification ---");
  const r1 = routeCommand("Open YouTube.");
  assert(r1.intent === "OPEN_WEBSITE" && r1.arguments.target === "youtube", "Open YouTube -> OPEN_WEBSITE (youtube)");

  const r2 = routeCommand("Search for music on YouTube.");
  assert(r2.intent === "SEARCH_WEB" && r2.arguments.target === "youtube" && r2.arguments.query === "music", "Search for music on YouTube -> SEARCH_WEB (youtube, music)");

  ComputerStateManager.update({ current_url: "https://www.youtube.com/results?search_query=music" });
  const r3 = routeCommand("Search for relaxing music.");
  assert(r3.intent === "SEARCH_WEB" && r3.arguments.target === "youtube" && r3.arguments.query === "relaxing music", "Search for relaxing music in YouTube context -> SEARCH_WEB (youtube, relaxing music)");

  const r4 = routeCommand("Play the first result.");
  assert(r4.intent === "PLAY_FIRST_RESULT" && r4.arguments.target === "youtube", "Play the first result -> PLAY_FIRST_RESULT (youtube)");

  const r5 = routeCommand("Pause the video.");
  assert(r5.intent === "PAUSE_MEDIA", "Pause the video -> PAUSE_MEDIA");

  const r6 = routeCommand("Resume playback.");
  assert(r6.intent === "RESUME_MEDIA", "Resume playback -> RESUME_MEDIA");

  ComputerStateManager.reset();

  // --- 4. Stage B Command Routing Verification ---
  console.log("\n--- 4. Stage B Command Routing Verification ---");
  const r7 = routeCommand("Create a playlist called Coding Music.");
  assert(r7.intent === "YOUTUBE_CREATE_PLAYLIST" && r7.arguments.name === "Coding Music", "Create a playlist called Coding Music -> YOUTUBE_CREATE_PLAYLIST (Coding Music)");

  const r8 = routeCommand("Search for Python tutorials and add the first three relevant videos to Coding Music.");
  assert(r8.intent === "COMPOUND_GOAL", "Search and add to playlist -> COMPOUND_GOAL");
  assert(r8.subCommands?.length === 2, "Splits into exactly 2 sub-commands");

  // Check sub-commands routing with contextual propagation
  const sub1 = routeCommand(r8.subCommands![0], "youtube");
  assert(sub1.intent === "SEARCH_WEB" && sub1.arguments.target === "youtube" && sub1.arguments.query === "python tutorials", "Sub-command 1: search python tutorials on youtube");

  const sub2 = routeCommand(r8.subCommands![1], "youtube");
  assert(sub2.intent === "YOUTUBE_ADD_TO_PLAYLIST" && sub2.arguments.playlist_name === "coding music" && sub2.arguments.limit === 3, "Sub-command 2: add first 3 videos to coding music");

  const r9 = routeCommand("Play my Coding Music playlist.");
  assert(r9.intent === "YOUTUBE_PLAY_PLAYLIST" && r9.arguments.name === "Coding Music", "Play my Coding Music playlist -> YOUTUBE_PLAY_PLAYLIST (Coding Music)");

  const r10 = routeCommand("Open playlist Coding Music.");
  assert(r10.intent === "YOUTUBE_OPEN_PLAYLIST" && r10.arguments.name === "Coding Music", "Open playlist Coding Music -> YOUTUBE_OPEN_PLAYLIST (Coding Music)");

  const r11 = routeCommand("Remove Python tutorials from Coding Music.");
  assert(r11.intent === "YOUTUBE_REMOVE_FROM_PLAYLIST" && r11.arguments.playlist_name === "Coding Music" && r11.arguments.video === "Python tutorials", "Remove Python tutorials from Coding Music -> YOUTUBE_REMOVE_FROM_PLAYLIST");

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
  console.error("Test execution threw error:", err);
  process.exit(1);
});
