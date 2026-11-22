export interface YouTubeCommandDefinition {
  canonicalName: string;
  category: "Playback" | "Navigation" | "Fullscreen" | "Ad Control" | "Playlist" | "Discovery";
  description: string;
  examplePhrases: string[];
  tool: string;
  intent: string;
  prerequisites: string;
  verificationMethod: string;
}

export const YOUTUBE_COMMAND_CATALOG: YouTubeCommandDefinition[] = [
  // 1. Playback Controls
  {
    canonicalName: "Play First Video Result",
    category: "Playback",
    description: "Plays the very first organic video result on YouTube search or feed.",
    examplePhrases: [
      "play the first result",
      "play the 1st one",
      "play first video",
      "open the first video",
      "play top result",
      "pehla video chalao",
    ],
    tool: "browser_play_first_video",
    intent: "PLAY_FIRST_RESULT",
    prerequisites: "YouTube search results page open with visible video cards.",
    verificationMethod: "Verifies navigation to /watch URL and video playback state is PLAYING.",
  },
  {
    canonicalName: "Play Video by Rank",
    category: "Playback",
    description: "Plays a specific ranked organic video result (e.g. 2nd, 3rd) skipping ads and channel headers.",
    examplePhrases: [
      "play the second result",
      "play 2nd video",
      "play the third result",
      "dusra video chalao",
    ],
    tool: "browser_play_video_rank",
    intent: "PLAY_VIDEO_RANK",
    prerequisites: "YouTube search results page open with at least N organic video cards.",
    verificationMethod: "Verifies target video URL is loaded and video element is playing.",
  },
  {
    canonicalName: "Pause Video",
    category: "Playback",
    description: "Pauses the currently playing YouTube video.",
    examplePhrases: ["pause video", "pause the song", "video pause karo", "pause"],
    tool: "browser_control_playback",
    intent: "PAUSE_MEDIA",
    prerequisites: "Active video playing on YouTube watch page.",
    verificationMethod: "Verifies HTML5 video player paused property equals true.",
  },
  {
    canonicalName: "Resume / Play Video",
    category: "Playback",
    description: "Resumes playback of the currently paused YouTube video.",
    examplePhrases: ["resume video", "play video", "video chalao", "continue playing"],
    tool: "browser_control_playback",
    intent: "RESUME_MEDIA",
    prerequisites: "Paused video on YouTube watch page.",
    verificationMethod: "Verifies HTML5 video player paused property equals false.",
  },
  {
    canonicalName: "Stop Video",
    category: "Playback",
    description: "Stops playback and resets current playback time to beginning (00:00).",
    examplePhrases: ["stop video", "stop playing", "video band karo", "video rok do"],
    tool: "youtube_stop_video",
    intent: "YOUTUBE_STOP",
    prerequisites: "YouTube watch page open.",
    verificationMethod: "Verifies video.paused === true and video.currentTime === 0.",
  },
  {
    canonicalName: "Seek Video",
    category: "Playback",
    description: "Jumps playback forward (+) or backward (-) by the requested number of seconds.",
    examplePhrases: [
      "forward 10 seconds",
      "fast forward 30s",
      "rewind 20 seconds",
      "skip ahead 15 seconds",
      "go back 1 minute",
      "10 second aage karo",
      "20 second peeche karo",
    ],
    tool: "youtube_seek",
    intent: "YOUTUBE_SEEK",
    prerequisites: "Active video with duration > 0.",
    verificationMethod: "Inspects video.currentTime before and after seek dispatch.",
  },
  {
    canonicalName: "Get Video Info / Current Song",
    category: "Playback",
    description: "Retrieves title, channel, duration, and playback progress of the active video.",
    examplePhrases: [
      "what is playing right now?",
      "which song is this?",
      "tell me the video title",
      "what video is this?",
      "current video title",
      "kaun sa gana chal raha hai",
    ],
    tool: "youtube_get_video_info",
    intent: "YOUTUBE_GET_VIDEO_INFO",
    prerequisites: "YouTube watch page loaded.",
    verificationMethod: "Extracts DOM metadata from #title, ytd-channel-name, and player duration.",
  },
  {
    canonicalName: "Get Playback State",
    category: "Playback",
    description: "Inspects whether player is PLAYING, PAUSED, BUFFERING, ENDED, or in ERROR.",
    examplePhrases: [
      "is video playing?",
      "is the video paused?",
      "check playback state",
      "playback status",
      "video status",
    ],
    tool: "youtube_get_playback_state",
    intent: "YOUTUBE_GET_PLAYBACK_STATE",
    prerequisites: "YouTube page open in browser.",
    verificationMethod: "Checks player class list and video tag readyState / paused state.",
  },
  {
    canonicalName: "Mute / Unmute Video",
    category: "Playback",
    description: "Mutes or unmutes the active YouTube video player.",
    examplePhrases: ["mute video", "mute youtube", "unmute video", "awaaz band karo", "unmute karo"],
    tool: "media_mute",
    intent: "MUTE_MEDIA",
    prerequisites: "YouTube watch page open.",
    verificationMethod: "Checks video.muted property and volume button aria attributes.",
  },
  {
    canonicalName: "Volume Up / Down",
    category: "Playback",
    description: "Adjusts YouTube playback volume up or down.",
    examplePhrases: ["volume up", "increase volume", "volume down", "decrease volume", "awaaz badhao"],
    tool: "media_volume_up",
    intent: "VOLUME_UP",
    prerequisites: "Active YouTube player.",
    verificationMethod: "Verifies video.volume adjustment.",
  },

  // 2. Fullscreen Controls (P2)
  {
    canonicalName: "Enter Fullscreen",
    category: "Fullscreen",
    description: "Enters fullscreen mode for the active YouTube video player.",
    examplePhrases: [
      "fullscreen",
      "full screen",
      "enter fullscreen",
      "go fullscreen",
      "fullscreen karo",
      "screen badi karo",
    ],
    tool: "youtube_set_fullscreen",
    intent: "YOUTUBE_SET_FULLSCREEN",
    prerequisites: "Active video playing on YouTube watch page (/watch).",
    verificationMethod: "Checks document.fullscreenElement and #movie_player.ytp-fullscreen.",
  },
  {
    canonicalName: "Exit Fullscreen",
    category: "Fullscreen",
    description: "Exits fullscreen mode and restores normal browser view using Escape key and UI controls.",
    examplePhrases: [
      "exit fullscreen",
      "leave fullscreen",
      "turn off fullscreen",
      "close fullscreen",
      "fullscreen band karo",
      "chhoti screen karo",
    ],
    tool: "youtube_set_fullscreen",
    intent: "YOUTUBE_SET_FULLSCREEN",
    prerequisites: "Browser currently in fullscreen mode.",
    verificationMethod: "Verifies document.fullscreenElement === null and ytp-fullscreen class removed.",
  },
  {
    canonicalName: "Get Fullscreen State",
    category: "Fullscreen",
    description: "Queries whether the active video player is currently in fullscreen mode.",
    examplePhrases: [
      "is the video currently fullscreen?",
      "check fullscreen state",
      "are we in fullscreen?",
      "is it fullscreen?",
      "fullscreen state",
    ],
    tool: "youtube_get_fullscreen_state",
    intent: "YOUTUBE_GET_FULLSCREEN_STATE",
    prerequisites: "YouTube page open in browser.",
    verificationMethod: "Inspects document.fullscreenElement, .ytp-fullscreen, and viewport height.",
  },

  // 3. Ad Controls
  {
    canonicalName: "Skip Advertisement",
    category: "Ad Control",
    description: "Clicks the real Skip Ad button if an advertisement is playing and skippable.",
    examplePhrases: [
      "skip ad",
      "skip the ad",
      "skip this ad",
      "skip advertisement",
      "skip the ad if the Skip Ads button appears",
      "skip the advertisement when possible",
      "click skip ad when it becomes available",
      "ad skip karo",
      "ad hatao",
    ],
    tool: "youtube_skip_ad",
    intent: "YOUTUBE_SKIP_AD",
    prerequisites: "Advertisement currently displayed on player.",
    verificationMethod: "Locates button.ytp-skip-ad-button, triggers click, verifies ad closure.",
  },

  // 4. Real YouTube Playlist Automation (P1)
  {
    canonicalName: "Create Playlist",
    category: "Playlist",
    description: "Creates a new playlist in the user's logged-in YouTube account seeded with a video via YouTube's real Save-to-playlist workflow.",
    examplePhrases: [
      "create a playlist called Python Learning",
      "create a private playlist named AI Tutorials",
      "create a public playlist named Web Development",
      "create an unlisted playlist named Project Demo",
      "create playlist Coding Music",
      "create a playlist named LUMA using this video",
      "create a playlist named LUMA with this video",
    ],
    tool: "youtube_create_playlist",
    intent: "YOUTUBE_CREATE_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile and an active video context.",
    verificationMethod: "Opens Save to playlist dialog, clicks New playlist, fills name/privacy, clicks Create, verifies seed video inside.",
  },
  {
    canonicalName: "Play Video from Playlist",
    category: "Playlist",
    description: "Plays a specific video by 1-based index from a YouTube playlist (e.g. Watch Later, LUMA, Python Learning).",
    examplePhrases: [
      "play the second video in Watch Later",
      "play the first video in LUMA",
      "play the third video from my Python Learning playlist",
      "play 2nd video in Watch Later",
      "play first video from LUMA playlist",
    ],
    tool: "youtube_play_playlist_video",
    intent: "YOUTUBE_PLAY_PLAYLIST_VIDEO",
    prerequisites: "Playlist accessible in YouTube account.",
    verificationMethod: "Opens playlist, filters playable videos, navigates to index N video, verifies playback starts.",
  },
  {
    canonicalName: "Play Next Video in Playlist",
    category: "Playlist",
    description: "Advances to and plays the next video in the active playlist player.",
    examplePhrases: [
      "play the next video in this playlist",
      "play next video in playlist",
      "play next video",
    ],
    tool: "youtube_play_playlist_video",
    intent: "YOUTUBE_PLAY_PLAYLIST_VIDEO",
    prerequisites: "Active video playing within a playlist context.",
    verificationMethod: "Clicks next playlist button, verifies URL change and playback.",
  },
  {
    canonicalName: "Open Playlist",
    category: "Playlist",
    description: "Opens an existing playlist by name, 'latest', 'Watch Later', or direct playlist URL in the browser.",
    examplePhrases: [
      "open my latest playlist",
      "open playlist Coding Music",
      "show playlist Python Learning",
      "view playlist AI Tutorials",
      "open Watch Later",
      "open my Watch Later playlist",
      "open playlist https://www.youtube.com/playlist?list=PL...",
    ],
    tool: "youtube_open_playlist_ui",
    intent: "YOUTUBE_OPEN_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile or public playlist URL.",
    verificationMethod: "Verifies page URL contains 'list=' and header matches playlist title.",
  },
  {
    canonicalName: "List All Playlists",
    category: "Playlist",
    description: "Retrieves and displays all playlists in the user's logged-in YouTube account.",
    examplePhrases: [
      "show my YouTube playlists",
      "list all my playlists",
      "which playlists have I created?",
      "show my playlists",
      "list playlists",
      "what are my playlists?",
    ],
    tool: "youtube_list_playlists",
    intent: "YOUTUBE_LIST_PLAYLISTS",
    prerequisites: "Active Google sign-in in .chrome_profile.",
    verificationMethod: "Scrapes user's feed/playlists page and returns names, URLs, and video counts.",
  },
  {
    canonicalName: "Count Playlist Videos",
    category: "Playlist",
    description: "Counts total number of videos in a playlist, distinguishing header count from loaded DOM rows.",
    examplePhrases: [
      "how many videos are in LUMA Tutorial?",
      "count the videos in Python Learning",
      "how many videos in playlist Coding Music?",
      "count videos in LUMA Tutorial",
    ],
    tool: "youtube_count_playlist_videos",
    intent: "YOUTUBE_COUNT_PLAYLIST_VIDEOS",
    prerequisites: "Playlist accessible in browser.",
    verificationMethod: "Extracts video count from metadata badge and DOM renderer elements.",
  },
  {
    canonicalName: "Add Video to Playlist",
    category: "Playlist",
    description: "Adds the active video or search result videos to a specific user playlist.",
    examplePhrases: [
      "add this video to Coding Music",
      "add current video to Python Learning",
      "add the first 3 videos to Coding Music",
      "add first 3 relevant videos to AI Tutorials",
    ],
    tool: "youtube_add_to_playlist",
    intent: "YOUTUBE_ADD_TO_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile and valid video open.",
    verificationMethod: "Opens Save dialog, checks playlist box, verifies checked state.",
  },
  {
    canonicalName: "List Playlist Videos",
    category: "Playlist",
    description: "Lists videos present inside a specific playlist with titles, links, and durations.",
    examplePhrases: [
      "list videos in playlist Coding Music",
      "show videos in playlist Python Learning",
      "what videos are in playlist LUMA Tutorial?",
    ],
    tool: "youtube_list_playlist_videos_ui",
    intent: "YOUTUBE_LIST_PLAYLIST_VIDEOS",
    prerequisites: "Playlist open in browser.",
    verificationMethod: "Scrapes ytd-playlist-video-renderer items from the page.",
  },
  {
    canonicalName: "Remove Video from Playlist",
    category: "Playlist",
    description: "Removes a video from a user playlist using the item action menu (confirmation required).",
    examplePhrases: [
      "remove Python tutorials from Coding Music",
      "remove the first video from Coding Music",
      "delete video from playlist Coding Music",
      "remove the current video from LUMA",
    ],
    tool: "youtube_remove_from_playlist_ui",
    intent: "YOUTUBE_REMOVE_FROM_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile and explicit user confirmation.",
    verificationMethod: "Enforces CONFIRM_REQUIRED gate, triggers action menu removal, verifies absence.",
  },
  {
    canonicalName: "Rename Playlist",
    category: "Playlist",
    description: "Renames a user playlist in the logged-in YouTube account.",
    examplePhrases: [
      "rename LUMA to LUMA Tutorials",
      "rename playlist LUMA to LUMA Tutorials",
      "rename playlist called Coding to Coding Music",
    ],
    tool: "youtube_rename_playlist",
    intent: "YOUTUBE_RENAME_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile.",
    verificationMethod: "Opens playlist, edits title in header, clicks Save, verifies updated title.",
  },
  {
    canonicalName: "Update Playlist Privacy",
    category: "Playlist",
    description: "Updates visibility/privacy setting of a YouTube playlist ('PUBLIC', 'UNLISTED', 'PRIVATE').",
    examplePhrases: [
      "make Python Learning private",
      "make LUMA Tutorials unlisted",
      "make Web Development public",
      "change privacy of Python Learning to private",
    ],
    tool: "youtube_update_playlist_privacy",
    intent: "YOUTUBE_UPDATE_PLAYLIST_PRIVACY",
    prerequisites: "Active Google sign-in in .chrome_profile.",
    verificationMethod: "Opens playlist, changes privacy dropdown, verifies updated privacy badge.",
  },
  {
    canonicalName: "Add Search Result to Playlist",
    category: "Playlist",
    description: "Searches YouTube and adds the video at rank N (excluding ads, channels, and playlists) to a target playlist.",
    examplePhrases: [
      "search for Python tutorials and add the first video to LUMA",
      "search YouTube for Nature and add the first video to LUMA",
      "find the second LangChain video and add it to AI Tutorials",
    ],
    tool: "youtube_add_search_result_to_playlist",
    intent: "YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST",
    prerequisites: "Active Google sign-in in .chrome_profile.",
    verificationMethod: "Navigates to query search, clicks rank N video, opens Save dialog, verifies addition.",
  },

  // 5. Command Discovery & Help (P3)
  {
    canonicalName: "Show YouTube Commands",
    category: "Discovery",
    description: "Displays the comprehensive catalog of all supported YouTube commands and usage examples.",
    examplePhrases: [
      "show YouTube commands",
      "what YouTube actions are supported?",
      "show playlist commands",
      "show playback commands",
      "how do I create a playlist?",
      "what can you do on YouTube?",
      "YouTube help",
    ],
    tool: "youtube_help_commands",
    intent: "YOUTUBE_HELP_COMMANDS",
    prerequisites: "None.",
    verificationMethod: "Returns formatted command catalog filtered by category or complete list.",
  },
];

/**
 * Returns commands matching an optional category filter.
 */
export function getYouTubeCommands(filterCategory?: string): YouTubeCommandDefinition[] {
  if (!filterCategory) return YOUTUBE_COMMAND_CATALOG;
  const lower = filterCategory.toLowerCase();
  return YOUTUBE_COMMAND_CATALOG.filter((cmd) => cmd.category.toLowerCase().includes(lower));
}

/**
 * Formats command catalog into a clean markdown presentation for users.
 */
export function formatYouTubeCommandsHelp(filterCategory?: string): string {
  const commands = getYouTubeCommands(filterCategory);
  const categories = Array.from(new Set(commands.map((c) => c.category)));

  let output = "### Supported YouTube Commands\n\n";
  output += "LUMA directly controls Google Chrome (`.chrome_profile`) with real DOM interactions:\n\n";

  for (const cat of categories) {
    output += `#### ${cat} Commands\n`;
    const catCmds = commands.filter((c) => c.category === cat);
    for (const cmd of catCmds) {
      output += `- **${cmd.canonicalName}**: ${cmd.description}\n`;
      output += `  *Examples*: "${cmd.examplePhrases.slice(0, 3).join('", "')}"\n`;
      if (cmd.prerequisites && cmd.prerequisites !== "None.") {
        output += `  *Prerequisite*: ${cmd.prerequisites}\n`;
      }
    }
    output += "\n";
  }

  output += "> Note: User playlist operations require an active Google sign-in in your Chrome session (`.chrome_profile`).";
  return output;
}
