/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession } from "./browserSession.js";

export interface PageElementInfo {
  text: string;
  role?: string;
  selector?: string;
  destination?: string;
  type?: string;
  name?: string;
  id?: string;
  required?: boolean;
  value?: string;
  placeholder?: string;
}

export interface SearchResultItem {
  rank: number;
  title: string;
  snippet: string;
  url: string;
}

export interface PageObservationSummary {
  title: string;
  url: string;
  headings: Array<{ level: string; text: string }>;
  visibleTextSummary: string;
  mainContentText: string;
  links: PageElementInfo[];
  buttons: PageElementInfo[];
  inputs: PageElementInfo[];
  dropdowns: Array<{ name: string; options: string[] }>;
  searchResults: SearchResultItem[];
  downloadLinks: PageElementInfo[];
  states: {
    isLoading: boolean;
    isError: boolean;
    isCaptcha: boolean;
    isLoginForm: boolean;
    errorMessage?: string;
  };
}

export class PageObserver {
  /**
   * Observes the active browser page and returns comprehensive semantic structure.
   * Uses accessible roles, labels, placeholders, and semantic DOM inspection.
   */
  static async observePage(page?: Page): Promise<PageObservationSummary> {
    const targetPage = page || (await BrowserSession.getActivePage());

    // Evaluate in page context
    const data = await targetPage.evaluate(() => {
      // 1. Title & URL
      const title = document.title || "";
      const url = window.location.href;

      // 2. Headings
      const headings: Array<{ level: string; text: string }> = [];
      const headingEls = document.querySelectorAll("h1, h2, h3, h4");
      headingEls.forEach((h) => {
        const t = (h.textContent || "").trim();
        if (t && t.length > 1 && !t.includes("<!")) {
          headings.push({ level: h.tagName.toLowerCase(), text: t });
        }
      });

      // 3. Buttons
      const buttons: Array<{ text: string; role?: string; id?: string }> = [];
      const btnEls = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");
      btnEls.forEach((b) => {
        const text = (b.textContent || b.getAttribute("aria-label") || (b as HTMLInputElement).value || "").trim();
        if (text && text.length > 0 && text.length < 80) {
          buttons.push({
            text,
            role: "button",
            id: b.id || undefined,
          });
        }
      });

      // 4. Input Fields & Labels
      const inputs: Array<{
        text: string;
        name?: string;
        id?: string;
        type: string;
        placeholder?: string;
        label?: string;
        required: boolean;
        value: string;
      }> = [];

      const inputEls = document.querySelectorAll("input:not([type='hidden']), textarea, select");
      inputEls.forEach((el) => {
        const htmlInput = el as HTMLInputElement;
        const id = htmlInput.id || "";
        const name = htmlInput.name || "";
        const type = (htmlInput.type || el.tagName.toLowerCase()).toLowerCase();
        const placeholder = htmlInput.placeholder || "";
        const required = htmlInput.required || el.hasAttribute("aria-required");
        const value = htmlInput.value || "";

        // Find associated label
        let label = "";
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl) label = (lbl.textContent || "").trim();
        }
        if (!label) {
          const parentLabel = el.closest("label");
          if (parentLabel) label = (parentLabel.textContent || "").trim();
        }
        if (!label && htmlInput.getAttribute("aria-label")) {
          label = htmlInput.getAttribute("aria-label") || "";
        }

        inputs.push({
          text: label || placeholder || name || id || type || "input",
          id: id || undefined,
          name: name || undefined,
          type,
          placeholder: placeholder || undefined,
          label: label || undefined,
          required: Boolean(required),
          value,
        });
      });

      // 5. Dropdowns
      const dropdowns: Array<{ name: string; options: string[] }> = [];
      const selectEls = document.querySelectorAll("select");
      selectEls.forEach((sel) => {
        const name = sel.name || sel.id || sel.getAttribute("aria-label") || "dropdown";
        const options: string[] = [];
        sel.querySelectorAll("option").forEach((opt) => {
          const t = (opt.textContent || opt.value || "").trim();
          if (t) options.push(t);
        });
        dropdowns.push({ name, options: options.slice(0, 20) });
      });

      // 6. Links and Downloads
      const links: Array<{ text: string; destination: string }> = [];
      const downloadLinks: Array<{ text: string; destination: string }> = [];
      const anchorEls = document.querySelectorAll("a[href]");

      anchorEls.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const text = (a.textContent || a.getAttribute("aria-label") || "").trim();
        if (!href || href.startsWith("javascript:") || href === "#") return;

        const isDownload =
          a.hasAttribute("download") ||
          /\.(?:pdf|zip|tar|gz|exe|docx|xlsx|csv|dmg|pkg)$/i.test(href) ||
          /\b(?:download|save\s+pdf|get\s+file)\b/i.test(text);

        const fullHref = href.startsWith("http") ? href : new URL(href, window.location.href).href;

        if (isDownload) {
          downloadLinks.push({ text: text || "Download File", destination: fullHref });
        } else if (text && text.length > 2 && text.length < 100) {
          links.push({ text, destination: fullHref });
        }
      });

      // 7. Search Results Detection (Google, Bing, generic results)
      const searchResults: Array<{ rank: number; title: string; snippet: string; url: string }> = [];

      // Google search result cards
      const googleCards = document.querySelectorAll("div.g, div[data-sokoban-container], #rso > div");
      let rank = 1;
      googleCards.forEach((card) => {
        const titleEl = card.querySelector("h3, h2, a > div");
        const linkEl = card.querySelector("a[href]");
        const snippetEl = card.querySelector("div[data-sncf], div.VwiC3b, span.st, .IT10dc");

        const t = (titleEl?.textContent || "").trim();
        const u = linkEl?.getAttribute("href") || "";
        const s = (snippetEl?.textContent || "").trim();

        if (t && u && u.startsWith("http") && !u.includes("google.com/search")) {
          searchResults.push({ rank: rank++, title: t, snippet: s, url: u });
        }
      });

      // 8. Visible Text / Main Article Extraction
      const paragraphs: string[] = [];
      const pEls = document.querySelectorAll("p, article, .content, main, [role='main']");
      pEls.forEach((p) => {
        const t = (p.textContent || "").trim().replace(/\s+/g, " ");
        if (t && t.length > 20 && !t.includes("cookie") && !t.includes("javascript")) {
          paragraphs.push(t);
        }
      });

      const mainContentText = paragraphs.slice(0, 15).join("\n\n");

      // 9. Page States
      const pageText = document.body ? document.body.innerText.toLowerCase() : "";
      const isCaptcha =
        pageText.includes("robot check") ||
        pageText.includes("captcha") ||
        pageText.includes("verify you are human") ||
        Boolean(document.querySelector("#captcha, .g-recaptcha, #cf-turnstile"));

      const isLoginForm =
        Boolean(document.querySelector("input[type='password']")) ||
        (/\b(?:login|sign in|log in|log into)\b/i.test(title) && Boolean(document.querySelector("input[type='email'], input[name*='user']")));

      const isLoading =
        Boolean(document.querySelector("[aria-busy='true'], .spinner, .loading-indicator")) ||
        document.readyState !== "complete";

      const errorEl = document.querySelector(".error-message, .alert-danger, [role='alert']");
      const isError = Boolean(errorEl);
      const errorMessage = errorEl ? (errorEl.textContent || "").trim() : undefined;

      return {
        title,
        url,
        headings: headings.slice(0, 20),
        links: links.slice(0, 30),
        buttons: buttons.slice(0, 25),
        inputs: inputs.slice(0, 25),
        dropdowns: dropdowns.slice(0, 10),
        searchResults: searchResults.slice(0, 10),
        downloadLinks: downloadLinks.slice(0, 15),
        mainContentText: mainContentText.slice(0, 4000),
        states: {
          isLoading,
          isError,
          isCaptcha,
          isLoginForm,
          errorMessage,
        },
      };
    });

    // Build visible text summary
    const summaryLines: string[] = [];
    summaryLines.push(`Page: "${data.title}" (${data.url})`);

    if (data.headings.length > 0) {
      summaryLines.push("Main Headings: " + data.headings.slice(0, 5).map((h) => h.text).join(" | "));
    }

    if (data.searchResults.length > 0) {
      summaryLines.push(`Search Results Found (${data.searchResults.length}):`);
      data.searchResults.slice(0, 4).forEach((r) => {
        summaryLines.push(`- #${r.rank}: ${r.title} (${r.url}) - ${r.snippet.slice(0, 80)}`);
      });
    } else if (data.mainContentText) {
      summaryLines.push("Content Excerpt: " + data.mainContentText.slice(0, 300) + "...");
    }

    return {
      ...data,
      visibleTextSummary: summaryLines.join("\n"),
    };
  }

  /**
   * Deterministically reads and summarizes content from the active page.
   * Specifically handles commands like:
   * "Open Chrome and search for Mike and tell me what is written on this page."
   */
  static async readPageContent(page?: Page): Promise<{
    success: boolean;
    title: string;
    url: string;
    summary: string;
    headings: string[];
    topSnippets: string[];
    relevantLinks: Array<{ text: string; url: string }>;
  }> {
    const observation = await this.observePage(page);

    if (observation.states.isCaptcha) {
      return {
        success: false,
        title: observation.title,
        url: observation.url,
        summary: "Security challenge / CAPTCHA detected on page. Manual verification required in browser.",
        headings: [],
        topSnippets: [],
        relevantLinks: [],
      };
    }

    const headings = observation.headings.map((h) => h.text);
    const topSnippets: string[] = [];
    const relevantLinks: Array<{ text: string; url: string }> = [];

    if (observation.searchResults.length > 0) {
      observation.searchResults.slice(0, 5).forEach((r) => {
        topSnippets.push(`[#${r.rank}] ${r.title}: ${r.snippet || "Result link available"}`);
        relevantLinks.push({ text: r.title, url: r.url });
      });
    } else if (observation.mainContentText) {
      const paragraphs = observation.mainContentText.split("\n\n").filter(Boolean);
      topSnippets.push(...paragraphs.slice(0, 4));
    }

    // Build human-readable summary
    let summaryText = "";
    if (observation.searchResults.length > 0) {
      summaryText = `Search results on "${observation.title}":\n` +
        observation.searchResults
          .slice(0, 4)
          .map((r) => `• ${r.title} — ${r.snippet || r.url}`)
          .join("\n");
    } else if (topSnippets.length > 0) {
      summaryText = `Content on "${observation.title}":\n` + topSnippets.join("\n\n");
    } else {
      summaryText = `Loaded page "${observation.title}" at ${observation.url}. No article or result text detected.`;
    }

    return {
      success: true,
      title: observation.title,
      url: observation.url,
      summary: summaryText,
      headings: headings.slice(0, 8),
      topSnippets,
      relevantLinks: relevantLinks.slice(0, 5),
    };
  }
}
