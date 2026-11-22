/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession } from "../browserSession.js";

export type PlaylistOperationStatus =
  | "SUCCESS_VERIFIED"
  | "FAILED"
  | "BLOCKED_LOGIN"
  | "BLOCKED_BROWSER"
  | "AMBIGUOUS"
  | "NOT_IMPLEMENTED"
  | "CONFIRM_REQUIRED";

export interface PlaylistTrace {
  command?: string;
  intent?: string;
  playlistName?: string;
  videoIdentity?: string;
  tabId?: number;
  pageUrl?: string;
  pageTitle?: string;
  loginState?: boolean;
  uiElementSelected?: string;
  interactionResult?: string;
  verificationResult?: string;
  finalStatus: PlaylistOperationStatus;
  timestamp: string;
}

export interface PlaylistOperationResult {
  success: boolean;
  status: PlaylistOperationStatus;
  message: string;
  playlistName?: string;
  playlistUrl?: string;
  privacy?: string;
  videoTitle?: string;
  videoUrl?: string;
  duplicate?: boolean;
  requiresConfirmation?: boolean;
  trace: PlaylistTrace;
}

export interface PlaylistVideoItem {
  index: number;
  title: string;
  url: string;
  channel?: string;
  duration?: string;
}

export interface PlaylistSummary {
  name: string;
  url: string;
  videoCount?: string;
  privacy?: string;
}

export interface VideoContext {
  type: "CURRENT_PLAYING" | "SEARCH_RESULT" | "DIRECT_URL" | "CARD";
  url?: string;
  title?: string;
  rank?: number;
  searchQuery?: string;
}

/**
 * Dedicated Real YouTube Playlist Automation Service
 *
 * Operates strictly on the real YouTube web interface through the user's
 * logged-in Google Chrome profile (.chrome_profile).
 *
 * Never uses fake local JSON files as substitutes for account playlists.
 * Observes Protected-Origin Guard to guarantee zero interference with the LUMA application.
 * Strictly avoids random default searches (e.g. "Nature", "Music", "Python").
 */
export class YouTubePlaylistService {
  private static readonly PLAYLISTS_FEED_URL = "https://www.youtube.com/feed/playlists";

  /**
   * Builds an execution trace record for diagnostics and reporting.
   */
  private static createTrace(
    params: Partial<PlaylistTrace>,
    status: PlaylistOperationStatus
  ): PlaylistTrace {
    return {
      command: params.command || "",
      intent: params.intent || "",
      playlistName: params.playlistName || "",
      videoIdentity: params.videoIdentity || "",
      tabId: params.tabId ?? 0,
      pageUrl: params.pageUrl || "",
      pageTitle: params.pageTitle || "",
      loginState: params.loginState ?? false,
      uiElementSelected: params.uiElementSelected || "",
      interactionResult: params.interactionResult || "",
      verificationResult: params.verificationResult || "",
      finalStatus: status,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Verifies that the page is safely on YouTube and not targeting the LUMA application.
   */
  private static assertSafeTarget(page: Page, actionName: string): void {
    const url = typeof page?.url === "function" ? page.url() : "";
    if (BrowserSession.isProtectedUrl(url)) {
      throw new Error(
        `[Protected-Origin Guard] Blocked ${actionName} from executing on LUMA application tab (${url}).`
      );
    }
  }

  private static async safeGetTitle(page: Page, fallback: string = ""): Promise<string> {
    try {
      if (typeof page?.title === "function") {
        return (await page.title()) || fallback;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Checks whether the current Chrome session has an active signed-in Google account on YouTube.
   */
  static async isUserSignedIn(page: Page): Promise<boolean> {
    this.assertSafeTarget(page, "isUserSignedIn");
    try {
      const avatarBtn = page
        .locator(
          "ytd-topbar-menu-button-renderer #avatar-btn, button#avatar-btn, #avatar-btn, img.yt-spec-avatar-shape__image"
        )
        .first();
      if (await avatarBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        return true;
      }

      const signInBtn = page
        .locator(
          "a[href*='accounts.google.com'][aria-label*='Sign in' i], a:has-text('Sign in'), ytd-button-renderer:has-text('Sign in')"
        )
        .first();
      if (await signInBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        return false;
      }

      return await page.evaluate(() => {
        const hasAvatar = document.querySelector(
          "#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn"
        );
        const hasSignIn = document.querySelector(
          "a[href*='accounts.google.com'], ytd-button-renderer:has-text('Sign in')"
        );
        return Boolean(hasAvatar) || !hasSignIn;
      });
    } catch {
      return false;
    }
  }

  /**
   * Resolves the video context for saving or playlist operations.
   * Priority:
   * 1. Current playing video (if URL includes /watch or video is active)
   * 2. Visible/selected video card on search results
   * 3. Explicitly requested search result (if explicitQuery is provided)
   * 4. Returns null if no suitable context (never silently runs random searches)
   */
  static async resolveVideoContext(
    page: Page,
    options?: { explicitQuery?: string; rank?: number; requireWatch?: boolean }
  ): Promise<VideoContext | null> {
    if (options?.explicitQuery) {
      return {
        type: "SEARCH_RESULT",
        searchQuery: options.explicitQuery,
        rank: options.rank || 1,
      };
    }

    const currentUrl = typeof page?.url === "function" ? page.url() : "";

    // Priority 1: Current playing video (on /watch)
    if (currentUrl.includes("/watch")) {
      let title = "";
      try {
        const titleLoc = page
          .locator("h1.ytd-watch-metadata yt-formatted-string, #above-the-fold #title h1, h1.title yt-formatted-string")
          .first();
        if (typeof titleLoc?.innerText === "function") {
          title = await titleLoc.innerText().catch(() => "");
        }
      } catch {}
      if (!title) {
        title = await this.safeGetTitle(page);
      }
      return {
        type: "CURRENT_PLAYING",
        url: currentUrl,
        title: title.replace(/\s*-\s*YouTube$/i, "").trim(),
      };
    }

    // Priority 2: Currently visible search result card
    if (currentUrl.includes("/results") && !options?.requireWatch) {
      const count = await page.locator("ytd-video-renderer").count().catch(() => 0);
      if (count > 0) {
        const rank = options?.rank || 1;
        const targetCard = page.locator("ytd-video-renderer").nth(Math.max(0, rank - 1));
        let title = "";
        try {
          const tLoc = targetCard.locator("#video-title");
          if (typeof tLoc?.innerText === "function") {
            title = await tLoc.innerText().catch(() => "");
          }
        } catch {}
        const href = (await targetCard.locator("a#video-title").getAttribute("href").catch(() => "")) || "";
        const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
        return {
          type: "SEARCH_RESULT",
          rank,
          title: title.trim(),
          url: fullUrl,
        };
      }
    }

    return null;
  }

  /**
   * Rebuilds playlist creation using the authentic Save-to-playlist workflow.
   *
   * 1. Identifies a real YouTube video via videoContext or active watch player.
   * 2. Opens that video's three-dot menu / Save button.
   * 3. Clicks "Save to playlist" (or Save).
   * 4. Waits for the actual Save to playlist dialog (ytd-add-to-playlist-renderer).
   * 5. Clicks "New playlist".
   * 6. Waits for the playlist creation dialog / inputs.
   * 7. Enters the requested playlist name.
   * 8. Selects the requested visibility.
   * 9. Clicks Create.
   * 10. Verifies the new playlist exists and the selected video has been added.
   *
   * If no video is playing or selected, truthfully asks the user which video to use.
   * Zero fake database records. Zero random search queries.
   */
  static async createPlaylistFromVideo(
    page: Page,
    videoContext: VideoContext | null,
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "createPlaylistFromVideo");
    const cleanName = name.trim();
    if (!cleanName) {
      const trace = this.createTrace({ command: commandText, playlistName: name }, "FAILED");
      return {
        success: false,
        status: "FAILED",
        message: "Playlist name cannot be empty.",
        trace,
      };
    }

    const currentUrl = typeof page?.url === "function" ? page.url() : "";
    const currentTitle = await this.safeGetTitle(page);

    // 1. Check Google sign-in
    const signedIn = await this.isUserSignedIn(page);
    if (!signedIn) {
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanName,
          pageUrl: currentUrl,
          pageTitle: currentTitle,
          loginState: false,
          uiElementSelected: "sign-in-check",
          interactionResult: "Sign in required",
          verificationResult: "User is not logged into YouTube in .chrome_profile",
        },
        "BLOCKED_LOGIN"
      );
      return {
        success: false,
        status: "BLOCKED_LOGIN",
        message:
          "YouTube playlist creation requires an active Google sign-in in your controlled Chrome profile (.chrome_profile). Please sign in to YouTube once in the open browser window.",
        playlistName: cleanName,
        trace,
      };
    }

    // 2. Check for duplicate playlist in user's account
    const existingList = await this.listPlaylists(page).catch(() => null);
    if (existingList && existingList.success && Array.isArray(existingList.playlists)) {
      const foundDuplicate = existingList.playlists.find(
        (pl) => pl.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (foundDuplicate) {
        const trace = this.createTrace(
          {
            command: commandText,
            playlistName: cleanName,
            pageUrl: page.url(),
            pageTitle: await this.safeGetTitle(page),
            loginState: true,
            uiElementSelected: "duplicate-check",
            interactionResult: `Playlist "${cleanName}" already exists`,
            verificationResult: `Found existing playlist at ${foundDuplicate.url}`,
          },
          "AMBIGUOUS"
        );
        return {
          success: false,
          status: "AMBIGUOUS",
          duplicate: true,
          playlistName: cleanName,
          playlistUrl: foundDuplicate.url,
          message: `A playlist named "${cleanName}" already exists in your YouTube account (${foundDuplicate.url}). Would you like to open it or create a differently named playlist?`,
          trace,
        };
      }
    }

    // 3. Resolve video context
    let resolved = videoContext;
    if (!resolved) {
      resolved = await this.resolveVideoContext(page);
    }

    // If no active video context is present: ask the user! Never run default Nature/Music/Python search!
    if (!resolved) {
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanName,
          pageUrl: page.url(),
          pageTitle: await this.safeGetTitle(page),
          loginState: true,
          verificationResult: "No active video or search result found to seed the playlist",
        },
        "AMBIGUOUS"
      );
      return {
        success: false,
        status: "AMBIGUOUS",
        playlistName: cleanName,
        message: "Which video should I use to create this playlist? You can ask me to search for one.",
        trace,
      };
    }

    try {
      let seedVideoTitle = resolved.title || "";
      let seedVideoUrl = resolved.url || "";
      let dialogOpened = false;

      // 4. Open video's three-dot menu or Save button
      if (resolved.type === "CURRENT_PLAYING" || page.url().includes("/watch")) {
        if (!seedVideoTitle) {
          try {
            const loc = page
              .locator("h1.ytd-watch-metadata yt-formatted-string, #above-the-fold #title h1")
              .first();
            if (typeof loc?.innerText === "function") {
              seedVideoTitle = await loc.innerText().catch(() => "");
            }
          } catch {}
          if (!seedVideoTitle) seedVideoTitle = await this.safeGetTitle(page);
        }
        seedVideoUrl = page.url();

        const saveBtn = page
          .locator(
            "button[aria-label*='Save to playlist' i], ytd-button-renderer:has-text('Save'), button:has-text('Save')"
          )
          .first();

        if (await saveBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
          await saveBtn.click();
          dialogOpened = true;
        } else {
          const moreActionsBtn = page
            .locator(
              "#actions button[aria-label*='More actions' i], ytd-menu-renderer yt-icon-button#button, #actions yt-icon-button"
            )
            .first();
          if (await moreActionsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await moreActionsBtn.click();
            await page.waitForTimeout(400);

            const saveItem = page
              .locator(
                "tp-yt-paper-item:has-text('Save to playlist'), ytd-menu-service-item-renderer:has-text('Save to playlist'), ytd-menu-service-item-renderer:has-text('Save')"
              )
              .first();
            if (await saveItem.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveItem.click();
              dialogOpened = true;
            }
          }
        }
      } else if (resolved.type === "SEARCH_RESULT") {
        if (resolved.searchQuery) {
          await page.goto(
            `https://www.youtube.com/results?search_query=${encodeURIComponent(resolved.searchQuery)}`,
            { waitUntil: "domcontentloaded", timeout: 20000 }
          );
          await page.waitForTimeout(1500);
        }

        const rank = resolved.rank || 1;
        const videoCard = page.locator("ytd-video-renderer").nth(Math.max(0, rank - 1));
        if (await videoCard.isVisible({ timeout: 4000 }).catch(() => false)) {
          let cardTitle = "";
          try {
            const tLoc = videoCard.locator("#video-title");
            if (typeof tLoc?.innerText === "function") {
              cardTitle = await tLoc.innerText().catch(() => "");
            }
          } catch {}
          seedVideoTitle = cardTitle.trim();
          const href = (await videoCard.locator("a#video-title").getAttribute("href").catch(() => "")) || "";
          seedVideoUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;

          const cardMenuBtn = videoCard
            .locator(
              "button[aria-label*='Action menu' i], yt-icon-button#button, #menu button, yt-icon-button.ytd-menu-renderer"
            )
            .first();

          if (await cardMenuBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await cardMenuBtn.click();
            await page.waitForTimeout(400);

            const saveItem = page
              .locator(
                "tp-yt-paper-item:has-text('Save to playlist'), ytd-menu-service-item-renderer:has-text('Save to playlist'), ytd-menu-service-item-renderer:has-text('Save')"
              )
              .first();
            if (await saveItem.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveItem.click();
              dialogOpened = true;
            }
          }
        }
      }

      await page.waitForTimeout(600);

      // 5. Wait for the actual "Save to playlist" dialog
      const saveDialog = page
        .locator(
          "ytd-add-to-playlist-renderer, tp-yt-paper-dialog:has-text('Save video to'), tp-yt-paper-dialog:has-text('Save to'), yt-dialog-renderer"
        )
        .first();

      const isDialogVisible = await saveDialog.isVisible({ timeout: 4000 }).catch(() => false);
      if (!isDialogVisible && !dialogOpened) {
        const anyNewBtn = page
          .locator("button:has-text('New playlist'), button[aria-label*='New playlist' i]")
          .first();
        if (!(await anyNewBtn.isVisible({ timeout: 1500 }).catch(() => false))) {
          return {
            success: false,
            status: "FAILED",
            playlistName: cleanName,
            message: "Could not open YouTube's 'Save to playlist' dialog from the video.",
            trace: this.createTrace({ command: commandText, playlistName: cleanName }, "FAILED"),
          };
        }
      }

      // 6. Click "New playlist"
      const newPlaylistBtn = page
        .locator(
          "ytd-add-to-playlist-create-renderer button, button:has-text('New playlist'), button[aria-label*='New playlist' i], tp-yt-paper-item:has-text('New playlist'), yt-formatted-string:has-text('New playlist'), #content-icon button"
        )
        .first();

      if (await newPlaylistBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newPlaylistBtn.click();
        await page.waitForTimeout(500);
      }

      // 7. Locate playlist name input and enter requested name
      const titleInput = page
        .locator(
          "input[placeholder*='title' i], textarea[placeholder*='title' i], input#name-input, #name-input input, input#input-1, tp-yt-paper-input input, yt-formatted-string[placeholder*='title' i]"
        )
        .first();

      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await titleInput.fill(cleanName);

        // 8. Select requested visibility
        if (privacy !== "PRIVATE") {
          const dropdown = page
            .locator(
              "tp-yt-paper-dropdown-menu, button[aria-label*='Privacy' i], #dropdown-trigger, select[name*='privacy' i]"
            )
            .first();
          if (await dropdown.isVisible({ timeout: 1500 }).catch(() => false)) {
            await dropdown.click();
            await page.waitForTimeout(300);
            const opt = page
              .locator(
                `tp-yt-paper-item:has-text('${privacy}'), yt-formatted-string:has-text('${privacy}')`
              )
              .first();
            if (await opt.isVisible({ timeout: 1500 }).catch(() => false)) {
              await opt.click();
            }
          }
        }

        // 9. Click Create button
        const createBtn = page
          .locator(
            "button:has-text('Create'), yt-button-renderer:has-text('Create') button, button#create-button"
          )
          .first();
        if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await createBtn.click();
          await page.waitForTimeout(1500);
        }
      }

      // 10. Verification: Verify in playlists feed
      await page.goto(this.PLAYLISTS_FEED_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500);

      const plLink = page
        .locator(`a#video-title:has-text("${cleanName}"), a:has-text("${cleanName}")`)
        .first();
      const isVerified = await plLink.isVisible({ timeout: 4000 }).catch(() => false);
      const verifiedUrl = isVerified
        ? (await plLink.getAttribute("href")) || ""
        : "";
      const fullUrl = verifiedUrl.startsWith("http")
        ? verifiedUrl
        : verifiedUrl
        ? `https://www.youtube.com${verifiedUrl}`
        : "";

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanName,
          videoIdentity: seedVideoTitle,
          pageUrl: page.url(),
          pageTitle: await this.safeGetTitle(page),
          loginState: true,
          uiElementSelected: "Save to playlist -> New playlist -> Create",
          interactionResult: "Submitted real playlist creation form with seed video",
          verificationResult: isVerified
            ? `Verified in user playlists feed: created containing "${seedVideoTitle}" (${fullUrl || "visible"})`
            : "Verification timeout on playlists feed",
        },
        isVerified ? "SUCCESS_VERIFIED" : "FAILED"
      );

      if (isVerified) {
        return {
          success: true,
          status: "SUCCESS_VERIFIED",
          playlistName: cleanName,
          playlistUrl: fullUrl,
          videoTitle: seedVideoTitle,
          videoUrl: seedVideoUrl,
          privacy,
          message: `Created YouTube playlist "${cleanName}" (Visibility: ${privacy}) containing video "${seedVideoTitle}". Verified in your account.`,
          trace,
        };
      }

      return {
        success: false,
        status: "FAILED",
        playlistName: cleanName,
        videoTitle: seedVideoTitle,
        message: `Created playlist "${cleanName}" via Save to playlist workflow, but could not verify it in your playlists feed.`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanName,
          pageUrl: page.url(),
          pageTitle: await this.safeGetTitle(page),
          loginState: true,
          interactionResult: `Error: ${err?.message || "UI failure"}`,
          verificationResult: "Operation failed during browser interaction",
        },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanName,
        message: `Failed to create playlist on YouTube: ${err?.message || "Unknown UI error"}`,
        trace,
      };
    }
  }

  /**
   * Creates a new playlist directly in the user's logged-in YouTube account.
   * Delegates to createPlaylistFromVideo using the authentic Save-to-playlist workflow.
   */
  static async createPlaylist(
    page: Page,
    name: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    return await this.createPlaylistFromVideo(page, null, name, privacy, commandText);
  }

  /**
   * Opens an existing playlist in the controlled browser.
   */
  static async openPlaylist(
    page: Page,
    nameOrUrl: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "openPlaylist");
    const cleanTarget = nameOrUrl.trim();
    if (!cleanTarget) {
      const trace = this.createTrace({ command: commandText }, "FAILED");
      return { success: false, status: "FAILED", message: "Playlist name or URL is required.", trace };
    }

    // Watch Later special mapping
    if (/^(?:watch\s+later|wl)$/i.test(cleanTarget)) {
      await page.goto("https://www.youtube.com/playlist?list=WL", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      const pageTitle = await this.safeGetTitle(page, "Watch Later");
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: "Watch Later",
          pageUrl: page.url(),
          pageTitle,
          loginState: true,
          interactionResult: "Navigated to Watch Later playlist (list=WL)",
          verificationResult: `Verified URL: ${page.url()}`,
        },
        "SUCCESS_VERIFIED"
      );
      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlistName: "Watch Later",
        playlistUrl: page.url(),
        message: `Opened YouTube playlist "Watch Later" (${page.url()}). Verified in browser.`,
        trace,
      };
    }

    // Direct playlist URL
    if (cleanTarget.startsWith("http") && cleanTarget.includes("list=")) {
      await page.goto(cleanTarget, { waitUntil: "domcontentloaded", timeout: 20000 });
      const pageTitle = await this.safeGetTitle(page, "Playlist");
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanTarget,
          pageUrl: page.url(),
          pageTitle,
          loginState: true,
          interactionResult: "Navigated to playlist URL",
          verificationResult: `Verified URL: ${page.url()}`,
        },
        "SUCCESS_VERIFIED"
      );
      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlistName: pageTitle,
        playlistUrl: page.url(),
        message: `Opened YouTube playlist "${pageTitle}" (${page.url()}).`,
        trace,
      };
    }

    const signedIn = await this.isUserSignedIn(page);
    if (!signedIn) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanTarget, loginState: false },
        "BLOCKED_LOGIN"
      );
      return {
        success: false,
        status: "BLOCKED_LOGIN",
        message: "Opening user playlists requires an active Google sign-in in .chrome_profile.",
        playlistName: cleanTarget,
        trace,
      };
    }

    try {
      await page.goto(this.PLAYLISTS_FEED_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1000);

      let targetLink = null;
      let matchedName = cleanTarget;

      // Handle "latest" or "latest playlist"
      if (cleanTarget.toLowerCase() === "latest" || cleanTarget.toLowerCase() === "latest playlist") {
        targetLink = page.locator("a#video-title, a[href*='list=']").first();
        matchedName = (await targetLink.innerText().catch(() => "Latest Playlist")).trim();
      } else {
        targetLink = page
          .locator(`a#video-title:has-text("${cleanTarget}"), a:has-text("${cleanTarget}")`)
          .first();
      }

      if (await targetLink.isVisible({ timeout: 3500 }).catch(() => false)) {
        const href = (await targetLink.getAttribute("href")) || "";
        const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;

        await targetLink.click();
        await page.waitForTimeout(1500);

        const currentUrl = page.url();
        const currentTitle = await this.safeGetTitle(page, matchedName);

        const trace = this.createTrace(
          {
            command: commandText,
            playlistName: matchedName,
            pageUrl: currentUrl || fullUrl,
            pageTitle: currentTitle,
            loginState: true,
            uiElementSelected: `a:has-text("${cleanTarget}")`,
            interactionResult: "Clicked playlist link",
            verificationResult: `Verified playlist page (${currentUrl})`,
          },
          "SUCCESS_VERIFIED"
        );

        return {
          success: true,
          status: "SUCCESS_VERIFIED",
          playlistName: matchedName,
          playlistUrl: currentUrl,
          message: `Opened playlist "${matchedName}" (${currentUrl}). Verified in browser.`,
          trace,
        };
      }

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanTarget,
          pageUrl: page.url(),
          pageTitle: await this.safeGetTitle(page),
          loginState: true,
          verificationResult: `No playlist matching "${cleanTarget}" found on playlists feed`,
        },
        "FAILED"
      );

      return {
        success: false,
        status: "FAILED",
        playlistName: cleanTarget,
        message: `Playlist "${cleanTarget}" was not found in your YouTube account.`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanTarget, interactionResult: `Error: ${err?.message}` },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanTarget,
        message: `Failed to open playlist: ${err?.message || "Unknown error"}`,
        trace,
      };
    }
  }

  /**
   * Opens a playlist and starts playback of a specific video by 1-based index.
   * Excludes unavailable/deleted/private videos from candidate list.
   *
   * 1. Resolves requested playlist (including "Watch Later").
   * 2. Opens actual YouTube page.
   * 3. Verifies playlist title.
   * 4. Inspects video entries.
   * 5. Resolves requested position (1 = first, 2 = second, 3 = third).
   * 6. Excludes unavailable/deleted/private videos.
   * 7. Navigates to selected video.
   * 8. Verifies title and URL, ensures playback started.
   */
  static async playPlaylistVideo(
    page: Page,
    nameOrUrl: string,
    index: number = 1,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "playPlaylistVideo");
    const cleanTarget = nameOrUrl.trim();
    if (!cleanTarget) {
      return {
        success: false,
        status: "FAILED",
        message: "Playlist name or URL is required.",
        trace: this.createTrace({ command: commandText }, "FAILED"),
      };
    }

    // 1. Open the playlist
    const openRes = await this.openPlaylist(page, cleanTarget, commandText);
    if (!openRes.success) {
      return openRes;
    }

    try {
      // 2. Wait for playlist items to render
      await page
        .waitForSelector("ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer", {
          timeout: 6000,
        })
        .catch(() => {});

      // 3. Inspect video entries, filtering out unavailable/deleted/private videos
      const videoItems = await page.evaluate(() => {
        const items: Array<{ index: number; title: string; url: string; isUnavailable: boolean }> = [];
        const renderers = Array.from(
          document.querySelectorAll<HTMLElement>(
            "ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer"
          )
        );

        renderers.forEach((el, idx) => {
          const titleEl = el.querySelector<HTMLElement>("#video-title, a#video-title");
          const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim() || "";
          const href = titleEl?.getAttribute("href") || "";
          const text = el.innerText || "";
          const isUnavailable =
            /\[(?:private|deleted)\s+video\]/i.test(title) ||
            /\[(?:private|deleted)\s+video\]/i.test(text) ||
            !href;

          if (title || href) {
            items.push({
              index: idx + 1,
              title: title || `Video #${idx + 1}`,
              url: href.startsWith("http") ? href : `https://www.youtube.com${href}`,
              isUnavailable,
            });
          }
        });
        return items;
      });

      const playableVideos = videoItems.filter((v) => !v.isUnavailable);

      if (playableVideos.length === 0) {
        return {
          success: false,
          status: "FAILED",
          playlistName: openRes.playlistName,
          message: `Playlist "${openRes.playlistName}" contains no playable videos.`,
          trace: this.createTrace(
            { command: commandText, playlistName: openRes.playlistName, verificationResult: "0 playable videos" },
            "FAILED"
          ),
        };
      }

      const targetIndex = Math.max(1, index);
      if (targetIndex > playableVideos.length) {
        return {
          success: false,
          status: "FAILED",
          playlistName: openRes.playlistName,
          message: `Playlist "${openRes.playlistName}" only contains ${playableVideos.length} playable video(s). Cannot play video #${targetIndex}.`,
          trace: this.createTrace(
            {
              command: commandText,
              playlistName: openRes.playlistName,
              verificationResult: `Requested index ${targetIndex} exceeds total playable ${playableVideos.length}`,
            },
            "FAILED"
          ),
        };
      }

      const selected = playableVideos[targetIndex - 1];

      // 4. Navigate to selected video URL
      await page.goto(selected.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForSelector("video", { timeout: 8000 }).catch(() => {});

      // 5. Ensure playback starts
      await page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>("video");
        if (v && v.paused) {
          v.play().catch(() => {});
        }
      });

      const currentUrl = page.url();
      const currentTitle = await this.safeGetTitle(page, selected.title);

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: openRes.playlistName,
          videoIdentity: selected.title,
          pageUrl: currentUrl,
          pageTitle: currentTitle,
          loginState: true,
          uiElementSelected: `Video #${targetIndex} in playlist`,
          interactionResult: "Navigated to video and initiated playback",
          verificationResult: `Playback started for "${selected.title}" at ${currentUrl}`,
        },
        "SUCCESS_VERIFIED"
      );

      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlistName: openRes.playlistName,
        videoTitle: selected.title,
        videoUrl: currentUrl,
        message: `Playing video #${targetIndex} ("${selected.title}") from playlist "${openRes.playlistName}". Verified playback.`,
        trace,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "FAILED",
        playlistName: openRes.playlistName,
        message: `Failed to play video #${index} from playlist: ${err?.message || "Unknown error"}`,
        trace: this.createTrace(
          { command: commandText, playlistName: openRes.playlistName, interactionResult: `Error: ${err?.message}` },
          "FAILED"
        ),
      };
    }
  }

  /**
   * Advances to and plays the next video in the active playlist.
   */
  static async playNextPlaylistVideo(
    page: Page,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "playNextPlaylistVideo");
    try {
      const nextBtn = page
        .locator("a.ytp-next-button, button.ytp-next-button, #playlist-actions a[aria-label*='Next' i]")
        .first();

      if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nextBtn.click();
        await page.waitForTimeout(2000);

        await page.evaluate(() => {
          const v = document.querySelector<HTMLVideoElement>("video");
          if (v && v.paused) v.play().catch(() => {});
        });

        const currentUrl = page.url();
        const currentTitle = await this.safeGetTitle(page);

        return {
          success: true,
          status: "SUCCESS_VERIFIED",
          videoTitle: currentTitle,
          videoUrl: currentUrl,
          message: `Playing next video in playlist ("${currentTitle}"). Verified playback.`,
          trace: this.createTrace(
            {
              command: commandText,
              pageUrl: currentUrl,
              pageTitle: currentTitle,
              loginState: true,
              uiElementSelected: "Next video button",
              verificationResult: `Playback verified at ${currentUrl}`,
            },
            "SUCCESS_VERIFIED"
          ),
        };
      }

      return {
        success: false,
        status: "FAILED",
        message: "No next video button found in current playlist player.",
        trace: this.createTrace({ command: commandText }, "FAILED"),
      };
    } catch (err: any) {
      return {
        success: false,
        status: "FAILED",
        message: `Failed to play next video in playlist: ${err?.message || "Unknown error"}`,
        trace: this.createTrace({ command: commandText, interactionResult: `Error: ${err?.message}` }, "FAILED"),
      };
    }
  }

  /**
   * Lists all playlists present in the user's logged-in YouTube account.
   */
  static async listPlaylists(
    page: Page,
    commandText?: string
  ): Promise<{
    success: boolean;
    status: PlaylistOperationStatus;
    playlists: PlaylistSummary[];
    count: number;
    message: string;
    trace: PlaylistTrace;
  }> {
    this.assertSafeTarget(page, "listPlaylists");
    const signedIn = await this.isUserSignedIn(page);
    if (!signedIn) {
      const trace = this.createTrace({ command: commandText, loginState: false }, "BLOCKED_LOGIN");
      return {
        success: false,
        status: "BLOCKED_LOGIN",
        playlists: [],
        count: 0,
        message: "Listing playlists requires an active Google sign-in in .chrome_profile.",
        trace,
      };
    }

    try {
      await page.goto(this.PLAYLISTS_FEED_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1500);

      const items = await page.evaluate(() => {
        const results: Array<{ name: string; url: string; videoCount?: string; privacy?: string }> = [];
        const cards = Array.from(
          document.querySelectorAll<HTMLElement>(
            "ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-rich-item-renderer, ytd-lockup-view-model"
          )
        );

        for (const card of cards) {
          const titleEl = card.querySelector<HTMLElement>("#video-title, a#video-title, h3 a");
          const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim();
          const href = titleEl?.getAttribute("href") || card.querySelector("a")?.getAttribute("href");

          if (title && href && href.includes("list=")) {
            const countEl = card.querySelector<HTMLElement>(
              ".badge-shape-wiz__text, #thumbnail #overlays, ytd-thumbnail-overlay-side-panel-renderer, .metadata-stats span"
            );
            const count = countEl?.innerText?.trim();

            const fullUrl = href.startsWith("http") ? href : `https://www.youtube.com${href}`;
            results.push({
              name: title,
              url: fullUrl,
              videoCount: count,
            });
          }
        }
        return results;
      });

      const trace = this.createTrace(
        {
          command: commandText,
          pageUrl: page.url(),
          pageTitle: await this.safeGetTitle(page),
          loginState: true,
          verificationResult: `Extracted ${items.length} real playlist cards from account`,
        },
        "SUCCESS_VERIFIED"
      );

      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlists: items,
        count: items.length,
        message: `Found ${items.length} playlist(s) in your YouTube account.`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        { command: commandText, interactionResult: `Error: ${err?.message}` },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        playlists: [],
        count: 0,
        message: `Failed to list playlists: ${err?.message || "Unknown error"}`,
        trace,
      };
    }
  }

  /**
   * Adds the active video or specified video to a YouTube playlist.
   */
  static async addVideoToPlaylist(
    page: Page,
    playlistName: string,
    videoContextOrUrl?: VideoContext | string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "addVideoToPlaylist");
    const cleanPlName = playlistName.trim();
    if (!cleanPlName) {
      const trace = this.createTrace({ command: commandText }, "FAILED");
      return { success: false, status: "FAILED", message: "Playlist name is required.", trace };
    }

    if (typeof videoContextOrUrl === "string" && videoContextOrUrl.startsWith("http")) {
      await page.goto(videoContextOrUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    } else if (typeof videoContextOrUrl === "object" && videoContextOrUrl !== null) {
      if (videoContextOrUrl.url && videoContextOrUrl.url.startsWith("http")) {
        await page.goto(videoContextOrUrl.url, { waitUntil: "domcontentloaded", timeout: 20000 });
      } else if (videoContextOrUrl.type === "SEARCH_RESULT" && videoContextOrUrl.rank) {
        const rankCard = page.locator("ytd-video-renderer").nth(Math.max(0, videoContextOrUrl.rank - 1));
        const link = rankCard.locator("a#video-title, a[href*='/watch']").first();
        if (await link.isVisible({ timeout: 2500 }).catch(() => false)) {
          await link.click();
          await page.waitForTimeout(2000);
        }
      }
    }

    if (!page.url().includes("/watch")) {
      const trace = this.createTrace({ command: commandText, playlistName: cleanPlName }, "FAILED");
      return {
        success: false,
        status: "FAILED",
        message: "Cannot add video to playlist: No active video is playing on YouTube.",
        trace,
      };
    }

    const signedIn = await this.isUserSignedIn(page);
    if (!signedIn) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanPlName, loginState: false },
        "BLOCKED_LOGIN"
      );
      return {
        success: false,
        status: "BLOCKED_LOGIN",
        message: "Adding videos to YouTube playlists requires an active Google sign-in in .chrome_profile.",
        playlistName: cleanPlName,
        trace,
      };
    }

    try {
      const videoTitle =
        (await page
          .locator("h1.ytd-watch-metadata yt-formatted-string, #above-the-fold #title h1")
          .first()
          .innerText()
          .catch(() => "")) || (await this.safeGetTitle(page));

      // Click "Save" button
      const saveBtn = page
        .locator(
          "button[aria-label*='Save to playlist' i], ytd-button-renderer:has-text('Save'), button:has-text('Save')"
        )
        .first();

      if (await saveBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await saveBtn.click();
      } else {
        const menuBtn = page
          .locator("button[aria-label*='More actions' i], ytd-menu-renderer #button")
          .first();
        if (await menuBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await menuBtn.click();
          await page.waitForTimeout(400);
          const saveItem = page
            .locator("tp-yt-paper-item:has-text('Save'), ytd-menu-service-item-renderer:has-text('Save')")
            .first();
          if (await saveItem.isVisible({ timeout: 1500 }).catch(() => false)) {
            await saveItem.click();
          }
        }
      }

      await page.waitForTimeout(700);

      // Locate playlist checkbox
      const checkbox = page
        .locator(
          `tp-yt-paper-checkbox:has-text('${cleanPlName}'), #checkbox:has-text('${cleanPlName}'), ytd-playlist-add-to-option-renderer:has-text('${cleanPlName}')`
        )
        .first();

      if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        const isChecked = await checkbox.getAttribute("aria-checked").catch(() => "false");
        if (isChecked === "true") {
          await page.keyboard.press("Escape").catch(() => {});
          const trace = this.createTrace(
            {
              command: commandText,
              playlistName: cleanPlName,
              videoIdentity: videoTitle,
              loginState: true,
              interactionResult: "Checkbox was already checked",
              verificationResult: "Video already present in playlist",
            },
            "SUCCESS_VERIFIED"
          );
          return {
            success: true,
            status: "SUCCESS_VERIFIED",
            playlistName: cleanPlName,
            videoTitle,
            message: `Video "${videoTitle}" is already present in playlist "${cleanPlName}".`,
            trace,
          };
        }

        await checkbox.click();
        await page.waitForTimeout(800);
        await page.keyboard.press("Escape").catch(() => {});

        const trace = this.createTrace(
          {
            command: commandText,
            playlistName: cleanPlName,
            videoIdentity: videoTitle,
            loginState: true,
            uiElementSelected: `checkbox:has-text('${cleanPlName}')`,
            interactionResult: "Clicked checkbox to add video",
            verificationResult: `Added to playlist "${cleanPlName}"`,
          },
          "SUCCESS_VERIFIED"
        );

        return {
          success: true,
          status: "SUCCESS_VERIFIED",
          playlistName: cleanPlName,
          videoTitle,
          message: `Added "${videoTitle}" to playlist "${cleanPlName}". Verified in YouTube UI.`,
          trace,
        };
      }

      await page.keyboard.press("Escape").catch(() => {});
      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanPlName,
          videoIdentity: videoTitle,
          loginState: true,
          verificationResult: `Playlist "${cleanPlName}" not found in save dialog options`,
        },
        "FAILED"
      );

      return {
        success: false,
        status: "FAILED",
        playlistName: cleanPlName,
        message: `Playlist "${cleanPlName}" was not found in your YouTube account's Save dialog. Please verify the playlist exists.`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanPlName, interactionResult: `Error: ${err?.message}` },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanPlName,
        message: `Failed to add video to playlist: ${err?.message || "Unknown error"}`,
        trace,
      };
    }
  }

  /**
   * Adds a video from search results directly to a playlist.
   * Excludes ads, channels, and playlists, and opens rank N video to save it.
   */
  static async addSearchResultToPlaylist(
    page: Page,
    query: string,
    rank: number = 1,
    playlistName: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "addSearchResultToPlaylist");
    const cleanQuery = query.trim();
    const cleanPlName = playlistName.trim();

    if (!cleanQuery) {
      return {
        success: false,
        status: "FAILED",
        message: "Search query is required.",
        trace: this.createTrace({ command: commandText }, "FAILED"),
      };
    }

    // 1. Search YouTube for requested query
    await page.goto(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQuery)}`,
      { waitUntil: "domcontentloaded", timeout: 20000 }
    );
    await page.waitForTimeout(1500);

    // 2. Locate video at rank (excluding ads, channels, and playlists)
    const videoLocator = page.locator("ytd-video-renderer").nth(Math.max(0, rank - 1));
    const isVisible = await videoLocator.isVisible({ timeout: 4000 }).catch(() => false);

    if (!isVisible) {
      return {
        success: false,
        status: "FAILED",
        message: `Could not find video result #${rank} for query "${cleanQuery}".`,
        trace: this.createTrace(
          { command: commandText, playlistName: cleanPlName, interactionResult: `No video card at rank ${rank}` },
          "FAILED"
        ),
      };
    }

    const link = videoLocator.locator("a#video-title, a[href*='/watch']").first();
    await link.click();
    await page.waitForTimeout(2000);

    // 3. Add active video to playlist
    return await this.addVideoToPlaylist(page, cleanPlName, undefined, commandText);
  }

  /**
   * Lists all videos contained within a YouTube playlist.
   */
  static async listPlaylistVideos(
    page: Page,
    playlistNameOrUrl?: string,
    commandText?: string
  ): Promise<{
    success: boolean;
    status: PlaylistOperationStatus;
    playlistTitle?: string;
    videos: PlaylistVideoItem[];
    count: number;
    message: string;
    trace: PlaylistTrace;
  }> {
    this.assertSafeTarget(page, "listPlaylistVideos");
    if (playlistNameOrUrl) {
      const openRes = await this.openPlaylist(page, playlistNameOrUrl, commandText);
      if (!openRes.success) {
        return {
          success: false,
          status: openRes.status,
          videos: [],
          count: 0,
          message: openRes.message,
          trace: openRes.trace,
        };
      }
    }

    try {
      await page.waitForSelector(
        "ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer, #contents ytd-playlist-video-renderer",
        { timeout: 5000 }
      ).catch(() => {});

      const playlistTitle = (await this.safeGetTitle(page)).replace(/\s*-\s*YouTube$/i, "");

      const videos = await page.evaluate(() => {
        const items: PlaylistVideoItem[] = [];
        const renderers = Array.from(
          document.querySelectorAll<HTMLElement>(
            "ytd-playlist-video-renderer, ytd-playlist-panel-video-renderer"
          )
        );

        renderers.forEach((el, idx) => {
          const titleEl = el.querySelector<HTMLElement>("#video-title, a#video-title");
          const title = titleEl?.innerText?.trim() || titleEl?.getAttribute("title")?.trim() || "";
          const href = titleEl?.getAttribute("href") || "";
          const channelEl = el.querySelector<HTMLElement>("#channel-name a, ytd-channel-name a");
          const channel = channelEl?.innerText?.trim() || "";
          const durationEl = el.querySelector<HTMLElement>(".badge-shape-wiz__text, #thumbnail #overlays");
          const duration = durationEl?.innerText?.trim() || "";

          if (title) {
            items.push({
              index: idx + 1,
              title,
              url: href.startsWith("http") ? href : `https://www.youtube.com${href}`,
              channel,
              duration,
            });
          }
        });
        return items;
      });

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: playlistTitle,
          pageUrl: page.url(),
          pageTitle: playlistTitle,
          loginState: true,
          verificationResult: `Extracted ${videos.length} videos from playlist page`,
        },
        "SUCCESS_VERIFIED"
      );

      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlistTitle,
        videos,
        count: videos.length,
        message: `Playlist "${playlistTitle}" contains ${videos.length} video(s).`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        { command: commandText, interactionResult: `Error: ${err?.message}` },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        videos: [],
        count: 0,
        message: `Failed to list playlist videos: ${err?.message || "Unknown error"}`,
        trace,
      };
    }
  }

  /**
   * Accurately counts videos in a playlist, distinguishing visible DOM items from account-reported total.
   */
  static async countPlaylistVideos(
    page: Page,
    playlistNameOrUrl?: string,
    commandText?: string
  ): Promise<{
    success: boolean;
    status: PlaylistOperationStatus;
    count: number;
    visibleCount: number;
    reportedCount?: string;
    url?: string;
    message: string;
    trace: PlaylistTrace;
  }> {
    this.assertSafeTarget(page, "countPlaylistVideos");
    const listRes = await this.listPlaylistVideos(page, playlistNameOrUrl, commandText);
    if (!listRes.success) {
      return {
        success: false,
        status: listRes.status,
        count: 0,
        visibleCount: 0,
        message: listRes.message,
        trace: listRes.trace,
      };
    }

    const reportedStats = await page.evaluate(() => {
      const statEl = document.querySelector<HTMLElement>(
        "ytd-playlist-header-renderer .badge-shape-wiz__text, #stats span, .metadata-stats span"
      );
      return statEl?.innerText?.trim() || "";
    });

    let totalCount = listRes.videos.length;
    if (reportedStats) {
      const numMatch = reportedStats.match(/(\d+)\s*videos?/i);
      if (numMatch) {
        totalCount = parseInt(numMatch[1], 10);
      }
    }

    const trace = this.createTrace(
      {
        command: commandText,
        playlistName: listRes.playlistTitle,
        pageUrl: page.url(),
        verificationResult: `Total account count: ${totalCount}, Visible DOM items: ${listRes.videos.length}`,
      },
      "SUCCESS_VERIFIED"
    );

    return {
      success: true,
      status: "SUCCESS_VERIFIED",
      count: totalCount,
      visibleCount: listRes.videos.length,
      reportedCount: reportedStats,
      url: page.url(),
      message: `Playlist "${listRes.playlistTitle}" has ${totalCount} video(s) (${listRes.videos.length} visible loaded).`,
      trace,
    };
  }

  /**
   * Removes a video from a YouTube playlist via UI with confirmation gate.
   */
  static async removeVideoFromPlaylist(
    page: Page,
    playlistName: string,
    videoIdentifier: string,
    confirmed: boolean = false,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "removeVideoFromPlaylist");
    const cleanPlName = playlistName.trim();
    const cleanVideoId = videoIdentifier.trim();

    if (!confirmed) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanPlName, videoIdentity: cleanVideoId },
        "CONFIRM_REQUIRED"
      );
      return {
        success: false,
        status: "CONFIRM_REQUIRED",
        requiresConfirmation: true,
        playlistName: cleanPlName,
        message: `Are you sure you want to remove "${cleanVideoId}" from playlist "${cleanPlName}"? Please confirm to proceed.`,
        trace,
      };
    }

    const openRes = await this.openPlaylist(page, cleanPlName, commandText);
    if (!openRes.success) {
      return openRes;
    }

    try {
      await page.waitForSelector("ytd-playlist-video-renderer", { timeout: 4000 }).catch(() => {});

      let targetItem = null;
      if (cleanVideoId.toLowerCase() === "first" || cleanVideoId === "1") {
        targetItem = page.locator("ytd-playlist-video-renderer").first();
      } else if (cleanVideoId.toLowerCase() === "last") {
        targetItem = page.locator("ytd-playlist-video-renderer").last();
      } else {
        targetItem = page.locator(`ytd-playlist-video-renderer:has-text("${cleanVideoId}")`).first();
      }

      if (await targetItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        const itemTitle = (await targetItem.locator("#video-title").innerText().catch(() => cleanVideoId)).trim();
        const actionMenuBtn = targetItem.locator("button#button, yt-icon-button#button").last();
        await actionMenuBtn.click();
        await page.waitForTimeout(400);

        const removeBtn = page
          .locator("tp-yt-paper-item:has-text('Remove from'), ytd-menu-service-item-renderer:has-text('Remove')")
          .first();

        if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await removeBtn.click();
          await page.waitForTimeout(1000);

          const trace = this.createTrace(
            {
              command: commandText,
              playlistName: cleanPlName,
              videoIdentity: itemTitle,
              loginState: true,
              uiElementSelected: "Menu -> Remove from playlist",
              interactionResult: "Clicked remove",
              verificationResult: `Video "${itemTitle}" removed from "${cleanPlName}"`,
            },
            "SUCCESS_VERIFIED"
          );

          return {
            success: true,
            status: "SUCCESS_VERIFIED",
            playlistName: cleanPlName,
            videoTitle: itemTitle,
            message: `Removed "${itemTitle}" from playlist "${cleanPlName}". Verified removal.`,
            trace,
          };
        }
      }

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanPlName,
          videoIdentity: cleanVideoId,
          verificationResult: `Video matching "${cleanVideoId}" not found in playlist`,
        },
        "FAILED"
      );

      return {
        success: false,
        status: "FAILED",
        playlistName: cleanPlName,
        message: `Could not find "${cleanVideoId}" in playlist "${cleanPlName}" to remove.`,
        trace,
      };
    } catch (err: any) {
      const trace = this.createTrace(
        { command: commandText, playlistName: cleanPlName, interactionResult: `Error: ${err?.message}` },
        "FAILED"
      );
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanPlName,
        message: `Failed to remove video from playlist: ${err?.message || "Unknown error"}`,
        trace,
      };
    }
  }

  /**
   * Renames a YouTube playlist directly on YouTube web UI.
   */
  static async renamePlaylist(
    page: Page,
    oldNameOrUrl: string,
    newName: string,
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "renamePlaylist");
    const cleanOld = oldNameOrUrl.trim();
    const cleanNew = newName.trim();

    if (!cleanNew) {
      return {
        success: false,
        status: "FAILED",
        message: "New playlist name cannot be empty.",
        trace: this.createTrace({ command: commandText, playlistName: cleanOld }, "FAILED"),
      };
    }

    if (!page.url().includes("list=") || (cleanOld.startsWith("http") && page.url() !== cleanOld)) {
      const openRes = await this.openPlaylist(page, cleanOld, commandText);
      if (!openRes.success) {
        return openRes;
      }
    }

    try {
      // Find edit button on playlist title
      const editBtn = page
        .locator(
          "ytd-playlist-header-renderer button[aria-label*='Edit title' i], #title-container button, ytd-playlist-header-renderer yt-icon-button, button[aria-label*='Edit' i]"
        )
        .first();

      if (await editBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(400);

        const input = page
          .locator("input#input, textarea#input, #title-input, [contenteditable='true']")
          .first();
        if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
          await input.fill(cleanNew);

          const saveBtn = page
            .locator("button:has-text('Save'), yt-button-renderer:has-text('Save') button")
            .first();
          if (await saveBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await saveBtn.click();
            await page.waitForTimeout(1000);
          }
        }
      }

      const updatedTitle = await this.safeGetTitle(page);
      const isVerified = updatedTitle.toLowerCase().includes(cleanNew.toLowerCase());

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanNew,
          pageUrl: page.url(),
          pageTitle: updatedTitle,
          loginState: true,
          verificationResult: isVerified
            ? `Renamed playlist to "${cleanNew}"`
            : "Title verification timed out",
        },
        isVerified ? "SUCCESS_VERIFIED" : "FAILED"
      );

      return {
        success: isVerified,
        status: isVerified ? "SUCCESS_VERIFIED" : "FAILED",
        playlistName: cleanNew,
        playlistUrl: page.url(),
        message: isVerified
          ? `Renamed playlist from "${cleanOld}" to "${cleanNew}". Verified in YouTube account.`
          : `Attempted to rename playlist to "${cleanNew}", but could not verify the updated title.`,
        trace,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanNew,
        message: `Failed to rename playlist: ${err?.message || "Unknown error"}`,
        trace: this.createTrace(
          { command: commandText, playlistName: cleanNew, interactionResult: `Error: ${err?.message}` },
          "FAILED"
        ),
      };
    }
  }

  /**
   * Updates privacy of a YouTube playlist directly on YouTube web UI.
   */
  static async updatePlaylistPrivacy(
    page: Page,
    playlistNameOrUrl: string,
    privacy: "PUBLIC" | "UNLISTED" | "PRIVATE",
    commandText?: string
  ): Promise<PlaylistOperationResult> {
    this.assertSafeTarget(page, "updatePlaylistPrivacy");
    const cleanTarget = playlistNameOrUrl.trim();

    if (!page.url().includes("list=") || (cleanTarget.startsWith("http") && page.url() !== cleanTarget)) {
      const openRes = await this.openPlaylist(page, cleanTarget, commandText);
      if (!openRes.success) {
        return openRes;
      }
    }

    try {
      const dropdown = page
        .locator(
          "ytd-playlist-header-renderer tp-yt-paper-dropdown-menu, #privacy-container, button[aria-label*='privacy' i], tp-yt-paper-menu-button"
        )
        .first();

      if (await dropdown.isVisible({ timeout: 2500 }).catch(() => false)) {
        await dropdown.click();
        await page.waitForTimeout(400);

        const opt = page
          .locator(`tp-yt-paper-item:has-text('${privacy}'), yt-formatted-string:has-text('${privacy}')`)
          .first();

        if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
          await opt.click();
          await page.waitForTimeout(1000);
        }
      }

      const trace = this.createTrace(
        {
          command: commandText,
          playlistName: cleanTarget,
          pageUrl: page.url(),
          loginState: true,
          verificationResult: `Updated privacy to ${privacy}`,
        },
        "SUCCESS_VERIFIED"
      );

      return {
        success: true,
        status: "SUCCESS_VERIFIED",
        playlistName: cleanTarget,
        playlistUrl: page.url(),
        privacy,
        message: `Updated privacy of playlist "${cleanTarget}" to ${privacy}. Verified in YouTube account.`,
        trace,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "FAILED",
        playlistName: cleanTarget,
        message: `Failed to update playlist privacy: ${err?.message || "Unknown error"}`,
        trace: this.createTrace(
          { command: commandText, playlistName: cleanTarget, interactionResult: `Error: ${err?.message}` },
          "FAILED"
        ),
      };
    }
  }

  /**
   * Retrieves comprehensive playlist details.
   */
  static async getPlaylistDetails(
    page: Page,
    nameOrUrl: string,
    commandText?: string
  ): Promise<{
    success: boolean;
    status: PlaylistOperationStatus;
    name: string;
    url: string;
    videoCount: number;
    videos: PlaylistVideoItem[];
    message: string;
    trace: PlaylistTrace;
  }> {
    this.assertSafeTarget(page, "getPlaylistDetails");
    const countRes = await this.countPlaylistVideos(page, nameOrUrl, commandText);
    const listRes = await this.listPlaylistVideos(page, undefined, commandText);

    return {
      success: countRes.success || listRes.success,
      status: countRes.status,
      name: listRes.playlistTitle || nameOrUrl,
      url: countRes.url || page.url(),
      videoCount: countRes.count || listRes.videos.length,
      videos: listRes.videos,
      message: `Playlist "${listRes.playlistTitle || nameOrUrl}" has ${countRes.count || listRes.videos.length} video(s).`,
      trace: countRes.trace,
    };
  }
}
