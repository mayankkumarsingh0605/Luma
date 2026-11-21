import { resolveAppAlias } from "./appAliasRegistry.js";
import { resolveKeyAlias } from "./keyAliasRegistry.js";

/**
 * LUMA Generic Rule Engine (Milestone 2.1)
 *
 * Modular, extensible rule-based pattern evaluation.
 * Evaluates normalized commands against structured CommandRules:
 *   Rule = Intent + Tool + Patterns + Entity Extraction + Validation
 *
 * Supported Intents:
 * 1. OPEN_APP   -> open_app(app)
 * 2. CLOSE_APP  -> close_app(app)
 * 3. TYPE_TEXT  -> type_text(text)
 * 4. PRESS_KEY  -> press_key(key)
 * 5. UNKNOWN    -> Fallback (Zero LLM)
 */

export type CommandIntentType =
  | "OPEN_APP"
  | "CLOSE_APP"
  | "TYPE_TEXT"
  | "PRESS_KEY"
  | "UNKNOWN";

export interface RuleMatch {
  matched: boolean;
  intent: CommandIntentType;
  ruleName: string;
  arguments: Record<string, any>;
  toolToExecute?: string;
  matchedPattern?: string;
  validationError?: string;
}

export interface RulePattern {
  name: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}

export interface CommandRule {
  intent: CommandIntentType;
  name: string;
  tool: string;
  patterns: RulePattern[];
  validateAndTransform: (
    extracted: Record<string, string>,
    normalizedCommand: string
  ) => {
    valid: boolean;
    arguments: Record<string, any>;
    errorMessage?: string;
  };
}

// ---------------------------------------------------------------------------
// Rule Definitions
// ---------------------------------------------------------------------------

export const OPEN_APP_RULE: CommandRule = {
  intent: "OPEN_APP",
  name: "RULE_OPEN_APP",
  tool: "open_app",
  patterns: [
    {
      name: "PREFIX_OPEN_VERBS",
      regex: /^(?:open|launch|start|run)\s+(.+)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_KHOLO",
      regex: /^(.+?)\s+(?:kholo|khol\s+do|khol\s+de|kholiye)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_OPEN_KARO",
      regex: /^(.+?)\s+(?:open\s+karo|open\s+kardo|open\s+kar\s+do)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_START_KARO",
      regex: /^(.+?)\s+(?:start\s+karo|start\s+kardo|start\s+kar\s+do)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_LAUNCH_KARO",
      regex: /^(.+?)\s+(?:launch\s+karo|launch\s+kardo)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_CHALAO",
      regex: /^(.+?)\s+(?:chalao|chala\s+do|chala\s+de)$/i,
      extract: (match) => ({ app: match[1] }),
    },
  ],
  validateAndTransform: (extracted) => {
    const rawTarget = (extracted.app || "").trim();
    const resolved = resolveAppAlias(rawTarget);
    if (resolved) {
      return {
        valid: true,
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
      };
    }
    return {
      valid: false,
      arguments: { app: rawTarget },
      errorMessage: `I don't know which application you want me to open: "${rawTarget}".`,
    };
  },
};

export const CLOSE_APP_RULE: CommandRule = {
  intent: "CLOSE_APP",
  name: "RULE_CLOSE_APP",
  tool: "close_app",
  patterns: [
    {
      name: "PREFIX_CLOSE_VERBS",
      regex: /^(?:close|exit|quit|stop|kill|terminate)\s+(.+)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_BAND_KARO",
      regex: /^(.+?)\s+(?:band\s+karo|band\s+kar\s+do|band\s+kardo|band\s+kar\s+de|band\s+kijiye)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_CLOSE_KARO",
      regex: /^(.+?)\s+(?:close\s+karo|close\s+kardo|close\s+kar\s+do)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_STOP_KARO",
      regex: /^(.+?)\s+(?:stop\s+karo|stop\s+kardo|stop\s+kar\s+do)$/i,
      extract: (match) => ({ app: match[1] }),
    },
    {
      name: "SUFFIX_HATAO",
      regex: /^(.+?)\s+(?:hatao|hata\s+do|hata\s+de)$/i,
      extract: (match) => ({ app: match[1] }),
    },
  ],
  validateAndTransform: (extracted) => {
    const rawTarget = (extracted.app || "").trim();
    const resolved = resolveAppAlias(rawTarget);
    if (resolved) {
      return {
        valid: true,
        arguments: { app: resolved.canonical, appDisplayName: resolved.displayName },
      };
    }
    return {
      valid: false,
      arguments: { app: rawTarget },
      errorMessage: `I don't know which application you want me to close: "${rawTarget}".`,
    };
  },
};

export const PRESS_KEY_RULE: CommandRule = {
  intent: "PRESS_KEY",
  name: "RULE_PRESS_KEY",
  tool: "press_key",
  patterns: [
    {
      name: "PREFIX_PRESS_VERBS",
      regex: /^(?:press|hit|tap)\s+(.+)$/i,
      extract: (match) => ({ key: match[1] }),
    },
    {
      name: "SUFFIX_DABAO",
      regex: /^(.+?)\s+(?:dabao|daba\s+do|daba\s+de|dabaye|dabaiye)$/i,
      extract: (match) => ({ key: match[1] }),
    },
    {
      name: "SUFFIX_PRESS_KARO",
      regex: /^(.+?)\s+(?:press\s+karo|press\s+kardo|press\s+kar\s+do)$/i,
      extract: (match) => ({ key: match[1] }),
    },
    {
      name: "SUFFIX_HIT_KARO",
      regex: /^(.+?)\s+(?:hit\s+karo|hit\s+kardo)$/i,
      extract: (match) => ({ key: match[1] }),
    },
  ],
  validateAndTransform: (extracted) => {
    const rawKey = (extracted.key || "").trim();
    const resolved = resolveKeyAlias(rawKey);
    if (resolved) {
      return {
        valid: true,
        arguments: {
          key: resolved.canonical,
          keyDisplayName: resolved.displayName,
        },
      };
    }
    return {
      valid: false,
      arguments: { key: rawKey },
      errorMessage: `I don't recognize the keyboard key: "${rawKey}". Supported keys include Enter, Escape, Tab, Backspace, Space, Arrow keys, etc.`,
    };
  },
};

export const TYPE_TEXT_RULE: CommandRule = {
  intent: "TYPE_TEXT",
  name: "RULE_TYPE_TEXT",
  tool: "type_text",
  patterns: [
    {
      name: "PREFIX_YE_TEXT_TYPE_KARO",
      regex: /^(?:ye text type karo|ye type karo|text type karo|isko type karo)\s+(.+)$/i,
      extract: (match) => ({ text: match[1] }),
    },
    {
      name: "PREFIX_TYPE_VERBS",
      regex: /^(?:type|write|enter text|input)\s+(.+)$/i,
      extract: (match) => ({ text: match[1] }),
    },
    {
      name: "SUFFIX_TYPE_KARO",
      regex: /^(.+?)\s+(?:type\s+karo|type\s+kardo|type\s+kar\s+do|type\s+kijiye)$/i,
      extract: (match) => ({ text: match[1] }),
    },
    {
      name: "SUFFIX_LIKHO",
      regex: /^(.+?)\s+(?:likho|likh\s+do|likh\s+de|likhiye)$/i,
      extract: (match) => ({ text: match[1] }),
    },
  ],
  validateAndTransform: (extracted) => {
    const rawText = (extracted.text || "").trim();
    if (rawText.length > 0) {
      return {
        valid: true,
        arguments: { text: rawText },
      };
    }
    return {
      valid: false,
      arguments: { text: "" },
      errorMessage: "Please specify the text you want me to type.",
    };
  },
};

/**
 * Ordered list of rules to evaluate.
 * Evaluates specific verbs/suffixes (PRESS_KEY, CLOSE_APP, OPEN_APP) before generalized text typing.
 */
export const RULES_REGISTRY: CommandRule[] = [
  PRESS_KEY_RULE,
  CLOSE_APP_RULE,
  OPEN_APP_RULE,
  TYPE_TEXT_RULE,
];

// ---------------------------------------------------------------------------
// Rule Engine Implementation
// ---------------------------------------------------------------------------

export class RuleEngine {
  /**
   * Evaluates a normalized command against all registered rules.
   */
  static evaluate(normalizedText: string): RuleMatch {
    if (!normalizedText) {
      return {
        matched: false,
        intent: "UNKNOWN",
        ruleName: "NONE",
        arguments: {},
      };
    }

    // 1. Iterate through registered rules
    for (const rule of RULES_REGISTRY) {
      for (const pattern of rule.patterns) {
        const match = normalizedText.match(pattern.regex);
        if (match) {
          const extracted = pattern.extract(match);
          const validation = rule.validateAndTransform(extracted, normalizedText);

          return {
            matched: true,
            intent: rule.intent,
            ruleName: rule.name,
            arguments: validation.arguments,
            toolToExecute: rule.tool,
            matchedPattern: pattern.name,
            validationError: validation.valid ? undefined : validation.errorMessage,
          };
        }
      }
    }

    // 2. Direct App Alias Match fallback (e.g. user just enters "chrome" or "google chrome")
    const directApp = resolveAppAlias(normalizedText);
    if (directApp && normalizedText === directApp.matchedAlias) {
      return {
        matched: true,
        intent: "OPEN_APP",
        ruleName: "RULE_OPEN_APP",
        arguments: { app: directApp.canonical, appDisplayName: directApp.displayName },
        toolToExecute: "open_app",
        matchedPattern: "DIRECT_ALIAS",
      };
    }

    // 3. Fallback to UNKNOWN
    return {
      matched: false,
      intent: "UNKNOWN",
      ruleName: "NONE",
      arguments: {},
    };
  }
}
