import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
};

export class BrowserInspectController {
  /**
   * Inspects Amazon search results to locate the first organic product URL, title, and initial price.
   */
  static async inspectAmazonSearch(
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
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      throw new Error("Search query is required.");
    }

    const searchUrl = `https://www.${domain}/s?k=${encodeURIComponent(cleanQuery)}`;

    try {
      const res = await fetch(searchUrl, {
        headers: BROWSER_HEADERS,
      });

      if (!res.ok) {
        throw new Error(`Amazon responded with HTTP status ${res.status}`);
      }

      const html = await res.text();

      // Extract first product with /dp/ ASIN link
      const productRegex = /href="(\/([a-zA-Z0-9_-]+\/)?dp\/([A-Z0-9]{10})[^"]*)"/gi;
      let productUrl: string | undefined;
      let asin: string | undefined;
      let match: RegExpExecArray | null;

      while ((match = productRegex.exec(html)) !== null) {
        const path = match[1];
        if (!path.includes("customerReviews") && !path.includes("sponsored")) {
          productUrl = `https://www.${domain}${path}`;
          asin = match[3];
          break;
        }
      }

      // Fallback: search for data-asin attribute
      if (!productUrl) {
        const asinMatch = html.match(/data-asin="([B0-9][A-Z0-9]{9})"/i);
        if (asinMatch && asinMatch[1]) {
          asin = asinMatch[1];
          productUrl = `https://www.${domain}/dp/${asin}`;
        }
      }

      if (!productUrl) {
        return {
          success: false,
          error: "No product links found on Amazon results page (possibly rate-limited or bot check).",
        };
      }

      // Extract title from search result if available
      let productTitle: string | undefined;
      const titleMatch =
        html.match(/<h2[^>]*>\s*<a[^>]*>\s*<span[^>]*>([^<]+)<\/span>/i) ||
        html.match(/<span class="a-size-medium a-color-base a-text-normal">([^<]+)<\/span>/i) ||
        html.match(/<span class="a-size-base-plus a-color-base a-text-normal">([^<]+)<\/span>/i);
      if (titleMatch) {
        productTitle = titleMatch[1].trim();
      }

      // Extract price from search results
      let price: string | undefined;
      const priceWholeMatch = html.match(/<span class="a-price-whole">([^<]+)<\/span>/i);
      const priceSymbolMatch = html.match(/<span class="a-price-symbol">([^<]+)<\/span>/i);
      const symbol = priceSymbolMatch ? priceSymbolMatch[1] : domain.endsWith(".in") ? "₹" : "$";

      if (priceWholeMatch) {
        price = `${symbol}${priceWholeMatch[1].replace(/[,.]*$/, "").trim()}`;
      } else {
        const offscreenMatch = html.match(/<span class="a-offscreen">([^<]+)<\/span>/i);
        if (offscreenMatch) {
          price = offscreenMatch[1].trim();
        }
      }

      return {
        success: true,
        productUrl,
        productTitle: productTitle || "Amazon Product Result",
        price: price || "Price details on page",
        asin,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not inspect Amazon search: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Inspects a product page directly to extract the active product title and selling price.
   */
  static async inspectProductPrice(
    url: string
  ): Promise<{
    success: boolean;
    title?: string;
    price?: string;
    currency?: string;
    error?: string;
  }> {
    if (!url || !url.trim()) {
      throw new Error("URL is required.");
    }

    try {
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch page: HTTP ${res.status}`);
      }

      const html = await res.text();

      // Title extraction
      let title: string | undefined;
      const titleMatch =
        html.match(/<span id="productTitle"[^>]*>\s*([^<]+)\s*<\/span>/i) ||
        html.match(/<h1[^>]*>\s*([^<]+)\s*<\/h1>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Price extraction
      let price: string | undefined;
      const offscreenMatch =
        html.match(/<span class="a-price a-text-price[^>]*>\s*<span class="a-offscreen">([^<]+)<\/span>/i) ||
        html.match(/<span class="a-offscreen">([^<]+)<\/span>/i);

      const wholeMatch = html.match(/<span class="a-price-whole">([^<]+)<\/span>/i);
      const symbolMatch = html.match(/<span class="a-price-symbol">([^<]+)<\/span>/i);

      if (offscreenMatch) {
        price = offscreenMatch[1].trim();
      } else if (wholeMatch) {
        const sym = symbolMatch ? symbolMatch[1] : "₹";
        price = `${sym}${wholeMatch[1].trim()}`;
      }

      const currency = price?.includes("₹")
        ? "INR"
        : price?.includes("$")
        ? "USD"
        : price?.includes("€")
        ? "EUR"
        : price?.includes("£")
        ? "GBP"
        : "UNKNOWN";

      return {
        success: true,
        title: title || "Product",
        price: price || "Price not found on page",
        currency,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not inspect product price: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * Retrieves current text from Windows clipboard.
   */
  static async getClipboardText(): Promise<{ text: string }> {
    try {
      const { stdout } = await execAsync("powershell.exe -NoProfile -Command Get-Clipboard");
      return { text: stdout.trim() };
    } catch {
      return { text: "" };
    }
  }
}
