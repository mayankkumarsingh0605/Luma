import { normalizeCommand, splitCompoundCommand, basicNormalize } from "./normalizer.js";
import { RuleEngine } from "./ruleEngine.js";
import type { UserIntentType } from "./intents/types.js";
import { matchAppIntent } from "./intents/appIntent.js";
import { matchWebsiteIntent } from "./intents/websiteIntent.js";
import { matchSearchIntent } from "./intents/searchIntent.js";
import { matchFileIntent } from "./intents/fileIntent.js";
import { matchMediaIntent } from "./intents/mediaIntent.js";
import { matchSystemIntent } from "./intents/systemIntent.js";
import { ComputerStateManager } from "../state/computerState.js";

/**
 * LUMA Command Router (General Desktop Agent)
 *
 * Coordinates normalization, compound multi-step goal detection,
 * confirmation responses, and modular intent evaluation.
 * Strictly local and deterministic — zero LLM calls.
 */

export interface RoutedCommand {
  rawCommand: string;
  normalizedCommand: string;
  intent: UserIntentType;
  matchedRule: string;
  arguments: Record<string, any>;
  toolToExecute?: string;
  validationError?: string;
  subCommands?: string[];
}

export function routeCommand(rawCommand: string, contextualTarget?: string): RoutedCommand {
  const normalizedCommand = normalizeCommand(rawCommand);
  const basicClean = basicNormalize(rawCommand);
  const hasPending = ComputerStateManager.getPendingConfirmation() !== null;

  // 1. Check for Confirmation / Cancellation Responses
  // (e.g. user replying to "You're asking me to delete report.pdf. Should I continue?")
  if (
    /^(?:yes|confirm|proceed|ha|haan|sure|kardo|kar\s*do|delete\s*it)$/i.test(basicClean) ||
    (hasPending && /^(?:y|ok|okay)$/i.test(basicClean))
  ) {
    return {
      rawCommand,
      normalizedCommand,
      intent: "CONFIRM_ACTION",
      matchedRule: "RULE_CONFIRM_ACTION",
      arguments: { confirmed: true },
    };
  }

  if (
    /^(?:cancel|mat\s*karo|mat\s*kar|nahin|nahi|abort)$/i.test(basicClean) ||
    /^(?:no)$/i.test(basicClean) ||
    (hasPending && /^(?:n|stop|dont|don't)$/i.test(basicClean))
  ) {
    return {
      rawCommand,
      normalizedCommand,
      intent: "CANCEL_ACTION",
      matchedRule: "RULE_CANCEL_ACTION",
      arguments: { confirmed: false },
    };
  }

  // 2. Compound Multi-Step User Goals
  // e.g. "Open Chrome and search Amazon for keyboards" -> splits into ["open chrome", "search amazon for keyboards"]
  const subCommands = splitCompoundCommand(rawCommand);
  if (subCommands.length > 1) {
    return {
      rawCommand,
      normalizedCommand,
      intent: "COMPOUND_GOAL",
      matchedRule: "RULE_COMPOUND_GOAL",
      arguments: { subCommands },
      subCommands,
    };
  }

  // 3. Modular Intent Evaluation (in prioritized order)
  const toRouted = (match: any): RoutedCommand => ({
    rawCommand,
    normalizedCommand,
    intent: match.intent,
    matchedRule: match.ruleName || match.matchedRule || "RULE_MATCH",
    arguments: match.arguments,
    toolToExecute: match.toolToExecute,
    validationError: match.validationError,
    subCommands: match.subCommands,
  });

  // A. Search Intent (e.g. "search Amazon for keyboards", "Amazon pe keyboard search karo")
  const searchMatch = matchSearchIntent(normalizedCommand, rawCommand, contextualTarget);
  if (searchMatch) return toRouted(searchMatch);

  // B. File & Folder Operations (e.g. "open downloads", "create folder called Luma", "delete report.pdf")
  const fileMatch = matchFileIntent(normalizedCommand, rawCommand);
  if (fileMatch) return toRouted(fileMatch);

  // C. Media Controls (e.g. "play", "pause", "next", "volume up", "mute")
  const mediaMatch = matchMediaIntent(normalizedCommand, rawCommand);
  if (mediaMatch) return toRouted(mediaMatch);

  // D. System & GUI Control (e.g. "take a screenshot", "what window is active", "copy", "paste")
  const systemMatch = matchSystemIntent(normalizedCommand, rawCommand);
  if (systemMatch) return toRouted(systemMatch);

  // E. Application Control (e.g. "open Chrome", "Chrome kholo", "close Chrome", "switch to VS Code")
  const appMatch = matchAppIntent(normalizedCommand, rawCommand);
  if (appMatch) return toRouted(appMatch);

  // F. Website Navigation (e.g. "open YouTube", "open Amazon", "go to Google", "YT kholo")
  const websiteMatch = matchWebsiteIntent(normalizedCommand, rawCommand);
  if (websiteMatch) return toRouted(websiteMatch);

  // G. Low-level Keyboard / Typing Fallback (from RuleEngine)
  const legacyMatch = RuleEngine.evaluate(normalizedCommand);
  if (legacyMatch.matched && legacyMatch.intent !== "UNKNOWN") {
    return {
      rawCommand,
      normalizedCommand,
      intent: legacyMatch.intent as UserIntentType,
      matchedRule: legacyMatch.ruleName,
      arguments: legacyMatch.arguments,
      toolToExecute: legacyMatch.toolToExecute,
      validationError: legacyMatch.validationError,
    };
  }

  // H. Unknown Intent (Graceful Fallback - No LLM in this phase)
  return {
    rawCommand,
    normalizedCommand,
    intent: "UNKNOWN",
    matchedRule: "NONE",
    arguments: {},
  };
}
