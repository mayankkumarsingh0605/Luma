import type { WebsiteModule } from "./types.js";
import { AmazonModule } from "./amazonModule.js";
import { FlipkartModule } from "./flipkartModule.js";
import { YouTubeModule } from "./youtubeModule.js";
import { GoogleModule } from "./googleModule.js";
import { GenericBrowserModule } from "./genericModule.js";

/**
 * Centralized Website Module Registry
 * Selects and manages website-specific automation modules deterministically.
 */
export class ModuleRegistry {
  private static modules: Map<string, WebsiteModule> = new Map<string, WebsiteModule>([
    ["amazon", new AmazonModule()],
    ["flipkart", new FlipkartModule()],
    ["youtube", new YouTubeModule()],
    ["google", new GoogleModule()],
    ["generic", new GenericBrowserModule()],
  ]);

  /**
   * Retrieves a module by its explicit site key.
   */
  static getModule(siteKey?: string): WebsiteModule {
    if (!siteKey) return this.modules.get("generic")!;
    const key = siteKey.toLowerCase().trim();
    if (this.modules.has(key)) {
      return this.modules.get(key)!;
    }
    return this.modules.get("generic")!;
  }

  /**
   * Determines the module corresponding to an active browser page URL.
   */
  static getModuleForUrl(url: string): WebsiteModule {
    if (!url) return this.modules.get("generic")!;
    const lower = url.toLowerCase();

    if (lower.includes("amazon.in") || lower.includes("amazon.com") || lower.includes("amazon.")) {
      return this.modules.get("amazon")!;
    }
    if (lower.includes("flipkart.com")) {
      return this.modules.get("flipkart")!;
    }
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
      return this.modules.get("youtube")!;
    }
    if (lower.includes("google.com") || lower.includes("google.co")) {
      return this.modules.get("google")!;
    }

    return this.modules.get("generic")!;
  }

  /**
   * Resolves the module with explicit siteKey taking absolute precedence over page URL.
   * NEVER silently defaults to Amazon.
   */
  static resolve(siteKey?: string, currentUrl?: string): WebsiteModule {
    if (siteKey && siteKey.trim() && siteKey !== "generic") {
      const explicit = this.getModule(siteKey);
      if (explicit.id !== "generic") {
        return explicit;
      }
    }

    if (currentUrl && currentUrl.startsWith("http")) {
      const urlModule = this.getModuleForUrl(currentUrl);
      if (urlModule.id !== "generic") {
        return urlModule;
      }
    }

    // Default is generic browser module — NEVER Amazon!
    return this.modules.get("generic")!;
  }
}

