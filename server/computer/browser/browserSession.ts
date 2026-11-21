import path from "path";
import fs from "fs";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { AppRegistry } from "../apps/appRegistry.js";
import { WindowsBridge } from "../native/windowsBridge.js";

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
          this.activePage = pages.length > 0 ? pages[0] : await this.context.newPage();

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
      this.activePage = pages.length > 0 ? pages[0] : await this.context.newPage();

      // Clean up on page close
      this.activePage.on("close", () => {
        if (this.context) {
          const remaining = this.context.pages();
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
   */
  static async getActivePage(): Promise<Page> {
    const { page } = await this.getSession();
    return page;
  }

  /**
   * Brings the controlled Chrome window into focus.
   */
  static async focusBrowser(): Promise<void> {
    await WindowsBridge.focusWindow("Google Chrome").catch(() => {});
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
