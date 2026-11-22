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
import { ContextManager } from "../../memory/contextManager.js";
import { GoogleOAuthManager } from "../../calendar/googleOAuthManager.js";
import { GoogleCalendarClient } from "../../calendar/googleCalendarClient.js";

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

    this.register({
      definition: {
        name: "minimize_app",
        displayName: "Minimize Application",
        description: "Minimizes an application window.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "app",
            type: "string",
            description: "Application name or window title to minimize.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await AppController.minimizeApp(args.app);
      },
    });

    this.register({
      definition: {
        name: "restore_all_minimized",
        displayName: "Restore All Minimized Windows",
        description: "Restores all application windows that are currently minimized.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await AppController.restoreAllMinimized();
      },
    });

    this.register({
      definition: {
        name: "switch_previous_window",
        displayName: "Switch to Previous Window",
        description: "Switches to the previous active window in Z-order.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await AppController.switchPreviousWindow();
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
        name: "find_installed_app",
        displayName: "Find Installed Application",
        description: "Searches locally installed Windows software and Store apps for a query string.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Application name to search for (e.g. 'Google Chrome', 'Notepad').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await SystemController.findInstalledApp(args.query);
      },
    });

    this.register({
      definition: {
        name: "find_process",
        displayName: "Find Running Process",
        description: "Searches currently running Windows processes for a process name or executable.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Process name or executable to search for (e.g. 'chrome.exe', 'notepad.exe').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await SystemController.findProcess(args.query);
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
        description: "Creates a new user playlist with the provided name and privacy directly in YouTube account.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Name of the playlist to create.",
            required: true,
          },
          {
            name: "privacy",
            type: "string",
            description: "Privacy visibility: 'PUBLIC', 'UNLISTED', or 'PRIVATE'.",
            required: false,
            default: "PRIVATE",
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.createPlaylist(args.name, args.privacy);
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
          {
            name: "index",
            type: "number",
            description: "Optional 1-based index of the video to play from the playlist.",
            required: false,
          },
          {
            name: "next",
            type: "boolean",
            description: "If true, advances to and plays the next video in the playlist.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.playPlaylist(args.name, args.index, args.next);
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

    this.register({
      definition: {
        name: "youtube_seek",
        displayName: "Seek Video",
        description: "Seeks the currently playing video forward or backward by the specified number of seconds.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "seconds",
            type: "number",
            description: "Seconds to seek (+10 for forward, -10 for backward).",
            required: true,
          },
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        const seconds = Number(args.seconds) || 0;
        return await BrowserController.seekVideo(seconds, args.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_get_video_info",
        displayName: "Get Video Info",
        description: "Retrieves metadata of the currently playing video (title, channel, duration, progress).",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getVideoInfo(args?.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_get_playback_state",
        displayName: "Get Playback State",
        description: "Detects current playback state: PLAYING, PAUSED, BUFFERING, ENDED, ERROR, NO_VIDEO.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getPlaybackState(args?.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_set_fullscreen",
        displayName: "Set Fullscreen",
        description: "Toggles or sets fullscreen mode for the active video player.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "enable",
            type: "boolean",
            description: "Optional explicit fullscreen state (true for fullscreen, false to exit). Omit to toggle.",
            required: false,
          },
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.setFullscreen(args.enable, args.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_get_fullscreen_state",
        displayName: "Get Fullscreen State",
        description: "Queries whether the active video player is currently in fullscreen mode.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getFullscreenState(args?.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_stop_video",
        displayName: "Stop Video",
        description: "Stops video playback and resets player to beginning.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.stopVideo(args?.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_skip_ad",
        displayName: "Skip Ad",
        description: "Skips active advertisement on YouTube if skip button is present and enabled.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Target video site (default 'youtube').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.skipAd(args?.site);
      },
    });

    this.register({
      definition: {
        name: "youtube_open_playlist_ui",
        displayName: "Open Playlist UI",
        description: "Opens a user playlist on YouTube interface in the controlled browser.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Playlist name or direct YouTube playlist URL.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.openPlaylistUI(args.name);
      },
    });

    this.register({
      definition: {
        name: "youtube_list_playlist_videos_ui",
        displayName: "List Playlist Videos UI",
        description: "Lists videos present in a YouTube playlist page in the controlled browser.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Optional playlist name or URL to open and inspect.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.listPlaylistVideosUI(args?.name);
      },
    });

    this.register({
      definition: {
        name: "youtube_remove_from_playlist_ui",
        displayName: "Remove from Playlist UI",
        description: "Removes a video from a YouTube playlist via UI with confirmation gate.",
        category: "app",
        safetyLevel: "CONFIRM_REQUIRED",
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
            description: "Title or identifier of the video to remove.",
            required: true,
          },
          {
            name: "confirmed",
            type: "boolean",
            description: "User confirmation flag.",
            required: false,
            default: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.removeVideoFromPlaylistUI(args.playlist_name, args.video, args.confirmed);
      },
    });

    this.register({
      definition: {
        name: "youtube_list_playlists",
        displayName: "List YouTube Playlists",
        description: "Lists all playlists in the user's logged-in YouTube account.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.listPlaylists();
      },
    });

    this.register({
      definition: {
        name: "youtube_count_playlist_videos",
        displayName: "Count Playlist Videos",
        description: "Counts total number of videos in a YouTube playlist.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "playlist_name",
            type: "string",
            description: "Name or URL of the playlist.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.countPlaylistVideos(args.playlist_name);
      },
    });

    this.register({
      definition: {
        name: "youtube_help_commands",
        displayName: "YouTube Commands Help",
        description: "Returns the supported command catalog and usage examples for YouTube automation.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "category",
            type: "string",
            description: "Optional category filter ('playback', 'fullscreen', 'ad', 'playlist').",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getYouTubeCommandsCatalog(args?.category);
      },
    });

    this.register({
      definition: {
        name: "youtube_rename_playlist",
        displayName: "Rename Playlist",
        description: "Renames a user playlist directly on YouTube.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "old_name",
            type: "string",
            description: "Current name or URL of the playlist.",
            required: true,
          },
          {
            name: "new_name",
            type: "string",
            description: "New name for the playlist.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.renamePlaylist(args.old_name, args.new_name);
      },
    });

    this.register({
      definition: {
        name: "youtube_update_playlist_privacy",
        displayName: "Update Playlist Privacy",
        description: "Updates visibility/privacy setting of a YouTube playlist ('PUBLIC', 'UNLISTED', 'PRIVATE').",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "playlist_name",
            type: "string",
            description: "Name or URL of the playlist.",
            required: true,
          },
          {
            name: "privacy",
            type: "string",
            description: "Privacy visibility ('PUBLIC', 'UNLISTED', 'PRIVATE').",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.updatePlaylistPrivacy(args.playlist_name, args.privacy);
      },
    });

    this.register({
      definition: {
        name: "youtube_add_search_result_to_playlist",
        displayName: "Add Search Result to Playlist",
        description: "Searches YouTube and adds the video at rank N to a playlist.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search query for YouTube video.",
            required: true,
          },
          {
            name: "rank",
            type: "number",
            description: "Rank of search result (1 for first, 2 for second).",
            required: false,
            default: 1,
          },
          {
            name: "playlist_name",
            type: "string",
            description: "Target playlist name.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        const rank = Number(args.rank) || 1;
        return await BrowserController.addSearchResultToPlaylist(args.query, rank, args.playlist_name);
      },
    });

    this.register({
      definition: {
        name: "youtube_get_playlist_details",
        displayName: "Get Playlist Details",
        description: "Retrieves complete details of a YouTube playlist including stats and video items.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Playlist name or URL.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.getPlaylist(args.name);
      },
    });

    this.register({
      definition: {
        name: "youtube_play_playlist_video",
        displayName: "Play Video from Playlist",
        description: "Plays a specific video by 1-based index from a YouTube playlist or advances to the next video.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "playlist_name",
            type: "string",
            description: "Name or URL of the playlist (e.g. 'Watch Later', 'LUMA').",
            required: false,
          },
          {
            name: "index",
            type: "number",
            description: "1-based index of the video (1 = first, 2 = second, 3 = third).",
            required: false,
          },
          {
            name: "next",
            type: "boolean",
            description: "Whether to play the next video in the playlist.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.playPlaylistVideo(args.playlist_name, args.index, args.next);
      },
    });

    this.register({
      definition: {
        name: "youtube_create_playlist_from_video",
        displayName: "Create Playlist from Video",
        description: "Creates a new YouTube playlist seeded with a specific video using YouTube's real Save-to-playlist workflow.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Name of the playlist to create.",
            required: true,
          },
          {
            name: "privacy",
            type: "string",
            description: "Visibility: 'PUBLIC', 'UNLISTED', or 'PRIVATE'.",
            required: false,
            enum: ["PUBLIC", "UNLISTED", "PRIVATE"],
          },
          {
            name: "video_context",
            type: "object",
            description: "Optional video context details (URL, title, rank, or query).",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.createPlaylistFromVideo(args.name, args.privacy, args.video_context);
      },
    });

    // 10. Browser Tab Management Tools
    this.register({
      definition: {
        name: "browser_new_tab",
        displayName: "New Browser Tab",
        description: "Opens a new tab in the controlled Chrome session and optionally navigates to a URL.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "url",
            type: "string",
            description: "Optional destination URL to open in the new tab.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.createTab(args.url);
      },
    });

    this.register({
      definition: {
        name: "browser_list_tabs",
        displayName: "List Browser Tabs",
        description: "Lists all open tabs in the controlled Chrome session.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.listTabs();
      },
    });

    this.register({
      definition: {
        name: "browser_switch_tab",
        displayName: "Switch Browser Tab",
        description: "Switches to an open browser tab by index or title/URL matching.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "target",
            type: "string",
            description: "Tab index number or title/URL substring to match.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        const tgt = !isNaN(Number(args.target)) ? Number(args.target) : args.target;
        return await BrowserController.switchTab(tgt);
      },
    });

    this.register({
      definition: {
        name: "browser_close_tab",
        displayName: "Close Browser Tab",
        description: "Closes a specific tab or the active tab, preserving other tabs.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "target",
            type: "string",
            description: "Optional tab index or title/URL substring to close. If omitted, closes active tab.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        const tgt = args.target !== undefined && !isNaN(Number(args.target)) ? Number(args.target) : args.target;
        return await BrowserController.closeTab(tgt);
      },
    });

    this.register({
      definition: {
        name: "browser_get_active_tab",
        displayName: "Get Active Tab",
        description: "Retrieves title, index, and URL of the active browser tab.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.getActiveTab();
      },
    });

    // 11. Universal Page Observation & Content Extraction Tools
    this.register({
      definition: {
        name: "browser_inspect_page",
        displayName: "Inspect Webpage DOM",
        description: "Performs semantic DOM inspection on the active webpage, returning headings, buttons, links, inputs, and states.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.inspectPage();
      },
    });

    this.register({
      definition: {
        name: "browser_read_page_content",
        displayName: "Read Page Content",
        description: "Reads, extracts, and summarizes visible text, headings, and search results on the active page.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.readPageContent();
      },
    });

    // 12. Form Inspection & Filling Tools
    this.register({
      definition: {
        name: "browser_inspect_form",
        displayName: "Inspect Form Fields",
        description: "Inspects all interactive form fields on the active webpage.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await BrowserController.inspectForm();
      },
    });

    this.register({
      definition: {
        name: "browser_fill_form",
        displayName: "Fill Form Fields",
        description: "Fills form fields on the active page matching provided data or user profile data.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "data",
            type: "object",
            description: "Key-value map of form field values to enter.",
            required: false,
          },
          {
            name: "submit",
            type: "boolean",
            description: "Whether to request form submission (subject to safety gate confirmation).",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.fillForm(args.data || {}, { submit: args.submit });
      },
    });

    // 13. File / PDF Download Tools
    this.register({
      definition: {
        name: "browser_download_file",
        displayName: "Download File from Page",
        description: "Locates and downloads a document or PDF from the active webpage, saving to Downloads.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Keyword or file type to download (e.g. 'pdf', 'report', 'manual').",
            required: false,
          },
          {
            name: "targetDir",
            type: "string",
            description: "Optional destination directory.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return await BrowserController.downloadFile(args.query || "pdf", args.targetDir);
      },
    });

    // 14. Ranked Video Playback Tool
    this.register({
      definition: {
        name: "browser_play_video_rank",
        displayName: "Play Video By Rank",
        description: "Plays the video at the given rank (1 = first, 2 = second, etc.) on YouTube.",
        category: "app",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "rank",
            type: "number",
            description: "Rank of video to play (1 for first, 2 for second, etc.).",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        const r = Number(args.rank) || 1;
        return await BrowserController.playVideoByRank(r);
      },
    });

    // 15. Context & Personal Memory Tools
    this.register({
      definition: {
        name: "memory_save",
        displayName: "Save Long-Term Memory",
        description: "Saves a new fact or topic into LUMA's persistent local memory.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "topic",
            type: "string",
            description: "Topic or category title.",
            required: true,
          },
          {
            name: "content",
            type: "string",
            description: "Detailed content to remember.",
            required: true,
          },
          {
            name: "tags",
            type: "array",
            description: "Optional search tags.",
            required: false,
          },
          {
            name: "importance",
            type: "number",
            description: "Importance level 1-5 (default 1).",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return ContextManager.saveMemory(args.topic, args.content, args.tags, args.importance);
      },
    });

    this.register({
      definition: {
        name: "memory_get",
        displayName: "Retrieve Memories",
        description: "Retrieves memories matching a query, topic, or tag.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search keyword.",
            required: false,
          },
        ],
      },
      handler: async (args) => {
        return ContextManager.getMemories({ query: args.query });
      },
    });

    this.register({
      definition: {
        name: "memory_review",
        displayName: "Review All Memories",
        description: "Returns profile, preferences, and long-term memories for user review.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return ContextManager.reviewMemories();
      },
    });

    this.register({
      definition: {
        name: "memory_correct",
        displayName: "Correct Memory",
        description: "Updates or corrects an existing memory item.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "id",
            type: "number",
            description: "ID of memory record to correct.",
            required: true,
          },
          {
            name: "content",
            type: "string",
            description: "Corrected content.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return ContextManager.correctMemory(Number(args.id), args.content);
      },
    });

    this.register({
      definition: {
        name: "memory_delete",
        displayName: "Delete Memory",
        description: "Deletes a specific memory item by ID.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "id",
            type: "number",
            description: "ID of memory record to delete.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return ContextManager.deleteMemory(Number(args.id));
      },
    });

    this.register({
      definition: {
        name: "memory_get_profile",
        displayName: "Get User Profile",
        description: "Retrieves the current user profile fields.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return ContextManager.getProfile();
      },
    });

    this.register({
      definition: {
        name: "memory_update_profile",
        displayName: "Update User Profile",
        description: "Updates a user profile field (e.g. name, email, phone).",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "key",
            type: "string",
            description: "Profile field name.",
            required: true,
          },
          {
            name: "value",
            type: "string",
            description: "New value for field.",
            required: true,
          },
        ],
      },
      handler: async (args) => {
        return ContextManager.updateProfile(args.key, args.value);
      },
    });

    this.register({
      definition: {
        name: "memory_get_context",
        displayName: "Get Compact Context",
        description: "Retrieves compact structured context for an incoming user command.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          { name: "command", type: "string", description: "User command", required: true },
          { name: "intent", type: "string", description: "Identified intent", required: false },
        ],
      },
      handler: async (args) => {
        return ContextManager.buildContext(args.command, args.intent);
      },
    });

    this.register({
      definition: {
        name: "memory_save_task_context",
        displayName: "Save Active Task Context",
        description: "Saves active task context and progress into persistent memory.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          { name: "taskId", type: "string", description: "Unique task identifier", required: true },
          { name: "goal", type: "string", description: "Task goal", required: true },
          { name: "currentStep", type: "number", description: "Current step index", required: false },
        ],
      },
      handler: async (args) => {
        ContextManager.saveTaskContext(args.taskId, args.goal, Number(args.currentStep) || 1);
        return { success: true, taskId: args.taskId };
      },
    });

    this.register({
      definition: {
        name: "memory_archive_task_context",
        displayName: "Archive Active Task Context",
        description: "Archives an active task context upon completion or failure.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          { name: "taskId", type: "string", description: "Unique task identifier to archive", required: true },
        ],
      },
      handler: async (args) => {
        ContextManager.archiveTaskContext(args.taskId);
        return { success: true, taskId: args.taskId };
      },
    });

    // 12. Calendar Tools (Phase 1)
    this.register({
      definition: {
        name: "calendar_auth_login",
        displayName: "Connect Google Calendar",
        description: "Initiates Google OAuth 2.0 authorization with PKCE (S256) and opens the consent page in the browser.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        const authRes = GoogleOAuthManager.generateAuthUrl();
        if (!authRes.success || !authRes.url) {
          return { success: false, error: authRes.error || "Failed to generate authorization URL." };
        }
        const openRes = await SystemController.openUrl(authRes.url);
        if (openRes.success) {
          return {
            success: true,
            browserOpened: true,
            message: "Google authorization page opened in your browser. Please approve access to continue.",
            url: authRes.url,
          };
        } else {
          return {
            success: true,
            browserOpened: false,
            message: "Google authorization URL generated, but could not automatically open your browser. Please click the button below to authorize.",
            url: authRes.url,
            error: openRes.error,
          };
        }
      },
    });

    this.register({
      definition: {
        name: "calendar_auth_status",
        displayName: "Google Calendar Connection Status",
        description: "Checks whether Google Calendar is currently connected and reports account details without exposing credentials.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return GoogleOAuthManager.getConnectionStatus();
      },
    });

    this.register({
      definition: {
        name: "calendar_auth_logout",
        displayName: "Disconnect Google Calendar",
        description: "Disconnects Google Calendar, revokes access tokens, and removes stored credentials. Requires explicit user confirmation.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          {
            name: "confirmed",
            type: "boolean",
            description: "Whether the user explicitly confirmed credential revocation and disconnection.",
            required: false,
            default: false,
          },
        ],
      },
      handler: async (args) => {
        return await GoogleOAuthManager.logout(Boolean(args.confirmed));
      },
    });

    this.register({
      definition: {
        name: "calendar_list_upcoming_events",
        displayName: "List Upcoming Calendar Events",
        description: "Fetches events from the user's primary Google Calendar with support for date ranges (today, tomorrow, this week, upcoming), meetings, and event categorization.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          {
            name: "maxResults",
            type: "number",
            description: "Maximum number of upcoming events to retrieve (default: 10, max: 50).",
            required: false,
            default: 10,
          },
          {
            name: "dateFilter",
            type: "string",
            description: "Date filter: 'today', 'tomorrow', 'this_week', or 'upcoming'. Default is 'upcoming'.",
            required: false,
            default: "upcoming",
          },
          {
            name: "filterType",
            type: "string",
            description: "Filter type: 'all' or 'meeting'. Default is 'all'.",
            required: false,
            default: "all",
          },
          {
            name: "nextOnly",
            type: "boolean",
            description: "Whether to return only the single next upcoming meeting/event.",
            required: false,
            default: false,
          },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.listUpcomingEvents({
          maxResults: args.maxResults,
          dateFilter: args.dateFilter,
          filterType: args.filterType,
          nextOnly: Boolean(args.nextOnly),
        });
      },
    });

    this.register({
      definition: {
        name: "calendar_get_timezone",
        displayName: "Get Calendar Timezone",
        description: "Retrieves the primary Google Calendar timezone and local host machine timezone.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [],
      },
      handler: async () => {
        return await GoogleCalendarClient.getCalendarTimezone();
      },
    });

    this.register({
      definition: {
        name: "calendar_create_event",
        displayName: "Create Calendar Event",
        description: "Creates a new event on Google Calendar with title, date, time, attendees, reminders, and Google Meet link. Requires user confirmation.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          { name: "summary", type: "string", description: "Title or summary of the event.", required: true },
          { name: "start", type: "string", description: "Start time (ISO string) or date (YYYY-MM-DD).", required: true },
          { name: "end", type: "string", description: "End time (ISO string) or date (YYYY-MM-DD).", required: false },
          { name: "durationMinutes", type: "number", description: "Duration in minutes (default: 60).", required: false, default: 60 },
          { name: "isAllDay", type: "boolean", description: "Whether this is an all-day event.", required: false, default: false },
          { name: "description", type: "string", description: "Event description or notes.", required: false },
          { name: "location", type: "string", description: "Event location.", required: false },
          { name: "attendees", type: "array", description: "List of attendee names or email addresses.", required: false },
          { name: "recurrence", type: "array", description: "Recurrence rules (RRULE).", required: false },
          { name: "reminderMinutes", type: "number", description: "Reminder minutes before event (e.g. 15).", required: false, default: 15 },
          { name: "createMeet", type: "boolean", description: "Whether to generate a Google Meet video conference link.", required: false, default: true },
        ],
      },
      handler: async (args) => {
        const reminders = args.reminderMinutes
          ? { useDefault: false, overrides: [{ method: "popup" as const, minutes: Number(args.reminderMinutes) }] }
          : undefined;
        return await GoogleCalendarClient.createEvent({
          summary: args.summary,
          start: args.start,
          end: args.end,
          durationMinutes: args.durationMinutes,
          isAllDay: Boolean(args.isAllDay),
          description: args.description,
          location: args.location,
          attendees: args.attendees,
          recurrence: args.recurrence,
          reminders,
          createMeet: args.createMeet !== false,
        });
      },
    });

    this.register({
      definition: {
        name: "calendar_update_event",
        displayName: "Update Calendar Event",
        description: "Updates an existing event on Google Calendar. Requires user confirmation.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          { name: "eventId", type: "string", description: "The ID of the event to update.", required: true },
          { name: "summary", type: "string", description: "Updated event title.", required: false },
          { name: "start", type: "string", description: "Updated start time (ISO string).", required: false },
          { name: "end", type: "string", description: "Updated end time (ISO string).", required: false },
          { name: "durationMinutes", type: "number", description: "Updated duration in minutes.", required: false },
          { name: "location", type: "string", description: "Updated location.", required: false },
          { name: "description", type: "string", description: "Updated description.", required: false },
          { name: "attendees", type: "array", description: "Updated attendees list.", required: false },
          { name: "recurringScope", type: "string", description: "Recurring scope: 'this_occurrence' or 'all'.", required: false, default: "this_occurrence" },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.updateEvent({
          eventId: args.eventId,
          summary: args.summary,
          start: args.start,
          end: args.end,
          durationMinutes: args.durationMinutes,
          location: args.location,
          description: args.description,
          attendees: args.attendees,
          recurringScope: args.recurringScope,
        });
      },
    });

    this.register({
      definition: {
        name: "calendar_delete_event",
        displayName: "Delete Calendar Event",
        description: "Deletes an event from Google Calendar. Requires user confirmation.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          { name: "eventId", type: "string", description: "ID of the event to delete.", required: true },
          { name: "recurringScope", type: "string", description: "Recurring scope: 'this_occurrence' or 'all'.", required: false, default: "this_occurrence" },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.deleteEvent(args.eventId, { recurringScope: args.recurringScope });
      },
    });

    this.register({
      definition: {
        name: "calendar_duplicate_event",
        displayName: "Duplicate Calendar Event",
        description: "Duplicates an existing event onto a new date or time. Requires user confirmation.",
        category: "system",
        safetyLevel: "CONFIRM_REQUIRED",
        parameters: [
          { name: "eventId", type: "string", description: "ID of the event to duplicate.", required: true },
          { name: "newStart", type: "string", description: "New start time (ISO string).", required: true },
          { name: "newEnd", type: "string", description: "New end time (ISO string).", required: false },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.duplicateEvent(args.eventId, args.newStart, args.newEnd);
      },
    });

    this.register({
      definition: {
        name: "calendar_find_events",
        displayName: "Find Calendar Events",
        description: "Searches Google Calendar events by query text, attendee, or date.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          { name: "query", type: "string", description: "Search query text.", required: false },
          { name: "date", type: "string", description: "Date to search (YYYY-MM-DD).", required: false },
          { name: "attendee", type: "string", description: "Attendee name or email.", required: false },
          { name: "maxResults", type: "number", description: "Maximum number of results.", required: false, default: 20 },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.findEvents(args);
      },
    });

    this.register({
      definition: {
        name: "calendar_check_conflicts",
        displayName: "Check Calendar Conflicts",
        description: "Checks for overlapping events in a time window and suggests alternative free slots.",
        category: "system",
        safetyLevel: "SAFE",
        parameters: [
          { name: "start", type: "string", description: "Start time (ISO string).", required: true },
          { name: "end", type: "string", description: "End time (ISO string).", required: true },
          { name: "excludeEventId", type: "string", description: "Event ID to exclude from conflict check.", required: false },
        ],
      },
      handler: async (args) => {
        return await GoogleCalendarClient.checkConflicts(args.start, args.end, args.excludeEventId);
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
