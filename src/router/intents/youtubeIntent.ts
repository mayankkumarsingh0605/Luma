import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates YouTube-specific playback, video opening, and playlist intents.
 */
export function matchYouTubeIntent(
  normalizedText: string,
  rawText: string,
  _contextualTarget?: string
): IntentMatchResult | null {
  const text = normalizedText.trim();
  const rawClean = rawText.replace(/[.?!]+(?:\s+|$)/g, " ").trim();
  const raw = rawText.trim();

  // 0. Command Discovery & Help (P3)
  // "Show YouTube commands", "What YouTube actions are supported?", "Show playlist commands",
  // "Show playback commands", "How do I create a playlist?", "What can you do on YouTube?", "YouTube help"
  if (
    /^(?:show\s+youtube\s+commands|what\s+youtube\s+actions\s+are\s+supported|what\s+can\s+you\s+do\s+on\s+youtube|youtube\s+help|youtube\s+commands|supported\s+youtube\s+commands)$/i.test(rawClean) ||
    /^(?:show\s+(?:all\s+)?(?:youtube\s+)?(?:playlist|playback|fullscreen)\s+commands)$/i.test(rawClean) ||
    /^how\s+do\s+i\s+create\s+a\s+playlist\??$/i.test(rawClean)
  ) {
    let category = "all";
    if (/playlist/i.test(rawClean)) category = "playlist";
    else if (/playback/i.test(rawClean)) category = "playback";
    else if (/fullscreen/i.test(rawClean)) category = "fullscreen";

    return {
      matched: true,
      intent: "YOUTUBE_HELP_COMMANDS",
      ruleName: "RULE_YOUTUBE_HELP_COMMANDS",
      arguments: { category },
      toolToExecute: "youtube_help_commands",
    };
  }

  // 1. Play first result / video / ranked video:
  // "play the first result", "play the 1st one", "play the first one", "play the second result",
  // "open the first video", "play the top result", "play first one", "play 2nd video"
  const rankMatch =
    text.match(/^(?:play|open|watch)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|top|\d+(?:st|nd|rd|th)?)\s+(?:result|video|song|track|one)$/i) ||
    rawClean.match(/^(?:play|open|watch)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|top|\d+(?:st|nd|rd|th)?)\s+(?:result|video|song|track|one)$/i) ||
    raw.match(/^(?:pehla|dusra|teesra|1st|2nd|3rd)\s+(?:video|result)\s+(?:chalao|play\s*karo)$/i);

  if (rankMatch || /^(?:pehla\s+video\s+chalao|first\s+video\s+play\s+karo)$/i.test(raw)) {
    let rank = 1;
    if (rankMatch && rankMatch[1]) {
      const rWord = rankMatch[1].toLowerCase();
      if (rWord === "second" || rWord === "2nd") rank = 2;
      else if (rWord === "third" || rWord === "3rd") rank = 3;
      else if (rWord === "fourth" || rWord === "4th") rank = 4;
      else if (!isNaN(parseInt(rWord, 10))) rank = parseInt(rWord, 10);
    } else if (/dusra/i.test(raw)) {
      rank = 2;
    } else if (/teesra/i.test(raw)) {
      rank = 3;
    }

    if (rank === 1) {
      return {
        matched: true,
        intent: "PLAY_FIRST_RESULT",
        ruleName: "RULE_PLAY_FIRST_RESULT",
        arguments: { target: "youtube", rank: 1 },
        toolToExecute: "browser_play_first_video",
      };
    } else {
      return {
        matched: true,
        intent: "PLAY_VIDEO_RANK",
        ruleName: "RULE_PLAY_VIDEO_RANK",
        arguments: { target: "youtube", rank },
        toolToExecute: "browser_play_video_rank",
      };
    }
  }

  // 2. Fullscreen State Query (P2)
  // "Is the video currently fullscreen?", "Check fullscreen state", "Are we in fullscreen?", "Is it fullscreen?", "Fullscreen state"
  if (
    /^(?:is\s+(?:the\s+)?video\s+(?:currently\s+)?(?:in\s+)?fullscreen\??|check\s+fullscreen\s+state|are\s+we\s+in\s+fullscreen\??|is\s+it\s+fullscreen\??|fullscreen\s+state|fullscreen\s+status|check\s+if\s+fullscreen)$/i.test(rawClean) ||
    /^(?:kya\s+video\s+fullscreen\s+me\s+hai\??)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_GET_FULLSCREEN_STATE",
      ruleName: "RULE_YOUTUBE_GET_FULLSCREEN_STATE",
      arguments: { site: "youtube" },
      toolToExecute: "youtube_get_fullscreen_state",
    };
  }

  // 3. Fullscreen toggle / mode (P2)
  // "fullscreen", "full screen", "enter fullscreen", "go fullscreen", "toggle fullscreen",
  // "exit fullscreen", "leave fullscreen", "fullscreen karo", "badi screen karo", "screen badi karo", "fullscreen band karo"
  if (
    /^(?:exit\s+fullscreen|leave\s+fullscreen|turn\s+off\s+fullscreen|close\s+fullscreen)$/i.test(rawClean) ||
    /^(?:fullscreen\s+band\s+karo|chhoti\s+screen\s+karo)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_SET_FULLSCREEN",
      ruleName: "RULE_YOUTUBE_SET_FULLSCREEN",
      arguments: { enable: false, site: "youtube" },
      toolToExecute: "youtube_set_fullscreen",
    };
  }

  if (
    /^(?:fullscreen|full\s*screen|enter\s+fullscreen|go\s+fullscreen|toggle\s+fullscreen)$/i.test(rawClean) ||
    /^(?:fullscreen\s+karo|badi\s+screen\s+karo|screen\s+badi\s+karo)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_SET_FULLSCREEN",
      ruleName: "RULE_YOUTUBE_SET_FULLSCREEN",
      arguments: { enable: true, site: "youtube" },
      toolToExecute: "youtube_set_fullscreen",
    };
  }

  // 4. Ad Skipping (P3)
  // "skip ad", "skip the ad", "skip this ad", "skip advertisement", "skip ads", "ad skip karo", "advertisement skip karo", "ad hatao", "add skip karo"
  // "Skip the ad if the Skip Ads button appears", "Skip the advertisement when possible", "Click Skip Ad when it becomes available", "Skip ad if present"
  if (
    /^(?:skip\s+(?:the\s+|this\s+)?ad(?:vertisement)?s?|ad\s+skip\s*karo|advertisement\s+skip\s*karo|ad\s+hatao|add\s+skip\s*karo)$/i.test(rawClean) ||
    /^skip\s+(?:the\s+)?ad(?:vertisement)?(?:\s+if\s+(?:the\s+)?skip\s+ads?\s+button\s+appears|\s+when\s+possible|\s+if\s+present)$/i.test(rawClean) ||
    /^click\s+skip\s+ad(?:\s+when\s+it\s+becomes\s+available|\s+if\s+present)?$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_SKIP_AD",
      ruleName: "RULE_YOUTUBE_SKIP_AD",
      arguments: { site: "youtube" },
      toolToExecute: "youtube_skip_ad",
    };
  }

  // 5. List All Playlists (P1)
  // "Show all my YouTube playlists", "Show my YouTube playlists", "List all my playlists", "Which playlists have I created?", "Show my playlists", "List playlists"
  if (
    /^(?:show|list|view|get)\s+(?:all\s+)?(?:my\s+)?(?:youtube\s+)?playlists$/i.test(rawClean) ||
    /^(?:which\s+playlists\s+have\s+i\s+created\??|what\s+are\s+my\s+playlists\??|show\s+(?:all\s+)?my\s+playlists|list\s+playlists|mere\s+playlists\s+dikhao)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_LIST_PLAYLISTS",
      ruleName: "RULE_YOUTUBE_LIST_PLAYLISTS",
      arguments: {},
      toolToExecute: "youtube_list_playlists",
    };
  }

  // 5B. Search and Add to Playlist (P1 Compound):
  // "Search for Python tutorials and add the first video to LUMA", "Search YouTube for Nature and add the first video to LUMA", "Find the second LangChain video and add it to AI Tutorials"
  const searchAndAddMatch1 =
    rawClean.match(/^(?:search(?:\s+youtube)?\s+(?:for\s+)?|find\s+)(.+?)\s+and\s+add\s+(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+video\s+to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:search(?:\s+youtube)?\s+(?:for\s+)?|find\s+)(.+?)\s+and\s+add\s+(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+video\s+to\s+(?:playlist\s+)?(.+)$/i);

  const searchAndAddMatch2 =
    rawClean.match(/^(?:search(?:\s+youtube)?\s+(?:for\s+)?|find\s+)(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+(.+?)(?:\s+video)?\s+and\s+add\s+it\s+to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:search(?:\s+youtube)?\s+(?:for\s+)?|find\s+)(?:the\s+)?(first|second|third|1st|2nd|3rd|\d+(?:st|nd|rd|th)?)\s+(.+?)(?:\s+video)?\s+and\s+add\s+it\s+to\s+(?:playlist\s+)?(.+)$/i);

  if (searchAndAddMatch1 || searchAndAddMatch2) {
    let query = "";
    let rankStr = "1";
    let plName = "";

    if (searchAndAddMatch1) {
      query = searchAndAddMatch1[1].replace(/^(?:for\s+)/i, "").trim();
      rankStr = searchAndAddMatch1[2].toLowerCase();
      plName = searchAndAddMatch1[3].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    } else if (searchAndAddMatch2) {
      rankStr = searchAndAddMatch2[1].toLowerCase();
      query = searchAndAddMatch2[2].replace(/^(?:for\s+)/i, "").trim();
      plName = searchAndAddMatch2[3].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    }

    let rank = 1;
    if (rankStr === "second" || rankStr === "2nd") rank = 2;
    else if (rankStr === "third" || rankStr === "3rd") rank = 3;
    else if (!isNaN(parseInt(rankStr, 10))) rank = parseInt(rankStr, 10);

    return {
      matched: true,
      intent: "YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST",
      ruleName: "RULE_YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST",
      arguments: {
        query,
        rank,
        playlist_name: plName,
      },
      toolToExecute: "youtube_add_search_result_to_playlist",
    };
  }

  // 5C. Rename Playlist:
  // "Rename LUMA to LUMA Tutorials", "Rename playlist LUMA to LUMA Tutorials", "Rename playlist called LUMA to LUMA Tutorials"
  const renameMatch =
    rawClean.match(/^rename\s+(?:playlist\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i) ||
    text.match(/^rename\s+(?:playlist\s+)?(?:called\s+|named\s+)?(.+?)\s+to\s+(.+)$/i);

  if (renameMatch && renameMatch[1] && renameMatch[2]) {
    const oldName = renameMatch[1].replace(/["']/g, "").trim();
    const newName = renameMatch[2].replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_RENAME_PLAYLIST",
      ruleName: "RULE_YOUTUBE_RENAME_PLAYLIST",
      arguments: { old_name: oldName, new_name: newName },
      toolToExecute: "youtube_rename_playlist",
    };
  }

  // 5D. Update Playlist Privacy:
  // "Make Python Learning private", "Make LUMA Tutorials unlisted", "Make Web Development public", "Change privacy of Python Learning to private"
  const privacyMatch =
    rawClean.match(/^make\s+(?:playlist\s+)?(.+?)\s+(private|public|unlisted)$/i) ||
    rawClean.match(/^change\s+(?:the\s+)?privacy\s+of\s+(?:playlist\s+)?(.+?)\s+to\s+(private|public|unlisted)$/i) ||
    text.match(/^make\s+(?:playlist\s+)?(.+?)\s+(private|public|unlisted)$/i) ||
    text.match(/^change\s+(?:the\s+)?privacy\s+of\s+(?:playlist\s+)?(.+?)\s+to\s+(private|public|unlisted)$/i);

  if (privacyMatch && privacyMatch[1] && privacyMatch[2]) {
    const plName = privacyMatch[1].replace(/["']/g, "").trim();
    const pStr = privacyMatch[2].toUpperCase() as "PUBLIC" | "UNLISTED" | "PRIVATE";
    return {
      matched: true,
      intent: "YOUTUBE_UPDATE_PLAYLIST_PRIVACY",
      ruleName: "RULE_YOUTUBE_UPDATE_PLAYLIST_PRIVACY",
      arguments: { playlist_name: plName, privacy: pStr },
      toolToExecute: "youtube_update_playlist_privacy",
    };
  }

  // 6. Count Playlist Videos (P1)
  // "How many videos are in LUMA?", "Count videos in Python Learning", "How many videos in playlist Coding Music?"
  const countMatch =
    rawClean.match(/^(?:how\s+many\s+videos(?:\s+are)?\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??)$/i) ||
    rawClean.match(/^(?:count\s+(?:the\s+)?videos\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??)$/i) ||
    text.match(/^(?:how\s+many\s+videos(?:\s+are)?\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??)$/i) ||
    text.match(/^(?:count\s+(?:the\s+)?videos\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??)$/i);

  if (countMatch && countMatch[1]) {
    const plName = countMatch[1].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_COUNT_PLAYLIST_VIDEOS",
      ruleName: "RULE_YOUTUBE_COUNT_PLAYLIST_VIDEOS",
      arguments: { playlist_name: plName },
      toolToExecute: "youtube_count_playlist_videos",
    };
  }

  // 7. Create playlist with privacy option (P1):
  // "create a playlist called Python Learning", "create a private playlist named AI Tutorials",
  // "create a public playlist named Web Development", "create an unlisted playlist named Project Demo", "create playlist Coding Music"
  const createMatch =
    rawClean.match(/^create\s+(?:(?:a|an)\s+)?(?:(private|public|unlisted)\s+)?playlist\s+(?:called|named)\s+(.+)$/i) ||
    rawClean.match(/^create\s+(?:(?:a|an)\s+)?(?:(private|public|unlisted)\s+)?playlist\s+([a-zA-Z0-9\s_-]+)$/i) ||
    raw.match(/(?:called|named)\s+(.+?)\s+(?:playlist\s+banao|playlist\s+create\s+karo)/i) ||
    text.match(/^create\s+(?:(?:a|an)\s+)?(?:(private|public|unlisted)\s+)?playlist\s+(?:called|named)\s+(.+)$/i) ||
    text.match(/^create\s+(?:(?:a|an)\s+)?(?:(private|public|unlisted)\s+)?playlist\s+([a-zA-Z0-9\s_-]+)$/i);

  if (createMatch) {
    let privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE";
    let playlistName = "";

    if (createMatch.length >= 3 && createMatch[2]) {
      if (createMatch[1]) {
        const pStr = createMatch[1].toUpperCase();
        if (pStr === "PUBLIC" || pStr === "UNLISTED" || pStr === "PRIVATE") {
          privacy = pStr;
        }
      }
      playlistName = createMatch[2].replace(/["']/g, "").trim();
    } else if (createMatch[1]) {
      playlistName = createMatch[1].replace(/["']/g, "").trim();
    }

    let useCurrentVideo = false;
    if (/\s+(?:using|with)\s+this\s+video$/i.test(playlistName)) {
      useCurrentVideo = true;
      playlistName = playlistName.replace(/\s+(?:using|with)\s+this\s+video$/i, "").trim();
    }

    if (playlistName) {
      return {
        matched: true,
        intent: "YOUTUBE_CREATE_PLAYLIST",
        ruleName: "RULE_YOUTUBE_CREATE_PLAYLIST",
        arguments: { name: playlistName, privacy, use_current_video: useCurrentVideo },
        toolToExecute: "youtube_create_playlist",
      };
    }
  }

  // 7B. Add Search Result to Playlist:
  // "Add the first search result to LUMA", "Save 1st result to Python Learning"
  const addSearchResultMatch =
    rawClean.match(/^(?:add|save)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|\d+(?:st|nd|rd|th)?)\s+(?:search\s+result|result)\s+to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:add|save)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|\d+(?:st|nd|rd|th)?)\s+(?:search\s+result|result)\s+to\s+(?:playlist\s+)?(.+)$/i);

  if (addSearchResultMatch) {
    const rankStr = addSearchResultMatch[1].toLowerCase();
    let rank = 1;
    if (rankStr === "second" || rankStr === "2nd") rank = 2;
    else if (rankStr === "third" || rankStr === "3rd") rank = 3;
    else if (!isNaN(parseInt(rankStr, 10))) rank = parseInt(rankStr, 10);
    const plName = addSearchResultMatch[2].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_ADD_TO_PLAYLIST",
      ruleName: "RULE_YOUTUBE_ADD_SEARCH_RESULT_TO_PLAYLIST",
      arguments: {
        playlist_name: plName,
        rank,
        use_search_result: true,
      },
      toolToExecute: "youtube_add_to_playlist",
    };
  }

  // 8. Add videos to playlist (P1):
  // "add the first three relevant videos to Coding Music", "add first 3 videos to Coding Music", "add this video to Coding Music", "add current video to Python Learning", "save the playing video to AI Tutorials"
  const addMatch =
    rawClean.match(/^(?:add|save)\s+(?:the\s+)?(?:first\s+)?([a-z0-9]+)\s+(?:relevant\s+)?videos?\s+to\s+(.+)$/i) ||
    rawClean.match(/^(?:add|save)\s+(?:the\s+)?videos?\s+to\s+(.+)$/i) ||
    rawClean.match(/^(?:add|save)\s+(?:the\s+)?(?:this|current|playing)\s+video\s+to\s+(?:playlist\s+)?(.+)$/i) ||
    rawClean.match(/^(?:add|save)\s+(?:this\s+video\s+)?to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:add|save)\s+(?:the\s+)?(?:first\s+)?([a-z0-9]+)\s+(?:relevant\s+)?videos?\s+to\s+(.+)$/i) ||
    text.match(/^(?:add|save)\s+(?:the\s+)?videos?\s+to\s+(.+)$/i) ||
    text.match(/^(?:add|save)\s+(?:the\s+)?(?:this|current|playing)\s+video\s+to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:add|save)\s+(?:this\s+video\s+)?to\s+(?:playlist\s+)?(.+)$/i);

  if (addMatch) {
    let limit = 1;
    let playlistName = "";

    if (addMatch.length === 3) {
      const numWord = addMatch[1].toLowerCase();
      const numMap: Record<string, number> = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
      };
      limit = numMap[numWord] || parseInt(numWord, 10) || 1;
      playlistName = addMatch[2].replace(/["']/g, "").trim();
    } else if (addMatch.length === 2) {
      playlistName = addMatch[1].replace(/["']/g, "").trim();
    }

    // Strip trailing keywords like "playlist" if mentioned ("to Coding Music playlist")
    playlistName = playlistName.replace(/\s+playlist$/i, "").trim();

    return {
      matched: true,
      intent: "YOUTUBE_ADD_TO_PLAYLIST",
      ruleName: "RULE_YOUTUBE_ADD_TO_PLAYLIST",
      arguments: {
        playlist_name: playlistName,
        limit,
      },
      toolToExecute: "youtube_add_to_playlist",
    };
  }

  // 8B. Play specific video from playlist or advance to next video:
  // "Play the second video in Watch Later.", "Play the first video in LUMA.", "Play the third video from my Python Learning playlist.", "Play the next video in this playlist."
  if (/^play\s+(?:the\s+)?next\s+video\s+in\s+(?:this\s+|the\s+)?playlist$/i.test(rawClean)) {
    return {
      matched: true,
      intent: "YOUTUBE_PLAY_PLAYLIST_VIDEO",
      ruleName: "RULE_YOUTUBE_PLAY_PLAYLIST_NEXT",
      arguments: { next: true },
      toolToExecute: "youtube_play_playlist_video",
    };
  }

  const playPlVideoMatch =
    rawClean.match(/^play\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|\d+(?:st|nd|rd|th)?)\s+video\s+(?:in|from|of)\s+(?:playlist\s+)?(?:my\s+)?(.+?)(?:\s+playlist)?$/i) ||
    text.match(/^play\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|\d+(?:st|nd|rd|th)?)\s+video\s+(?:in|from|of)\s+(?:playlist\s+)?(?:my\s+)?(.+?)(?:\s+playlist)?$/i);

  if (playPlVideoMatch) {
    const rankStr = playPlVideoMatch[1].toLowerCase();
    let index = 1;
    if (rankStr === "second" || rankStr === "2nd") index = 2;
    else if (rankStr === "third" || rankStr === "3rd") index = 3;
    else if (rankStr === "fourth" || rankStr === "4th") index = 4;
    else if (!isNaN(parseInt(rankStr, 10))) index = parseInt(rankStr, 10);

    const plName = playPlVideoMatch[2].replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_PLAY_PLAYLIST_VIDEO",
      ruleName: "RULE_YOUTUBE_PLAY_PLAYLIST_VIDEO",
      arguments: { playlist_name: plName, index },
      toolToExecute: "youtube_play_playlist_video",
    };
  }

  // 9. Play playlist: "play my Coding Music playlist", "play Coding Music playlist", "play playlist Coding Music"
  const playPlMatch =
    rawClean.match(/^play\s+(?:my\s+)?(.+?)\s+playlist$/i) ||
    rawClean.match(/^play\s+(?:the\s+)?playlist\s+(.+)$/i) ||
    text.match(/^play\s+(?:my\s+)?(.+?)\s+playlist$/i) ||
    text.match(/^play\s+(?:the\s+)?playlist\s+(.+)$/i);

  if (playPlMatch && playPlMatch[1]) {
    const playlistName = playPlMatch[1].replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_PLAY_PLAYLIST",
      ruleName: "RULE_YOUTUBE_PLAY_PLAYLIST",
      arguments: { name: playlistName },
      toolToExecute: "youtube_play_playlist",
    };
  }

  // 10. Open Watch Later:
  // "open watch later", "open my watch later playlist", "view watch later"
  if (/^(?:open|show|view)\s+(?:my\s+)?(?:watch\s+later)(?:\s+playlist)?$/i.test(rawClean)) {
    return {
      matched: true,
      intent: "YOUTUBE_OPEN_PLAYLIST",
      ruleName: "RULE_YOUTUBE_OPEN_WATCH_LATER",
      arguments: { name: "Watch Later" },
      toolToExecute: "youtube_open_playlist_ui",
    };
  }

  // 10B. Open / Show playlist (P1):
  // "open playlist Coding Music", "open my LUMA playlist", "show my Coding Music playlist", "open my latest playlist", "view playlist AI Tutorials"
  const openPlMatch =
    rawClean.match(/^(?:open|show|view)\s+(?:my\s+)?latest\s+playlist$/i) ||
    rawClean.match(/^(?:open|show|view)\s+(?:my\s+)?playlist\s+(?:called\s+|named\s+)?(.+)$/i) ||
    rawClean.match(/^(?:open|show|view)\s+(?:my\s+)?(.+?)\s+playlist$/i) ||
    text.match(/^(?:open|show|view)\s+(?:my\s+)?latest\s+playlist$/i) ||
    text.match(/^(?:open|show|view)\s+(?:my\s+)?playlist\s+(?:called\s+|named\s+)?(.+)$/i) ||
    text.match(/^(?:open|show|view)\s+(?:my\s+)?(.+?)\s+playlist$/i) ||
    (_contextualTarget === "youtube" && rawClean.match(/^open\s+playlist\s+(.+)$/i));

  if (openPlMatch) {
    const isLatest = /latest/i.test(rawClean);
    const playlistName = isLatest ? "latest" : (openPlMatch[1] || "").replace(/["']/g, "").trim();
    if (playlistName) {
      return {
        matched: true,
        intent: "YOUTUBE_OPEN_PLAYLIST",
        ruleName: "RULE_YOUTUBE_OPEN_PLAYLIST",
        arguments: { name: playlistName },
        toolToExecute: "youtube_open_playlist_ui",
      };
    }
  }

  // 11. Remove video from playlist (P1):
  // "remove Python tutorials from Coding Music", "remove the first video from Coding Music", "remove the current video from LUMA"
  const removeMatch =
    rawClean.match(/^(?:remove|delete)\s+(?:the\s+)?(?:current\s+video|first\s+video|video\s+)?(.+?)\s+from\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:remove|delete)\s+(?:the\s+)?(?:current\s+video|first\s+video|video\s+)?(.+?)\s+from\s+(?:playlist\s+)?(.+)$/i);

  if (removeMatch && removeMatch[1] && removeMatch[2]) {
    const video = removeMatch[1].replace(/["']/g, "").trim();
    const playlistName = removeMatch[2].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_REMOVE_FROM_PLAYLIST",
      ruleName: "RULE_YOUTUBE_REMOVE_FROM_PLAYLIST",
      arguments: {
        playlist_name: playlistName,
        video,
      },
      toolToExecute: "youtube_remove_from_playlist_ui",
    };
  }

  // 12. List videos in playlist UI (P1):
  // "list videos in playlist Coding Music", "show me the videos in LUMA", "show videos in my LUMA playlist", "list all videos in Python Learning"
  const listPlMatch =
    rawClean.match(/^(?:list|show|what)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:first\s+\w+\s+)?videos?(?:\s+are)?\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??$/i) ||
    text.match(/^(?:list|show|what)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:first\s+\w+\s+)?videos?(?:\s+are)?\s+in\s+(?:playlist\s+)?(?:my\s+)?(.+?)\??$/i);

  if (listPlMatch && listPlMatch[1]) {
    const playlistName = listPlMatch[1].replace(/\s+playlist$/i, "").replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_LIST_PLAYLIST_VIDEOS",
      ruleName: "RULE_YOUTUBE_LIST_PLAYLIST_VIDEOS",
      arguments: { name: playlistName },
      toolToExecute: "youtube_list_playlist_videos_ui",
    };
  }

  // 13. Video Seeking (forward / backward):
  // "fast forward 10 seconds", "forward 10s", "rewind 20 seconds", "skip ahead 30 seconds",
  // "go back 1 minute", "10 second aage karo", "20 second peeche karo", "aage 10 second", "peeche 10 second"
  const isForward =
    /\b(?:fast\s+forward|forward|ahead|skip\s+ahead|skip\s+forward|go\s+forward|jump\s+forward|aage(?:\s+badao|\s+karo)?)\b/i.test(rawClean);
  const isBackward =
    /\b(?:rewind|backward|back|skip\s+back|go\s+back|jump\s+back|peeche(?:\s+le\s+jao|\s+karo)?)\b/i.test(rawClean);

  if (isForward || isBackward) {
    const hasTimeSpec = /\b\d+\s*(?:seconds?|secs?|s|minutes?|mins?|m)\b/i.test(rawClean);
    const hasSeekAction = /\b(?:seek|forward|rewind|skip|jump|aage|peeche)\b/i.test(rawClean);

    if (hasTimeSpec || hasSeekAction) {
      let seconds = 10;
      const minMatch = rawClean.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);
      if (minMatch) {
        seconds = parseInt(minMatch[1], 10) * 60;
      } else {
        const secMatch = rawClean.match(/(\d+)\s*(?:seconds?|secs?|s)?\b/i);
        if (secMatch && parseInt(secMatch[1], 10) > 0) {
          seconds = parseInt(secMatch[1], 10);
        }
      }

      if (isBackward) {
        seconds = -Math.abs(seconds);
      } else {
        seconds = Math.abs(seconds);
      }

      return {
        matched: true,
        intent: "YOUTUBE_SEEK",
        ruleName: "RULE_YOUTUBE_SEEK",
        arguments: { seconds, site: "youtube" },
        toolToExecute: "youtube_seek",
      };
    }
  }

  // 14. Playing video metadata info:
  // "what is playing right now?", "which song is this?", "tell me the video title",
  // "what video is this?", "current video title", "kaun sa gana chal raha hai", "video ka naam batao"
  if (
    /^(?:what\s+is\s+playing(?:\s+right\s+now)?|what's\s+playing(?:\s+right\s+now)?|which\s+song\s+is\s+this|what\s+song\s+is\s+this|tell\s+me\s+the\s+video\s+title|what\s+video\s+is\s+this|current\s+(?:video|song)(?:\s+title)?|video\s+title)$/i.test(rawClean) ||
    /^(?:kaun\s*sa\s+(?:gana|video|song)\s+(?:chal\s*raha\s*hai|hai)|koun\s*sa\s+(?:gana|song)|video\s+ka\s+naam\s+batao|ye\s+kaun\s*sa\s+song\s+hai)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_GET_VIDEO_INFO",
      ruleName: "RULE_YOUTUBE_GET_VIDEO_INFO",
      arguments: { site: "youtube" },
      toolToExecute: "youtube_get_video_info",
    };
  }

  // 15. Playback state detection:
  // "playback state", "playback status", "is video playing", "is the video paused", "video status", "video chal raha hai ya ruka hua hai"
  if (
    /^(?:playback\s+state|playback\s+status|is\s+video\s+playing\??|is\s+the\s+video\s+playing\??|is\s+video\s+paused\??|is\s+the\s+video\s+paused\??|video\s+status|check\s+playback\s+state)$/i.test(rawClean) ||
    /^(?:video\s+chal\s+raha\s+hai\s+ya\s+ruka\s+hua\s+hai|video\s+ka\s+status)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_GET_PLAYBACK_STATE",
      ruleName: "RULE_YOUTUBE_GET_PLAYBACK_STATE",
      arguments: { site: "youtube" },
      toolToExecute: "youtube_get_playback_state",
    };
  }

  // 16. Stop video:
  // "stop video", "stop playing", "stop youtube", "video stop karo", "video band karo", "video rok do", "video rok do aur shuru me jao"
  if (
    /^(?:stop\s+video|stop\s+playing|stop\s+youtube|video\s+stop\s*karo|video\s+band\s*karo|video\s+rok\s*do|video\s+rok\s*do\s+aur\s+shuru\s+me\s+jao)$/i.test(rawClean) ||
    /^(?:stop\s+video|video\s+band\s*karo|video\s+rok\s*do)$/i.test(text)
  ) {
    return {
      matched: true,
      intent: "YOUTUBE_STOP",
      ruleName: "RULE_YOUTUBE_STOP",
      arguments: { site: "youtube" },
      toolToExecute: "youtube_stop_video",
    };
  }

  return null;
}
