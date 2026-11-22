/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession, type TabInfo } from "./browserSession.js";
import { ModuleRegistry } from "./modules/moduleRegistry.js";
import { YouTubeModule } from "./modules/youtubeModule.js";
import type { ProductSearchResult, ExtractedPriceResult } from "./modules/types.js";
import { PageObserver, type PageObservationSummary } from "./pageObserver.js";
import { FormManager, type FormInspectionResult, type FormFillResult } from "./formManager.js";
import { DownloadManager, type DownloadResult } from "./downloadManager.js";

export type { ProductSearchResult, ExtractedPriceResult, TabInfo, PageObservationSummary, FormInspectionResult, FormFillResult, DownloadResult };

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
      let page = await BrowserSession.getActivePage({ targetUrl: url });
      await BrowserSession.focusBrowser();

      // Protected-Origin Guard: never navigate a LUMA application tab!
      if (BrowserSession.isProtectedUrl(page.url())) {
        console.warn(`[BrowserController] Protected-Origin Guard: Active page is LUMA application (${page.url()}). Creating a dedicated tab for ${url}.`);
        const tab = await BrowserSession.createTab(url);
        return {
          success: true,
          url: tab.url,
          title: tab.title,
        };
      }

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
      let page = await BrowserSession.getActivePage({ targetUrl: siteKey });
      await BrowserSession.focusBrowser();

      // Protected-Origin Guard
      if (BrowserSession.isProtectedUrl(page.url())) {
        console.warn(`[BrowserController] Protected-Origin Guard: Active page is LUMA application (${page.url()}). Spawning new tab.`);
        const homeUrl = siteKey === "youtube" ? "https://www.youtube.com" : siteKey === "amazon" ? "https://www.amazon.in" : "https://www.google.com";
        await BrowserSession.createTab(homeUrl);
        page = await BrowserSession.getActivePage({ targetUrl: siteKey });
      }

      // Resolve module with explicit siteKey taking precedence
      const mod = ModuleRegistry.resolve(siteKey, page.url());
      console.log(`[BrowserController] fillAndSubmitSearch using module: '${mod.displayName}'`);

      // If page is on blank / invalid origin, navigate to that module's default home
      const currentUrl = page.url();
      if (currentUrl === "about:blank" || currentUrl === "" || !currentUrl.startsWith("http")) {
        console.log(`[BrowserController] Blank page detected; navigating to ${mod.displayName} home (${mod.defaultHomeUrl})`);
        await page.goto(mod.defaultHomeUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => { });
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
          else v.play().catch(() => { });
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
   * Creates a user playlist on YouTube via UI.
   */
  static async createPlaylist(
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.createPlaylist(page, name, privacy, commandText);
  }

  /**
   * Creates a new user playlist seeded with a specific video using the authentic Save-to-playlist workflow.
   */
  static async createPlaylistFromVideo(
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    videoContext?: any,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.createPlaylistFromVideo(page, videoContext || null, name, privacy, commandText);
  }

  /**
   * Plays a video by 1-based index from a YouTube playlist or advances to next video.
   */
  static async playPlaylistVideo(
    nameOrUrl?: string,
    index?: number,
    next?: boolean,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    if (next) {
      return await YouTubePlaylistService.playNextPlaylistVideo(page, commandText);
    }
    return await YouTubePlaylistService.playPlaylistVideo(page, nameOrUrl || "latest", index || 1, commandText);
  }

  /**
   * Adds videos to a user playlist on YouTube via UI.
   */
  static async addVideosToPlaylist(
    playlistName: string,
    videos?: Array<{ title: string; url: string; videoId?: string }>,
    limit: number = 3,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    if (videos && videos.length > 0) {
      let addedCount = 0;
      const results = [];
      for (const v of videos.slice(0, limit)) {
        const res = await YouTubePlaylistService.addVideoToPlaylist(page, playlistName, v.url, commandText);
        if (res.success) addedCount++;
        results.push(res);
      }
      return {
        success: addedCount > 0,
        addedCount,
        message: `Added ${addedCount} video(s) to playlist "${playlistName}".`,
        results,
      };
    }
    return await YouTubePlaylistService.addVideoToPlaylist(page, playlistName, undefined, commandText);
  }

  /**
   * Plays a user playlist by name or URL. If index is provided, starts playback of that specific video.
   */
  static async playPlaylist(
    nameOrUrl: string,
    index?: number,
    next?: boolean,
    commandText?: string
  ): Promise<{ success: boolean; message: string; url?: string; videoTitle?: string }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    if (next) {
      const res = await YouTubePlaylistService.playNextPlaylistVideo(page, commandText);
      return {
        success: res.success,
        message: res.message,
        url: res.videoUrl,
        videoTitle: res.videoTitle,
      };
    }
    const res = await YouTubePlaylistService.playPlaylistVideo(page, nameOrUrl, index || 1, commandText);
    return {
      success: res.success,
      message: res.message,
      url: res.videoUrl || res.playlistUrl,
      videoTitle: res.videoTitle,
    };
  }

  /**
   * Removes a video from a user playlist.
   */
  static async removeVideoFromPlaylist(
    playlistName: string,
    identifier: string,
    confirmed: boolean = false,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.removeVideoFromPlaylist(page, playlistName, identifier, confirmed, commandText);
  }

  /**
   * Retrieves a playlist's video count and details.
   */
  static async getPlaylist(name: string, commandText?: string): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.getPlaylistDetails(page, name, commandText);
  }

  /**
   * Renames a YouTube playlist.
   */
  static async renamePlaylist(
    oldNameOrUrl: string,
    newName: string,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.renamePlaylist(page, oldNameOrUrl, newName, commandText);
  }

  /**
   * Updates privacy of a YouTube playlist.
   */
  static async updatePlaylistPrivacy(
    nameOrUrl: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE",
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.updatePlaylistPrivacy(page, nameOrUrl, privacy, commandText);
  }

  /**
   * Searches YouTube and adds the video at rank N to a playlist.
   */
  static async addSearchResultToPlaylist(
    query: string,
    rank: number = 1,
    playlistName: string,
    commandText?: string
  ): Promise<any> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.addSearchResultToPlaylist(page, query, rank, playlistName, commandText);
  }

  // ===========================================================================
  // TAB MANAGEMENT
  // ===========================================================================

  /**
   * Opens a new tab in the existing controlled Chrome session and optionally navigates to a URL.
   */
  static async createTab(url?: string): Promise<{
    success: boolean;
    index: number;
    title: string;
    url: string;
    message: string;
  }> {
    try {
      const res = await BrowserSession.createTab(url);
      return {
        success: true,
        index: res.index,
        title: res.title,
        url: res.url,
        message: `Opened new tab #${res.index}: "${res.title}" (${res.url}).`,
      };
    } catch (err: any) {
      return {
        success: false,
        index: -1,
        title: "",
        url: url || "",
        message: `Failed to open new tab: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Lists all open tabs in the controlled browser session.
   */
  static async listTabs(): Promise<{ success: boolean; tabs: TabInfo[]; message: string }> {
    try {
      const tabs = await BrowserSession.listTabs();
      return {
        success: true,
        tabs,
        message: `Currently ${tabs.length} tab(s) open in controlled Chrome session.`,
      };
    } catch (err: any) {
      return {
        success: false,
        tabs: [],
        message: `Failed to list tabs: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Switches to a specific tab by index or title/URL substring.
   */
  static async switchTab(target: number | string): Promise<{
    success: boolean;
    index: number;
    title: string;
    url: string;
    message: string;
  }> {
    return await BrowserSession.switchTab(target);
  }

  /**
   * Closes a specific tab, preserving other tabs.
   */
  static async closeTab(target?: number | string): Promise<{
    success: boolean;
    closedTitle: string;
    remainingCount: number;
    message: string;
  }> {
    return await BrowserSession.closeTab(target);
  }

  /**
   * Returns active tab information.
   */
  static async getActiveTab(): Promise<{ index: number; title: string; url: string }> {
    return await BrowserSession.getActiveTabInfo();
  }

  // ===========================================================================
  // UNIVERSAL PAGE OBSERVATION & CONTENT EXTRACTION
  // ===========================================================================

  /**
   * Performs semantic inspection of the active webpage DOM.
   */
  static async inspectPage(): Promise<PageObservationSummary> {
    return await PageObserver.observePage();
  }

  /**
   * Reads and summarizes visible text, headings, and search results on the active page.
   */
  static async readPageContent(): Promise<{
    success: boolean;
    title: string;
    url: string;
    summary: string;
    headings: string[];
    topSnippets: string[];
    relevantLinks: Array<{ text: string; url: string }>;
  }> {
    return await PageObserver.readPageContent();
  }

  // ===========================================================================
  // FORM INSPECTION & FILLING
  // ===========================================================================

  /**
   * Inspects all form elements on the active page.
   */
  static async inspectForm(): Promise<FormInspectionResult> {
    return await FormManager.inspectForm();
  }

  /**
   * Fills form fields on the active page matching provided data or user profile.
   */
  static async fillForm(
    data: Record<string, string> = {},
    options: { submit?: boolean } = {}
  ): Promise<FormFillResult> {
    return await FormManager.fillForm(data, options);
  }

  // ===========================================================================
  // PDF & FILE DOWNLOADS
  // ===========================================================================

  /**
   * Detects and downloads requested file/PDF from the active webpage.
   */
  static async downloadFile(fileQuery: string = "pdf", targetDir?: string): Promise<DownloadResult> {
    return await DownloadManager.downloadFile(fileQuery, targetDir);
  }

  // ===========================================================================
  // ADVANCED YOUTUBE RANKED PLAYBACK & LIVE PLAYLISTS
  // ===========================================================================

  /**
   * Plays the video at the given rank (1 = first, 2 = second, etc.) on YouTube.
   */
  static async playVideoByRank(
    rank: number = 1,
    siteKey?: string
  ): Promise<{
    success: boolean;
    title?: string;
    url?: string;
    message: string;
    isPlaying: boolean;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "playVideoByRank" in mod) {
        return await (mod as any).playVideoByRank(page, rank);
      }
      return {
        success: false,
        message: `Ranked video playback not supported on ${mod.displayName}.`,
        isPlaying: false,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Could not play video rank #${rank}: ${err?.message || "Unknown error"}`,
        isPlaying: false,
        error: err?.message,
      };
    }
  }

  /**
   * Creates a playlist directly on YouTube web interface.
   */
  static async createPlaylistUI(
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE"
  ): Promise<{ success: boolean; message: string }> {
    const page = await BrowserSession.getActivePage();
    const mod = ModuleRegistry.resolve("youtube", page.url());
    if (mod instanceof YouTubeModule || "createPlaylistUI" in mod) {
      return await (mod as any).createPlaylistUI(page, name, privacy);
    }
    return { success: false, message: "YouTube module required for UI playlist creation." };
  }

  /**
   * Adds the currently playing video to a playlist on YouTube via UI.
   */
  static async addCurrentVideoToPlaylistUI(
    playlistName: string
  ): Promise<{ success: boolean; message: string }> {
    const page = await BrowserSession.getActivePage();
    const mod = ModuleRegistry.resolve("youtube", page.url());
    if (mod instanceof YouTubeModule || "addCurrentVideoToPlaylistUI" in mod) {
      return await (mod as any).addCurrentVideoToPlaylistUI(page, playlistName);
    }
    return { success: false, message: "YouTube module required." };
  }

  /**
   * Seeks video playback forward or backward by seconds.
   */
  static async seekVideo(
    seconds: number,
    siteKey?: string
  ): Promise<{
    success: boolean;
    oldTime: number;
    newTime: number;
    duration: number;
    message: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "seek" in mod) {
        return await (mod as any).seek(page, seconds);
      }
      return {
        success: false,
        oldTime: 0,
        newTime: 0,
        duration: 0,
        message: `Seek not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        oldTime: 0,
        newTime: 0,
        duration: 0,
        message: `Seek failed: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }

  /**
   * Retrieves metadata of the currently playing video.
   */
  static async getVideoInfo(siteKey?: string): Promise<{
    success: boolean;
    title: string;
    channel: string;
    currentTime: number;
    duration: number;
    formattedProgress: string;
    url: string;
    message: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "getVideoInfo" in mod) {
        return await (mod as any).getVideoInfo(page);
      }
      return {
        success: false,
        title: "",
        channel: "",
        currentTime: 0,
        duration: 0,
        formattedProgress: "",
        url: page.url(),
        message: `Video metadata inspection not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        title: "",
        channel: "",
        currentTime: 0,
        duration: 0,
        formattedProgress: "",
        url: "",
        message: `Could not retrieve video info: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Retrieves player playback state (PLAYING, PAUSED, BUFFERING, ENDED, ERROR, NO_VIDEO).
   */
  static async getPlaybackState(siteKey?: string): Promise<{
    success: boolean;
    state: "PLAYING" | "PAUSED" | "BUFFERING" | "ENDED" | "ERROR" | "NO_VIDEO";
    currentTime: number;
    duration: number;
    percentPlayed: number;
    isMuted: boolean;
    volume: number;
    message: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "getPlaybackState" in mod) {
        return await (mod as any).getPlaybackState(page);
      }
      return {
        success: false,
        state: "NO_VIDEO",
        currentTime: 0,
        duration: 0,
        percentPlayed: 0,
        isMuted: false,
        volume: 0,
        message: `Playback state not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        state: "ERROR",
        currentTime: 0,
        duration: 0,
        percentPlayed: 0,
        isMuted: false,
        volume: 0,
        message: `Could not detect playback state: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Toggles or sets fullscreen mode for the active video.
   */
  static async setFullscreen(
    enable?: boolean,
    siteKey?: string
  ): Promise<{ success: boolean; isFullscreen: boolean; message: string }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "setFullscreen" in mod) {
        return await (mod as any).setFullscreen(page, enable);
      }
      return {
        success: false,
        isFullscreen: false,
        message: `Fullscreen control not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        isFullscreen: false,
        message: `Fullscreen control failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Stops video playback and resets time to 0.
   */
  static async stopVideo(siteKey?: string): Promise<{ success: boolean; message: string }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "stopVideo" in mod) {
        return await (mod as any).stopVideo(page);
      }
      return {
        success: false,
        message: `Stop video not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Stop video failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Skips active advertisement if skippable.
   */
  static async skipAd(siteKey?: string): Promise<{
    success: boolean;
    isAd: boolean;
    skipped?: boolean;
    skippable?: boolean;
    message: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "skipAd" in mod) {
        return await (mod as any).skipAd(page);
      }
      return {
        success: false,
        isAd: false,
        message: `Ad skipping not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        isAd: false,
        message: `Ad skip check failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Opens playlist via YouTube UI.
   */
  static async openPlaylistUI(playlistNameOrUrl: string, commandText?: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    message: string;
    status?: string;
    trace?: any;
  }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    const res = await YouTubePlaylistService.openPlaylist(page, playlistNameOrUrl, commandText);
    return {
      success: res.success,
      url: res.playlistUrl || "",
      title: res.playlistName || "",
      message: res.message,
      status: res.status,
      trace: res.trace,
    };
  }

  /**
   * Lists all playlists in the user's logged-in YouTube account.
   */
  static async listPlaylists(commandText?: string): Promise<{
    success: boolean;
    playlists: any[];
    message: string;
    status?: string;
    trace?: any;
  }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.listPlaylists(page, commandText);
  }

  /**
   * Counts videos in a YouTube playlist.
   */
  static async countPlaylistVideos(playlistNameOrUrl: string, commandText?: string): Promise<{
    success: boolean;
    count: number;
    name: string;
    url?: string;
    message: string;
    status?: string;
    trace?: any;
  }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    const res = await YouTubePlaylistService.countPlaylistVideos(page, playlistNameOrUrl, commandText);
    return {
      success: res.success,
      count: res.count,
      name: playlistNameOrUrl,
      url: res.url,
      message: res.message,
      status: res.status,
      trace: res.trace,
    };
  }

  /**
   * Lists playlist videos via YouTube UI.
   */
  static async listPlaylistVideosUI(playlistNameOrUrl?: string, commandText?: string): Promise<{
    success: boolean;
    videos: Array<{ index: number; title: string; url: string }>;
    message: string;
    status?: string;
    trace?: any;
  }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.listPlaylistVideos(page, playlistNameOrUrl, commandText);
  }

  /**
   * Removes video from playlist via YouTube UI.
   */
  static async removeVideoFromPlaylistUI(
    playlistName: string,
    videoIdentifier: string,
    confirmed: boolean = false,
    commandText?: string
  ): Promise<{ success: boolean; requiresConfirmation?: boolean; message: string; status?: string; trace?: any }> {
    const page = await BrowserSession.getActivePage();
    const { YouTubePlaylistService } = await import("./modules/youtubePlaylistService.js");
    return await YouTubePlaylistService.removeVideoFromPlaylist(page, playlistName, videoIdentifier, confirmed, commandText);
  }

  /**
   * Retrieves active fullscreen status in the browser for YouTube.
   */
  static async getFullscreenState(siteKey?: string): Promise<{
    success: boolean;
    isFullscreen: boolean;
    isVideoPlaying: boolean;
    url: string;
    message: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
      const mod = ModuleRegistry.resolve(siteKey || "youtube", page.url());
      if (mod instanceof YouTubeModule || "getFullscreenState" in mod) {
        return await (mod as any).getFullscreenState(page);
      }
      return {
        success: false,
        isFullscreen: false,
        isVideoPlaying: false,
        url: page.url(),
        message: `Fullscreen state inspection not supported on ${mod.displayName}.`,
      };
    } catch (err: any) {
      return {
        success: false,
        isFullscreen: false,
        isVideoPlaying: false,
        url: "",
        message: `Could not retrieve fullscreen state: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Retrieves the supported YouTube commands catalog.
   */
  static async getYouTubeCommandsCatalog(category?: string): Promise<{
    success: boolean;
    catalog: string;
    message: string;
  }> {
    const { formatYouTubeCommandsHelp } = await import("./modules/youtubeCommandCatalog.js");
    const catalog = formatYouTubeCommandsHelp(category);
    return {
      success: true,
      catalog,
      message: "Retrieved YouTube commands catalog.",
    };
  }
}
