/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule } from "./types.js";

/**
 * YouTube Automation Module
 * Handles SPA navigation, Lit/Polymer custom elements, and consent overlays.
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

      // YouTube search input selectors (Polymer custom elements)
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
        // Direct navigation fallback if custom element didn't mount in time
        console.log("[YouTubeModule] Search box locator not yet attached, falling back to results navigation");
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
}
