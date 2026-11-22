/**
 * LUMA Command Normalizer (Extended for General Desktop Agent)
 *
 * Standardizes natural language input across English and Hindi/Hinglish.
 * Strictly deterministic — no LLM calls.
 */

/**
 * Standardizes text: lowercase, punctuation removal, whitespace collapse.
 */
export function basicNormalize(rawText: string): string {
  if (!rawText || typeof rawText !== "string") {
    return "";
  }

  return rawText
    .toLowerCase()
    .trim()
    .replace(/[!?,;:"'`~*^]+/g, " ")
    .replace(/\.(?:\s+|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips common conversational prefixes and polite wrappers while preserving core instructions.
 * e.g. "Please open Paint" -> "open Paint"
 * e.g. "Can you open Paint for me?" -> "open Paint"
 * e.g. "Luma, tell me which windows are active" -> "tell me which windows are active"
 */
export function stripConversationalPrefixes(text: string): string {
  let cleaned = text.trim();
  // Strip trailing punctuation first
  cleaned = cleaned.replace(/[.?!]+$/g, "").trim();
  // Assistant name prefix
  cleaned = cleaned.replace(/^(?:hey\s+)?luma\s*,?\s*/i, "");
  // Polite prefixes
  cleaned = cleaned.replace(/^(?:can\s+you\s+(?:please\s+)?|could\s+you\s+(?:please\s+)?|would\s+you\s+(?:please\s+)?)/i, "");
  cleaned = cleaned.replace(/^(?:please|kindly|kripya)\s+/i, "");
  cleaned = cleaned.replace(/^(?:i\s+want\s+(?:you\s+)?to\s+|i\s+need\s+(?:you\s+)?to\s+|help\s+me\s+)/i, "");
  cleaned = cleaned.replace(/^(?:zara\s+)/i, "");
  // Hindi / Hinglish possessive prefixes (e.g. "mere upcoming meetings", "meri meetings")
  cleaned = cleaned.replace(/^(?:mere|meri|mera|hamare|hamari|hamara)\s+/i, "");
  // Polite suffix
  cleaned = cleaned.replace(/\s+(?:for\s+me|please|kripya)$/i, "");
  cleaned = cleaned.replace(/[.?!]+$/g, "").trim();
  return cleaned.trim();
}

/**
 * Normalizes common Hindi/Hinglish action phrasing to canonical English forms
 * while preserving query contents.
 */
export function normalizeCommand(rawText: string): string {
  let text = basicNormalize(rawText);
  if (!text) return "";

  text = stripConversationalPrefixes(text);

  // Common Hindi/Hinglish verbal standardizations
  // e.g., "khol do" / "kholo" / "kholna" -> "open"
  text = text
    .replace(/\b(?:khol\s*do|khol\s*de|kholiye|kholna|kholo|khol)\b/gi, "open")
    .replace(/\b(?:start\s*karo|start\s*kardo|start\s*kar\s*do)\b/gi, "open")
    .replace(/\b(?:launch\s*karo|launch\s*kardo|chalao|chala\s*do)\b/gi, "open")
    .replace(/\b(?:band\s*karo|band\s*kar\s*do|band\s*kardo|band\s*kijiye|band)\b/gi, "close")
    .replace(/\b(?:hatao|hata\s*do)\b/gi, "close")
    .replace(/\b(?:search\s*karo|search\s*kro|search\s*karna|search\s*kardo|dhundo|dhundho|khojo)\b/gi, "search")
    .replace(/\b(?:likho|likh\s*do|likhna|type\s*karo|type\s*kardo)\b/gi, "type")
    .replace(/\b(?:dabao|daba\s*do|press\s*karo|press\s*kardo)\b/gi, "press")
    .replace(/\b(?:rok\s*do|roko|pause\s*karo)\b/gi, "pause")
    .replace(/\b(?:bajao|play\s*karo|chalao)\b/gi, "play");

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Splits a compound multi-step instruction into ordered sub-commands.
 * Examples:
 * - "Open Chrome and search Amazon for keyboards" -> ["open chrome", "search amazon for keyboards"]
 * - "Chrome kholo aur Amazon pe keyboard search karo" -> ["chrome open", "amazon pe keyboard search"]
 * - "Open VS Code and create a new file" -> ["open vs code", "create a new file"]
 */
export function splitCompoundCommand(rawText: string): string[] {
  if (!rawText || typeof rawText !== "string") return [];

  // Strip conversational assistant prefixes first (e.g. "Luma, ...", "Hey Luma, ...")
  const stripped = stripConversationalPrefixes(rawText);
  const rawClean = stripped.trim().replace(/\.(?:\s+|$)/g, " ");

  // 1. Non-compound exceptions: phrases containing 'and' that represent single atomic intents
  // A. "switch between X and Y" / "toggle between X and Y"
  const normalizedForCheck = basicNormalize(stripped);
  if (/^(?:switch|toggle|alternate)\s+between\s+.+?\s+(?:and|&)\s+.+$/i.test(normalizedForCheck)) {
    return [normalizedForCheck];
  }

  // B. "active window title and process" / "title and process"
  if (/(?:title\s+and\s+process|process\s+and\s+title|title\s+and\s+pid|active\s+window.*and.*process)/i.test(normalizedForCheck)) {
    return [normalizedForCheck];
  }

  // C. "search ... and add ... to ... playlist" / "find ... and add ... to ..." atomic workflow
  if (/(?:search|find).+?\s+and\s+add\s+(?:it|the\s+\w+\s+video|\w+\s+video|video)\s+to/i.test(normalizedForCheck)) {
    return [normalizedForCheck];
  }

  // Split on clause boundaries:
  // e.g. ", and ", ", then ", ", ", " and ", " then ", " aur ", " phir ", " uske baad "
  // Do not split inside digits (e.g. 10,000)
  const clauseSplitRegex = /(?:,\s*(?:and\s+then|and|aur|then|phir|fir|uske\s+baad)\s*|,\s+|\s+(?:and\s+then|and|aur|then|phir|fir|uske\s+baad)\s+)/i;

  if (clauseSplitRegex.test(rawClean)) {
    const parts = rawClean
      .split(clauseSplitRegex)
      .map((p) => basicNormalize(p))
      .filter((p) => p.length > 0 && p !== "luma" && p !== "hey luma");

    if (parts.length > 1) {
      return parts;
    }
  }

  return [basicNormalize(stripped)];
}
