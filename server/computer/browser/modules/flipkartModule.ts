/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule, ProductSearchResult, ExtractedPriceResult } from "./types.js";

/**
 * Flipkart Automation Module
 * Completely isolated from Amazon — uses genuine Flipkart DOM selectors and rules.
 */
export class FlipkartModule implements WebsiteModule {
  readonly id = "flipkart";
  readonly displayName = "Flipkart";
  readonly defaultHomeUrl = "https://www.flipkart.com";

  matchesUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("flipkart.com");
  }

  async isCaptchaPresent(page: Page): Promise<boolean> {
    try {
      const title = (await page.title()).toLowerCase();
      if (title.includes("robot check") || title.includes("captcha") || title.includes("verify you are human")) {
        return true;
      }
      const pageText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");
      if (
        pageText.includes("please enter the characters you see") ||
        pageText.includes("access to this page has been denied") ||
        pageText.includes("something went wrong") && pageText.includes("try refreshing")
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async dismissPopups(page: Page): Promise<void> {
    try {
      // Flipkart often presents a login overlay/modal on fresh sessions
      const closeButtons = [
        "button._2KpZ6l._2doB4z",
        "span._30XB9F",
        "button[class*='close' i]",
        "div[class*='close' i] > span",
        "span[role='button']:has-text('✕')",
        "button:has-text('✕')",
      ];

      for (const sel of closeButtons) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log(`[FlipkartModule] Dismissing login popup via '${sel}'`);
          await btn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          break;
        }
      }
    } catch {
      // Non-fatal if no popup was open
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
          error: "Flipkart security verification or blocked page detected. Please complete verification in browser.",
        };
      }

      // Flipkart-specific search input selectors
      const inputSelectors = [
        "input[name='q']",
        "input.Pke_EE",
        "input[title*='Search' i]",
        "input[placeholder*='Search' i]",
        "input[type='search']",
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
        return {
          success: false,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
          error: "Could not locate Flipkart search input box on the active webpage.",
        };
      }

      console.log(`[FlipkartModule] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 3000 });
      await foundInput.fill(cleanQuery, { timeout: 3000 });

      // Verification of typed content
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search: focus input and press Enter
      await foundInput.focus();
      await foundInput.press("Enter");

      // Also try clicking search button if visible
      const submitSelectors = [
        "button[type='submit']",
        "button._2iLD__",
        "button[aria-label*='Search' i]",
      ];

      for (const btnSel of submitSelectors) {
        try {
          const btn = page.locator(btnSel).first();
          if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
            await btn.click({ timeout: 1000 }).catch(() => {});
            break;
          }
        } catch {
          // Try next
        }
      }

      // Check if URL navigated to search results; if not within 2.5s, direct search URL navigation
      const navStarted = await page
        .waitForURL((u) => u.href.includes("q=") || u.href.includes("search"), { timeout: 2500 })
        .then(() => true)
        .catch(() => false);

      if (!navStarted && !page.url().includes("q=")) {
        console.log("[FlipkartModule] Direct search URL navigation fallback");
        const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(cleanQuery)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      }

      await page.waitForTimeout(1000);
      await this.dismissPopups(page);

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
        error: `Failed to fill and submit Flipkart search for "${cleanQuery}": ${err?.message || "Unknown error"}`,
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

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          url,
          title,
          error: "Flipkart security challenge encountered on results page.",
        };
      }

      const lowerQuery = query.toLowerCase();
      const urlHasQuery =
        url.toLowerCase().includes("flipkart.com") &&
        (url.toLowerCase().includes("q=") || url.toLowerCase().includes("search") || url.toLowerCase().includes("marketplace="));
      const titleHasQuery =
        title.toLowerCase().includes(lowerQuery) || title.toLowerCase().includes("flipkart");

      if (!urlHasQuery && !titleHasQuery) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to be a Flipkart search results page for "${query}" (URL: ${url}).`,
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
        error: `Could not verify Flipkart search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  async getFirstProduct(
    page: Page
  ): Promise<{
    success: boolean;
    result?: ProductSearchResult;
    error?: string;
  }> {
    try {
      await this.dismissPopups(page);

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "Flipkart security challenge encountered. Cannot inspect search results.",
        };
      }

      // Wait for Flipkart result cards
      await page.waitForSelector(
        "div[data-id], div._75nlfW, div.cPHDOP, div._1AtVbE, div.slAVV4, div._2kHMtA, div._4ddWXP",
        { timeout: 8000 }
      ).catch(() => {});

      const product = await page.evaluate(() => {
        // Collect candidate result cards
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "div[data-id], div._75nlfW, div.cPHDOP, div._1AtVbE, div.slAVV4, div._2kHMtA, div._4ddWXP"
          )
        );

        for (const card of cards) {
          const id = card.getAttribute("data-id")?.trim();

          // Title selection on Flipkart
          const titleEl =
            card.querySelector<HTMLElement>("div.KzDlHZ") ||
            card.querySelector<HTMLElement>("a.wjcEIp") ||
            card.querySelector<HTMLElement>("a.WKTcLC") ||
            card.querySelector<HTMLElement>("a.IRpwTa") ||
            card.querySelector<HTMLElement>("div._4rR01T") ||
            card.querySelector<HTMLElement>("a[title]");

          const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim();
          if (!title || title.length < 3) {
            continue;
          }

          // Exclude header / footer navigation elements
          if (/^(?:login|cart|become\s+a\s+seller|sell\s+online|explore|plus|more)$/i.test(title)) {
            continue;
          }

          // Link selection on Flipkart
          const linkEl =
            card.querySelector<HTMLAnchorElement>("a[href*='/p/']") ||
            card.querySelector<HTMLAnchorElement>("a._1fQZEK") ||
            card.querySelector<HTMLAnchorElement>("a.CGtC58") ||
            card.querySelector<HTMLAnchorElement>("a.VJA3rP") ||
            card.querySelector<HTMLAnchorElement>("a.s1Q9rs") ||
            card.querySelector<HTMLAnchorElement>("a[href*='flipkart.com']");

          const href = linkEl?.getAttribute("href")?.trim();
          if (!href || href.startsWith("javascript") || href === "#") {
            continue;
          }

          const fullUrl = href.startsWith("http") ? href : `${window.location.origin}${href}`;

          // Price selection on Flipkart
          const priceEl =
            card.querySelector<HTMLElement>("div.Nx9bqj") ||
            card.querySelector<HTMLElement>("div._30jeq3") ||
            card.querySelector<HTMLElement>("div._16Jk6d");

          let price = priceEl?.innerText?.trim();
          if (price && !price.includes("₹")) {
            price = `₹${price.replace(/[,.\s]*$/, "")}`;
          }

          return {
            productTitle: title,
            productUrl: fullUrl,
            id: id || undefined,
            price: price || undefined,
          };
        }

        return null;
      });

      if (!product || !product.productUrl) {
        return {
          success: false,
          error: "No valid organic product cards could be identified on the Flipkart results page.",
        };
      }

      return {
        success: true,
        result: product,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to inspect Flipkart search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  async extractProductPrice(
    page: Page
  ): Promise<{
    success: boolean;
    result?: ExtractedPriceResult;
    error?: string;
  }> {
    try {
      await this.dismissPopups(page);

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "Flipkart security challenge encountered on product page.",
        };
      }

      await page.waitForSelector("span.VU-ZEz, span.B_NuCI, h1", { timeout: 6000 }).catch(() => {});

      const details = await page.evaluate(() => {
        // Title on product page
        const titleEl =
          document.querySelector<HTMLElement>("span.VU-ZEz") ||
          document.querySelector<HTMLElement>("span.B_NuCI") ||
          document.querySelector<HTMLElement>("h1.yhB1nd") ||
          document.querySelector<HTMLElement>("h1");

        const title = titleEl?.innerText?.trim() || document.title;

        // Price on product page
        const priceSelectors = [
          "div.Nx9bqj.CxhGGd",
          "div._30jeq3._16Jk6d",
          "div.Nx9bqj",
          "div._30jeq3",
          "div[class*='Nx9bqj']",
          "div[class*='_30jeq3']",
        ];

        let priceText = "";
        for (const sel of priceSelectors) {
          const el = document.querySelector<HTMLElement>(sel);
          if (el && el.innerText?.trim()) {
            priceText = el.innerText.trim();
            break;
          }
        }

        if (priceText && !priceText.includes("₹")) {
          priceText = `₹${priceText.replace(/[,.\s]*$/, "")}`;
        }

        return {
          title,
          price: priceText || "Price details on page",
          currency: "INR",
          url: window.location.href,
        };
      });

      if (!details || !details.title) {
        return {
          success: false,
          error: "Could not read product details from the active Flipkart product page.",
        };
      }

      return {
        success: true,
        result: details,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to extract Flipkart product price: ${err?.message || "Unknown error"}`,
      };
    }
  }
}
