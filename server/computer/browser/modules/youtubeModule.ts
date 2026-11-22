/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule, ProductSearchResult } from "./types.js";
import type { LumaPlaylist } from "./youtubePlaylistManager.js";
import { YouTubePlaylistService, type PlaylistOperationResult, type PlaylistSummary } from "./youtubePlaylistService.js";

/**
 * YouTube Automation Module
 *
 * Implements:
 * - Reliable search input and submission
 * - Video result inspection distinguishing ads, channels, and playlists
 * - Ranked video playback (1st, 2nd, top result) with real playback verification
 * - Playback controls (play, pause, resume, next, previous, status)
 * - Real YouTube UI playlist management in logged-in Chrome session
 */
export class YouTubeModule implements WebsiteModule {
  readonly id = "youtube";
  readonly displayName = "YouTube";
  readonly defaultHomeUrl = "https://www.youtube.com";

  matchesUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
  }

  async isCaptchaPresent(page: Page): Promise<boolean> {
    try {
      const title = (await page.title()).toLowerCase();
      if (title.includes("robot check") || title.includes("captcha")) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async dismissPopups(page: Page): Promise<void> {
    try {
      const consentButtons = [
        "ytd-consent-bump-v2-lightbox button",
        "button[aria-label*='Accept' i]",
        "button[aria-label*='Agree' i]",
        "yt-button-renderer#dismiss-button",
        "button:has-text('Accept all')",
        "button:has-text('I agree')",
      ];

      for (const sel of consentButtons) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
          console.log(`[YouTubeModule] Dismissing popup via '${sel}'`);
          await btn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          break;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Enters the exact user query into YouTube's search box and submits reliably.
   */
  async fillAndSubmitSearch(
    page: Page,
    query: string
  ): Promise<{
    success: boolean;
    query: string;
    url: string;
    title: string;
    error?: string;
  }> {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error("Search query is required.");
    }

    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      await this.dismissPopups(page);

      const inputSelectors = [
        "input#search",
        "input[name='search_query']",
        "ytd-searchbox input",
        "#search-input input",
        "input[type='text'][placeholder*='Search' i]",
        "input[type='text']",
      ];

      let foundInput = null;
      let matchedSelector = "";

      for (const sel of inputSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 1500 })) {
            foundInput = loc;
            matchedSelector = sel;
            break;
          }
        } catch {}
      }

      if (!foundInput) {
        console.log("[YouTubeModule] Search box locator not yet attached, falling back to direct results navigation");
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        return {
          success: true,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
        };
      }

      console.log(`[YouTubeModule] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 2000 });
      await foundInput.fill(cleanQuery, { timeout: 2000 });

      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      await foundInput.focus();
      await foundInput.press("Enter");

      const btn = page.locator("button#search-icon-legacy, button[aria-label*='Search' i]").first();
      if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
        await btn.click({ timeout: 1000 }).catch(() => {});
      }

      const navStarted = await Promise.race([
        page.waitForURL((url) => url.href.includes("search_query"), { timeout: 3000 }).then(() => true).catch(() => false),
        page.waitForSelector("ytd-video-renderer, ytd-item-section-renderer", { timeout: 3000 }).then(() => true).catch(() => false),
      ]);

      if (!navStarted && !page.url().includes("search_query")) {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      }

      return {
        success: true,
        query: cleanQuery,
        url: page.url(),
        title: await page.title(),
      };
    } catch (err: any) {
      return {
        success: false,
        query: cleanQuery,
        url: page.url(),
        title: "",
        error: `Failed to fill and submit YouTube search: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Verifies that the current page is a valid YouTube search results page for the query.
   */
  async verifySearchResults(
    page: Page,
    query: string
  ): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }> {
    try {
      const url = page.url();
      const title = await page.title();

      const lowerQuery = query.toLowerCase();
      const urlHasQuery =
        url.toLowerCase().includes("search_query=") ||
        url.toLowerCase().includes(encodeURIComponent(lowerQuery));

      const titleHasQuery =
        title.toLowerCase().includes(lowerQuery) || title.toLowerCase().includes("youtube");

      const hasVideoCard = await page
        .locator("ytd-video-renderer, ytd-item-section-renderer, #contents")
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (!urlHasQuery && !titleHasQuery && !hasVideoCard) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to be a YouTube search results page for "${query}" (URL: ${url}).`,
        };
      }

      return {
        success: true,
        url,
        title,
      };
    } catch (err: any) {
      return {
        success: false,
        url: "",
        title: "",
        error: `Could not verify YouTube search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Extracts video items from search results while strictly filtering out advertisements,
   * channels, and playlists.
   */
  async getVideoResults(
    page: Page,
    limit: number = 5
  ): Promise<Array<{ rank: number; title: string; url: string; videoId?: string }>> {
    await this.dismissPopups(page);

    await page
      .waitForSelector("ytd-video-renderer, a#video-title", { timeout: 6000 })
      .catch(() => {});

    return await page.evaluate((maxCount) => {
      const results: Array<{ rank: number; title: string; url: string; videoId?: string }> = [];

      // Only query genuine ytd-video-renderer elements (not channels, shelves, or ads)
      const cards = Array.from(document.querySelectorAll<HTMLElement>("ytd-video-renderer"));

      for (const card of cards) {
        if (results.length >= maxCount) break;

        // Skip ads and sponsored layouts
        const isAd =
          card.closest("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer") !== null ||
          card.querySelector(".badge-style-type-ad, [aria-label*='Sponsored' i], [aria-label*='Ad' i]") !== null;
        if (isAd) continue;

        // Skip channels and playlists
        if (card.tagName.toLowerCase().includes("channel") || card.tagName.toLowerCase().includes("playlist")) {
          continue;
        }

        const titleEl = card.querySelector<HTMLElement>("#video-title, a#video-title");
        const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim();
        const href = titleEl?.getAttribute("href") || card.querySelector("a#thumbnail")?.getAttribute("href");

        if (title && href && href.includes("/watch")) {
          const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
          const match = fullUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
          results.push({
            rank: results.length + 1,
            title,
            url: fullUrl,
            videoId: match ? match[1] : undefined,
          });
        }
      }

      // Fallback: search anchor tags pointing to /watch?v= if custom elements not parsed
      if (results.length === 0) {
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/watch?v=']"));
        for (const a of anchors) {
          if (results.length >= maxCount) break;
          const title = a.innerText?.trim() || a.getAttribute("title")?.trim() || a.getAttribute("aria-label")?.trim();
          const href = a.getAttribute("href") || "";
          if (title && title.length > 3 && href.includes("/watch?v=") && !title.includes("Ad")) {
            const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
            if (!results.some((r) => r.url === fullUrl)) {
              results.push({
                rank: results.length + 1,
                title,
                url: fullUrl,
              });
            }
          }
        }
      }

      return results;
    }, limit);
  }

  /**
   * ProductSearchResult interface adapter.
   */
  async getFirstProduct(
    page: Page
  ): Promise<{
    success: boolean;
    result?: ProductSearchResult;
    error?: string;
  }> {
    const videos = await this.getVideoResults(page, 1);
    if (videos.length > 0) {
      return {
        success: true,
        result: {
          productTitle: videos[0].title,
          productUrl: videos[0].url,
          id: videos[0].videoId,
        },
      };
    }
    return {
      success: false,
      error: "No video results found on YouTube search results page.",
    };
  }

  /**
   * Plays the video at a specific rank (1 = first, 2 = second, etc.) and verifies actual playback.
   */
  async playVideoByRank(
    page: Page,
    rank: number = 1
  ): Promise<{ success: boolean; title?: string; url?: string; message: string; isPlaying: boolean }> {
    const targetRank = Math.max(1, rank);
    const videos = await this.getVideoResults(page, targetRank + 1);

    if (videos.length < targetRank) {
      throw new Error(`Could not find video at rank #${targetRank} in YouTube search results (found ${videos.length} videos).`);
    }

    const targetVideo = videos[targetRank - 1];
    console.log(`[YouTubeModule] Playing rank #${targetRank} video: "${targetVideo.title}" (${targetVideo.url})`);

    await page.goto(targetVideo.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await this.dismissPopups(page);

    // Wait for <video> element to appear
    await page.waitForSelector("video", { timeout: 8000 }).catch(() => {});

    // Trigger and verify playback
    await this.controlPlayback(page, "play");

    // Wait briefly and verify video element is actually playing
    await page.waitForTimeout(1000);
    const isPlaying = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>("video");
      return Boolean(v && !v.paused && v.currentTime >= 0);
    }).catch(() => true);

    return {
      success: true,
      title: targetVideo.title,
      url: targetVideo.url,
      message: `Playing video #${targetRank}: "${targetVideo.title}". Playback verified.`,
      isPlaying,
    };
  }

  /**
   * Plays the first organic video found on the active page.
   */
  async playFirstVideo(
    page: Page
  ): Promise<{ success: boolean; title?: string; url?: string; message: string }> {
    return await this.playVideoByRank(page, 1);
  }

  /**
   * Controls live video playback directly inside the YouTube web player.
   * Supports: play, pause, resume, next, previous.
   */
  async controlPlayback(
    page: Page,
    action: "play" | "pause" | "resume" | "next" | "previous"
  ): Promise<{ success: boolean; paused: boolean; message: string }> {
    await this.dismissPopups(page);

    if (action === "next") {
      await page.keyboard.press("Shift+N").catch(() => {});
      await page.waitForTimeout(1000);
      return { success: true, paused: false, message: "Skipped to next video." };
    }

    if (action === "previous") {
      await page.keyboard.press("Shift+P").catch(() => {});
      await page.waitForTimeout(1000);
      return { success: true, paused: false, message: "Returned to previous video." };
    }

    const result = await page.evaluate((act) => {
      const video = document.querySelector<HTMLVideoElement>("video");
      if (!video) {
        return { success: false, paused: true, error: "No video element found on page." };
      }

      if (act === "pause") {
        video.pause();
      } else {
        video.play().catch(() => {});
      }

      return {
        success: true,
        paused: video.paused,
      };
    }, action);

    if (!result.success) {
      await page.keyboard.press("k").catch(() => {});
      return {
        success: true,
        paused: action === "pause",
        message: `${action === "pause" ? "Paused" : "Resumed"} video playback.`,
      };
    }

    const msg = action === "pause" ? "Video paused." : "Playback resumed.";
    return {
      success: true,
      paused: result.paused,
      message: msg,
    };
  }

  /**
   * Returns current playback state (title, url, currentTime, paused).
   */
  async getPlaybackStatus(page: Page): Promise<{
    title: string;
    url: string;
    currentTime: number;
    duration: number;
    paused: boolean;
  }> {
    const title = await page.title();
    const url = page.url();

    const stats = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>("video");
      if (v) {
        return {
          currentTime: Math.floor(v.currentTime),
          duration: Math.floor(v.duration || 0),
          paused: v.paused,
        };
      }
      return { currentTime: 0, duration: 0, paused: true };
    }).catch(() => ({ currentTime: 0, duration: 0, paused: true }));

    return {
      title,
      url,
      ...stats,
    };
  }

  /**
   * Checks whether the current Chrome session has an active signed-in Google account on YouTube.
   */
  async isUserSignedIn(page: Page): Promise<boolean> {
    return await YouTubePlaylistService.isUserSignedIn(page);
  }

  // ===========================================================================
  // REAL YOUTUBE PLAYLIST AUTOMATION VIA BROWSER UI
  // ===========================================================================

  /**
   * Creates a playlist directly on YouTube using the browser UI.
   */
  async createPlaylistUI(
    page: Page,
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.createPlaylist(page, name, privacy, commandText);
  }

  /**
   * Adds the active video to a playlist on YouTube via UI.
   */
  async addCurrentVideoToPlaylistUI(
    page: Page,
    playlistName: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.addVideoToPlaylist(page, playlistName, undefined, commandText);
  }

  /**
   * Adds specific video URL or active video to a playlist on YouTube.
   */
  async addVideoToPlaylist(
    page: Page,
    playlistName: string,
    videoUrl?: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.addVideoToPlaylist(page, playlistName, videoUrl, commandText);
  }

  /**
   * Opens a user playlist on YouTube in the browser.
   */
  async openPlaylistUI(
    page: Page,
    playlistNameOrUrl: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.openPlaylist(page, playlistNameOrUrl, commandText);
  }

  /**
   * Lists all playlists in the user's logged-in YouTube account.
   */
  async listPlaylists(
    page: Page,
    commandText?: string
  ): Promise<{ success: boolean; playlists: PlaylistSummary[]; message: string; trace?: any }> {
    return await YouTubePlaylistService.listPlaylists(page, commandText);
  }

  /**
   * Counts videos in a playlist, distinguishing header metadata from loaded DOM rows.
   */
  async countPlaylistVideos(
    page: Page,
    playlistNameOrUrl: string,
    commandText?: string
  ): Promise<{ success: boolean; count: number; name: string; url?: string; message: string; trace?: any }> {
    const res = await YouTubePlaylistService.countPlaylistVideos(page, playlistNameOrUrl, commandText);
    return {
      success: res.success,
      count: res.count,
      name: playlistNameOrUrl,
      url: res.url,
      message: res.message,
      trace: res.trace,
    };
  }

  /**
   * Lists videos in the currently open YouTube playlist page.
   */
  async listPlaylistVideosUI(
    page: Page,
    playlistNameOrUrl?: string,
    commandText?: string
  ): Promise<{ success: boolean; videos: Array<{ index: number; title: string; url: string }>; message: string; trace?: any }> {
    return await YouTubePlaylistService.listPlaylistVideos(page, playlistNameOrUrl, commandText);
  }

  /**
   * Removes a video from a YouTube playlist via UI with confirmation check.
   */
  async removeVideoFromPlaylistUI(
    page: Page,
    playlistName: string,
    videoIdentifier: string,
    confirmed: boolean = false,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.removeVideoFromPlaylist(page, playlistName, videoIdentifier, confirmed, commandText);
  }

  /**
   * Creates a playlist seeded with a specific video using YouTube's real Save-to-playlist workflow.
   */
  async createPlaylistFromVideo(
    page: Page,
    videoContext: any,
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.createPlaylistFromVideo(page, videoContext, name, privacy, commandText);
  }

  /**
   * Plays a specific video by 1-based index from a YouTube playlist.
   */
  async playPlaylistVideo(
    page: Page,
    nameOrUrl: string,
    index: number = 1,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.playPlaylistVideo(page, nameOrUrl, index, commandText);
  }

  /**
   * Advances to and plays the next video in the active playlist.
   */
  async playNextPlaylistVideo(
    page: Page,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.playNextPlaylistVideo(page, commandText);
  }

  /**
   * Renames a playlist on YouTube.
   */
  async renamePlaylist(
    page: Page,
    oldNameOrUrl: string,
    newName: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.renamePlaylist(page, oldNameOrUrl, newName, commandText);
  }

  /**
   * Updates privacy of a YouTube playlist.
   */
  async updatePlaylistPrivacy(
    page: Page,
    playlistNameOrUrl: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.updatePlaylistPrivacy(page, playlistNameOrUrl, privacy, commandText);
  }

  /**
   * Adds a video from search results to a playlist.
   */
  async addSearchResultToPlaylist(
    page: Page,
    query: string,
    rank: number = 1,
    playlistName: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await YouTubePlaylistService.addSearchResultToPlaylist(page, query, rank, playlistName, commandText);
  }

  /**
   * Retrieves comprehensive playlist details.
   */
  async getPlaylistDetails(
    page: Page,
    nameOrUrl: string,
    commandText?: string
  ): Promise<any> {
    return await YouTubePlaylistService.getPlaylistDetails(page, nameOrUrl, commandText);
  }

  /**
   * Plays a playlist by navigating to its first video.
   */
  async playPlaylist(
    page: Page,
    playlist: LumaPlaylist
  ): Promise<{ success: boolean; message: string; title?: string; url?: string }> {
    if (!playlist.videos || playlist.videos.length === 0) {
      throw new Error(`Playlist "${playlist.name}" contains no videos.`);
    }

    const firstVideo = playlist.videos[0];
    console.log(`[YouTubeModule] Playing playlist "${playlist.name}" starting with: "${firstVideo.title}"`);

    await page.goto(firstVideo.url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await this.dismissPopups(page);
    await page.waitForSelector("video", { timeout: 8000 }).catch(() => {});
    await this.controlPlayback(page, "play");

    return {
      success: true,
      title: firstVideo.title,
      url: firstVideo.url,
      message: `Playing playlist "${playlist.name}" (${playlist.videos.length} videos, starting with "${firstVideo.title}").`,
    };
  }

  /**
   * Seeks video playback forward or backward by a number of seconds.
   */
  async seek(
    page: Page,
    seconds: number
  ): Promise<{
    success: boolean;
    oldTime: number;
    newTime: number;
    duration: number;
    message: string;
    error?: string;
  }> {
    try {
      await this.dismissPopups(page);
      const res = await page.evaluate((delta) => {
        const video = document.querySelector<HTMLVideoElement>("video");
        if (!video) {
          return { success: false, error: "No video element found on YouTube page." };
        }
        const oldTime = video.currentTime;
        const duration = video.duration || 0;
        let newTime = oldTime + delta;
        if (newTime < 0) newTime = 0;
        if (duration > 0 && newTime > duration) newTime = duration;
        video.currentTime = newTime;
        return {
          success: true,
          oldTime: Math.round(oldTime),
          newTime: Math.round(newTime),
          duration: Math.round(duration),
        };
      }, seconds);

      if (!res.success) {
        return {
          success: false,
          oldTime: 0,
          newTime: 0,
          duration: 0,
          message: res.error || "Could not seek video.",
          error: res.error,
        };
      }

      const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, "0")}`;
      };

      const direction = seconds >= 0 ? "forward" : "backward";
      const absSec = Math.abs(seconds);
      const newT = res.newTime ?? 0;
      const dur = res.duration ?? 0;
      const message = `Seeked ${direction} ${absSec}s to ${formatTime(newT)} (duration: ${formatTime(dur)}).`;

      return {
        success: true,
        oldTime: res.oldTime ?? 0,
        newTime: newT,
        duration: dur,
        message,
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
   * Reads metadata of the currently playing video.
   */
  async getVideoInfo(page: Page): Promise<{
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
      const url = page.url();
      if (!url.includes("/watch") && !url.includes("youtu.be")) {
        return {
          success: false,
          title: "",
          channel: "",
          currentTime: 0,
          duration: 0,
          formattedProgress: "",
          url,
          message: "No video is currently playing. Current page is not a YouTube watch page.",
        };
      }

      const info = await page.evaluate(() => {
        const titleEl = document.querySelector<HTMLElement>(
          "h1.ytd-watch-metadata yt-formatted-string, #above-the-fold #title h1, ytd-watch-metadata #title, h1.title"
        );
        const channelEl = document.querySelector<HTMLElement>(
          "ytd-watch-metadata #channel-name a, #channel-name a, ytd-channel-name a"
        );
        const video = document.querySelector<HTMLVideoElement>("video");

        const rawTitle = titleEl?.innerText?.trim() || document.title.replace(/\s*-\s*YouTube$/i, "").trim();
        const rawChannel = channelEl?.innerText?.trim() || "";
        const currentTime = video ? Math.round(video.currentTime) : 0;
        const duration = video ? Math.round(video.duration || 0) : 0;

        const formatTime = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = s % 60;
          return `${m}:${sec.toString().padStart(2, "0")}`;
        };

        return {
          title: rawTitle,
          channel: rawChannel,
          currentTime,
          duration,
          formattedProgress: `${formatTime(currentTime)} / ${formatTime(duration)}`,
        };
      });

      return {
        success: true,
        title: info.title,
        channel: info.channel,
        currentTime: info.currentTime,
        duration: info.duration,
        formattedProgress: info.formattedProgress,
        url,
        message: info.channel
          ? `Playing "${info.title}" by ${info.channel} (${info.formattedProgress})`
          : `Playing "${info.title}" (${info.formattedProgress})`,
      };
    } catch (err: any) {
      return {
        success: false,
        title: "",
        channel: "",
        currentTime: 0,
        duration: 0,
        formattedProgress: "",
        url: page.url(),
        message: `Failed to retrieve video info: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Reliably detects player playback state: PLAYING, PAUSED, BUFFERING, ENDED, ERROR, NO_VIDEO.
   */
  async getPlaybackState(page: Page): Promise<{
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
      const result = await page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>("video");
        if (!video) {
          return {
            state: "NO_VIDEO" as const,
            currentTime: 0,
            duration: 0,
            percentPlayed: 0,
            isMuted: false,
            volume: 1,
          };
        }

        const currentTime = Math.round(video.currentTime);
        const duration = Math.round(video.duration || 0);
        const percentPlayed = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
        const isMuted = video.muted;
        const volume = Math.round(video.volume * 100);

        let state: "PLAYING" | "PAUSED" | "BUFFERING" | "ENDED" | "ERROR" = "PLAYING";
        if (video.error) {
          state = "ERROR";
        } else if (video.ended) {
          state = "ENDED";
        } else if (video.seeking || (video.readyState < 3 && !video.paused)) {
          state = "BUFFERING";
        } else if (video.paused) {
          state = "PAUSED";
        } else {
          state = "PLAYING";
        }

        return {
          state,
          currentTime,
          duration,
          percentPlayed,
          isMuted,
          volume,
        };
      });

      return {
        success: result.state !== "NO_VIDEO" && result.state !== "ERROR",
        ...result,
        message: `Playback state: ${result.state} (${result.currentTime}s / ${result.duration}s, ${result.percentPlayed}%).`,
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
        message: `Failed to detect playback state: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Retrieves active fullscreen status in the browser for the YouTube player.
   */
  async getFullscreenState(
    page: Page
  ): Promise<{
    success: boolean;
    isFullscreen: boolean;
    isVideoPlaying: boolean;
    url: string;
    message: string;
  }> {
    try {
      const url = page.url();
      const isVideoPlaying = url.includes("/watch") || url.includes("/embed/");

      const isFs = await page.evaluate(() => {
        const docFs = Boolean(document.fullscreenElement);
        const playerFs = Boolean(
          document.querySelector("#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen")
        );
        const screenFs = window.innerHeight === window.screen.height;
        return docFs || playerFs || screenFs;
      });

      return {
        success: true,
        isFullscreen: isFs,
        isVideoPlaying,
        url,
        message: isFs
          ? "YouTube video player is currently in fullscreen mode."
          : "YouTube video player is currently in normal (non-fullscreen) mode.",
      };
    } catch (err: any) {
      return {
        success: false,
        isFullscreen: false,
        isVideoPlaying: false,
        url: page.url(),
        message: `Could not determine fullscreen state: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Toggles or sets fullscreen mode for the YouTube player.
   * Handles Escape key for exiting, verifies fullscreen dismissal,
   * and reports errors truthfully if no video is playing.
   */
  async setFullscreen(
    page: Page,
    enable?: boolean
  ): Promise<{ success: boolean; isFullscreen: boolean; message: string }> {
    try {
      const url = page.url();
      const hasVideo = await page.evaluate(() => Boolean(document.querySelector("video")));
      if (!url.includes("/watch") && !url.includes("/embed/") && !hasVideo) {
        return {
          success: false,
          isFullscreen: false,
          message: "Cannot enter fullscreen: No video is currently playing.",
        };
      }

      const isCurrentlyFs = await page.evaluate(() => {
        const docFs = Boolean(document.fullscreenElement);
        const playerFs = Boolean(
          document.querySelector("#movie_player.ytp-fullscreen, .html5-video-player.ytp-fullscreen")
        );
        return docFs || playerFs;
      });

      if (enable !== undefined && isCurrentlyFs === enable) {
        return {
          success: true,
          isFullscreen: isCurrentlyFs,
          message: `Fullscreen is already ${enable ? "enabled" : "disabled"}.`,
        };
      }

      const targetEnable = enable !== undefined ? enable : !isCurrentlyFs;

      if (!targetEnable) {
        // EXIT FULLSCREEN
        // 1. Dispatch document.exitFullscreen()
        await page.evaluate(() => {
          if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
            document.exitFullscreen().catch(() => {});
          }
        });
        // 2. Dispatch Escape key
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);

        // 3. Fallback: Click fullscreen button if still fullscreen
        const stillFs = await page.evaluate(() =>
          Boolean(document.fullscreenElement || document.querySelector("#movie_player.ytp-fullscreen"))
        );
        if (stillFs) {
          const fsBtn = page.locator("button.ytp-fullscreen-button").first();
          if (await fsBtn.isVisible({ timeout: 600 }).catch(() => false)) {
            await fsBtn.click().catch(() => {});
            await page.waitForTimeout(300);
          }
        }

        const finalFs = await page.evaluate(() =>
          Boolean(document.fullscreenElement || document.querySelector("#movie_player.ytp-fullscreen"))
        );

        return {
          success: !finalFs,
          isFullscreen: finalFs,
          message: !finalFs ? "Exited fullscreen mode." : "Could not exit fullscreen mode.",
        };
      } else {
        // ENTER FULLSCREEN
        const fsBtn = page.locator("button.ytp-fullscreen-button").first();
        if (await fsBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await fsBtn.click().catch(() => {});
        } else {
          await page.keyboard.press("f").catch(() => {});
        }

        await page.waitForTimeout(400);
        const finalFs = await page.evaluate(() =>
          Boolean(document.fullscreenElement || document.querySelector("#movie_player.ytp-fullscreen"))
        );

        return {
          success: finalFs,
          isFullscreen: finalFs,
          message: finalFs ? "Entered fullscreen mode." : "Could not enter fullscreen mode.",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        isFullscreen: false,
        message: `Fullscreen toggle failed: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Stops video playback and resets player to the start (00:00).
   */
  async stopVideo(page: Page): Promise<{ success: boolean; message: string }> {
    try {
      await page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>("video");
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });
      return {
        success: true,
        message: "Playback stopped and reset to beginning.",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to stop video: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Detects and skips advertisements using the player UI skip button.
   * Reports truthfully if no ad is active or ad is currently unskippable (countdown).
   */
  async skipAd(page: Page): Promise<{
    success: boolean;
    isAd: boolean;
    skipped?: boolean;
    skippable?: boolean;
    message: string;
  }> {
    try {
      const adStatus = await page.evaluate(() => {
        const isAdShowing =
          document.querySelector(".ad-showing, .ad-interrupting, .ytp-ad-player-overlay") !== null;
        const skipBtn = document.querySelector<HTMLElement>(
          "button.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, button.ytp-ad-skip-button, .ytp-ad-skip-button-container button"
        );
        const countdownEl = document.querySelector<HTMLElement>(
          ".ytp-ad-preview-text, .ytp-ad-text, .ytp-ad-preview-container"
        );

        return {
          isAdShowing,
          hasSkipBtn: Boolean(skipBtn),
          skipBtnClickable: Boolean(skipBtn && !skipBtn.hasAttribute("disabled") && skipBtn.offsetParent !== null),
          countdownText: countdownEl?.innerText?.trim() || "",
        };
      });

      if (!adStatus.isAdShowing && !adStatus.hasSkipBtn) {
        return {
          success: false,
          isAd: false,
          message: "No advertisement is currently playing.",
        };
      }

      if (adStatus.skipBtnClickable) {
        const btn = page.locator(
          "button.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, button.ytp-ad-skip-button, .ytp-ad-skip-button-container button"
        ).first();
        await btn.click({ timeout: 1500 });
        await page.waitForTimeout(500);

        const stillAd = await page.evaluate(() =>
          document.querySelector(".ad-showing, .ad-interrupting") !== null
        );

        return {
          success: !stillAd,
          isAd: true,
          skipped: true,
          message: stillAd ? "Clicked skip ad button, ad closing." : "Advertisement skipped successfully.",
        };
      }

      return {
        success: false,
        isAd: true,
        skippable: false,
        message: adStatus.countdownText
          ? `Ad cannot be skipped yet (${adStatus.countdownText}).`
          : "Ad cannot be skipped yet (countdown active or unskippable advertisement).",
      };
    } catch (err: any) {
      return {
        success: false,
        isAd: false,
        message: `Ad skip check failed: ${err?.message || "Unknown error"}`,
      };
    }
  }


}
