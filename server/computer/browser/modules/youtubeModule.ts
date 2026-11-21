/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule, ProductSearchResult } from "./types.js";
import type { LumaPlaylist } from "./youtubePlaylistManager.js";

/**
 * YouTube Automation Module
 *
 * Implements Stage A (reliable search, video selection, playback control)
 * and Stage B (playlist creation, batch addition, playback, and management).
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
      // YouTube Cookie / Consent Bump overlay
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
          console.log(`[YouTubeModule] Dismissing consent popup via '${sel}'`);
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

      // YouTube search input selectors (Polymer/Lit custom elements)
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
        } catch {
          // Try next
        }
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

      // Verification of typed content
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search: focus input, press Enter, and try clicking search icon
      await foundInput.focus();
      await foundInput.press("Enter");

      const btn = page.locator("button#search-icon-legacy, button[aria-label*='Search' i]").first();
      if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
        await btn.click({ timeout: 1000 }).catch(() => {});
      }

      // SPA Wait: wait for URL to reflect search query or video renderers to appear
      const navStarted = await Promise.race([
        page.waitForURL((url) => url.href.includes("search_query"), { timeout: 3000 }).then(() => true).catch(() => false),
        page.waitForSelector("ytd-video-renderer, ytd-item-section-renderer", { timeout: 3000 }).then(() => true).catch(() => false),
      ]);

      if (!navStarted && !page.url().includes("search_query")) {
        console.log("[YouTubeModule] Direct search URL navigation fallback");
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
   * Extracts the first organic video item from the rendered search results.
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
   * Extracts multiple video items from search results (for batch playlist addition).
   */
  async getVideoResults(
    page: Page,
    limit: number = 3
  ): Promise<Array<{ title: string; url: string; videoId?: string }>> {
    await this.dismissPopups(page);

    await page
      .waitForSelector("ytd-video-renderer, a#video-title", { timeout: 6000 })
      .catch(() => {});

    return await page.evaluate((maxCount) => {
      const results: Array<{ title: string; url: string; videoId?: string }> = [];
      const cards = Array.from(document.querySelectorAll("ytd-video-renderer"));

      for (const card of cards) {
        if (results.length >= maxCount) break;

        const titleEl = card.querySelector<HTMLElement>("#video-title, a#video-title");
        const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim();
        const href = titleEl?.getAttribute("href") || card.querySelector("a#thumbnail")?.getAttribute("href");

        if (title && href && href.includes("/watch")) {
          const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
          const match = fullUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
          results.push({
            title,
            url: fullUrl,
            videoId: match ? match[1] : undefined,
          });
        }
      }

      // Fallback: search all anchor tags pointing to /watch?v=
      if (results.length === 0) {
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/watch?v=']"));
        for (const a of anchors) {
          if (results.length >= maxCount) break;
          const title = a.innerText?.trim() || a.getAttribute("title")?.trim() || a.getAttribute("aria-label")?.trim();
          const href = a.getAttribute("href") || "";
          if (title && title.length > 4 && href.includes("/watch?v=")) {
            const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
            if (!results.some((r) => r.url === fullUrl)) {
              results.push({
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
   * Plays the first organic video found on the active page.
   */
  async playFirstVideo(
    page: Page
  ): Promise<{ success: boolean; title?: string; url?: string; message: string }> {
    const first = await this.getFirstProduct(page);
    if (!first.success || !first.result) {
      throw new Error("Could not find any video result to play.");
    }

    const { productTitle, productUrl } = first.result;
    console.log(`[YouTubeModule] Playing first video: "${productTitle}" (${productUrl})`);

    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await this.dismissPopups(page);

    // Wait for <video> element to appear and start playback
    await page.waitForSelector("video", { timeout: 8000 }).catch(() => {});
    await this.controlPlayback(page, "play");

    return {
      success: true,
      title: productTitle,
      url: productUrl,
      message: `Playing video: "${productTitle}".`,
    };
  }

  /**
   * Controls live video playback directly inside the YouTube web player.
   */
  async controlPlayback(
    page: Page,
    action: "play" | "pause" | "resume"
  ): Promise<{ success: boolean; paused: boolean; message: string }> {
    await this.dismissPopups(page);

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
      // Fallback: press Space or 'k' on player
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
   * Checks whether the current Chrome session has an active signed-in Google account on YouTube.
   */
  async isUserSignedIn(page: Page): Promise<boolean> {
    try {
      const avatarBtn = page.locator("ytd-topbar-menu-button-renderer #avatar-btn, button#avatar-btn, #avatar-btn").first();
      const hasAvatar = await avatarBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (hasAvatar) return true;

      const signInBtn = page.locator("a[href*='accounts.google.com'][aria-label*='Sign in' i], a:has-text('Sign in')").first();
      const hasSignIn = await signInBtn.isVisible({ timeout: 1000 }).catch(() => false);
      return !hasSignIn;
    } catch {
      return false;
    }
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
}
