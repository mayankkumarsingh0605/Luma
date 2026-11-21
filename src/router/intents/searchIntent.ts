import { resolveSearchTarget, WEBSITES } from "../websiteRegistry.js";
import type { IntentMatchResult, UserIntentType } from "./types.js";

function buildSearchResult(
  siteRaw: string,
  query: string | null | undefined,
  ruleName: string,
  intentOverride?: UserIntentType
): IntentMatchResult | null {
  const cleanSite = siteRaw.trim();
  const targetEntry = resolveSearchTarget(cleanSite);
  if (!targetEntry) return null;

  let cleanQuery = query ? query.replace(/^for\s+/i, "").trim() : null;
  if (cleanQuery) {
    cleanQuery = cleanQuery.replace(/\s+(?:search\s*(?:karo|kro)|search|dhundo|dhundho|khojo)$/i, "").trim();
  }
  const siteKey = targetEntry.canonical;
  const isProduct = targetEntry.search_type === "product";
  const displayName = targetEntry.displayName;

  let intent: UserIntentType = intentOverride || (isProduct ? "SEARCH_PRODUCT" : "SEARCH_WEB");
  if (!cleanQuery) {
    intent = "OPEN_OR_SEARCH_WEBSITE";
  }

  let searchUrl = targetEntry.searchUrl || WEBSITES.google.searchUrl;
  if (siteKey === "amazon" && cleanQuery) {
    const isCom = cleanSite.includes("amazon.com") || (!cleanQuery.match(/(?:rs|inr|rupee|₹)/i) && cleanQuery.includes("$"));
    searchUrl = isCom ? "https://www.amazon.com/s?k=" : "https://www.amazon.in/s?k=";
  }

  return {
    matched: true,
    intent,
    ruleName,
    arguments: {
      browser: "chrome",
      target: siteKey,
      site: siteKey,
      siteDisplayName: displayName,
      query: cleanQuery,
      searchUrl,
    },
  };
}

/**
 * Evaluates web search and product search intents.
 * Separates INTENT ("WHAT to do") from TARGET ("WHERE to do it") and QUERY ("WHAT to find").
 */
export function matchSearchIntent(normalizedText: string, rawText: string, contextualTarget?: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // Local system / desktop queries must NEVER be hijacked by web search!
  const isLocalSystemQuery = /\b(?:installed\s+apps?|installed\s+applications?|installed\s+software|installed\s+programs?|running\s+processes?|background\s+processes?|running\s+background|active\s+window|visible\s+windows?|open\s+windows?|foreground\s+window)\b/i.test(text);
  if (isLocalSystemQuery) {
    return null;
  }

  // Pattern 1: "search <target>" with NO search query where target is a registered website
  // Prevents the website name from becoming the search query!
  // e.g. "search YouTube" -> target="youtube", query=null, intent="OPEN_OR_SEARCH_WEBSITE"
  const searchTargetOnly = text.match(/^(?:search|look\s+up)\s+([a-z0-9.]+)$/i);
  if (searchTargetOnly) {
    const res = buildSearchResult(searchTargetOnly[1], null, "RULE_OPEN_OR_SEARCH_WEBSITE", "OPEN_OR_SEARCH_WEBSITE");
    if (res) return res;
  }

  // Pattern 2: "search <query> in/on/at <target>" or "search for <query> in/on/at <target>"
  // e.g. "search keyboard in Amazon", "search Python tutorials on YouTube", "search Python at Google"
  const queryOnSite = text.match(/^(?:search|find|look)\s+(?:for\s+)?(.+?)\s+(?:in|on|at)\s+([a-z0-9.]+)$/i);
  if (queryOnSite) {
    const res = buildSearchResult(queryOnSite[2], queryOnSite[1], "RULE_SEARCH_QUERY_ON_SITE");
    if (res) return res;
  }

  // Pattern 3: "search <target> for <query>"
  // e.g. "search Amazon for wireless keyboards", "search YouTube for Python tutorials", "search Google for Python decorators"
  const siteForQuery = text.match(/^search\s+([a-z0-9.]+)\s+for\s+(.+)$/i);
  if (siteForQuery) {
    const res = buildSearchResult(siteForQuery[1], siteForQuery[2], "RULE_SEARCH_SITE_FOR_QUERY");
    if (res) return res;
  }

  // Pattern 4: "on/in/at <target> search for/find <query>" or "on/in/at <target> search <query>"
  // e.g. "on Amazon search for wireless keyboards", "on YouTube search Python tutorials", "in Google search Python decorators"
  const onSiteSearch = text.match(/^(?:on|in|at)\s+([a-z0-9.]+)\s+(?:search\s+for|search|find|look\s+for)\s+(.+)$/i);
  if (onSiteSearch) {
    const res = buildSearchResult(onSiteSearch[1], onSiteSearch[2], "RULE_ON_SITE_SEARCH");
    if (res) return res;
  }

  // Pattern 5: "search/find on/in/at <target> for <query>" or "search on/in/at <target> <query>"
  // e.g. "search on Amazon for keyboards", "search in YouTube for lofi beats"
  const searchOnSite = text.match(/^(?:search|find|look)\s+(?:on|in|at)\s+([a-z0-9.]+)\s+(?:for\s+)?(.+)$/i);
  if (searchOnSite) {
    const res = buildSearchResult(searchOnSite[1], searchOnSite[2], "RULE_SEARCH_ON_SITE");
    if (res) return res;
  }

  // Pattern 6: "<target> search for <query>" or "<target> search <query>"
  // e.g. "Amazon search for keyboards", "YouTube search Python tutorials"
  const directSiteSearch = text.match(/^([a-z0-9.]+)\s+search\s+(?:for\s+)?(.+)$/i);
  if (directSiteSearch) {
    const res = buildSearchResult(directSiteSearch[1], directSiteSearch[2], "RULE_DIRECT_SITE_SEARCH");
    if (res) return res;
  }

  // Pattern 7: Hindi/Hinglish: "<target> pe/par/me <query> search karo / dhundo"
  // e.g. "Amazon pe keyboard search karo", "Google par Python search karo", "YouTube pe music search karo", "Amazon me wireless mouse dhundo"
  const hinglishSiteSearch = raw.match(
    /^(?:(?:on|in)\s+[a-z0-9.]+\s+)?([a-z0-9.]+)\s+(?:pe|par|me|mein|par\s+se)\s+(?:search\s*(?:karo|kro)\s+|dhundo\s+|khojo\s+)?(.+?)(?:\s+(?:search\s*(?:karo|kro)|search\s*karna|search\s*kardo|dhundo|dhundho|khojo|search))?$/i
  );
  if (hinglishSiteSearch) {
    const res = buildSearchResult(hinglishSiteSearch[1], hinglishSiteSearch[2], "RULE_HINGLISH_SITE_SEARCH");
    if (res) return res;
  }

  // Pattern 8: "search the web for <query>" or "search web for <query>"
  const webSearchMatch = text.match(/^search\s+(?:the\s+)?web\s+for\s+(.+)$/i);
  if (webSearchMatch) {
    return buildSearchResult("google", webSearchMatch[1], "RULE_SEARCH_WEB");
  }

  // Pattern 9: "google <query>" (e.g. "google Python decorators")
  if (!/^google\s+chrome\b/i.test(text)) {
    const directGoogleMatch = text.match(/^(?:google|google\s+search)\s+(.+)$/i);
    if (directGoogleMatch) {
      const query = directGoogleMatch[1].trim();
      if (!/^(?:open|kholo|khol|close|band|start|launch)$/i.test(query)) {
        return buildSearchResult("google", query, "RULE_GOOGLE_SEARCH");
      }
    }
  }

  // Pattern 10: Generalized search: "search for <query>" or "search <query>"
  // CRITICAL RULE: When no website is specified (e.g. "Search Python tutorials"),
  // defaults to Google (general web search) unless a context target was provided by a compound workflow.
  const generalSearchMatch = text.match(/^search\s+(?:for\s+)?(.+)$/i);
  if (generalSearchMatch) {
    const query = generalSearchMatch[1].trim();
    const defaultSite = contextualTarget || "google";
    return buildSearchResult(defaultSite, query, "RULE_GENERAL_SEARCH");
  }

  // Pattern 11: Suffix search: "<query> search karo" / "<query> dhundo"
  const suffixSearchMatch = raw.match(/^(.+?)\s+(?:search\s*(?:karo|kro)|search\s*karna|search\s*kardo|dhundo|dhundho|khojo)$/i);
  if (suffixSearchMatch) {
    const query = suffixSearchMatch[1].trim();
    const defaultSite = contextualTarget || "google";
    return buildSearchResult(defaultSite, query, "RULE_SUFFIX_SEARCH");
  }

  // Pattern 12: Suffix search (English/normalized): "<query> search"
  const suffixSearchEnglish = text.match(/^(.+?)\s+search$/i);
  if (suffixSearchEnglish) {
    const query = suffixSearchEnglish[1].trim();
    const defaultSite = contextualTarget || "google";
    return buildSearchResult(defaultSite, query, "RULE_SUFFIX_SEARCH_EN");
  }

  return null;
}


