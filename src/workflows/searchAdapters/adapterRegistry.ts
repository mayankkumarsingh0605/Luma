import type { SearchAdapter } from "./types.js";
import type { WorkflowContext, WorkflowResult } from "../types.js";
import { ActionVerifier } from "../../verification/actionVerifier.js";
import { ComputerStateManager } from "../../state/computerState.js";
import { WEBSITE_REGISTRY } from "../../router/websiteRegistry.js";
import { BrowserAgent } from "../../agent/browserAgent.js";

/**
 * Common helper to launch a URL in Google Chrome, focus the window, and verify launch.
 * Reuses the active controlled session without spawning duplicate windows.
 */
async function launchAndFocusChrome(url: string): Promise<boolean> {
  await BrowserAgent.open_browser();
  const navRes = await BrowserAgent.navigate_to_url(url);
  return navRes.success;
}

/**
 * YouTube Search Adapter
 */
export class YouTubeSearchAdapter implements SearchAdapter {
  target = "youtube";
  displayName = "YouTube";

  async open(context: WorkflowContext): Promise<WorkflowResult> {
    const url = "https://www.youtube.com";
    context.onProgress("Opening YouTube in browser...", "in-progress");
    await BrowserAgent.open_browser();
    const navRes = await BrowserAgent.navigate_to_url(url);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to YouTube: ${navRes.message}`);
    }
    await ActionVerifier.sleep(400);

    const verifiedUrl = navRes.url || url;
    context.onProgress("YouTube loaded", "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: verifiedUrl,
      current_task: "Opened YouTube",
      last_action: "Opened YouTube",
      last_action_status: "success",
    });

    return {
      success: true,
      message: "YouTube opened successfully.",
      data: { target: this.target, url: verifiedUrl },
    };
  }

  async search(query: string, context: WorkflowContext): Promise<WorkflowResult> {
    const cleanQuery = query.trim();
    const homeUrl = "https://www.youtube.com";

    context.onProgress("Connecting to controlled browser session...", "in-progress");
    await BrowserAgent.open_browser();

    context.onProgress("Navigating to YouTube...", "in-progress");
    const navRes = await BrowserAgent.navigate_to_url(homeUrl);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to YouTube: ${navRes.message}`);
    }

    context.onProgress(`Entering "${cleanQuery}" into YouTube search box...`, "in-progress");
    const searchRes = await BrowserAgent.fill_and_submit_search(cleanQuery);
    if (!searchRes.success) {
      // Fallback: direct search URL navigation
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
      await BrowserAgent.navigate_to_url(searchUrl);
    } else {
      await BrowserAgent.verify_search_results(cleanQuery);
    }

    const resultingUrl = searchRes.url || (await BrowserAgent.get_current_url()) || `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
    context.onProgress("YouTube results loaded", "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: resultingUrl,
      current_task: `Searching YouTube for ${cleanQuery}`,
      last_action: `Searched YouTube for "${cleanQuery}"`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `Searched YouTube for "${cleanQuery}".`,
      data: { target: this.target, query: cleanQuery, url: resultingUrl },
    };
  }
}

/**
 * Amazon Search Adapter (Product Search)
 * Real DOM search-box interaction with single-session tab reuse.
 */
export class AmazonSearchAdapter implements SearchAdapter {
  target = "amazon";
  displayName = "Amazon";

  async open(context: WorkflowContext): Promise<WorkflowResult> {
    const url = "https://www.amazon.in";
    context.onProgress("Opening Amazon in browser...", "in-progress");
    await BrowserAgent.open_browser();
    const navRes = await BrowserAgent.navigate_to_url(url);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to Amazon: ${navRes.message}`);
    }
    await ActionVerifier.sleep(400);

    const verifiedUrl = navRes.url || url;
    context.onProgress("Amazon loaded", "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: verifiedUrl,
      current_task: "Opened Amazon",
      last_action: "Opened Amazon",
      last_action_status: "success",
    });

    return {
      success: true,
      message: "Amazon opened successfully.",
      data: { target: this.target, url: verifiedUrl },
    };
  }

  async search(query: string, context: WorkflowContext): Promise<WorkflowResult> {
    const cleanQuery = query.trim();
    const isCom = cleanQuery.includes("$") && !cleanQuery.match(/(?:rs|inr|rupee|₹)/i);
    const homeUrl = isCom ? "https://www.amazon.com" : "https://www.amazon.in";

    context.onProgress("Connecting to controlled browser session...", "in-progress");
    await BrowserAgent.open_browser();

    context.onProgress("Navigating to Amazon homepage...", "in-progress");
    const navRes = await BrowserAgent.navigate_to_url(homeUrl);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to Amazon: ${navRes.message}`);
    }

    context.onProgress(`Entering "${cleanQuery}" into Amazon search input...`, "in-progress");
    const searchRes = await BrowserAgent.fill_and_submit_search(cleanQuery);
    if (!searchRes.success) {
      // Fallback: direct search URL navigation if search box locator failed
      const fallbackUrl = `${homeUrl}/s?k=${encodeURIComponent(cleanQuery)}`;
      await BrowserAgent.navigate_to_url(fallbackUrl);
    } else {
      context.onProgress("Waiting for search results...", "in-progress");
      await BrowserAgent.verify_search_results(cleanQuery);
    }

    const resultingUrl = searchRes.url || (await BrowserAgent.get_current_url()) || `${homeUrl}/s?k=${encodeURIComponent(cleanQuery)}`;
    context.onProgress(`Amazon results loaded for "${cleanQuery}"`, "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: resultingUrl,
      current_task: `Searching Amazon for ${cleanQuery}`,
      last_action: `Searched Amazon for "${cleanQuery}"`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `Searched Amazon for "${cleanQuery}".`,
      data: { target: this.target, query: cleanQuery, url: resultingUrl },
    };
  }
}

/**
 * Google Search Adapter (General Web Search)
 */
export class GoogleSearchAdapter implements SearchAdapter {
  target = "google";
  displayName = "Google";

  async open(context: WorkflowContext): Promise<WorkflowResult> {
    const url = "https://www.google.com";
    context.onProgress("Opening Google in browser...", "in-progress");
    await BrowserAgent.open_browser();
    const navRes = await BrowserAgent.navigate_to_url(url);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to Google: ${navRes.message}`);
    }
    await ActionVerifier.sleep(400);

    const verifiedUrl = navRes.url || url;
    context.onProgress("Google loaded", "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: verifiedUrl,
      current_task: "Opened Google",
      last_action: "Opened Google",
      last_action_status: "success",
    });

    return {
      success: true,
      message: "Google opened successfully.",
      data: { target: this.target, url: verifiedUrl },
    };
  }

  async search(query: string, context: WorkflowContext): Promise<WorkflowResult> {
    const cleanQuery = query.trim();
    const homeUrl = "https://www.google.com";

    context.onProgress("Connecting to controlled browser session...", "in-progress");
    await BrowserAgent.open_browser();

    context.onProgress("Navigating to Google...", "in-progress");
    const navRes = await BrowserAgent.navigate_to_url(homeUrl);
    if (!navRes.success) {
      throw new Error(`Failed to navigate to Google: ${navRes.message}`);
    }

    context.onProgress(`Entering "${cleanQuery}" into search box...`, "in-progress");
    const searchRes = await BrowserAgent.fill_and_submit_search(cleanQuery);
    if (!searchRes.success) {
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
      await BrowserAgent.navigate_to_url(fallbackUrl);
    } else {
      context.onProgress("Waiting for search results...", "in-progress");
      await BrowserAgent.verify_search_results(cleanQuery);
    }

    const resultingUrl = searchRes.url || (await BrowserAgent.get_current_url()) || `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
    context.onProgress("Google results loaded", "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: resultingUrl,
      current_task: `Searching Google for ${cleanQuery}`,
      last_action: `Searched Google for "${cleanQuery}"`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `Searched Google for "${cleanQuery}".`,
      data: { target: this.target, query: cleanQuery, url: resultingUrl },
    };
  }
}

/**
 * Generic Site Search Adapter for any registered site (GitHub, Reddit, Flipkart, etc.)
 */
export class GenericSiteAdapter implements SearchAdapter {
  target: string;
  displayName: string;
  siteUrl: string;
  searchUrlTemplate?: string;

  constructor(targetKey: string) {
    const entry = WEBSITE_REGISTRY[targetKey];
    this.target = targetKey;
    this.displayName = entry?.displayName || targetKey.toUpperCase();
    this.siteUrl = entry?.url || `https://www.${targetKey}.com`;
    this.searchUrlTemplate = entry?.searchUrl;
  }

  async open(context: WorkflowContext): Promise<WorkflowResult> {
    context.onProgress(`Opening ${this.displayName}...`, "in-progress");
    await launchAndFocusChrome(this.siteUrl);
    await ActionVerifier.sleep(500);

    context.onProgress(`${this.displayName} loaded`, "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: this.siteUrl,
      current_task: `Opened ${this.displayName}`,
      last_action: `Opened ${this.displayName}`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `${this.displayName} opened successfully.`,
      data: { target: this.target, url: this.siteUrl },
    };
  }

  async search(query: string, context: WorkflowContext): Promise<WorkflowResult> {
    const cleanQuery = query.trim();
    const searchUrl = this.searchUrlTemplate
      ? `${this.searchUrlTemplate}${encodeURIComponent(cleanQuery)}`
      : `${WEBSITE_REGISTRY.google.searchUrl}${encodeURIComponent(`${this.target} ${cleanQuery}`)}`;

    context.onProgress(`Opening ${this.displayName}...`, "in-progress");
    await launchAndFocusChrome(searchUrl);

    context.onProgress(`Searching ${this.displayName} for "${cleanQuery}"...`, "in-progress");
    await ActionVerifier.sleep(500);

    context.onProgress(`${this.displayName} results loaded`, "completed");
    ComputerStateManager.update({
      active_app: "chrome",
      current_url: searchUrl,
      current_task: `Searching ${this.displayName} for ${cleanQuery}`,
      last_action: `Searched ${this.displayName} for "${cleanQuery}"`,
      last_action_status: "success",
    });

    return {
      success: true,
      message: `Searched ${this.displayName} for "${cleanQuery}".`,
      data: { target: this.target, query: cleanQuery, url: searchUrl },
    };
  }
}

/**
 * Adapter Registry Factory
 */
const adapters: Map<string, SearchAdapter> = new Map([
  ["youtube", new YouTubeSearchAdapter()],
  ["amazon", new AmazonSearchAdapter()],
  ["google", new GoogleSearchAdapter()],
]);

export function getSearchAdapter(targetKey: string): SearchAdapter {
  const key = targetKey.toLowerCase().trim();
  if (adapters.has(key)) {
    return adapters.get(key)!;
  }

  if (WEBSITE_REGISTRY[key]) {
    const custom = new GenericSiteAdapter(key);
    adapters.set(key, custom);
    return custom;
  }

  // Default fallback is Google (general web search) - NEVER default to Amazon
  return adapters.get("google")!;
}
