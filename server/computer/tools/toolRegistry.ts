import type { ToolDefinition } from "../types.js";
import { AppController } from "../apps/appController.js";
import { KeyboardController } from "../keyboard/keyboardController.js";
import { MouseController } from "../mouse/mouseController.js";
import { SystemController } from "../system/systemController.js";
import { FileController } from "../system/fileController.js";
import { MediaController, type MediaAction } from "../system/mediaController.js";
import { BrowserInspectController } from "../system/browserInspectController.js";
import { ObservationManager } from "../../observation/observationManager.js";
import { BrowserController } from "../browser/browserController.js";

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: (args: Record<string, any>) => Promise<any>;
}

export class ToolRegistry {
  private static tools: Map<string, RegisteredTool> = new Map();

  static {
    this.init();
  }

  private static init(): void {
    // 1. App Control Tools
    this.register({
      definition: {
        name: "open_app",
        displayName: "Open Application",
        description: "Launches an application installed on the operating system.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Name, alias, or executable of the application (e.g. 'vscode', 'chrome', 'whatsapp', 'notepad', 'calc').",
            required: true,
          },
          {
            name: "args",
            type: "array",
            description: "Optional array of command line arguments for the application.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.openApp(args.app, args.args);
      },
    });

    this.register({
      definition: {
        name: "close_app",
        displayName: "Close Application",
        description: "Terminates an application process.",
        category: "app",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Name or executable of the application to close.",
            required: true,
          },
          {
            name: "force",
            type: "boolean",
            description: "Whether to force-kill the process immediately.",
            required: false,
            default: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.closeApp(args.app, args.force ?? true);
      },
    });

    this.register({
      definition: {
        name: "is_app_running",
        displayName: "Check Application Status",
        description: "Checks whether a specific application is currently active/running.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Application name or process executable.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.isAppRunning(args.app);
      },
    });

    this.register({
      definition: {
        name: "focus_app",
        displayName: "Focus Application Window",
        description: "Brings the specified application window to the foreground.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Application name or window title to focus.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.focusApp(args.app);
      },
    });

    this.register({
      definition: {
        name: "switch_between_apps",
        displayName: "Switch Between Applications",
        description: "Switches or toggles between two applications depending on which is currently active.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "First application name.",
            required: true,
          },
          {
            name: "alternateApp",
            type: "string",
            description: "Second application name to alternate with.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.switchBetweenApps(args.app, args.alternateApp);
      },
    });

    this.register({
      definition: {
        name: "restore_app",
        displayName: "Restore Application",
        description: "Restores an application window if minimized and brings it to foreground without launching a new instance.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Application name or window title to restore.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.restoreApp(args.app);
      },
    });

    // 2. Keyboard Control Tools
    this.register({
      definition: {
        name: "type_text",
        displayName: "Type Text",
        description: "Types plain text directly into the currently focused window.",
        category: "keyboard",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "text",
            type: "string",
            description: "The text string to type.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await KeyboardController.typeText(args.text);
      },
    });

    this.register({
      definition: {
        name: "press_key",
        displayName: "Press Key",
        description: "Presses a single keyboard key (e.g. 'Enter', 'Escape', 'Tab', 'Backspace', 'Space').",
        category: "keyboard",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "key",
            type: "string",
            description: "The key name to press.",
            required: true,
            enum: ["enter", "escape", "tab", "backspace", "space", "delete", "up", "down", "left", "right"],
          },
        ],
      },
      handler: async (args) => {
        return await KeyboardController.pressKey(args.key);
      },
    });

    this.register({
      definition: {
        name: "hotkey",
        displayName: "Trigger Hotkey",
        description: "Triggers a keyboard shortcut combination (e.g. ['ctrl', 'c'], ['alt', 'tab']).",
        category: "keyboard",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "keys",
            type: "array",
            description: "Array of key names forming the combination.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await KeyboardController.hotkey(args.keys);
      },
    });

    // 3. Mouse Control Tools
    this.register({
      definition: {
        name: "move_mouse",
        displayName: "Move Mouse",
        description: "Moves the mouse cursor to absolute pixel coordinates (x, y).",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "x",
            type: "number",
            description: "X coordinate (horizontal position).",
            required: true,
          },
          {
            name: "y",
            type: "number",
            description: "Y coordinate (vertical position).",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await MouseController.moveMouse(Number(args.x), Number(args.y));
      },
    });

    this.register({
      definition: {
        name: "click",
        displayName: "Mouse Click",
        description: "Performs a mouse click at the current cursor position.",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "button",
            type: "string",
            description: "Mouse button to click ('left', 'right', 'middle'). Default is 'left'.",
            required: false,
            enum: ["left", "right", "middle"],
            default: "left",
          },
        ],
      },
      handler: async (args) => {
        return await MouseController.click(args.button || "left");
      },
    });

    this.register({
      definition: {
        name: "double_click",
        displayName: "Double Click",
        description: "Performs a double-click at current cursor position.",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await MouseController.doubleClick();
      },
    });

    this.register({
      definition: {
        name: "right_click",
        displayName: "Right Click",
        description: "Performs a right-click at current cursor position.",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await MouseController.rightClick();
      },
    });

    this.register({
      definition: {
        name: "scroll",
        displayName: "Mouse Scroll",
        description: "Scrolls the mouse wheel up (positive) or down (negative).",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "amount",
            type: "number",
            description: "Number of scroll notches (e.g. 3 for up, -3 for down).",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await MouseController.scroll(Number(args.amount));
      },
    });

    this.register({
      definition: {
        name: "get_mouse_position",
        displayName: "Get Mouse Position",
        description: "Retrieves the current coordinates of the mouse cursor.",
        category: "mouse",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await MouseController.getMousePosition();
      },
    });

    // 4. System Inspection & Observation Tools
    this.register({
      definition: {
        name: "take_screenshot",
        displayName: "Take Screenshot",
        description: "Captures the primary monitor as a base64 image.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.takeScreenshot();
      },
    });

    this.register({
      definition: {
        name: "get_active_window",
        displayName: "Get Active Window",
        description: "Retrieves the title and process name of the current foreground window.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.getActiveWindow();
      },
    });

    this.register({
      definition: {
        name: "get_visible_windows",
        displayName: "Get Visible Windows",
        description: "Enumerates all open visible application windows on the desktop, distinguishing foreground window from open windows.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.getVisibleWindows();
      },
    });

    this.register({
      definition: {
        name: "get_installed_apps",
        displayName: "Get Installed Applications",
        description: "Discovers all installed desktop software and Windows Store applications from Windows uninstall registry and app locations.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.getInstalledApps();
      },
    });

    this.register({
      definition: {
        name: "get_running_processes",
        displayName: "Get Running Processes",
        description: "Enumerates running system processes, distinguishing background tasks from visible application windows.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "type",
            type: "string",
            description: "Filter type: 'background', 'visible', or 'all'. Default is 'background'.",
            required: false,
            default: "background",
          },
        ],
      },
      handler: async (args) => {
        return await SystemController.getRunningProcesses(args.type || "background");
      },
    });

    this.register({
      definition: {
        name: "get_screen_size",
        displayName: "Get Screen Size",
        description: "Returns the resolution dimensions (width, height) of the primary display.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.getScreenSize();
      },
    });

    this.register({
      definition: {
        name: "get_os_info",
        displayName: "Get OS Information",
        description: "Retrieves operating system name, architecture, hostname, and uptime.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await SystemController.getOsInfo();
      },
    });

    this.register({
      definition: {
        name: "check_process",
        displayName: "Check Process",
        description: "Checks whether a specific system process is running.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "process_name",
            type: "string",
            description: "Process executable name (e.g. 'chrome.exe', 'explorer.exe').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await SystemController.isProcessRunning(args.process_name);
      },
    });

    this.register({
      definition: {
        name: "observe_computer_state",
        displayName: "Observe Computer State",
        description: "Collects a comprehensive, read-only snapshot of current computer state including active window, process, browser, and screen metrics.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "test_screenshot",
            type: "boolean",
            description: "Whether to perform a test screenshot capture verification.",
            required: false,
            default: false,
          },
        ],
      },
      handler: async (args) => {
        return await ObservationManager.observeComputerState({
          testScreenshot: Boolean(args.test_screenshot),
        });
      },
    });

    // 5. File & Folder Operations Tools
    this.register({
      definition: {
        name: "open_path",
        displayName: "Open File or Folder",
        description: "Opens a file, directory, or special Windows folder (Downloads, Documents, Desktop).",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Path, filename, or special folder to open (e.g. 'downloads', 'documents', 'desktop', 'report.pdf').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await FileController.openPath(args.path);
      },
    });

    this.register({
      definition: {
        name: "create_folder",
        displayName: "Create Folder",
        description: "Creates a new folder on the file system safely.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "folder",
            type: "string",
            description: "Name or path of folder to create (e.g. 'Luma', 'Projects').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await FileController.createFolder(args.folder);
      },
    });

    this.register({
      definition: {
        name: "delete_path",
        displayName: "Delete File or Folder",
        description: "Deletes a file or directory permanently. Requires confirmation before use.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Path of file or folder to delete.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await FileController.deletePath(args.path);
      },
    });

    // 6. Media Control Tools
    this.register({
      definition: {
        name: "media_control",
        displayName: "Media Control",
        description: "Controls media playback (play, pause, next, previous, stop) and volume.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "action",
            type: "string",
            description: "Media action ('play', 'pause', 'play_pause', 'resume', 'stop', 'next', 'previous', 'volume_up', 'volume_down', 'mute').",
            required: true,
            enum: ["play", "pause", "play_pause", "resume", "stop", "next", "previous", "volume_up", "volume_down", "mute"],
          },
        ],
      },
      handler: async (args) => {
        return await MediaController.executeMediaAction(args.action as MediaAction);
      },
    });

    // 7. Browser & Web Page Inspection Tools
    this.register({
      definition: {
        name: "inspect_amazon_search",
        displayName: "Inspect Amazon Search",
        description: "Inspects Amazon search results to find the first organic product URL, title, and price.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search keyword (e.g. 'wireless keyboards').",
            required: true,
          },
          {
            name: "domain",
            type: "string",
            description: "Amazon regional domain (e.g. 'amazon.in' or 'amazon.com'). Default 'amazon.in'.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserInspectController.inspectAmazonSearch(args.query, args.domain || "amazon.in");
      },
    });

    this.register({
      definition: {
        name: "inspect_product_price",
        displayName: "Inspect Product Price",
        description: "Inspects an active product page to extract the real selling price and title.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "url",
            type: "string",
            description: "Direct URL of the product page.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserInspectController.inspectProductPrice(args.url);
      },
    });

    this.register({
      definition: {
        name: "get_clipboard_text",
        displayName: "Get Clipboard Text",
        description: "Retrieves text currently stored in the Windows clipboard.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserInspectController.getClipboardText();
      },
    });

    // 8. Real DOM Browser Automation Tools (Controlled Chrome Session)
    this.register({
      definition: {
        name: "browser_connect",
        displayName: "Connect to Controlled Browser",
        description: "Connects to or visibly launches LUMA's controlled Chrome session with dedicated profile.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "url",
            type: "string",
            description: "Optional initial URL to navigate.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.connect(args.url);
      },
    });

    this.register({
      definition: {
        name: "browser_navigate",
        displayName: "Browser Navigate",
        description: "Navigates the active tab in the controlled Chrome session without opening a new window.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "url",
            type: "string",
            description: "Destination URL.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.navigate(args.url);
      },
    });

    this.register({
      definition: {
        name: "browser_fill_search",
        displayName: "Browser Search Input",
        description: "Locates the actual search box on the rendered page, types the exact query, and submits.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Exact search query string to enter.",
            required: true,
          },
          {
            name: "site",
            type: "string",
            description: "Optional website identifier (e.g. 'flipkart', 'amazon', 'youtube', 'google').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.fillAndSubmitSearch(args.query, args.site);
      },
    });

    this.register({
      definition: {
        name: "browser_wait_results",
        displayName: "Browser Wait Results",
        description: "Waits for and verifies the search results page has loaded for the given query.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search query to verify.",
            required: true,
          },
          {
            name: "site",
            type: "string",
            description: "Optional website identifier (e.g. 'flipkart', 'amazon', 'youtube', 'google').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.verifySearchResults(args.query, args.site);
      },
    });

    this.register({
      definition: {
        name: "browser_get_first_product",
        displayName: "Browser Get First Product",
        description: "Inspects rendered DOM search results to identify the first organic product card and its URL.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Optional website identifier (e.g. 'flipkart', 'amazon').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getFirstSearchResult(args?.site);
      },
    });

    this.register({
      definition: {
        name: "browser_open_product",
        displayName: "Browser Open Product",
        description: "Navigates the current controlled tab to the specified verified product URL.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "product_url",
            type: "string",
            description: "Full URL of the product to open.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.openProduct(args.product_url);
      },
    });

    this.register({
      definition: {
        name: "browser_extract_product_price",
        displayName: "Browser Extract Product Price",
        description: "Extracts the displayed price and product title directly from the rendered product page DOM.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Optional website identifier (e.g. 'flipkart', 'amazon').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.extractProductPrice(args?.site);
      },
    });

    this.register({
      definition: {
        name: "browser_get_state",
        displayName: "Browser Get State",
        description: "Retrieves live connection status, active URL, and page title from the controlled Chrome session.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.getState();
      },
    });

    // 9. YouTube Video Playback and Playlist Tools
    this.register({
      definition: {
        name: "browser_play_first_video",
        displayName: "Play First Video",
        description: "Opens and starts playback of the first video in the active YouTube search results.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video platform (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.playFirstVideo(args?.site);
      },
    });

    this.register({
      definition: {
        name: "browser_control_playback",
        displayName: "Control Video Playback",
        description: "Controls video playback ('play', 'pause', 'resume') on the active webpage.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "action",
            type: "string",
            description: "Playback action ('play', 'pause', 'resume').",
            required: true,
            enum: ["play", "pause", "resume"],
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.controlPlayback(args.action);
      },
    });

    this.register({
      definition: {
        name: "youtube_create_playlist",
        displayName: "Create Playlist",
        description: "Creates a new user playlist with the provided name.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Name of the playlist to create.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.createPlaylist(args.name);
      },
    });

    this.register({
      definition: {
        name: "youtube_add_to_playlist",
        displayName: "Add to Playlist",
        description: "Adds relevant search result videos or current video to the specified playlist.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "playlist_name",
            type: "string",
            description: "Name of the playlist.",
            required: true,
          },
          {
            name: "limit",
            type: "number",
            description: "Number of relevant videos to add (default 3).",
            required: false,
            default: 3,
          },
          {
            name: "videos",
            type: "array",
            description: "Optional pre-extracted video items.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        const limit = Number(args.limit) || 3;
        const videos =
          Array.isArray(args.videos) && args.videos.length > 0
            ? args.videos
            : await BrowserController.getVideoResults(limit);
        return await BrowserController.addVideosToPlaylist(args.playlist_name, videos);
      },
    });

    this.register({
      definition: {
        name: "browser_get_video_results",
        displayName: "Get Video Results",
        description: "Retrieves video cards (title, url, videoId) from the active YouTube page.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "limit",
            type: "number",
            description: "Maximum number of videos to extract (default 3).",
            required: false,
            default: 3,
          },
        ],
      },
      handler: async (args) => {
        const limit = Number(args.limit) || 3;
        return await BrowserController.getVideoResults(limit);
      },
    });

    this.register({
      definition: {
        name: "youtube_play_playlist",
        displayName: "Play Playlist",
        description: "Opens and starts playback of the specified playlist.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Name of the playlist to play.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.playPlaylist(args.name);
      },
    });

    this.register({
      definition: {
        name: "youtube_remove_from_playlist",
        displayName: "Remove from Playlist",
        description: "Removes a video from the specified playlist by title, videoId, or position keyword.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "playlist_name",
            type: "string",
            description: "Name of the playlist.",
            required: true,
          },
          {
            name: "video",
            type: "string",
            description: "Title, ID, or position ('first', 'last') of the video to remove.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.removeVideoFromPlaylist(args.playlist_name, args.video);
      },
    });

    this.register({
      definition: {
        name: "youtube_get_playlist",
        displayName: "Get Playlist",
        description: "Retrieves details and video list for a specified playlist.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Name of the playlist.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getPlaylist(args.name);
      },
    });
  }

  /**
   * Registers a tool into the tool registry.
   */
  static register(tool: RegisteredTool): void {
    const key = tool.definition.name.toLowerCase();
    this.tools.set(key, tool);
  }

  /**
   * Retrieves a tool by its unique name.
   */
  static get(name: string): RegisteredTool | undefined {
    if (!name) return undefined;
    return this.tools.get(name.toLowerCase().trim());
  }

  /**
   * Returns definitions for all registered tools.
   */
  static getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }
}
