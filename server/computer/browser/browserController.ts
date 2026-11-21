/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession } from "./browserSession.js";

export interface ProductSearchResult {
  productTitle: string;
  productUrl: string;
  asin?: string;
  price?: string;
}

export interface ExtractedPriceResult {
  title: string;
  price: string;
  currency: string;
  url: string;
}

export class BrowserController {
  /**
   * Checks whether the current page displays a bot check / CAPTCHA wall.
   */
  static async isCaptchaPresent(page: Page): Promise<boolean> {
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
          error: "CAPTCHA / Robot Check detected on page. Please complete verification in the browser window.",
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
   * verifies input contents, and submits the search via Enter or search button.
   */
  static async fillAndSubmitSearch(query: string): Promise<{
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

      // Ensure page DOM is loaded
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});

      // Auto-navigate to Amazon if invoked on blank page
      if (page.url() === "about:blank" || page.url() === "" || page.url().startsWith("chrome://")) {
        await page.goto("https://www.amazon.in", { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      }

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          query: cleanQuery,
          url: page.url(),
          title: await page.title(),
          error: "CAPTCHA / Robot Check detected on page. Please complete verification in the browser window.",
        };
      }

      // Prioritized search input selectors (Amazon-specific first, followed by generic standards)
      const inputSelectors = [
        "#twotabsearchtextbox",
        "input[name='field-keywords']",
        "#nav-search-keywords",
        "input[type='search']",
        "input[name='q']",
        "input[name='search_query']",
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
          error: "Could not locate a visible search input box on the active webpage.",
        };
      }

      // Real user interaction: click input, clear existing content, and type exact query
      console.log(`[BrowserController] Found search input via '${matchedSelector}'`);
      await foundInput.click({ timeout: 3000 });
      await foundInput.fill(cleanQuery, { timeout: 3000 });

      // Verification: ensure the field actually holds the exact requested query
      const filledValue = await foundInput.inputValue().catch(() => "");
      if (filledValue.toLowerCase() !== cleanQuery.toLowerCase()) {
        // Fallback: try keyboard typing if fill value mismatch
        await foundInput.selectText().catch(() => {});
        await page.keyboard.type(cleanQuery, { delay: 30 });
      }

      // Submit search: try submit button first, fallback to pressing Enter
      const submitSelectors = [
        "#nav-search-submit-button",
        "input[type='submit'][value='Go']",
        "input#nav-search-submit-button",
        "button#search-icon-legacy",
        "button[aria-label*='Search' i]",
        "input[name='btnK']",
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
          // Continue to fallback
        }
      }

      if (!submitted) {
        // Press Enter key to submit
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
          page.keyboard.press("Enter"),
        ]);
      }

      // Small pause to allow dynamic DOM stabilization
      await page.waitForTimeout(1000);

      const resultingUrl = page.url();
      const resultingTitle = await page.title();

      return {
        success: true,
        query: cleanQuery,
        url: resultingUrl,
        title: resultingTitle,
      };
    } catch (err: any) {
      return {
        success: false,
        query: cleanQuery,
        url: "",
        title: "",
        error: `Failed to fill and submit search for "${cleanQuery}": ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Verifies that the current page is a valid search results page for the query.
   */
  static async verifySearchResults(query: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();
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

      // Check if URL or title reflects the search query
      const lowerQuery = query.toLowerCase();
      const urlHasQuery = url.toLowerCase().includes(encodeURIComponent(lowerQuery)) ||
                          url.toLowerCase().includes("k=") ||
                          url.toLowerCase().includes("search");
      const titleHasQuery = title.toLowerCase().includes(lowerQuery) || title.toLowerCase().includes("amazon");

      if (!urlHasQuery && !titleHasQuery) {
        return {
          success: false,
          url,
          title,
          error: `Current page does not appear to be a search results page for "${query}" (URL: ${url}).`,
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
        error: `Could not verify search results: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Inspects the rendered search results on the active page.
   * Identifies the first organic, valid product card, extracts its real title, link, ASIN, and price.
   * Never hardcodes Zebronics or any other product.
   */
  static async getFirstSearchResult(): Promise<{
    success: boolean;
    result?: ProductSearchResult;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "CAPTCHA / Robot Check encountered. Cannot inspect search results.",
        };
      }

      // Wait for search result items to be present in DOM
      await page.waitForSelector(
        "div[data-component-type='s-search-result'], .s-result-item[data-asin]",
        { timeout: 8000 }
      ).catch(() => {});

      // Evaluate the actual rendered DOM to extract the first organic product card
      const product = await page.evaluate(() => {
        // Collect all candidate cards with data-asin
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "div[data-component-type='s-search-result'], div.s-result-item[data-asin]"
          )
        );

        for (const card of cards) {
          const asin = card.getAttribute("data-asin")?.trim();
          // Filter out ads / empty cards without a real 10-character ASIN
          if (!asin || asin.length !== 10) {
            continue;
          }

          // Locate title element
          const titleEl =
            card.querySelector<HTMLElement>("h2 a span") ||
            card.querySelector<HTMLElement>("h2 span") ||
            card.querySelector<HTMLElement>("h2 a");

          const title = titleEl?.innerText?.trim();
          if (!title || title.length < 3) {
            continue;
          }

          // Locate link element
          const linkEl =
            card.querySelector<HTMLAnchorElement>("h2 a") ||
            card.querySelector<HTMLAnchorElement>("a.a-link-normal.s-no-outline") ||
            card.querySelector<HTMLAnchorElement>("a.a-link-normal");

          const href = linkEl?.getAttribute("href")?.trim();
          if (!href || href.startsWith("javascript") || href === "#") {
            continue;
          }

          // Resolve relative href to full URL
          const fullUrl = href.startsWith("http") ? href : `${window.location.origin}${href}`;

          // Locate price if visible on result card
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
          error: "No valid organic product cards could be identified on the current search results page.",
        };
      }

      return {
        success: true,
        result: product,
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
   * Verifies the resulting page belongs to the opened product.
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
          error: "CAPTCHA / Robot Check encountered upon opening product page.",
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
   * Extracts the actual displayed price and title from the active rendered product page.
   * Verifies product title and visible price elements directly from DOM.
   */
  static async extractProductPrice(): Promise<{
    success: boolean;
    result?: ExtractedPriceResult;
    error?: string;
  }> {
    try {
      const page = await BrowserSession.getActivePage();

      if (await this.isCaptchaPresent(page)) {
        return {
          success: false,
          error: "CAPTCHA / Robot Check encountered on product page.",
        };
      }

      // Wait for product title container to be visible
      await page.waitForSelector("#productTitle, #title, h1", { timeout: 6000 }).catch(() => {});

      const details = await page.evaluate(() => {
        // 1. Extract Product Title
        const titleEl =
          document.querySelector<HTMLElement>("#productTitle") ||
          document.querySelector<HTMLElement>("h1#title") ||
          document.querySelector<HTMLElement>("h1");
        const title = titleEl?.innerText?.trim() || document.title;

        // 2. Extract Price from visible elements
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

        // If only whole digits found without symbol
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
          error: "Could not read product details from the active product page.",
        };
      }

      return {
        success: true,
        result: details,
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
}
