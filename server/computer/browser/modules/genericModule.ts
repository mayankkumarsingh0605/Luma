/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule } from "./types.js";

/**
 * Generic Browser Module
 * Operates on arbitrary websites and general web pages without site-specific assumptions.
 */
export class GenericBrowserModule implements WebsiteModule {
  readonly id = "generic";
  readonly displayName = "Generic Browser";
  readonly defaultHomeUrl = "https://www.google.com";

  matchesUrl(_url: string): boolean {
    return true; // Catch-all fallback
  }

  async isCaptchaPresent(page: Page): Promise<boolean> {
    try {
      const title = (await page.title()).toLowerCase();
      if (title.includes("captcha") || title.includes("robot check") || title.includes("verify you are human")) {
        return true;
      }
      return false;
    } catch {
      return false;
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

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
          error: "Security verification detected on page.",
        };
      }

      const inputSelectors = [
        "input[type='search']",
        "input[name='q']",
        "input[name='query']",
        "input[name='search']",
        "input[placeholder*='search' i]",
        "input[aria-label*='search' i]",
        "textarea[name='q']",
        "input[type='text']",
      ];

      let foundInput = null;
      let matchedSelector = "";

      for (const sel of inputSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 1000 })) {
            foundInput = loc;
            matchedSelector = sel;
            break;
          }
        } catch {
          // Try next
        }
      }

      if (!foundInput) {
        // Direct search engine navigation fallback
        console.log(`[GenericBrowserModule] No visible search input; searching via default search engine`);
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        return {
          success: true,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
        };
      }

      console.log(`[GenericBrowserModule] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 2000 });
      await foundInput.fill(cleanQuery, { timeout: 2000 });

      // Verification of typed content
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search
      const submitBtn = page.locator("button[type='submit'], input[type='submit']").first();
      if (await submitBtn.isVisible({ timeout: 400 }).catch(() => false)) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
          submitBtn.click({ timeout: 1500 }),
        ]);
      } else {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
          page.keyboard.press("Enter"),
        ]);
      }

      await page.waitForTimeout(1000);

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
        error: `Failed to search page: ${err?.message || "Unknown error"}`,
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
        url.toLowerCase().includes(encodeURIComponent(lowerQuery)) ||
        url.toLowerCase().includes("search") ||
        url.toLowerCase().includes("q=");

      const titleHasQuery = title.toLowerCase().includes(lowerQuery);

      if (!urlHasQuery && !titleHasQuery) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to reflect results for "${query}" (URL: ${url}).`,
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
        error: `Could not verify results: ${err?.message || "Unknown error"}`,
      };
    }
  }
}
