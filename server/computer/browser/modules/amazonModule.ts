/// <reference lib="dom" />
import type { Page } from "playwright-core";
import type { WebsiteModule, ProductSearchResult, ExtractedPriceResult } from "./types.js";

/**
 * Isolated, Protected Amazon Module
 * Preserves all battle-tested Amazon automation rules and selectors.
 */
export class AmazonModule implements WebsiteModule {
  readonly id = "amazon";
  readonly displayName = "Amazon";
  readonly defaultHomeUrl = "https://www.amazon.in";

  matchesUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("amazon.in") || lower.includes("amazon.com") || lower.includes("amazon.");
  }

  async isCaptchaPresent(page: Page): Promise<boolean> {
    try {
      const title = (await page.title()).toLowerCase();
      if (title.includes("robot check") || title.includes("captcha")) {
        return true;
      }
      const pageText = await page.evaluate(() => document.body?.innerText?.toLowerCase() || "");
      if (
        pageText.includes("enter the characters you see below") ||
        pageText.includes("type the characters you see in this image") ||
        pageText.includes("to discuss automated access to amazon data")
      ) {
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
          error: "CAPTCHA / Robot Check detected on page. Please complete verification in the browser window.",
        };
      }

      // Prioritized Amazon search input selectors
      const inputSelectors = [
        "#twotabsearchtextbox",
        "input[name='field-keywords']",
        "#nav-search-keywords",
        "input[type='search']",
        "input[type='text'][placeholder*='search' i]",
        "input[aria-label*='search' i]",
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
          // Try next selector
        }
      }

      if (!foundInput) {
        return {
          success: false,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
          error: "Could not locate Amazon search input box on the active webpage.",
        };
      }

      console.log(`[AmazonModule] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 3000 });
      await foundInput.fill(cleanQuery, { timeout: 3000 });

      // Verification: ensure the field actually holds the exact requested query
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search: try Amazon submit button first, fallback to Enter
      const submitSelectors = [
        "#nav-search-submit-button",
        "input[type='submit'][value='Go']",
        "input#nav-search-submit-button",
        "button[type='submit']",
      ];

      let submitted = false;
      for (const btnSel of submitSelectors) {
        try {
          const btn = page.locator(btnSel).first();
          if (await btn.isVisible({ timeout: 600 })) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
              btn.click({ timeout: 2000 }),
            ]);
            submitted = true;
            break;
          }
        } catch {
          // Continue
        }
      }

      if (!submitted) {
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
        error: `Failed to fill and submit Amazon search for "${cleanQuery}": ${err?.message || "Unknown error"}`,
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
          error: "CAPTCHA / Robot Check encountered on results page.",
        };
      }

      const lowerQuery = query.toLowerCase();
      const urlHasQuery =
        url.toLowerCase().includes(encodeURIComponent(lowerQuery)) ||
        url.toLowerCase().includes("k=") ||
        url.toLowerCase().includes("search");
      const titleHasQuery =
        title.toLowerCase().includes(lowerQuery) || title.toLowerCase().includes("amazon");

      if (!urlHasQuery && !titleHasQuery) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to be an Amazon search results page for "${query}" (URL: ${url}).`,
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
        error: `Could not verify Amazon search results: ${err?.message || "Unknown error"}`,
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
      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "CAPTCHA / Robot Check encountered. Cannot inspect search results.",
        };
      }

      await page.waitForSelector(
        "div[data-component-type='s-search-result'], .s-result-item[data-asin]",
        { timeout: 8000 }
      ).catch(() => {});

      const product = await page.evaluate(() => {
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "div[data-component-type='s-search-result'], div.s-result-item[data-asin]"
          )
        );

        for (const card of cards) {
          const asin = card.getAttribute("data-asin")?.trim();
          if (!asin || asin.length !== 10) {
            continue;
          }

          const titleEl =
            card.querySelector<HTMLElement>("h2 a span") ||
            card.querySelector<HTMLElement>("h2 span") ||
            card.querySelector<HTMLElement>("h2 a");

          const title = titleEl?.innerText?.trim();
          if (!title || title.length < 3) {
            continue;
          }

          const linkEl =
            card.querySelector<HTMLAnchorElement>("h2 a") ||
            card.querySelector<HTMLAnchorElement>("a.a-link-normal.s-no-outline") ||
            card.querySelector<HTMLAnchorElement>("a.a-link-normal");

          const href = linkEl?.getAttribute("href")?.trim();
          if (!href || href.startsWith("javascript") || href === "#") {
            continue;
          }

          const fullUrl = href.startsWith("http") ? href : `${window.location.origin}${href}`;

          const priceWhole = card.querySelector<HTMLElement>(".a-price .a-price-whole")?.innerText?.trim();
          const priceSymbol = card.querySelector<HTMLElement>(".a-price .a-price-symbol")?.innerText?.trim() || "₹";
          const offscreenPrice = card.querySelector<HTMLElement>(".a-price .a-offscreen")?.innerText?.trim();

          const price = offscreenPrice || (priceWhole ? `${priceSymbol}${priceWhole.replace(/[,.\s]*$/, "")}` : undefined);

          return {
            productTitle: title,
            productUrl: fullUrl,
            asin,
            price,
          };
        }

        return null;
      });

      if (!product || !product.productUrl) {
        return {
          success: false,
          error: "No valid organic product cards could be identified on the Amazon results page.",
        };
      }

      return {
        success: true,
        result: product,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to inspect Amazon search results: ${err?.message || "Unknown error"}`,
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
      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "CAPTCHA / Robot Check encountered on product page.",
        };
      }

      await page.waitForSelector("#productTitle, #title, h1", { timeout: 6000 }).catch(() => {});

      const details = await page.evaluate(() => {
        const titleEl =
          document.querySelector<HTMLElement>("#productTitle") ||
          document.querySelector<HTMLElement>("h1#title") ||
          document.querySelector<HTMLElement>("h1");
        const title = titleEl?.innerText?.trim() || document.title;

        const priceSelectors = [
          "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
          "#corePrice_feature_div .a-price .a-offscreen",
          "#apex_desktop .a-price .a-offscreen",
          "#priceblock_ourprice",
          "#priceblock_dealprice",
          "span.a-price.a-text-price span.a-offscreen",
          ".priceToPay span.a-price-whole",
          ".a-price .a-offscreen",
        ];

        let priceText = "";
        for (const sel of priceSelectors) {
          const el = document.querySelector<HTMLElement>(sel);
          if (el && el.innerText?.trim()) {
            priceText = el.innerText.trim();
            break;
          }
        }

        if (priceText && !priceText.includes("₹") && !priceText.includes("$") && !priceText.includes("€")) {
          const symbol = document.querySelector<HTMLElement>(".a-price-symbol")?.innerText?.trim() || "₹";
          priceText = `${symbol}${priceText.replace(/[,.\s]*$/, "")}`;
        }

        const currency = priceText.includes("₹")
          ? "INR"
          : priceText.includes("$")
          ? "USD"
          : priceText.includes("€")
          ? "EUR"
          : priceText.includes("£")
          ? "GBP"
          : "INR";

        return {
          title,
          price: priceText || "Price details on page",
          currency,
          url: window.location.href,
        };
      });

      if (!details || !details.title) {
        return {
          success: false,
          error: "Could not read product details from the active Amazon product page.",
        };
      }

      return {
        success: true,
        result: details,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to extract Amazon product price: ${err?.message || "Unknown error"}`,
      };
    }
  }
}
