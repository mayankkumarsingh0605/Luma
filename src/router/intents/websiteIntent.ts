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

  // 6. Tab Management Intents:
  // "open a new tab", "create a new tab", "new tab", "open a new tab and visit github"
  const newTabMatch =
    text.match(/^(?:open|create)\s+(?:a\s+)?new\s+tab(?:\s+(?:and\s+visit|to|visit|for)\s+(.+))?$/i) ||
    text.match(/^new\s+tab(?:\s+(?:to|for)\s+(.+))?$/i) ||
    raw.match(/^(?:naya\s+tab\s+kholo|new\s+tab\s+kholo)$/i);

  if (newTabMatch) {
    const destCandidate = newTabMatch[1]?.trim();
    let url: string | undefined;
    let siteKey: string | undefined;

    if (destCandidate) {
      const resolved = resolveWebsite(destCandidate);
      if (resolved) {
        url = resolved.url;
        siteKey = resolved.entry?.canonical;
      } else if (/^https?:\/\//i.test(destCandidate) || /\.[a-z]{2,}/i.test(destCandidate)) {
        url = destCandidate.startsWith("http") ? destCandidate : `https://${destCandidate}`;
      }
    }

    return {
      matched: true,
      intent: "NEW_TAB",
      ruleName: "RULE_BROWSER_NEW_TAB",
      arguments: { url, siteKey, target: siteKey || "chrome" },
      toolToExecute: "browser_new_tab",
    };
  }

  // "list tabs", "show tabs", "show open tabs", "what tabs are open"
  if (/^(?:list|show|get)\s+(?:all\s+)?(?:open\s+)?tabs$/i.test(text) || /^what\s+tabs\s+are\s+open$/i.test(text)) {
    return {
      matched: true,
      intent: "LIST_TABS",
      ruleName: "RULE_BROWSER_LIST_TABS",
      arguments: {},
      toolToExecute: "browser_list_tabs",
    };
  }

  // "switch to tab 2", "switch to tab github", "go to tab 1"
  const switchTabMatch = text.match(/^(?:switch|go)\s+(?:to\s+)?tab\s+(.+)$/i);
  if (switchTabMatch) {
    return {
      matched: true,
      intent: "SWITCH_TAB",
      ruleName: "RULE_BROWSER_SWITCH_TAB",
      arguments: { target: switchTabMatch[1].trim() },
      toolToExecute: "browser_switch_tab",
    };
  }

  // "close tab", "close this tab", "close current tab", "close tab 2"
  const closeTabMatch = text.match(/^close\s+(?:this\s+|current\s+)?tab(?:\s+(.+))?$/i);
  if (closeTabMatch) {
    return {
      matched: true,
      intent: "CLOSE_TAB",
      ruleName: "RULE_BROWSER_CLOSE_TAB",
      arguments: { target: closeTabMatch[1]?.trim() },
      toolToExecute: "browser_close_tab",
    };
  }

  // 7. Universal Page Reading & Content Inspection Intents:
  // "tell me what is written on this page", "what is on this page", "read this page", "read page content", "summarize this page"
  if (
    /^(?:tell\s+me\s+)?what\s+is\s+(?:written\s+)?on\s+this\s+page$/i.test(text) ||
    /^(?:read|summarize|extract)\s+(?:this\s+page|page\s+content|the\s+page)$/i.test(text) ||
    /^(?:page\s+pe\s+kya\s+likha\s+hai|page\s+padho|content\s+batao)$/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "READ_PAGE_CONTENT",
      ruleName: "RULE_BROWSER_READ_PAGE_CONTENT",
      arguments: {},
      toolToExecute: "browser_read_page_content",
    };
  }

  if (/^(?:inspect|observe)\s+(?:this\s+page|page\s+dom|webpage)$/i.test(text)) {
    return {
      matched: true,
      intent: "INSPECT_PAGE",
      ruleName: "RULE_BROWSER_INSPECT_PAGE",
      arguments: {},
      toolToExecute: "browser_inspect_page",
    };
  }

  // 8. Form Inspection & Filling Intents:
  // "fill my details in this form", "fill this form", "fill form with my details"
  if (
    /^(?:fill|enter)\s+(?:my\s+details\s+(?:in|on)\s+this\s+form|this\s+form(?:\s+with\s+my\s+details)?|the\s+form)$/i.test(text) ||
    /^(?:form\s+bhar\s*do|form\s+fill\s*karo|details\s+bhar\s*do)$/i.test(raw)
  ) {
    return {
      matched: true,
      intent: "FILL_FORM",
      ruleName: "RULE_BROWSER_FILL_FORM",
      arguments: {},
      toolToExecute: "browser_fill_form",
    };
  }

  // 9. PDF & File Download Intents:
  // "download pdf", "download the report", "download this file", "download file"
  const downloadMatch =
    text.match(/^(?:download|save|get)\s+(?:the\s+)?(?:this\s+)?(pdf|file|report|document|manual)(?:\s+(?:called|named)\s+(.+))?$/i) ||
    raw.match(/^(?:pdf|file)\s+download\s*karo$/i);

  if (downloadMatch) {
    const query = downloadMatch[2] || downloadMatch[1] || "pdf";
    return {
      matched: true,
      intent: "DOWNLOAD_FILE",
      ruleName: "RULE_BROWSER_DOWNLOAD_FILE",
      arguments: { query },
      toolToExecute: "browser_download_file",
    };
  }

  // 10. Memory & Profile Intents:
  // "who am i", "my profile", "show profile"
  if (/^(?:who\s+am\s+i|my\s+profile|show\s+profile|profile\s+dikhao)$/i.test(text)) {
    return {
      matched: true,
      intent: "MEMORY_GET_PROFILE",
      ruleName: "RULE_MEMORY_GET_PROFILE",
      arguments: {},
      toolToExecute: "memory_get_profile",
    };
  }

  // "review memories", "show memories", "list memories"
  if (/^(?:review|show|list)\s+memories$/i.test(text)) {
    return {
      matched: true,
      intent: "MEMORY_REVIEW",
      ruleName: "RULE_MEMORY_REVIEW",
      arguments: {},
      toolToExecute: "memory_review",
    };
  }

  // "remember that <content>", "save memory <content>"
  const rememberMatch = text.match(/^(?:remember\s+that|remember|save\s+memory)\s+(.+)$/i);
  if (rememberMatch) {
    return {
      matched: true,
      intent: "MEMORY_SAVE",
      ruleName: "RULE_MEMORY_SAVE",
      arguments: { topic: "User Note", content: rememberMatch[1].trim() },
      toolToExecute: "memory_save",
    };
  }

  return null;
}
