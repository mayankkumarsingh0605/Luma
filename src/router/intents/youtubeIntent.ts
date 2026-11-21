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
  const rawClean = rawText.replace(/\.(?:\s+|$)/g, " ").trim();
  const raw = rawText.trim();

  // 1. Play first result / video: "play the first result", "play first result", "play the first video", "play first video"
  if (
    /^(?:play|open|watch)\s+(?:the\s+)?(?:first|1st)\s+(?:result|video|song|track)$/i.test(text) ||
    /^(?:pehla\s+video\s+chalao|first\s+video\s+play\s+karo)$/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "PLAY_FIRST_RESULT",
      ruleName: "RULE_PLAY_FIRST_RESULT",
      arguments: { target: "youtube" },
      toolToExecute: "browser_play_first_video",
    };
  }

  // 2. Create playlist: "create a playlist called Coding Music", "create playlist named Coding Music", "create playlist Coding Music"
  const createMatch =
    rawClean.match(/^create\s+(?:a\s+)?playlist\s+(?:called|named)\s+(.+)$/i) ||
    rawClean.match(/^create\s+(?:a\s+)?playlist\s+([a-zA-Z0-9\s_-]+)$/i) ||
    raw.match(/(?:called|named)\s+(.+?)\s+(?:playlist\s+banao|playlist\s+create\s+karo)/i) ||
    text.match(/^create\s+(?:a\s+)?playlist\s+(?:called|named)\s+(.+)$/i) ||
    text.match(/^create\s+(?:a\s+)?playlist\s+([a-zA-Z0-9\s_-]+)$/i);

  if (createMatch && createMatch[1]) {
    const playlistName = createMatch[1].replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_CREATE_PLAYLIST",
      ruleName: "RULE_YOUTUBE_CREATE_PLAYLIST",
      arguments: { name: playlistName },
      toolToExecute: "youtube_create_playlist",
    };
  }

  // 3. Add videos to playlist: "add the first three relevant videos to Coding Music", "add first 3 videos to Coding Music", "add this video to Coding Music"
  const addMatch =
    rawClean.match(/^add\s+(?:the\s+)?(?:first\s+)?([a-z0-9]+)\s+(?:relevant\s+)?videos?\s+to\s+(.+)$/i) ||
    rawClean.match(/^add\s+(?:the\s+)?videos?\s+to\s+(.+)$/i) ||
    rawClean.match(/^add\s+(?:this\s+video\s+)?to\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^add\s+(?:the\s+)?(?:first\s+)?([a-z0-9]+)\s+(?:relevant\s+)?videos?\s+to\s+(.+)$/i) ||
    text.match(/^add\s+(?:the\s+)?videos?\s+to\s+(.+)$/i) ||
    text.match(/^add\s+(?:this\s+video\s+)?to\s+(?:playlist\s+)?(.+)$/i);

  if (addMatch) {
    let limit = 3;
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
      limit = numMap[numWord] || parseInt(numWord, 10) || 3;
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

  // 4. Play playlist: "play my Coding Music playlist", "play Coding Music playlist", "play playlist Coding Music"
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

  // 5. Open / Show playlist: "open playlist Coding Music", "show my Coding Music playlist", "open my Coding Music playlist"
  const openPlMatch =
    rawClean.match(/^(?:open|show|view)\s+(?:my\s+)?playlist\s+(.+)$/i) ||
    rawClean.match(/^(?:open|show|view)\s+(?:my\s+)?(.+?)\s+playlist$/i) ||
    text.match(/^(?:open|show|view)\s+(?:my\s+)?playlist\s+(.+)$/i) ||
    text.match(/^(?:open|show|view)\s+(?:my\s+)?(.+?)\s+playlist$/i);

  if (openPlMatch && openPlMatch[1]) {
    const playlistName = openPlMatch[1].replace(/["']/g, "").trim();
    return {
      matched: true,
      intent: "YOUTUBE_OPEN_PLAYLIST",
      ruleName: "RULE_YOUTUBE_OPEN_PLAYLIST",
      arguments: { name: playlistName },
      toolToExecute: "youtube_get_playlist",
    };
  }

  // 6. Remove video from playlist: "remove Python tutorials from Coding Music", "remove the first video from Coding Music"
  const removeMatch =
    rawClean.match(/^(?:remove|delete)\s+(?:the\s+)?(?:video\s+)?(.+?)\s+from\s+(?:playlist\s+)?(.+)$/i) ||
    text.match(/^(?:remove|delete)\s+(?:the\s+)?(?:video\s+)?(.+?)\s+from\s+(?:playlist\s+)?(.+)$/i);

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
      toolToExecute: "youtube_remove_from_playlist",
    };
  }

  return null;
}
