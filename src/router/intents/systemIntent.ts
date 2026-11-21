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

  // 1B. GET_VISIBLE_WINDOWS: "tell me which windows are currently active", "show all open windows", "what is running on my desktop"
  if (
    /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:tell\s+me\s+|show\s+me\s+)?)?(?:which\s+windows\s+are\s+(?:currently\s+)?(?:active|open)|show\s+(?:me\s+)?(?:all\s+)?open\s+windows|show\s+all\s+open\s+visible\s+windows|what\s+windows\s+are\s+(?:currently\s+)?open|what\s+is\s+(?:currently\s+)?running\s+on\s+(?:my\s+)?desktop|what\s+is\s+open\s+on\s+(?:my\s+)?desktop|list\s+(?:all\s+)?(?:open\s+|visible\s+)?windows|open\s+windows|visible\s+windows)$/i.test(
      cleanCmd
    ) ||
    /(?:kaun\s+kaun\s+si\s+window\s+khuli\s+hai|saari\s+khuli\s+windows|desktop\s+pe\s+kya\s+kya\s+khula\s+hai|open\s+windows\s+dikhao)/i.test(
      rawClean
    )
  ) {
    return {
      matched: true,
      intent: "GET_VISIBLE_WINDOWS",
      ruleName: "RULE_GET_VISIBLE_WINDOWS",
      arguments: {},
      toolToExecute: "get_visible_windows",
    };
  }

  // 1C. GET_INSTALLED_APPS: "show installed applications", "list installed apps", "what applications are installed"
  // Check for targeted "find <app> in installed applications" FIRST!
  const findInstalledMatch =
    cleanCmd.match(/^(?:find|search|look\s+for|check\s+if)\s+(.+?)\s+(?:in|among|from)\s+(?:all\s+)?installed\s+(?:apps|applications|software|programs)$/i) ||
    cleanCmd.match(/^is\s+(.+?)\s+installed(?:\s+on\s+(?:my\s+)?(?:computer|pc|system|windows))?$/i);
  if (findInstalledMatch) {
    const rawTarget = findInstalledMatch[1].trim();
    return {
      matched: true,
      intent: "FIND_INSTALLED_APP",
      ruleName: "RULE_FIND_INSTALLED_APP",
      arguments: { query: rawTarget },
      toolToExecute: "find_installed_app",
    };
  }

  if (
    /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:tell\s+me\s+|show\s+me\s+|list\s+|get\s+|display\s+)?)?(?:(?:all\s+)?installed\s+(?:applications|apps|software|programs)|what\s+(?:applications|apps|software|programs)\s+are\s+installed|installed\s+(?:apps|applications|software|programs))$/i.test(
      cleanCmd
    ) ||
    /(?:installed\s+(?:apps|applications|software)|kaun\s+kaun\s+se\s+apps?\s+installed\s+hai)/i.test(
      rawClean
    )
  ) {
    return {
      matched: true,
      intent: "GET_INSTALLED_APPS",
      ruleName: "RULE_GET_INSTALLED_APPS",
      arguments: {},
      toolToExecute: "get_installed_apps",
    };
  }

  // 1D. GET_RUNNING_PROCESSES / FIND_PROCESS:
  // First check targeted "find <proc> in running processes"
  const findProcessMatch =
    cleanCmd.match(/^(?:find|search|look\s+for|check\s+if)\s+(.+?)\s+(?:in|among|from)\s+(?:all\s+)?(?:running\s+)?processes$/i) ||
    cleanCmd.match(/^is\s+(.+?)\s+(?:running|active)(?:\s+in\s+processes)?$/i);
  if (findProcessMatch) {
    const rawTarget = findProcessMatch[1].trim();
    return {
      matched: true,
      intent: "FIND_PROCESS",
      ruleName: "RULE_FIND_PROCESS",
      arguments: { query: rawTarget },
      toolToExecute: "find_process",
    };
  }

  // Check explicit "show running processes with process IDs"
  if (
    /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:tell\s+(?:me\s+)?|show\s+(?:me\s+)?|list\s+(?:me\s+)?|get\s+|display\s+|view\s+)?)?(?:(?:all\s+)?running\s+processes\s+with\s+(?:process\s+ids|pids|pid))$/i.test(
      cleanCmd
    )
  ) {
    return {
      matched: true,
      intent: "GET_BACKGROUND_PROCESSES",
      ruleName: "RULE_GET_RUNNING_PROCESSES_WITH_PIDS",
      arguments: { type: "all", includePids: true },
      toolToExecute: "get_running_processes",
    };
  }

  if (
    /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:tell\s+(?:me\s+)?|show\s+(?:me\s+)?|list\s+(?:me\s+)?|get\s+|display\s+|view\s+)?)?(?:(?:all\s+)?(?:running\s+)?(?:background\s+processes|background\s+apps|background\s+tasks|system\s+processes)|running\s+processes|background\s+processes|running\s+background\s+processes)$/i.test(
      cleanCmd
    ) ||
    /(?:background\s+process|running\s+background)/i.test(cleanCmd) ||
    /(?:background\s+processes?\s+dikhao|kaun\s+se\s+background\s+process\s+chal\s+rahe\s+hain)/i.test(
      rawClean
    )
  ) {
    return {
      matched: true,
      intent: "GET_BACKGROUND_PROCESSES",
      ruleName: "RULE_GET_BACKGROUND_PROCESSES",
      arguments: { type: "background" },
      toolToExecute: "get_running_processes",
    };
  }

  // 2. GET_ACTIVE_WINDOW: "what window is active?", "which application is currently active?", "active window", "show active window title and process", "identify the active window"
  if (
    /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:tell\s+me\s+|show\s+me\s+)?)?(?:what\s+window\s+is\s+active|which\s+(?:window|app|application)\s+is\s+(?:currently\s+)?active|which\s+window\s+is\s+(?:currently\s+)?(?:active|open)|active\s+window(?:\s+title)?(?:\s+and\s+process)?|show\s+(?:me\s+)?active\s+window(?:\s+title)?(?:\s+and\s+process)?|active\s+window\s+title\s+and\s+process|current\s+window|get\s+active\s+window|identify\s+(?:the\s+)?active\s+window(?:\s+title)?(?:\s+and\s+process)?)$/i.test(
      cleanCmd
    ) ||
    /(?:active\s+window|active\s+app).*(?:title|process)/i.test(cleanCmd) ||
    /(?:identify\s+(?:the\s+)?active\s+window)/i.test(cleanCmd) ||
    /(?:kaunsi\s+window\s+khuli\s+hai|active\s+window\s+kaunsi\s+hai|abhi\s+kaunsi\s+window\s+open\s+hai)/i.test(
      rawClean
    )
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
