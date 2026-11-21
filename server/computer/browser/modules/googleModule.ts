/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule } from "./types.js";

/**
 * Google Search Module
 * Drives general web search without shopping or video assumptions.
 */
export class GoogleModule implements WebsiteModule {
  readonly id = "google";
  readonly displayName = "Google";
  readonly defaultHomeUrl = "https://www.google.com";

  matchesUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("google.com") || lower.includes("google.co");
  }

  async isCaptchaPresent(page: Page): Promise<boolean> {
    try {
      const url = page.url().toLowerCase();
      const title = (await page.title()).toLowerCase();
      if (url.includes("/sorry/index") || title.includes("unusual traffic") || title.includes("recaptcha")) {
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
        "button:has-text('Accept all')",
        "button:has-text('I agree')",
        "button:has-text('Reject all')",
        "button[aria-label*='Accept' i]",
      ];

      for (const sel of consentButtons) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
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

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
          error: "Google unusual traffic / security challenge detected.",
        };
      }

      const inputSelectors = [
        "textarea[name='q']",
        "input[name='q']",
        "input[type='search']",
        "input[type='text']",
      ];

      let foundInput = null;
      let matchedSelector = "";

      for (const sel of inputSelectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 1200 })) {
            foundInput = loc;
            matchedSelector = sel;
            break;
          }
        } catch {
          // Try next
        }
      }

      if (!foundInput) {
        // Fallback: direct navigation to search URL
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        return {
          success: true,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
        };
      }

      console.log(`[GoogleModule] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 2000 });
      await foundInput.fill(cleanQuery, { timeout: 2000 });

      // Verification
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search: press Enter or click submit button
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
        page.keyboard.press("Enter"),
      ]);

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
        error: `Failed to fill and submit Google search: ${err?.message || "Unknown error"}`,
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
        url.toLowerCase().includes("search?q=") ||
        url.toLowerCase().includes(encodeURIComponent(lowerQuery));

      const titleHasQuery =
        title.toLowerCase().includes(lowerQuery) || title.toLowerCase().includes("google");

      const hasResultsContainer = await page
        .locator("#search, #rso, div[data-async-context]")
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (!urlHasQuery && !titleHasQuery && !hasResultsContainer) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to be a Google search results page for "${query}" (URL: ${url}).`,
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
        error: `Could not verify Google search results: ${err?.message || "Unknown error"}`,
      };
    }
  }
}
