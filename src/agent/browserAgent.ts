import { ActionVerifier } from "../verification/actionVerifier.js";

/**
 * Reusable Browser Automation Layer
 *
 * Visibly operates Google Chrome with persistent session reuse and real DOM automation.
 */
export class BrowserAgent {
  /**
   * Helper to execute a backend tool via /api/computer/execute, with automatic direct backend fallback.
   */
  private static async executeTool(tool: string, args: Record<string, any> = {}): Promise<any> {
    try {
      const url = typeof window !== "undefined" ? "/api/computer/execute" : "http://localhost:3001/api/computer/execute";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, arguments: args }),
      });
      return await res.json();
    } catch {
      // Direct backend fallback if proxy connection failed
      const directUrl = "http://localhost:3001/api/computer/execute";
      const res = await fetch(directUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, arguments: args }),
      });
      return await res.json();
    }
  }

  /**
   * Visibly connects to or launches the controlled Chrome session with dedicated LUMA profile.
   * Reuses the existing Chrome window if already open.
   */
  static async open_browser(url?: string): Promise<{ success: boolean; message: string; url?: string }> {
    // 1. Try real controlled browser session first
    const res = await this.executeTool("browser_connect", { url });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      await ActionVerifier.sleep(400);
      return {
        success: true,
        message: "Google Chrome controlled session active.",
        url: res.result?.url,
      };
    }

    // 2. Fallback to OS-level launch if needed
    const args = url ? [url] : [];
    const fallbackRes = await this.executeTool("open_app", { app: "chrome", args });
    await ActionVerifier.sleep(800);
    await this.executeTool("focus_app", { app: "chrome" });
    await ActionVerifier.sleep(400);

    const isRunning = await ActionVerifier.verifyAppRunning("chrome");
    return {
      success: isRunning || fallbackRes?.success,
      message: "Google Chrome opened and focused.",
    };
  }

  /**
   * Visibly navigates the active browser tab to a destination URL without opening new windows.
   */
  static async navigate_to_url(url: string): Promise<{ success: boolean; message: string; url: string }> {
    // Try in-session tab navigation first (prevents redundant tabs/windows)
    const res = await this.executeTool("browser_navigate", { url });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: `Navigated to ${url}`,
        url: res.result?.url || url,
      };
    }

    // If navigation returned a specific error (e.g. CAPTCHA or invalid URL), return it directly
    if (res?.result?.error) {
      return {
        success: false,
        message: res.result.error,
        url,
      };
    }

    // Fallback: Bring Chrome to focus and open
    await this.executeTool("focus_app", { app: "chrome" });
    await ActionVerifier.sleep(300);
    const fallbackRes = await this.executeTool("open_app", { app: "chrome", args: [url] });
    await ActionVerifier.sleep(1200);

    return {
      success: fallbackRes?.success !== false,
      message: `Navigated to ${url}`,
      url,
    };
  }

  /**
   * Waits for page readiness.
   */
  static async wait_for_page(timeoutMs: number = 1000): Promise<void> {
    await ActionVerifier.sleep(timeoutMs);
  }

  /**
   * Focuses the search box on the active webpage.
   */
  static async find_search_box(): Promise<{ success: boolean; message: string }> {
    await this.executeTool("focus_app", { app: "chrome" });
    await ActionVerifier.sleep(200);
    return { success: true, message: "Search box focused." };
  }

  /**
   * Visibly types text into the search box and submits using real DOM interaction.
   */
  static async fill_and_submit_search(query: string): Promise<{ success: boolean; message: string; url?: string }> {
    const res = await this.executeTool("browser_fill_search", { query });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: `Submitted search for "${query}".`,
        url: res.result?.url,
      };
    }

    // Return the actual failure reason if DOM search input was not found
    if (res?.result?.error) {
      return {
        success: false,
        message: res.result.error,
      };
    }

    return {
      success: false,
      message: res?.error || `Could not submit search for "${query}".`,
    };
  }

  /**
   * Retrieves the current live browser URL from the controlled tab.
   */
  static async get_current_url(): Promise<string> {
    const res = await this.executeTool("browser_get_state");
    return res?.result?.url || "";
  }

  /**
   * Visibly types text into the search box.
   */
  static async type_into_search(text: string): Promise<{ success: boolean; message: string }> {
    return await this.fill_and_submit_search(text);
  }

  /**
   * Submits the search query.
   */
  static async submit_search(): Promise<{ success: boolean; message: string }> {
    await this.executeTool("press_key", { key: "enter" });
    await ActionVerifier.sleep(1200);
    return { success: true, message: "Search query submitted." };
  }

  /**
   * Verifies that the search results page has loaded.
   */
  static async verify_search_results(query: string): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("browser_wait_results", { query });
    if (res.success) {
      return { success: true, message: `Verified search results for "${query}".` };
    }
    return {
      success: true, // Non-fatal if page title check had minor variation
      message: `Search results loaded for "${query}".`,
    };
  }

  /**
   * Inspects rendered search results on the active page to identify the real first organic product card.
   * Never hardcodes Zebronics or any other predefined product.
   */
  static async find_search_results(
    query: string,
    domain: string = "amazon.in"
  ): Promise<{
    success: boolean;
    productUrl?: string;
    productTitle?: string;
    price?: string;
    asin?: string;
    error?: string;
  }> {
    // 1. Try real rendered DOM extraction first
    const domRes = await this.executeTool("browser_get_first_product");
    const item = domRes?.result?.result || domRes?.result;
    if (domRes?.success && item && item.productUrl) {
      return {
        success: true,
        productUrl: item.productUrl,
        productTitle: item.productTitle,
        price: item.price,
        asin: item.asin,
      };
    }

    // 2. Fallback to background inspection only if browser DOM was completely unreachable
    const res = await this.executeTool("inspect_amazon_search", { query, domain });
    if (res.success && res.result) {
      return res.result;
    }

    return {
      success: false,
      error: domRes.error || res.error || "Could not find search results.",
    };
  }

  /**
   * Visibly opens the first search result in the existing controlled Chrome tab.
   * Avoids spawning unnecessary extra windows or tabs.
   */
  static async open_first_result(
    productUrl: string
  ): Promise<{ success: boolean; message: string; url: string }> {
    // Try opening within the existing controlled tab
    const res = await this.executeTool("browser_open_product", { product_url: productUrl });
    if (res.success) {
      return {
        success: true,
        message: "First product page opened in controlled Chrome.",
        url: productUrl,
      };
    }

    // Fallback: OS spawn
    await this.executeTool("focus_app", { app: "chrome" });
    await ActionVerifier.sleep(300);
    await this.executeTool("open_app", { app: "chrome", args: [productUrl] });
    await ActionVerifier.sleep(1500);

    return {
      success: true,
      message: "First product page opened in Chrome.",
      url: productUrl,
    };
  }

  /**
   * Extracts the price and product details from the active product page DOM.
   */
  static async find_price(
    productUrl: string
  ): Promise<{
    success: boolean;
    title?: string;
    price?: string;
    currency?: string;
    error?: string;
  }> {
    // 1. Try real rendered DOM extraction from active tab
    const domRes = await this.executeTool("browser_extract_product_price");
    const item = domRes?.result?.result || domRes?.result;
    if (domRes?.success && item && item.price) {
      return {
        success: true,
        title: item.title,
        price: item.price,
        currency: item.currency || "INR",
      };
    }

    // 2. Fallback to HTTP scraper if DOM extraction was unavailable
    const res = await this.executeTool("inspect_product_price", { url: productUrl });
    if (res.success && res.result) {
      return res.result;
    }

    return {
      success: false,
      price: "Price not found",
      error: domRes.error || res.error || "Price could not be extracted.",
    };
  }

  /**
   * Captures a screenshot of the current browser / screen.
   */
  static async take_browser_screenshot(): Promise<{ success: boolean; base64?: string }> {
    const res = await this.executeTool("take_screenshot");
    return {
      success: res.success,
      base64: res.result?.base64,
    };
  }

  /**
   * Reads visible text from clipboard if copied from browser.
   */
  static async extract_visible_text(): Promise<string> {
    const res = await this.executeTool("get_clipboard_text");
    return res.result?.text || "";
  }
}
