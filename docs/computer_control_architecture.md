# LUMA — Computer Control Module Architecture Guide

Welcome to the internal architecture guide for **LUMA's Local Computer Control Module**. This document explains how LUMA interacts directly with your computer, how tools are structured, and how the future AI Command Router will connect to this foundation.

---

## 1. What is the Computer Control Module?

The **Computer Control Module** is an independent, non-AI execution subsystem that sits between LUMA and your Windows Operating System.

In this phase, **no LLM or SLM is involved** in executing computer actions. The module is purely deterministic, fast, and secure:

```
[ LUMA UI / Future Command Router ]
               ↓
     [ Tool Executor ]
               ↓
    [ Computer Control Layer ]
   ┌───────────┼───────────┬───────────┐
   ↓           ↓           ↓           ↓
[ Apps ]  [ Keyboard ]  [ Mouse ]  [ System ]
   └───────────┼───────────┴───────────┘
               ↓
   [ Windows Operating System ]
```

---

## 2. What is a "Tool"?

In LUMA, a **Tool** is a discrete, well-defined function that performs a single specific task on the operating system.

Every tool has:
* **`name`**: Unique identifier (e.g. `open_app`, `type_text`, `move_mouse`).
* **`displayName`**: Human-readable title (e.g. "Open Application").
* **`description`**: What the tool does.
* **`category`**: Category group (`app`, `keyboard`, `mouse`, `system`).
* **`safetyLevel`**: Safety classification (`SAFE`, `CONFIRM_REQUIRED`, `RESTRICTED`).
* **`parameters`**: Expected argument schema (names, types, required flags, enumerations).
* **`handler`**: The underlying TypeScript/Node.js asynchronous function that performs the real OS action.

---

## 3. What the Tool Executor Does

The **`ToolExecutor`** (`server/computer/tools/toolExecutor.ts`) acts as the single gateway for all tool invocations.

When an action is requested, the Tool Executor performs the following steps:
1. **Verification**: Checks if the requested tool exists in `ToolRegistry`.
2. **Schema Validation**: Validates that all required parameters are provided and match the expected types (e.g., numbers, strings, arrays).
3. **Execution**: Invokes the registered tool handler with error boundaries to prevent server crashes.
4. **Action Logging**: Automatically records the timestamp, tool name, arguments, status (`SUCCESS` or `ERROR`), and duration into `ActionLogger`.
5. **Structured Result**: Returns a standard JSON response:
   ```json
   {
     "success": true,
     "tool": "open_app",
     "result": { "message": "Visual Studio Code opened successfully." },
     "durationMs": 142,
     "timestamp": "2026-08-31T06:40:00.000Z"
   }
   ```

---

## 4. What the Application Registry Does

The **`AppRegistry`** (`server/computer/apps/appRegistry.ts`) is a centralized catalog of known desktop applications.

Instead of hardcoding file paths across the app, the registry contains definitions with multiple fallback strategies:
* **Standard Paths**: Checks common installation folders (e.g. `%LOCALAPPDATA%\Programs\...`, `C:\Program Files\...`).
* **System PATH Resolution**: Uses `where.exe <command>` to dynamically detect commands in Windows `PATH`.
* **URI Protocol Schemes**: Supports protocol handlers (e.g. `whatsapp:`, `spotify:`, `calculator:`).
* **Graceful Fallbacks**: If an application is not found, returns a readable error instead of crashing.

---

## 5. How Keyboard Control Works

The **`KeyboardController`** (`server/computer/keyboard/keyboardController.ts`) interacts with Windows through `WindowsBridge` using .NET's `System.Windows.Forms.SendKeys`:

* **Typing Text (`type_text`)**: Escapes special characters (such as `+`, `^`, `%`, `~`, `{`, `}`) and delivers keystrokes to whichever window currently holds system focus.
* **Key Presses (`press_key`)**: Maps common key names (e.g., `enter` → `{ENTER}`, `escape` → `{ESC}`, `tab` → `{TAB}`, `backspace` → `{BACKSPACE}`) and fires the keystroke.
* **Hotkeys (`hotkey`)**: Translates modifier keys (`Ctrl` → `^`, `Alt` → `%`, `Shift` → `+`) combined with main keys to trigger shortcuts like `Ctrl+C`, `Alt+Tab`, or `Ctrl+Shift+Esc`.

---

## 6. How Mouse Control Works

The **`MouseController`** (`server/computer/mouse/mouseController.ts`) interacts with the Windows cursor:

* **Cursor Movement (`move_mouse`)**: Uses `[System.Windows.Forms.Cursor]::Position` to position the cursor at exact screen coordinates $(x, y)$, clamped safely within primary display bounds.
* **Clicking (`click`, `double_click`, `right_click`)**: Uses Win32 `mouse_event` API via P/Invoke to send `MOUSEEVENTF_LEFTDOWN`, `MOUSEEVENTF_LEFTUP`, `MOUSEEVENTF_RIGHTDOWN`, and `MOUSEEVENTF_RIGHTUP` events.
* **Scrolling (`scroll`)**: Sends `MOUSEEVENTF_WHEEL` delta events (where +120 units corresponds to one notch up and -120 corresponds to one notch down).
* **Position Inspection (`get_mouse_position`)**: Reads the current live cursor coordinates.

---

## 7. How Screenshots Work

The **`SystemController`** (`server/computer/system/systemController.ts`) captures the primary display:

1. Uses `[System.Windows.Forms.Screen]::PrimaryScreen.Bounds` to determine display width and height.
2. Creates a `System.Drawing.Bitmap` and copies the display buffer using `Graphics.CopyFromScreen`.
3. Encodes the image directly to a JPEG byte array in memory.
4. Converts the bytes to a standard Base64 Data URL (`data:image/jpeg;base64,...`).
5. Returns the data URL and metadata to LUMA for live visual monitoring in the UI.

---

## 8. How to Add a New Application

To add a new application to LUMA, edit `server/computer/apps/appRegistry.ts` and add an entry to `DEFAULT_APPS`:

```typescript
{
  name: "blender",
  displayName: "Blender 3D",
  category: "Graphics",
  executableName: "blender.exe",
  commandName: "blender",
  standardPaths: [
    "C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe",
  ],
  description: "Open source 3D creation suite.",
}
```

The application will immediately appear in the UI dropdown and be available to `open_app`, `close_app`, `is_app_running`, and `focus_app`.

---

## 9. How to Add a New Tool

To add a new computer control tool:

1. **Implement the logic** in the relevant controller (e.g. `SystemController` or `AppController`).
2. **Register the tool** in `server/computer/tools/toolRegistry.ts`:

```typescript
this.register({
  definition: {
    name: "minimize_all_windows",
    displayName: "Minimize All Windows",
    description: "Minimizes all open application windows to show desktop.",
    category: "system",
    safetyLevel: "SAFE",
    parameters: [],
  },
  handler: async () => {
    // Call controller / bridge logic
    return await WindowsBridge.sendKeyStroke("^{ESC}");
  },
});
```

The new tool is automatically discovered by `/api/computer/tools` and available for execution via `POST /api/computer/execute`.

---

## 10. How the Future Command Router Will Connect

In the next phase, we will introduce the **Command Router**.

Instead of manually clicking buttons in the UI, the router will parse natural-language commands (e.g. *"Open VS Code and write a hello world script"*) into a sequence of tool calls:

```
USER COMMAND: "Open VS Code"
       ↓
[ Natural Language / Rule Matcher ]
       ↓
Resolved Action: { tool: "open_app", arguments: { app: "vscode" } }
       ↓
[ Tool Executor ] (Already Built & Tested)
       ↓
[ App Controller ] (Already Built & Tested)
       ↓
[ Windows OS ] -> VS Code Opens
```

Because the Computer Control layer is completely modular and independent, the future router will simply call `ToolExecutor.executeTool(toolName, args)` without touching any low-level operating system code!
