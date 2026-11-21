import { resolveAppAlias } from "../appAliasRegistry.js";
import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates application control intents (OPEN_APP, CLOSE_APP, FOCUS_APP).
 */
export function matchAppIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // 1. FOCUS_APP patterns: "switch to chrome", "bring vscode to front", "focus notepad", "chrome pe jao"
  const bringFrontMatch = text.match(/^bring\s+(.+?)\s+to\s+front$/i);
  const switchMatch = text.match(/^(?:switch\s+to|focus|bring\s+front)\s+(.+)$/i);
  if (bringFrontMatch || switchMatch) {
    const target = (bringFrontMatch ? bringFrontMatch[1] : switchMatch![1]).trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "FOCUS_APP",
        ruleName: "RULE_FOCUS_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
        toolToExecute: "focus_app",
      };
    }
  }

  // Suffix: "chrome pe jao", "vscode pe switch karo"
  const focusSuffixMatch = raw.match(/^(.+?)\s+(?:pe\s+jao|par\s+jao|pe\s+switch\s+karo|par\s+switch\s+karo)$/i);
  if (focusSuffixMatch) {
    const target = focusSuffixMatch[1].trim();
    const resolved = resolveAppAlias(target);
    if (resolved) {
      return {
        matched: true,
        intent: "FOCUS_APP",
        ruleName: "RULE_FOCUS_APP",
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
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
