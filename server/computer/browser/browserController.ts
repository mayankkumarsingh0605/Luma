/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession } from "./browserSession.js";
import { ModuleRegistry } from "./modules/moduleRegistry.js";
import { YouTubeModule } from "./modules/youtubeModule.js";
import type { ProductSearchResult, ExtractedPriceResult } from "./modules/types.js";

export type { ProductSearchResult, ExtractedPriceResult };

export class BrowserController {
  /**
   * Checks whether the current page displays a bot check / CAPTCHA wall.
   * Delegates to active website module.
   */
  static async isCaptchaPresent(page: Page, siteKey?: string): Promise<boolean> {
    try {
      let pageUrl = "";
      try {
        if (typeof page?.url === "function") {
          pageUrl = page.url();
        }
      } catch {
        // page.url might fail on mocks or detached pages
      }

      let key = siteKey;
      if (!key && !pageUrl) {
        try {
          const t = (await page.title()).toLowerCase();
          if (t.includes("amazon")) key = "amazon";
          else if (t.includes("youtube")) key = "youtube";
          else if (t.includes("flipkart")) key = "flipkart";
        } catch {
          // Ignore
        }
      }

      const mod = ModuleRegistry.resolve(key, pageUrl);
      return await mod.isCaptchaPresent(page);
    } catch {
      return false;
    }
  }

  /**
   * Connects to or visibly launches the controlled Chrome session.
   * If an initial URL is provided, navigates the active tab without spawning new windows.
   */
  static async connect(url?: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    isNewSession: boolean;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      await BrowserSession.focusBrowser();

      const currentUrl = page.url();
      if (url && (currentUrl === "about:blank" || currentUrl === "" || !currentUrl.startsWith("http"))) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      }

      const activeUrl = page.url();
      const activeTitle = await page.title();

      return {
        success: true,
        url: activeUrl,
        title: activeTitle,
        isNewSession: false,
      };
    } catch (err: any) {
      return {
        success: false,
        url: "",
        title: "",
        isNewSession: false,
        error: `Browser connection failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Navigates the single controlled tab to the specified destination URL.
   * Reuses the existing page; never spawns a new window or tab.
   */
  static async navigate(url: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      await BrowserSession.focusBrowser();

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          url: page.url(),
          title: await page.title(),
          error: "CAPTCHA / Security check detected on page. Please complete verification in the browser window.",
        };
      }

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    } catch (err: any) {
      return {
        success: false,
        url: "",
        title: "",
        error: `Navigation to ${url} failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Locates the actual search input on the rendered page, types the exact query,
   * verifies input contents, and submits search.
   * Dispatches to the corresponding WebsiteModule (Amazon, Flipkart, YouTube, Google, Generic).
   */
  static async fillAndSubmitSearch(
    query: string,
    siteKey?: string
  ): Promise<{
    success: boolean;
    query: string;
    url: string;
    title: string;
    error?: string;
  }> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error("Search query is required and cannot be empty.");
    }

    try {
      const page = await BrowserSession.getActivePage();
      await BrowserSession.focusBrowser();

      // Resolve module with explicit siteKey taking precedence
      const mod = ModuleRegistry.resolve(siteKey, page.url());
      console.log(`[BrowserController] fillAndSubmitSearch using module: '${mod.displayName}'`);

      // If page is on blank / invalid origin, navigate to that module's default home
      const currentUrl = page.url();
      if (currentUrl === "about:blank" || currentUrl === "" || !currentUrl.startsWith("http")) {
        console.log(`[BrowserController] Blank page detected; navigating to ${mod.displayName} home (${mod.defaultHomeUrl})`);
        await page.goto(mod.defaultHomeUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      }

      return await mod.fillAndSubmitSearch(page, cleanQuery);
    } catch (err: any) {
      return {
        success: false,
        query: cleanQuery,
        url: "",
        title: "",
        error: `Failed to search: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Verifies that the current page is a valid search results page for the query.
   * Dispatches to the matching website module.
   */
  static async verifySearchResults(
    query: string,
    siteKey?: string
  ): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey, page.url());
      return await mod.verifySearchResults(page, query);
    } catch (err: any) {
      return {
        success: false,
        url: "",
        title: "",
        error: `Could not verify search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Inspects the rendered search results on the active page.
   * Dispatches to the active module's getFirstProduct implementation.
   */
  static async getFirstSearchResult(
    siteKey?: string
  ): Promise<{
    success: boolean;
    result?: ProductSearchResult;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey, page.url());

      if (mod.getFirstProduct) {
        return await mod.getFirstProduct(page);
      }

      return {
        success: false,
        error: `Product inspection is not supported by the ${mod.displayName} module.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to inspect search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Opens the identified product by navigating the current controlled tab to that exact URL.
   */
  static async openProduct(productUrl: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      await BrowserSession.focusBrowser();

      await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          url: page.url(),
          title: await page.title(),
          error: "Security challenge encountered upon opening product page.",
        };
      }

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    } catch (err: any) {
      return {
        success: false,
        url: "",
        title: "",
        error: `Failed to open product page: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Extracts the actual displayed price and title from the active product page.
   * Dispatches to the active module's extractProductPrice.
   */
  static async extractProductPrice(
    siteKey?: string
  ): Promise<{
    success: boolean;
    result?: ExtractedPriceResult;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey, page.url());

      if (mod.extractProductPrice) {
        return await mod.extractProductPrice(page);
      }

      return {
        success: false,
        error: `Price extraction is not supported by the ${mod.displayName} module.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to extract product price: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Retrieves current browser live state snapshot (URL, title, connection status).
   */
  static async getState(): Promise<{
    connected: boolean;
    url: string | null;
    title: string | null;
    pageStatus: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      return {
        connected: true,
        url: page.url(),
        title: await page.title(),
        pageStatus: "LOADED",
      };
    } catch {
      return {
        connected: false,
        url: null,
        title: null,
        pageStatus: "UNAVAILABLE",
      };
    }
  }

  /**
   * Plays the first organic video from YouTube search results.
   */
  static async playFirstVideo(siteKey?: string): Promise<{
    success: boolean;
    title?: string;
    url?: string;
    message: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "playFirstVideo" in mod) {
        return await (mod as any).playFirstVideo(page);
      }
      return {
        success: false,
        message: `Playing videos is not supported on ${mod.displayName}.`,
        error: "Unsupported module",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Could not play video: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }

  /**
   * Controls playback (play, pause, resume) on the active webpage.
   */
  static async controlPlayback(action: "play" | "pause" | "resume"): Promise<{
    success: boolean;
    paused?: boolean;
    message: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(undefined, page.url());
      if (mod instanceof YouTubeModule || "controlPlayback" in mod) {
        return await (mod as any).controlPlayback(page, action);
      }

      // Generic HTML5 video control fallback
      const res = await page.evaluate((act) => {
        const v = document.querySelector<HTMLVideoElement>("video");
        if (v) {
          if (act === "pause") v.pause();
          else v.play().catch(() => {});
          return { success: true, paused: v.paused };
        }
        return { success: false };
      }, action);

      if (res.success) {
        return {
          success: true,
          paused: res.paused,
          message: `${action === "pause" ? "Paused" : "Resumed"} video playback.`,
        };
      }

      return {
        success: false,
        message: "No active video player found on current page.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Could not control playback: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }

  /**
   * Retrieves video results from the active YouTube page.
   */
  static async getVideoResults(limit: number = 3): Promise<Array<{ title: string; url: string; videoId?: string }>> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve("youtube", page.url());
      if (mod instanceof YouTubeModule || "getVideoResults" in mod) {
        return await (mod as any).getVideoResults(page, limit);
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Creates a user playlist.
   */
  static async createPlaylist(name: string): Promise<any> {
    const { YouTubePlaylistManager } = await import("./modules/youtubePlaylistManager.js");
    return await YouTubePlaylistManager.createPlaylist(name);
  }

  /**
   * Adds videos to a user playlist.
   */
  static async addVideosToPlaylist(
    playlistName: string,
    videos: Array<{ title: string; url: string; videoId?: string }>
  ): Promise<any> {
    const { YouTubePlaylistManager } = await import("./modules/youtubePlaylistManager.js");
    return await YouTubePlaylistManager.addVideosToPlaylist(playlistName, videos);
  }

  /**
   * Plays a user playlist by name.
   */
  static async playPlaylist(name: string): Promise<{ success: boolean; message: string; url?: string }> {
    const { YouTubePlaylistManager } = await import("./modules/youtubePlaylistManager.js");
    const playlist = await YouTubePlaylistManager.getPlaylist(name);
    if (!playlist) {
      return {
        success: false,
        message: `Playlist "${name}" not found.`,
      };
    }
    const page = await BrowserSession.getActivePage();
    const mod = ModuleRegistry.resolve("youtube", page.url());
    if (mod instanceof YouTubeModule || "playPlaylist" in mod) {
      return await (mod as any).playPlaylist(page, playlist);
    }
    return {
      success: false,
      message: "YouTube module required to play playlist.",
    };
  }

  /**
   * Removes a video from a user playlist.
   */
  static async removeVideoFromPlaylist(playlistName: string, identifier: string): Promise<any> {
    const { YouTubePlaylistManager } = await import("./modules/youtubePlaylistManager.js");
    return await YouTubePlaylistManager.removeVideoFromPlaylist(playlistName, identifier);
  }

  /**
   * Retrieves a playlist by name.
   */
  static async getPlaylist(name: string): Promise<any> {
    const { YouTubePlaylistManager } = await import("./modules/youtubePlaylistManager.js");
    return await YouTubePlaylistManager.getPlaylist(name);
  }
}
