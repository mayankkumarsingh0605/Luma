import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates media playback and volume control intents.
 */
export function matchMediaIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // 1. Next Track: "next", "next track", "next song", "play the next video", "skip song", "agla gana"
  if (
    /^(?:next|play\s+(?:the\s+)?next(?:\s+video|\s+song|\s+track)?|skip(?:\s+track|\s+song)?|agla\s+gana)$/i.test(
      text
    ) ||
    /^(?:agla\s+gana|next\s+gana)$/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "NEXT_MEDIA",
      ruleName: "RULE_NEXT_MEDIA",
      arguments: { action: "next" },
      toolToExecute: "media_control",
    };
  }

  // 2. Previous Track: "previous", "prev", "previous song", "pichla gana"
  if (
    /^(?:previous|prev|previous\s+song|previous\s+track|last\s+song|pichla\s+gana)$/i.test(text) ||
    /^(?:pichla\s+gana)$/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "PREV_MEDIA",
      ruleName: "RULE_PREV_MEDIA",
      arguments: { action: "previous" },
      toolToExecute: "media_control",
    };
  }

  // 3. Volume Up: "volume up", "increase volume", "louder", "awaaz badhao"
  if (
    /^(?:volume\s+up|increase\s+volume|louder|turn\s+it\s+up|sound\s+up)$/i.test(text) ||
    /(?:awaaz\s+badhao|volume\s+badhao)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "VOLUME_UP",
      ruleName: "RULE_VOLUME_UP",
      arguments: { action: "volume_up" },
      toolToExecute: "media_control",
    };
  }

  // 4. Volume Down: "volume down", "decrease volume", "lower volume", "awaaz kam karo"
  if (
    /^(?:volume\s+down|decrease\s+volume|lower\s+volume|turn\s+it\s+down|sound\s+down)$/i.test(text) ||
    /(?:awaaz\s+kam\s+karo|volume\s+kam\s+karo)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "VOLUME_DOWN",
      ruleName: "RULE_VOLUME_DOWN",
      arguments: { action: "volume_down" },
      toolToExecute: "media_control",
    };
  }

  // 5. Mute: "mute", "unmute", "mute audio", "awaaz band karo"
  if (/^(?:mute|unmute|mute\s+audio|mute\s+sound)$/i.test(text) || /(?:awaaz\s+band\s*karo)/i.test(raw)) {
    return {
      matched: true,
      intent: "MUTE_MEDIA",
      ruleName: "RULE_MUTE_MEDIA",
      arguments: { action: "mute" },
      toolToExecute: "media_control",
    };
  }

  // 6. Pause: "pause", "pause the music", "pause video", "gana roko", "rok do"
  if (
    /^(?:pause|pause\s+(?:the\s+)?music|pause\s+(?:the\s+)?video|pause\s+song|pause\s+audio)$/i.test(text) ||
    /(?:gana\s+roko|rok\s+do|pause\s*karo|pause\s*kardo)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "PAUSE_MEDIA",
      ruleName: "RULE_PAUSE_MEDIA",
      arguments: { action: "pause" },
      toolToExecute: "media_control",
    };
  }

  // 7. Resume: "resume", "resume music", "resume playback"
  if (/^(?:resume|resume\s+music|resume\s+video|resume\s+playback)$/i.test(text)) {
    return {
      matched: true,
      intent: "RESUME_MEDIA",
      ruleName: "RULE_RESUME_MEDIA",
      arguments: { action: "resume" },
      toolToExecute: "media_control",
    };
  }

  // 8. Stop: "stop", "stop music", "stop video", "stop media", "stop playback"
  if (/^(?:stop|stop\s+music|stop\s+video|stop\s+media|stop\s+playback|stop\s+song)$/i.test(text)) {
    return {
      matched: true,
      intent: "STOP_MEDIA",
      ruleName: "RULE_STOP_MEDIA",
      arguments: { action: "stop" },
      toolToExecute: "media_control",
    };
  }

  // 9. Play: "play", "play music", "play video", "play song", "gana bajao", "chalao"
  if (
    /^(?:play|play\s+(?:the\s+)?music|play\s+(?:the\s+)?video|play\s+song)$/i.test(text) ||
    /(?:gana\s+bajao|play\s*karo|play\s*kardo)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "PLAY_MEDIA",
      ruleName: "RULE_PLAY_MEDIA",
      arguments: { action: "play" },
      toolToExecute: "media_control",
    };
  }

  return null;
}
