import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates system inspection and standard GUI intents (SCREENSHOT, ACTIVE_WINDOW, SYSTEM_INFO, COPY, PASTE, SELECT, SCROLL).
 */
export function matchSystemIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();
  const cleanCmd = text.replace(/^luma\s*,?\s*/i, "").replace(/[.!?]+$/, "").trim();
  const rawClean = raw.replace(/^luma\s*,?\s*/i, "").replace(/[.!?]+$/, "").trim();

  // 0. INSPECT_COMPUTER: "Luma, inspect my current computer state", "inspect my current computer state", "computer observation"
  if (
    /^(?:inspect\s+(?:my\s+)?(?:current\s+)?computer\s+state|inspect\s+computer|computer\s+observation|observe\s+computer\s+state|system\s+observation)\.?$/i.test(
      cleanCmd
    ) ||
    /(?:computer\s+state\s+inspect\s*karo|computer\s+state\s+check\s*karo|computer\s+observe\s*karo)/i.test(
      rawClean
    )
  ) {
    return {
      matched: true,
      intent: "INSPECT_COMPUTER",
      ruleName: "RULE_INSPECT_COMPUTER",
      arguments: {},
      toolToExecute: "observe_computer_state",
    };
  }

  // 1. TAKE_SCREENSHOT: "take a screenshot", "capture screen", "screenshot lo", "take screenshot"
  if (
    /^(?:take\s+(?:a\s+)?screenshot|capture\s+(?:the\s+)?screen|screenshot)$/i.test(text) ||
    /(?:screenshot\s*lo|screenshot\s*kheecho|screenshot\s*karo)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "TAKE_SCREENSHOT",
      ruleName: "RULE_TAKE_SCREENSHOT",
      arguments: {},
      toolToExecute: "take_screenshot",
    };
  }

  // 2. GET_ACTIVE_WINDOW: "what window is active?", "active window", "which window is open?", "kaunsi window khuli hai?"
  if (
    /^(?:what\s+window\s+is\s+active|which\s+window\s+is\s+(?:active|open)|active\s+window|current\s+window|get\s+active\s+window)$/i.test(
      text
    ) ||
    /(?:kaunsi\s+window\s+khuli\s+hai|active\s+window\s+kaunsi\s+hai)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "GET_ACTIVE_WINDOW",
      ruleName: "RULE_GET_ACTIVE_WINDOW",
      arguments: {},
      toolToExecute: "get_active_window",
    };
  }

  // 3. CHECK_SYSTEM: "check system", "system info", "computer status", "system details"
  if (/^(?:check\s+system|system\s+info|system\s+status|computer\s+status|system\s+information)$/i.test(text)) {
    return {
      matched: true,
      intent: "CHECK_SYSTEM",
      ruleName: "RULE_CHECK_SYSTEM",
      arguments: {},
      toolToExecute: "get_os_info",
    };
  }

  // 4. COPY: "copy", "copy this", "copy karo" -> Ctrl+C
  if (/^(?:copy|copy\s+this|copy\s+text)$/i.test(text) || /(?:copy\s*karo|copy\s*kardo)/i.test(raw)) {
    return {
      matched: true,
      intent: "COPY",
      ruleName: "RULE_HOTKEY_COPY",
      arguments: { keys: ["ctrl", "c"] },
      toolToExecute: "hotkey",
    };
  }

  // 5. PASTE: "paste", "paste this", "paste karo" -> Ctrl+V
  if (/^(?:paste|paste\s+this|paste\s+here)$/i.test(text) || /(?:paste\s*karo|paste\s*kardo)/i.test(raw)) {
    return {
      matched: true,
      intent: "PASTE",
      ruleName: "RULE_HOTKEY_PASTE",
      arguments: { keys: ["ctrl", "v"] },
      toolToExecute: "hotkey",
    };
  }

  // 6. SELECT ALL: "select all", "select everything", "sab select karo" -> Ctrl+A
  if (
    /^(?:select\s+all|select\s+everything)$/i.test(text) ||
    /(?:sab\s+select\s*karo|saara\s+select\s*karo)/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "SELECT",
      ruleName: "RULE_HOTKEY_SELECT_ALL",
      arguments: { keys: ["ctrl", "a"] },
      toolToExecute: "hotkey",
    };
  }

  // 7. SCROLL: "scroll up", "scroll down", "scroll down 5"
  const scrollMatch = text.match(/^(?:scroll\s+(up|down)(?:\s+(\d+))?|page\s+(up|down))$/i);
  if (scrollMatch) {
    const dir = (scrollMatch[1] || scrollMatch[3]).toLowerCase();
    const count = scrollMatch[2] ? parseInt(scrollMatch[2], 10) : 3;
    const amount = dir === "up" ? count : -count;
    return {
      matched: true,
      intent: "SCROLL",
      ruleName: "RULE_MOUSE_SCROLL",
      arguments: { amount },
      toolToExecute: "scroll",
    };
  }

  return null;
}
