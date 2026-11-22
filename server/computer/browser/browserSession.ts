import path from "path";
import fs from "fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { AppRegistry } from "../apps/appRegistry.js";
import { WindowsBridge } from "../native/windowsBridge.js";

export interface TabInfo {
  index: number;
  title: string;
  url: string;
  isActive: boolean;
}

export class BrowserSession {
  private static context: BrowserContext | null = null;
  private static activePage: Page | null = null;
  private static isConnecting = false;

  private static readonly CDP_PORT = 9222;
  private static readonly PROFILE_DIR = path.resolve(process.cwd(), ".chrome_profile");

  /**
   * Resolves the real system Google Chrome executable path.
   */
  static async getChromeExecutablePath(): Promise<string> {
    const chromeApp = AppRegistry.getApp("chrome");
    if (chromeApp) {
      try {
        const target = await AppRegistry.resolveLaunchTarget(chromeApp);
        if (target.type === "file" && fs.existsSync(target.target)) {
          return target.target;
        }
      } catch {
        // Fall back to standard known locations
      }
    }

    const standardLocations = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    ];

    for (const loc of standardLocations) {
      if (fs.existsSync(loc)) {
        return loc;
      }
    }

    throw new Error(
      "Google Chrome executable could not be located on this system. Please ensure Chrome is installed."
    );
  }

  /**
   * Checks whether a URL points to the LUMA local application (frontend or backend).
   * Protected origins must NEVER be navigated away, refreshed, or clicked by automated website tools.
   */
  static isProtectedUrl(url?: string): boolean {
    if (!url || typeof url !== "string") return false;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const port = u.port;
      if (
        (host === "localhost" || host === "127.0.0.1" || host === "::1") &&
        (port === "5173" || port === "3001" || port === "5174")
      ) {
        return true;
      }
    } catch {
      const lower = url.toLowerCase();
      if (
        lower.includes("localhost:5173") ||
        lower.includes("127.0.0.1:5173") ||
        lower.includes("localhost:3001") ||
        lower.includes("127.0.0.1:3001")
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if an existing controlled Chrome session is already running on port 9222.
   */
  static async isCdpListening(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 400);
    try {
      const res = await fetch(`http://127.0.0.1:${this.CDP_PORT}/json/version`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      clearTimeout(timer);
      return false;
    }
  }

  /**
   * Connects to an existing controlled Chrome session or visibly launches a persistent context.
   * Reuses the existing session and active tab whenever available.
   */
  static async getSession(): Promise<{ context: BrowserContext; page: Page }> {
    // If active page and context exist and are healthy, reuse immediately
    if (this.context && this.activePage && !this.activePage.isClosed()) {
      return { context: this.context, page: this.activePage };
    }

    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return this.getSession();
    }

    this.isConnecting = true;

    try {
      // 1. Check if Chrome with CDP port 9222 is already listening
      const cdpActive = await this.isCdpListening();

      if (cdpActive) {
        try {
          const browser = await chromium.connectOverCDP(`http://127.0.0.1:${this.CDP_PORT}`);
          const contexts = browser.contexts();
          this.context = contexts.length > 0 ? contexts[0] : await browser.newContext();
          const pages = this.context.pages();
          const automationPages = pages.filter((p) => !p.isClosed() && !this.isProtectedUrl(p.url()));
          this.activePage = automationPages.length > 0 ? automationPages[0] : await this.context.newPage();

          // Bring window to foreground
          await WindowsBridge.focusWindow("Google Chrome").catch(() => {});

          return { context: this.context, page: this.activePage };
        } catch {
          // Fall through to launch persistent context
        }
      }

      // 2. Launch visible persistent context with dedicated LUMA profile
      const executablePath = await this.getChromeExecutablePath();

      // Ensure profile directory exists
      if (!fs.existsSync(this.PROFILE_DIR)) {
        fs.mkdirSync(this.PROFILE_DIR, { recursive: true });
      }

      this.context = await chromium.launchPersistentContext(this.PROFILE_DIR, {
        executablePath,
        headless: false,
        viewport: null, // Full monitor resolution
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
          `--remote-debugging-port=${this.CDP_PORT}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-blink-features=AutomationControlled",
          "--start-maximized",
        ],
      });

      const pages = this.context.pages();
      const automationPages = pages.filter((p) => !p.isClosed() && !this.isProtectedUrl(p.url()));
      this.activePage = automationPages.length > 0 ? automationPages[0] : await this.context.newPage();

      // Clean up on page close
      this.activePage.on("close", () => {
        if (this.context) {
          const remaining = this.context.pages().filter((p) => !p.isClosed() && !this.isProtectedUrl(p.url()));
          this.activePage = remaining.length > 0 ? remaining[0] : null;
        } else {
          this.activePage = null;
        }
      });

      // Bring Chrome to foreground
      await WindowsBridge.focusWindow("Google Chrome").catch(() => {});

      return { context: this.context, page: this.activePage };
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Retrieves the current active page in the controlled browser session.
   * Enforces Protected-Origin Guard: never returns a tab pointing to the LUMA local application.
   */
  static async getActivePage(options?: { allowProtected?: boolean; targetUrl?: string }): Promise<Page> {
    const { context } = await this.getSession();
    const pages = context.pages();

    // 1. If targetUrl specified, search for open page matching it
    if (options?.targetUrl) {
      const tLower = options.targetUrl.toLowerCase();
      const matched = pages.find(
        (p) => !p.isClosed() && p.url().toLowerCase().includes(tLower) && (!this.isProtectedUrl(p.url()) || options.allowProtected)
      );
      if (matched) {
        this.activePage = matched;
        return matched;
      }
    }

    // 2. Check if current this.activePage is valid and not protected
    if (
      this.activePage &&
      !this.activePage.isClosed() &&
      (!this.isProtectedUrl(this.activePage.url()) || options?.allowProtected)
    ) {
      return this.activePage;
    }

    // 3. Search for any open non-protected automation page
    const nonProtected = pages.filter(
      (p) => !p.isClosed() && (!this.isProtectedUrl(p.url()) || options?.allowProtected)
    );
    if (nonProtected.length > 0) {
      this.activePage = nonProtected[0];
      return this.activePage;
    }

    // 4. If all open tabs are protected LUMA pages, spawn a new automation tab
    console.log("[BrowserSession] All open tabs are protected LUMA pages. Spawning a dedicated automation tab.");
    const newPage = await context.newPage();
    this.activePage = newPage;
    return newPage;
  }

  /**
   * Brings the controlled Chrome window into focus.
   */
  static async focusBrowser(): Promise<void> {
    await WindowsBridge.focusWindow("Google Chrome").catch(() => {});
  }

  /**
   * Opens a new tab in the existing controlled Chrome session without creating duplicate windows.
   */
  static async createTab(url?: string): Promise<{ index: number; title: string; url: string }> {
    const { context } = await this.getSession();
    const newPage = await context.newPage();

    this.activePage = newPage;
    await this.focusBrowser();

    newPage.on("close", () => {
      if (this.context) {
        const remaining = this.context.pages();
        this.activePage = remaining.length > 0 ? remaining[remaining.length - 1] : null;
      }
    });

    if (url) {
      await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    }

    const pages = context.pages();
    const index = pages.indexOf(newPage);
    const title = await newPage.title().catch(() => "New Tab");

    return {
      index,
      title,
      url: newPage.url(),
    };
  }

  /**
   * Lists all open tabs in the controlled browser context.
   */
  static async listTabs(): Promise<TabInfo[]> {
    const { context } = await this.getSession();
    const pages = context.pages();
    const list: TabInfo[] = [];

    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      let title = "Unknown";
      let url = "";
      try {
        title = await p.title();
        url = p.url();
      } catch {
        // Page might be navigating
      }

      list.push({
        index: i,
        title,
        url,
        isActive: p === this.activePage,
      });
    }

    return list;
  }

  /**
   * Switches to a specific tab by index or title/URL substring.
   */
  static async switchTab(target: number | string): Promise<{
    success: boolean;
    index: number;
    title: string;
    url: string;
    message: string;
  }> {
    const { context } = await this.getSession();
    const pages = context.pages();
    if (pages.length === 0) {
      throw new Error("No open tabs found in the browser session.");
    }

    let targetPage: Page | undefined;
    let targetIndex = -1;

    if (typeof target === "number") {
      if (target >= 0 && target < pages.length) {
        targetPage = pages[target];
        targetIndex = target;
      }
    } else {
      const tLower = target.toLowerCase().trim();
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const title = (await p.title().catch(() => "")).toLowerCase();
        const url = p.url().toLowerCase();
        if (title.includes(tLower) || url.includes(tLower)) {
          targetPage = p;
          targetIndex = i;
          break;
        }
      }
    }

    if (!targetPage) {
      return {
        success: false,
        index: -1,
        title: "",
        url: "",
        message: `Tab matching "${target}" was not found.`,
      };
    }

    await targetPage.bringToFront();
    this.activePage = targetPage;
    await this.focusBrowser();

    const finalTitle = await targetPage.title().catch(() => "");
    return {
      success: true,
      index: targetIndex,
      title: finalTitle,
      url: targetPage.url(),
      message: `Switched to tab #${targetIndex}: "${finalTitle}".`,
    };
  }

  /**
   * Closes a specific tab, preserving unrelated tabs.
   * If target is omitted, closes the active tab.
   */
  static async closeTab(target?: number | string): Promise<{
    success: boolean;
    closedTitle: string;
    remainingCount: number;
    message: string;
  }> {
    const { context } = await this.getSession();
    const pages = context.pages();

    if (pages.length === 0) {
      return { success: false, closedTitle: "", remainingCount: 0, message: "No tabs open to close." };
    }

    let pageToClose: Page | undefined;

    if (target === undefined || target === null) {
      pageToClose = this.activePage || pages[pages.length - 1];
    } else if (typeof target === "number") {
      if (target >= 0 && target < pages.length) {
        pageToClose = pages[target];
      }
    } else {
      const tLower = target.toLowerCase().trim();
      for (const p of pages) {
        const title = (await p.title().catch(() => "")).toLowerCase();
        const url = p.url().toLowerCase();
        if (title.includes(tLower) || url.includes(tLower)) {
          pageToClose = p;
          break;
        }
      }
    }

    if (!pageToClose) {
      return {
        success: false,
        closedTitle: "",
        remainingCount: pages.length,
        message: `Tab matching "${target}" not found to close.`,
      };
    }

    if (this.isProtectedUrl(pageToClose.url())) {
      const closedTitle = await pageToClose.title().catch(() => "LUMA");
      return {
        success: false,
        closedTitle,
        remainingCount: pages.length,
        message: "Protected-origin guard: Cannot close protected LUMA application tab.",
      };
    }

    const closedTitle = await pageToClose.title().catch(() => "Tab");
    await pageToClose.close();

    const remaining = context.pages();
    this.activePage = remaining.length > 0 ? remaining[remaining.length - 1] : null;

    return {
      success: true,
      closedTitle,
      remainingCount: remaining.length,
      message: `Closed tab "${closedTitle}". ${remaining.length} tab(s) remaining.`,
    };
  }

  /**
   * Returns active tab information.
   */
  static async getActiveTabInfo(): Promise<{ index: number; title: string; url: string }> {
    const page = await this.getActivePage();
    const { context } = await this.getSession();
    const pages = context.pages();
    const index = pages.indexOf(page);
    return {
      index,
      title: await page.title().catch(() => ""),
      url: page.url(),
    };
  }

  /**
   * Resets connection pointers if the session disconnected.
   */
  static reset(): void {
    this.context = null;
    this.activePage = null;
    this.isConnecting = false;
  }
}
