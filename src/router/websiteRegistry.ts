/**
 * LUMA Centralized Website Registry
 *
 * Defines known websites, domain aliases, direct URLs, and product/web search endpoints.
 */

import { resolveAppAlias } from "./appAliasRegistry.js";

export interface WebsiteEntry {
  canonical: string;
  displayName: string;
  url: string;
  search_type: "web" | "product" | "site";
  searchUrl?: string;
  aliases: string[];
}

export const WEBSITE_REGISTRY: Record<string, WebsiteEntry> = {
  google: {
    canonical: "google",
    displayName: "Google",
    url: "https://www.google.com",
    search_type: "web",
    searchUrl: "https://www.google.com/search?q=",
    aliases: ["google", "google search", "google.com", "google baba"],
  },
  youtube: {
    canonical: "youtube",
    displayName: "YouTube",
    url: "https://www.youtube.com",
    search_type: "site",
    searchUrl: "https://www.youtube.com/results?search_query=",
    aliases: ["youtube", "yt", "youtube.com", "you tube"],
  },
  amazon: {
    canonical: "amazon",
    displayName: "Amazon",
    url: "https://www.amazon.in",
    search_type: "product",
    searchUrl: "https://www.amazon.in/s?k=",
    aliases: ["amazon", "amazon india", "amazon.in", "amazon.com", "amazon shopping"],
  },
  gmail: {
    canonical: "gmail",
    displayName: "Gmail",
    url: "https://mail.google.com",
    search_type: "site",
    aliases: ["gmail", "mail", "google mail", "email", "inbox"],
  },
  github: {
    canonical: "github",
    displayName: "GitHub",
    url: "https://github.com",
    search_type: "site",
    searchUrl: "https://github.com/search?q=",
    aliases: ["github", "gh", "git hub", "github.com"],
  },
  chatgpt: {
    canonical: "chatgpt",
    displayName: "ChatGPT",
    url: "https://chatgpt.com",
    search_type: "site",
    aliases: ["chatgpt", "chat gpt", "openai", "chatgpt.com"],
  },
  twitter: {
    canonical: "twitter",
    displayName: "Twitter / X",
    url: "https://twitter.com",
    search_type: "site",
    searchUrl: "https://twitter.com/search?q=",
    aliases: ["twitter", "x", "x.com", "twitter.com"],
  },
  reddit: {
    canonical: "reddit",
    displayName: "Reddit",
    url: "https://www.reddit.com",
    search_type: "site",
    searchUrl: "https://www.reddit.com/search/?q=",
    aliases: ["reddit", "reddit.com"],
  },
  netflix: {
    canonical: "netflix",
    displayName: "Netflix",
    url: "https://www.netflix.com",
    search_type: "site",
    searchUrl: "https://www.netflix.com/search?q=",
    aliases: ["netflix", "netflix.com"],
  },
  flipkart: {
    canonical: "flipkart",
    displayName: "Flipkart",
    url: "https://www.flipkart.com",
    search_type: "product",
    searchUrl: "https://www.flipkart.com/search?q=",
    aliases: ["flipkart", "flipkart.com"],
  },
  wikipedia: {
    canonical: "wikipedia",
    displayName: "Wikipedia",
    url: "https://www.wikipedia.org",
    search_type: "site",
    searchUrl: "https://en.wikipedia.org/wiki/Special:Search?search=",
    aliases: ["wikipedia", "wiki", "wikipedia.org"],
  },
};

export const WEBSITES = WEBSITE_REGISTRY;

/**
 * Resolves a search target name or alias (e.g. "youtube", "amazon", "google", "github")
 * strictly without loose substring matching.
 */
export function resolveSearchTarget(text: string): WebsiteEntry | null {
  if (!text) return null;
  const clean = text
    .toLowerCase()
    .trim()
    .replace(/^(?:on|in|at|pe|par|me|mein)\s+/i, "")
    .trim();
  if (!clean) return null;

  // Direct canonical or alias match
  for (const key of Object.keys(WEBSITE_REGISTRY)) {
    const entry = WEBSITE_REGISTRY[key];
    if (clean === entry.canonical) return entry;
    for (const alias of entry.aliases) {
      if (clean === alias.toLowerCase().trim()) {
        return entry;
      }
    }
  }

  // Strict check with common suffix ("the youtube website", "amazon site")
  for (const key of Object.keys(WEBSITE_REGISTRY)) {
    const entry = WEBSITE_REGISTRY[key];
    for (const alias of entry.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^(?:the\\s+)?${escaped}(?:\\s+website|\\s+site|\\s+page|\\s+app)?$`, "i");
      if (regex.test(clean)) {
        return entry;
      }
    }
  }

  return null;
}

/**
 * Resolves a text fragment to a known WebsiteEntry or detects if it is a direct URL.
 */
export function resolveWebsite(
  text: string
): { entry?: WebsiteEntry; url: string; displayName: string } | null {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  // If text is actually an application alias (e.g. "google chrome"), do not treat as website
  const appMatch = resolveAppAlias(clean);
  if (appMatch && appMatch.matchedAlias === clean) {
    return null;
  }

  // 1. Direct URL check (e.g. "https://example.com" or "example.com" or "www.example.com")
  if (/^https?:\/\//i.test(clean)) {
    try {
      const parsed = new URL(clean);
      return {
        url: clean,
        displayName: parsed.hostname.replace(/^www\./, ""),
      };
    } catch {
      return { url: clean, displayName: clean };
    }
  }

  if (/^(?:www\.)?[a-zA-Z0-9-]+\.[a-z]{2,}(\/.*)?$/i.test(clean)) {
    const fullUrl = `https://${clean.replace(/^www\./, "")}`;
    return {
      url: fullUrl,
      displayName: clean.replace(/^www\./, "").split("/")[0],
    };
  }

  // 2. Check registered search targets
  const targetEntry = resolveSearchTarget(clean);
  if (targetEntry) {
    const isAmazonCom = clean === "amazon.com";
    return {
      entry: targetEntry,
      url: isAmazonCom ? "https://www.amazon.com" : targetEntry.url,
      displayName: targetEntry.displayName,
    };
  }

  return null;
}
