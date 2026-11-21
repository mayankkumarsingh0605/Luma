import { resolveWebsite } from "../websiteRegistry.js";
import { resolveAppAlias } from "../appAliasRegistry.js";
import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates website navigation intents (OPEN_WEBSITE).
 */
export function matchWebsiteIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // 1. "on/in <app> open/launch/visit <site>" (e.g. "on chrome open amazon", "in chrome open youtube")
  const onBrowserOpen = text.match(/^(?:on|in)\s+([a-z0-9\s]+?)\s+(?:open|launch|go\s+to|visit)\s+(.+)$/i);
  if (onBrowserOpen) {
    const appCandidate = onBrowserOpen[1].trim();
    const siteCandidate = onBrowserOpen[2].trim();
    const resolvedSite = resolveWebsite(siteCandidate);
    const resolvedApp = resolveAppAlias(appCandidate);
    if (resolvedSite) {
      return {
        matched: true,
        intent: "OPEN_WEBSITE",
        ruleName: "RULE_OPEN_WEBSITE_ON_BROWSER",
        arguments: {
          url: resolvedSite.url,
          displayName: resolvedSite.displayName,
          target: resolvedSite.entry?.canonical,
          siteKey: resolvedSite.entry?.canonical,
          browserApp: resolvedApp?.canonical || "chrome",
        },
        toolToExecute: "open_app",
      };
    }
  }

  // 2. "open/launch/visit <site> on/in <app>" (e.g. "open amazon on chrome", "open youtube in chrome")
  const openOnBrowser = text.match(/^(?:open|launch|go\s+to|visit)\s+(.+?)\s+(?:on|in)\s+([a-z0-9\s]+)$/i);
  if (openOnBrowser) {
    const siteCandidate = openOnBrowser[1].trim();
    const appCandidate = openOnBrowser[2].trim();
    const resolvedSite = resolveWebsite(siteCandidate);
    const resolvedApp = resolveAppAlias(appCandidate);
    if (resolvedSite) {
      return {
        matched: true,
        intent: "OPEN_WEBSITE",
        ruleName: "RULE_OPEN_WEBSITE_ON_BROWSER",
        arguments: {
          url: resolvedSite.url,
          displayName: resolvedSite.displayName,
          target: resolvedSite.entry?.canonical,
          siteKey: resolvedSite.entry?.canonical,
          browserApp: resolvedApp?.canonical || "chrome",
        },
        toolToExecute: "open_app",
      };
    }
  }

  // 3. Prefix commands: "open youtube", "go to amazon", "navigate to github", "visit chatgpt"
  const prefixMatch = text.match(/^(?:open|go\s+to|navigate\s+to|visit|launch)\s+(.+)$/i);
  if (prefixMatch) {
    const target = prefixMatch[1].trim();
    const resolved = resolveWebsite(target);
    if (resolved) {
      return {
        matched: true,
        intent: "OPEN_WEBSITE",
        ruleName: "RULE_OPEN_WEBSITE",
        arguments: {
          url: resolved.url,
          displayName: resolved.displayName,
          target: resolved.entry?.canonical,
          siteKey: resolved.entry?.canonical,
        },
        toolToExecute: "open_app",
      };
    }
  }

  // 4. Hindi Suffix commands: "YouTube kholo", "Amazon open karo", "mail kholo", "GitHub chalao", "Chrome me amazon kholo"
  const suffixMatch = raw.match(
    /^(?:(?:on|in)\s+[a-z0-9\s]+\s+)?(?:(?:chrome|browser)\s+(?:me|mein|pe|par)\s+)?(.+?)\s+(?:kholo|khol\s*do|khol\s*de|kholiye|open\s*karo|open\s*kardo|chalao)$/i
  );
  if (suffixMatch) {
    const target = suffixMatch[1].trim();
    const resolved = resolveWebsite(target);
    if (resolved) {
      return {
        matched: true,
        intent: "OPEN_WEBSITE",
        ruleName: "RULE_OPEN_WEBSITE",
        arguments: {
          url: resolved.url,
          displayName: resolved.displayName,
          target: resolved.entry?.canonical,
          siteKey: resolved.entry?.canonical,
        },
        toolToExecute: "open_app",
      };
    }
  }

  // 5. Direct Website or URL: user enters "youtube", "amazon", "google.com", "https://github.com"
  // Strictly guarded: Must NOT match queries containing action/search verbs and must be short (<= 3 words)
  if (!/\b(?:search|dhundo|dhundho|khojo|find|look|type|likho|press|delete|band)\b/i.test(text)) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 3) {
      const directResolved = resolveWebsite(text);
      if (directResolved && (directResolved.entry || /^https?:\/\//i.test(text) || /\.[a-z]{2,}/i.test(text))) {
        return {
          matched: true,
          intent: "OPEN_WEBSITE",
          ruleName: "RULE_OPEN_WEBSITE_DIRECT",
          arguments: {
            url: directResolved.url,
            displayName: directResolved.displayName,
            target: directResolved.entry?.canonical,
            siteKey: directResolved.entry?.canonical,
          },
          toolToExecute: "open_app",
        };
      }
    }
  }

  return null;
}
