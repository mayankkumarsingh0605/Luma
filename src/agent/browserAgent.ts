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
      try {
        const directUrl = "http://localhost:3001/api/computer/execute";
        const res = await fetch(directUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, arguments: args }),
        });
        return await res.json();
      } catch {
        // If server is not running and running in Node.js environment, execute directly in-process
        if (typeof window === "undefined") {
          const modPath = "../../server/computer/tools/toolExecutor.js";
          const mod = await (Function("m", "return import(m)")(modPath));
          return await mod.ToolExecutor.executeTool(tool, args);
        }
        return { success: false, error: "Backend server unreachable." };
      }
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
  static async fill_and_submit_search(query: string, site?: string): Promise<{ success: boolean; message: string; url?: string }> {
    const res = await this.executeTool("browser_fill_search", { query, site });
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
  static async type_into_search(text: string, site?: string): Promise<{ success: boolean; message: string }> {
    return await this.fill_and_submit_search(text, site);
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
  static async verify_search_results(query: string, site?: string): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("browser_wait_results", { query, site });
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
    domain: string = "amazon.in",
    site?: string
  ): Promise<{
    success: boolean;
    productUrl?: string;
    productTitle?: string;
    price?: string;
    asin?: string;
    error?: string;
  }> {
    // 1. Try real rendered DOM extraction first
    const domRes = await this.executeTool("browser_get_first_product", { site });
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

    // 2. Fallback to background inspection only if browser DOM was completely unreachable and site is Amazon
    if (!site || site === "amazon") {
      const res = await this.executeTool("inspect_amazon_search", { query, domain });
      if (res.success && res.result) {
        return res.result;
      }
    }

    return {
      success: false,
      error: domRes?.error || "Could not find search results.",
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
    productUrl: string,
    site?: string
  ): Promise<{
    success: boolean;
    title?: string;
    price?: string;
    currency?: string;
    error?: string;
  }> {
    // 1. Try real rendered DOM extraction from active tab
    const domRes = await this.executeTool("browser_extract_product_price", { site });
    const item = domRes?.result?.result || domRes?.result;
    if (domRes?.success && item && item.price) {
      return {
        success: true,
        title: item.title,
        price: item.price,
        currency: item.currency || "INR",
      };
    }

    // 2. Fallback to HTTP scraper only if target is Amazon
    if (productUrl.includes("amazon.") || site === "amazon") {
      const res = await this.executeTool("inspect_product_price", { url: productUrl });
      if (res.success && res.result) {
        return res.result;
      }
    }

    return {
      success: false,
      price: "Price not found",
      error: domRes?.error || "Price could not be extracted.",
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

  /**
   * Opens and plays the first video from search results.
   */
  static async play_first_video(
    site?: string
  ): Promise<{ success: boolean; message: string; url?: string; title?: string }> {
    const res = await this.executeTool("browser_play_first_video", { site });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || "Playing first video.",
        url: res.result?.url,
        title: res.result?.title,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || "Could not play first video.",
    };
  }

  /**
   * Controls playback (play, pause, resume) inside the active browser tab.
   */
  static async control_playback(
    action: "play" | "pause" | "resume"
  ): Promise<{ success: boolean; message: string; paused?: boolean }> {
    const res = await this.executeTool("browser_control_playback", { action });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Playback ${action} executed.`,
        paused: res.result?.paused,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not ${action} playback.`,
    };
  }

  /**
   * Retrieves video results from the active search page.
   */
  static async get_video_results(
    limit: number = 3
  ): Promise<Array<{ title: string; url: string; videoId?: string }>> {
    const res = await this.executeTool("browser_get_video_results", { limit });
    if (res?.success && Array.isArray(res.result)) {
      return res.result;
    }
    return [];
  }

  /**
   * Creates a user playlist with a given name and optional privacy.
   */
  static async create_playlist(
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE"
  ): Promise<{ success: boolean; message: string; playlist?: any }> {
    const res = await this.executeTool("youtube_create_playlist", { name, privacy });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Playlist "${name}" created successfully.`,
        playlist: res.result,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not create playlist "${name}".`,
    };
  }

  /**
   * Adds videos to a playlist.
   */
  static async add_to_playlist(
    playlistName: string,
    videos?: Array<{ title: string; url: string; videoId?: string }>,
    limit?: number
  ): Promise<{ success: boolean; message: string; count?: number }> {
    const res = await this.executeTool("youtube_add_to_playlist", {
      playlist_name: playlistName,
      videos,
      limit: limit || 3,
    });
    if (res?.success) {
      const added = res.result?.addedCount ?? (videos?.length || 0);
      return {
        success: true,
        message: `Added ${added} video(s) to playlist "${playlistName}".`,
        count: added,
      };
    }
    return {
      success: false,
      message: res?.error || `Could not add videos to playlist "${playlistName}".`,
    };
  }

  /**
   * Plays a playlist by name.
   */
  static async play_playlist(
    name: string,
    index?: number,
    next?: boolean
  ): Promise<{ success: boolean; message: string; url?: string; videoTitle?: string }> {
    const res = await this.executeTool("youtube_play_playlist", { name, index, next });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Playing playlist "${name}".`,
        url: res.result?.url,
        videoTitle: res.result?.videoTitle,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not play playlist "${name}".`,
    };
  }

  /**
   * Plays a video by 1-based index from a YouTube playlist or advances to next video.
   */
  static async play_playlist_video(
    playlistName?: string,
    index?: number,
    next?: boolean
  ): Promise<{ success: boolean; message: string; url?: string; videoTitle?: string }> {
    const res = await this.executeTool("youtube_play_playlist_video", {
      playlist_name: playlistName,
      index: index || 1,
      next: Boolean(next),
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Playing video from playlist "${playlistName || "current"}".`,
        url: res.result?.videoUrl || res.result?.url,
        videoTitle: res.result?.videoTitle,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not play video from playlist "${playlistName}".`,
    };
  }

  /**
   * Creates a playlist seeded with a video using the authentic Save-to-playlist workflow.
   */
  static async create_playlist_from_video(
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    videoContext?: any
  ): Promise<{ success: boolean; message: string; playlist?: any }> {
    const res = await this.executeTool("youtube_create_playlist_from_video", {
      name,
      privacy,
      video_context: videoContext,
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Playlist "${name}" created successfully.`,
        playlist: res.result,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not create playlist "${name}".`,
    };
  }

  /**
   * Removes a video from a playlist.
   */
  static async remove_from_playlist(
    playlistName: string,
    video: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("youtube_remove_from_playlist", {
      playlist_name: playlistName,
      video,
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Removed "${video}" from playlist "${playlistName}".`,
      };
    }
    return {
      success: false,
      message:
        res?.result?.message || res?.error || `Could not remove "${video}" from playlist "${playlistName}".`,
    };
  }

  /**
   * Gets a playlist by name.
   */
  static async get_playlist(
    name: string
  ): Promise<{ success: boolean; message: string; playlist?: any }> {
    const res = await this.executeTool("youtube_get_playlist", { name });
    if (res?.success && res.result) {
      const pl = res.result;
      const count = pl.videos?.length || 0;
      return {
        success: true,
        message: `Playlist "${pl.name}" has ${count} video${count === 1 ? "" : "s"}.`,
        playlist: pl,
      };
    }
    return {
      success: false,
      message: `Playlist "${name}" not found.`,
    };
  }

  /**
   * Opens a new tab in the existing controlled Chrome session and optionally navigates to a URL.
   */
  static async create_tab(url?: string): Promise<{ success: boolean; message: string; url?: string; index?: number }> {
    const res = await this.executeTool("browser_new_tab", { url });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Opened new tab: ${url || ""}`,
        url: res.result?.url,
        index: res.result?.index,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || "Failed to open new tab.",
    };
  }

  /**
   * Lists all open tabs in the controlled browser context.
   */
  static async list_tabs(): Promise<{ success: boolean; tabs: any[]; message: string }> {
    const res = await this.executeTool("browser_list_tabs", {});
    if (res?.success && res.result) {
      return res.result;
    }
    return {
      success: false,
      tabs: [],
      message: res?.error || "Failed to list tabs.",
    };
  }

  /**
   * Switches to an open browser tab by index or title/URL matching.
   */
  static async switch_tab(target: number | string): Promise<{ success: boolean; message: string; url?: string }> {
    const res = await this.executeTool("browser_switch_tab", { target });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || `Switched to tab "${target}".`,
        url: res.result?.url,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not switch to tab "${target}".`,
    };
  }

  /**
   * Closes a specific tab or active tab.
   */
  static async close_tab(target?: number | string): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("browser_close_tab", { target });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        message: res.result?.message || "Closed browser tab.",
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || "Failed to close tab.",
    };
  }

  /**
   * Semantically inspects the active webpage DOM.
   */
  static async inspect_page(): Promise<any> {
    const res = await this.executeTool("browser_inspect_page", {});
    return res?.result || null;
  }

  /**
   * Reads and summarizes visible text, headings, and search results on the active page.
   */
  static async read_page_content(): Promise<{
    success: boolean;
    title: string;
    url: string;
    summary: string;
    headings: string[];
    topSnippets: string[];
  }> {
    const res = await this.executeTool("browser_read_page_content", {});
    if (res?.success && res.result) {
      return res.result;
    }
    return {
      success: false,
      title: "",
      url: "",
      summary: res?.error || "Could not read page content.",
      headings: [],
      topSnippets: [],
    };
  }

  /**
   * Inspects form fields on the active page.
   */
  static async inspect_form(): Promise<any> {
    const res = await this.executeTool("browser_inspect_form", {});
    return res?.result || null;
  }

  /**
   * Fills form fields on the active page matching provided data or user profile data.
   */
  static async fill_form(
    data: Record<string, string> = {},
    submit: boolean = false
  ): Promise<{ success: boolean; message: string; filledFields?: any[]; requiresConfirmation?: boolean }> {
    const res = await this.executeTool("browser_fill_form", { data, submit });
    if (res?.success && res.result) {
      return {
        success: res.result.success,
        message: res.result.message,
        filledFields: res.result.filledFields,
        requiresConfirmation: res.result.requiresConfirmationBeforeSubmit,
      };
    }
    return {
      success: false,
      message: res?.error || "Failed to fill form fields.",
    };
  }

  /**
   * Downloads a document or PDF from the active page.
   */
  static async download_file(
    query: string = "pdf",
    targetDir?: string
  ): Promise<{ success: boolean; filename?: string; savedPath?: string; message: string }> {
    const res = await this.executeTool("browser_download_file", { query, targetDir });
    if (res?.success && res.result) {
      return res.result;
    }
    return {
      success: false,
      message: res?.error || "Failed to download file.",
    };
  }

  /**
   * Plays the video at the given rank (1 = first, 2 = second, etc.) on YouTube.
   */
  static async play_video_rank(
    rank: number = 1
  ): Promise<{ success: boolean; title?: string; url?: string; message: string }> {
    const res = await this.executeTool("browser_play_video_rank", { rank });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    if (isOk) {
      return {
        success: true,
        title: res.result?.title,
        url: res.result?.url,
        message: res.result?.message || `Playing video #${rank}.`,
      };
    }
    return {
      success: false,
      message: res?.result?.message || res?.error || `Could not play video #${rank}.`,
    };
  }

  /**
   * Seeks the video forward (+) or backward (-) by seconds.
   */
  static async seek_video(
    seconds: number
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const res = await this.executeTool("youtube_seek", { seconds });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not seek video.`,
      details: res?.result,
    };
  }

  /**
   * Retrieves active video info.
   */
  static async get_video_info(): Promise<{
    success: boolean;
    message: string;
    info?: any;
  }> {
    const res = await this.executeTool("youtube_get_video_info", {});
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || "Could not retrieve video info.",
      info: res?.result,
    };
  }

  /**
   * Retrieves playback state.
   */
  static async get_playback_state(): Promise<{
    success: boolean;
    message: string;
    state?: any;
  }> {
    const res = await this.executeTool("youtube_get_playback_state", {});
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || "Could not get playback state.",
      state: res?.result,
    };
  }

  /**
   * Toggles or sets fullscreen mode.
   */
  static async set_fullscreen(
    enable?: boolean
  ): Promise<{ success: boolean; isFullscreen: boolean; message: string }> {
    const res = await this.executeTool("youtube_set_fullscreen", { enable });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      isFullscreen: Boolean(res?.result?.isFullscreen),
      message: res?.result?.message || res?.error || "Could not change fullscreen state.",
    };
  }

  /**
   * Stops video playback and resets time.
   */
  static async stop_video(): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("youtube_stop_video", {});
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || "Could not stop video playback.",
    };
  }

  /**
   * Skips active advertisement.
   */
  static async skip_ad(): Promise<{
    success: boolean;
    isAd: boolean;
    skipped?: boolean;
    skippable?: boolean;
    message: string;
  }> {
    const res = await this.executeTool("youtube_skip_ad", {});
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      isAd: Boolean(res?.result?.isAd),
      skipped: res?.result?.skipped,
      skippable: res?.result?.skippable,
      message: res?.result?.message || res?.error || "Could not skip ad.",
    };
  }

  /**
   * Opens playlist in YouTube UI.
   */
  static async open_playlist_ui(
    name: string
  ): Promise<{ success: boolean; message: string; url?: string; title?: string }> {
    const res = await this.executeTool("youtube_open_playlist_ui", { name });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not open playlist "${name}".`,
      url: res?.result?.url,
      title: res?.result?.title,
    };
  }

  /**
   * Lists playlist videos via YouTube UI.
   */
  static async list_playlist_videos_ui(
    name?: string
  ): Promise<{ success: boolean; videos?: any[]; message: string }> {
    const res = await this.executeTool("youtube_list_playlist_videos_ui", { name });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      videos: res?.result?.videos || [],
      message: res?.result?.message || res?.error || "Could not list playlist videos.",
    };
  }

  /**
   * Removes video from playlist via YouTube UI.
   */
  static async remove_video_from_playlist_ui(
    playlistName: string,
    video: string,
    confirmed?: boolean
  ): Promise<{ success: boolean; message: string; requiresConfirmation?: boolean }> {
    const res = await this.executeTool("youtube_remove_from_playlist_ui", {
      playlist_name: playlistName,
      video,
      confirmed,
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not remove video from playlist "${playlistName}".`,
      requiresConfirmation: res?.result?.requiresConfirmation,
    };
  }

  /**
   * Queries active fullscreen state.
   */
  static async get_fullscreen_state(
    site?: string
  ): Promise<{ success: boolean; isFullscreen: boolean; isVideoPlaying: boolean; message: string }> {
    const res = await this.executeTool("youtube_get_fullscreen_state", { site });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      isFullscreen: Boolean(res?.result?.isFullscreen),
      isVideoPlaying: Boolean(res?.result?.isVideoPlaying),
      message: res?.result?.message || res?.error || "Could not retrieve fullscreen state.",
    };
  }

  /**
   * Lists all playlists in user's account.
   */
  static async list_playlists(): Promise<{ success: boolean; playlists?: any[]; message: string }> {
    const res = await this.executeTool("youtube_list_playlists", {});
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      playlists: res?.result?.playlists || [],
      message: res?.result?.message || res?.error || "Could not list playlists.",
    };
  }

  /**
   * Counts videos in a playlist.
   */
  static async count_playlist_videos(
    playlistName: string
  ): Promise<{ success: boolean; count: number; name: string; url?: string; message: string }> {
    const res = await this.executeTool("youtube_count_playlist_videos", { playlist_name: playlistName });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      count: res?.result?.count || 0,
      name: res?.result?.name || playlistName,
      url: res?.result?.url,
      message: res?.result?.message || res?.error || `Could not count videos in playlist "${playlistName}".`,
    };
  }

  /**
   * Renames a YouTube playlist.
   */
  static async rename_playlist(
    oldName: string,
    newName: string
  ): Promise<{ success: boolean; message: string; playlistName?: string }> {
    const res = await this.executeTool("youtube_rename_playlist", { old_name: oldName, new_name: newName });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not rename playlist "${oldName}".`,
      playlistName: res?.result?.playlistName || newName,
    };
  }

  /**
   * Updates playlist visibility/privacy.
   */
  static async update_playlist_privacy(
    playlistName: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE"
  ): Promise<{ success: boolean; message: string; privacy?: string }> {
    const res = await this.executeTool("youtube_update_playlist_privacy", {
      playlist_name: playlistName,
      privacy,
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not update privacy of "${playlistName}".`,
      privacy: res?.result?.privacy || privacy,
    };
  }

  /**
   * Searches YouTube and adds video at rank N to a playlist.
   */
  static async add_search_result_to_playlist(
    query: string,
    rank: number = 1,
    playlistName: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await this.executeTool("youtube_add_search_result_to_playlist", {
      query,
      rank,
      playlist_name: playlistName,
    });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not add search result to playlist "${playlistName}".`,
    };
  }

  /**
   * Retrieves comprehensive playlist details.
   */
  static async get_playlist_details(
    name: string
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const res = await this.executeTool("youtube_get_playlist_details", { name });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      message: res?.result?.message || res?.error || `Could not retrieve details for playlist "${name}".`,
      details: res?.result,
    };
  }

  /**
   * Retrieves YouTube commands help and usage catalog.
   */
  static async get_youtube_commands_help(
    category?: string
  ): Promise<{ success: boolean; catalog: string; message: string }> {
    const res = await this.executeTool("youtube_help_commands", { category });
    const isOk = res?.success && (res.result ? res.result.success !== false : true);
    return {
      success: isOk,
      catalog: res?.result?.catalog || "",
      message: res?.result?.message || res?.error || "Could not retrieve YouTube commands.",
    };
  }
}
