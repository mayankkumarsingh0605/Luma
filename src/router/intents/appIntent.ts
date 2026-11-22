import { resolveAppAlias } from "../appAliasRegistry.js";
import { ComputerStateManager } from "../../state/computerState.js";
import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates application control intents (OPEN_APP, CLOSE_APP, FOCUS_APP, MINIMIZE_APP, RESTORE_APP).
 */
export function matchAppIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // -3. SWITCH_PREVIOUS_WINDOW: "switch to the previous window", "switch to previous window", "switch to previous app"
  if (
    /^(?:switch\s+to\s+(?:the\s+)?previous\s+window|switch\s+to\s+previous\s+app|switch\s+back|go\s+back\s+to\s+previous\s+window)$/i.test(
      text
    )
  ) {
    return {
      matched: true,
      intent: "FOCUS_APP",
      ruleName: "RULE_SWITCH_PREVIOUS_WINDOW",
      arguments: { mode: "previous" },
      toolToExecute: "switch_previous_window",
    };
  }

  // -2. RESTORE_ALL_MINIMIZED: "restore all minimized application windows", "restore all minimized windows"
  if (/^(?:restore|unminimize)\s+all\s+(?:minimized\s+)?(?:application\s+)?windows$/i.test(text)) {
    return {
      matched: true,
      intent: "RESTORE_ALL_MINIMIZED",
      ruleName: "RULE_RESTORE_ALL_MINIMIZED",
      arguments: {},
      toolToExecute: "restore_all_minimized",
    };
  }

  // -1. MINIMIZE_APP: "minimize chrome", "minimize notepad"
  const minimizeMatch = text.match(/^minimize\s+(.+)$/i);
  if (minimizeMatch) {
    const rawTarget = minimizeMatch[1].trim();
    const cleanTarget = rawTarget.replace(/\s+(window|app|application)$/i, "").trim();
    const resolved = resolveAppAlias(cleanTarget) || resolveAppAlias(rawTarget);
    const appCanonical = resolved ? resolved.canonical : cleanTarget;
    const appDisplayName = resolved ? resolved.displayName : cleanTarget;
    return {
      matched: true,
      intent: "MINIMIZE_APP",
      ruleName: "RULE_MINIMIZE_APP",
      arguments: { app: appCanonical, appDisplayName, windowTarget: rawTarget },
      toolToExecute: "minimize_app",
    };
  }

  // 0. RESTORE_APP patterns: "restore chrome if it is minimized", "restore chrome", "unminimize chrome", "restore it"
  const restoreMatch =
    text.match(/^(?:restore|unminimize)\s+(.+?)(?:\s+if\s+it\s+is\s+minimized)?$/i) ||
    text.match(/^if\s+(.+?)\s+is\s+minimized\s*,?\s*(?:restore|unminimize)\s+(?:it)?$/i);
  if (restoreMatch) {
    const rawTarget = restoreMatch[1].trim();
    let cleanTarget = rawTarget.replace(/\s+(window|app|application)$/i, "").trim();
    if (["it", "that", "this"].includes(cleanTarget.toLowerCase())) {
      cleanTarget = ComputerStateManager.getState().active_app || "notepad";
    }
    const resolved = resolveAppAlias(cleanTarget) || resolveAppAlias(rawTarget);
    const appCanonical = resolved ? resolved.canonical : cleanTarget;
    const appDisplayName = resolved ? resolved.displayName : cleanTarget;
    return {
      matched: true,
      intent: "RESTORE_APP",
      ruleName: "RULE_RESTORE_APP",
      arguments: { app: appCanonical, appDisplayName, restoreOnly: true },
      toolToExecute: "restore_app",
    };
  }

  // 0B. SWITCH_BETWEEN_APPS patterns: "switch between chrome and notepad", "toggle between chrome and notepad"
  const switchBetweenMatch = text.match(/^(?:switch|toggle|alternate)\s+between\s+(.+?)\s+(?:and|&)\s+(.+)$/i);
  if (switchBetweenMatch) {
    const rawA = switchBetweenMatch[1].trim();
    const rawB = switchBetweenMatch[2].trim();
    const cleanA = rawA.replace(/\s+(window|app|application)$/i, "").trim();
    const cleanB = rawB.replace(/\s+(window|app|application)$/i, "").trim();
    const resA = resolveAppAlias(cleanA) || resolveAppAlias(rawA);
    const resB = resolveAppAlias(cleanB) || resolveAppAlias(rawB);
    const appA = resA ? resA.canonical : cleanA;
    const appB = resB ? resB.canonical : cleanB;
    return {
      matched: true,
      intent: "FOCUS_APP",
      ruleName: "RULE_SWITCH_BETWEEN_APPS",
      arguments: {
        app: appA,
        alternateApp: appB,
        mode: "toggle",
      },
      toolToExecute: "switch_between_apps",
    };
  }

  // 1. FOCUS_APP patterns: "switch to chrome", "switch to chrome window", "bring vscode to front", "bring notepad to foreground", "focus notepad", "chrome pe jao"
  const bringFrontMatch = text.match(/^bring\s+(.+?)\s+(?:to\s+(?:the\s+)?)?(?:front|foreground)$/i);
  const switchMatch = text.match(/^(?:switch\s+to|focus|bring\s+front|bring\s+to\s+foreground)\s+(.+)$/i);
  if (bringFrontMatch || switchMatch) {
    const rawTarget = (bringFrontMatch ? bringFrontMatch[1] : switchMatch![1]).trim();
    const cleanTarget = rawTarget.replace(/\s+(window|app|application)$/i, "").trim();
    const resolved = resolveAppAlias(cleanTarget) || resolveAppAlias(rawTarget);
    if (resolved) {
      return {
        matched: true,
        intent: "FOCUS_APP",
        ruleName: "RULE_FOCUS_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName, windowTarget: rawTarget },
        toolToExecute: "focus_app",
      };
    } else if (cleanTarget.length > 0 && !/^tab(\s+\d+|\s+.+)?$/i.test(rawTarget) && !rawTarget.toLowerCase().includes("browser tab")) {
      // Allow switching to arbitrary window title or process
      return {
        matched: true,
        intent: "FOCUS_APP",
        ruleName: "RULE_FOCUS_WINDOW_GENERIC",
        arguments: { app: cleanTarget, appDisplayName: cleanTarget, windowTarget: rawTarget },
        toolToExecute: "focus_app",
      };
    }
  }

  // Suffix: "chrome pe jao", "vscode pe switch karo"
  const focusSuffixMatch = raw.match(/^(.+?)\s+(?:pe\s+jao|par\s+jao|pe\s+switch\s+karo|par\s+switch\s+karo)$/i);
  if (focusSuffixMatch) {
    const rawTarget = focusSuffixMatch[1].trim();
    const cleanTarget = rawTarget.replace(/\s+(window|app|application)$/i, "").trim();
    const resolved = resolveAppAlias(cleanTarget) || resolveAppAlias(rawTarget);
    if (resolved) {
      return {
        matched: true,
        intent: "FOCUS_APP",
        ruleName: "RULE_FOCUS_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName, windowTarget: rawTarget },
        toolToExecute: "focus_app",
      };
    }
  }

  // 2. CLOSE_APP patterns
  // Prefix: "close chrome", "exit vscode", "quit notepad", "kill calculator", "terminate cmd"
  const closePrefixMatch = text.match(/^(?:close|exit|quit|stop|kill|terminate)\s+(.+)$/i);
  if (closePrefixMatch) {
    const target = closePrefixMatch[1].trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "CLOSE_APP",
        ruleName: "RULE_CLOSE_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName, force: true },
        toolToExecute: "close_app",
      };
    }
  }

  // Suffix: "chrome band karo", "calc close kardo"
  const closeSuffixMatch = raw.match(/^(.+?)\s+(?:band\s*karo|band\s*kardo|band\s*kar\s*do|band\s*kijiye|close\s*karo|close\s*kardo|hatao)$/i);
  if (closeSuffixMatch) {
    const target = closeSuffixMatch[1].trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "CLOSE_APP",
        ruleName: "RULE_CLOSE_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName, force: true },
        toolToExecute: "close_app",
      };
    }
  }

  // 3. OPEN_APP patterns
  // Prefix: "open chrome", "launch vscode", "start notepad", "run calculator"
  const openPrefixMatch = text.match(/^(?:open|launch|start|run)\s+(.+)$/i);
  if (openPrefixMatch) {
    const target = openPrefixMatch[1].trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "OPEN_APP",
        ruleName: "RULE_OPEN_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
        toolToExecute: "open_app",
      };
    }
  }

  // Suffix: "chrome kholo", "vscode start karo", "notepad open karo"
  const openSuffixMatch = raw.match(/^(.+?)\s+(?:kholo|khol\s*do|khol\s*de|kholiye|open\s*karo|open\s*kardo|start\s*karo|launch\s*karo|chalao)$/i);
  if (openSuffixMatch) {
    const target = openSuffixMatch[1].trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "OPEN_APP",
        ruleName: "RULE_OPEN_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
        toolToExecute: "open_app",
      };
    }
  }

  // 4. Direct App Match: user just says "chrome", "vscode", "notepad", "calculator"
  const directApp = resolveAppAlias(text);
  if (directApp && (text === directApp.matchedAlias || text === directApp.canonical)) {
    return {
      matched: true,
      intent: "OPEN_APP",
      ruleName: "RULE_OPEN_APP_DIRECT",
      arguments: { app: directApp.canonical, appDisplayName: directApp.displayName },
      toolToExecute: "open_app",
    };
  }

  return null;
}
