import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WINDOW_MANAGER_SCRIPT = path.resolve(__dirname, "scripts", "windowManager.ps1");

export interface VisibleWindow {
  hwnd: number;
  title: string;
  processId: number;
  processName: string;
  isForeground: boolean;
  isMinimized: boolean;
}

/**
 * WindowsBridge handles low-level Windows OS interactions safely and reliably
 * via PowerShell and .NET / Win32 APIs without requiring external binary build tools.
 */
export class WindowsBridge {
  /**
   * Executes a PowerShell script safely using UTF-16LE Base64 encoding.
   * This completely prevents shell injection, quote escaping issues, and syntax errors.
   */
  static async runPowerShell(script: string): Promise<string> {
    // Check if J:\Temp exists and is writable, otherwise keep default user temp
    const wrapper = `
try {
    if (Test-Path "J:\\Temp") {
        $t = "J:\\Temp\\_test_w.tmp"
        [System.IO.File]::WriteAllText($t, "1")
        [System.IO.File]::Delete($t)
        $env:TEMP = "J:\\Temp"
        $env:TMP = "J:\\Temp"
    }
} catch {}
${script}
`;
    const b64 = Buffer.from(wrapper, "utf16le").toString("base64");
    const command = `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${b64}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 25 * 1024 * 1024, // 25 MB buffer for high-res screenshots
        windowsHide: true,
      });

      if (stderr && stderr.includes("ParserError")) {
        throw new Error(`PowerShell Syntax Error: ${stderr}`);
      }

      return stdout.trim();
    } catch (err: any) {
      // Ignore non-fatal progress/informational stream warnings
      const message = err?.message || String(err);
      if (err.stdout && err.stdout.trim().length > 0) {
        return err.stdout.trim();
      }
      throw new Error(`Windows OS execution failed: ${message}`);
    }
  }

  /**
   * Executes a PowerShell script that returns JSON and parses the output.
   */
  static async runPowerShellJson<T = any>(script: string): Promise<T> {
    const raw = await this.runPowerShell(script);
    if (!raw) {
      throw new Error("No output returned from Windows command.");
    }

    try {
      // Sometimes PowerShell output contains XML progress headers, extract JSON payload
      const jsonStart = raw.indexOf("{");
      const arrayStart = raw.indexOf("[");
      let startIdx = 0;

      if (jsonStart !== -1 && (arrayStart === -1 || jsonStart < arrayStart)) {
        startIdx = jsonStart;
      } else if (arrayStart !== -1) {
        startIdx = arrayStart;
      }

      const jsonStr = raw.substring(startIdx);
      return JSON.parse(jsonStr) as T;
    } catch {
      throw new Error(`Failed to parse JSON response from Windows: ${raw.slice(0, 200)}...`);
    }
  }

  /**
   * Get primary screen dimensions.
   */
  static async getScreenBounds(): Promise<{ width: number; height: number }> {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
@{ width = $b.Width; height = $b.Height } | ConvertTo-Json -Compress
`;
    return await this.runPowerShellJson<{ width: number; height: number }>(script);
  }

  /**
   * Get current mouse cursor position.
   */
  static async getMousePosition(): Promise<{ x: number; y: number }> {
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$pos = [System.Windows.Forms.Cursor]::Position
@{ x = $pos.X; y = $pos.Y } | ConvertTo-Json -Compress
`;
    return await this.runPowerShellJson<{ x: number; y: number }>(script);
  }

  /**
   * Set mouse cursor position to absolute coordinates.
   */
  static async setMousePosition(x: number, y: number): Promise<void> {
    const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${Math.round(x)}, ${Math.round(y)})
`;
    await this.runPowerShell(script);
  }

  /**
   * Performs a mouse click (left, right, double, or middle click) using Win32 mouse_event.
   */
  static async mouseClick(action: "left" | "right" | "middle" | "double"): Promise<void> {
    let script = "";

    if (action === "double") {
      script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) {
    Add-Type -TypeDefinition $code
}
[WinMouse]::mouse_event(0x0002, 0, 0, 0, 0) # LEFTDOWN
[WinMouse]::mouse_event(0x0004, 0, 0, 0, 0) # LEFTUP
Start-Sleep -Milliseconds 50
[WinMouse]::mouse_event(0x0002, 0, 0, 0, 0) # LEFTDOWN
[WinMouse]::mouse_event(0x0004, 0, 0, 0, 0) # LEFTUP
`;
    } else if (action === "right") {
      script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) {
    Add-Type -TypeDefinition $code
}
[WinMouse]::mouse_event(0x0008, 0, 0, 0, 0) # RIGHTDOWN
[WinMouse]::mouse_event(0x0010, 0, 0, 0, 0) # RIGHTUP
`;
    } else if (action === "middle") {
      script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) {
    Add-Type -TypeDefinition $code
}
[WinMouse]::mouse_event(0x0020, 0, 0, 0, 0) # MIDDLEDOWN
[WinMouse]::mouse_event(0x0040, 0, 0, 0, 0) # MIDDLEUP
`;
    } else {
      // Standard left click
      script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) {
    Add-Type -TypeDefinition $code
}
[WinMouse]::mouse_event(0x0002, 0, 0, 0, 0) # LEFTDOWN
[WinMouse]::mouse_event(0x0004, 0, 0, 0, 0) # LEFTUP
`;
    }

    await this.runPowerShell(script);
  }

  /**
   * Performs mouse wheel scrolling. Positive amount scrolls UP, negative scrolls DOWN.
   */
  static async mouseScroll(amount: number): Promise<void> {
    // 120 units per standard scroll click in Win32
    const delta = Math.round(amount * 120);
    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinScroll {
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinScroll').Type) {
    Add-Type -TypeDefinition $code
}
[WinScroll]::mouse_event(0x0800, 0, 0, [uint32]${delta}, 0) # MOUSEEVENTF_WHEEL
`;
    await this.runPowerShell(script);
  }

  /**
   * Types plain text directly into the currently focused window using SendKeys.
   * Special SendKeys characters (+, ^, %, ~, (, ), {, }, [, ]) are safely escaped.
   */
  static async typeText(text: string): Promise<void> {
    if (!text) return;

    // In SendKeys, characters +, ^, %, ~, (, ), {, }, [, ] must be enclosed in braces {}
    const escaped = text.replace(/([+^%~(){}[\]])/g, "{$1}");
    const jsonStr = JSON.stringify(escaped);

    const script = `
Add-Type -AssemblyName System.Windows.Forms
$text = ${jsonStr}
[System.Windows.Forms.SendKeys]::SendWait($text)
`;
    await this.runPowerShell(script);
  }

  /**
   * Sends a special key stroke (Enter, Escape, Tab, Backspace, etc.)
   */
  static async sendKeyStroke(sendKeyPattern: string): Promise<void> {
    const jsonStr = JSON.stringify(sendKeyPattern);
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$key = ${jsonStr}
[System.Windows.Forms.SendKeys]::SendWait($key)
`;
    await this.runPowerShell(script);
  }

  /**
   * Captures the primary display and returns a Base64-encoded JPEG image string.
   */
  static async captureScreenshot(): Promise<{ base64: string; width: number; height: number }> {
    const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bytes = $ms.ToArray()
$b64 = [System.Convert]::ToBase64String($bytes)
$g.Dispose()
$bmp.Dispose()
$ms.Dispose()

@{
    width = $bounds.Width
    height = $bounds.Height
    base64 = $b64
} | ConvertTo-Json -Compress
`;
    return await this.runPowerShellJson<{ base64: string; width: number; height: number }>(script);
  }

  /**
   * Executes a standalone PowerShell script file safely.
   */
  static async runScriptFile<T = any>(scriptPath: string, args: string[] = []): Promise<T> {
    const formattedArgs = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
    const command = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" ${formattedArgs}`;

    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 25 * 1024 * 1024,
      windowsHide: true,
    });

    if (stderr && stderr.includes("ParserError")) {
      throw new Error(`PowerShell Syntax Error in ${path.basename(scriptPath)}: ${stderr}`);
    }

    const raw = stdout.trim();
    if (!raw) {
      return [] as unknown as T;
    }

    try {
      const jsonStart = raw.indexOf("{");
      const arrayStart = raw.indexOf("[");
      let startIdx = 0;

      if (jsonStart !== -1 && (arrayStart === -1 || jsonStart < arrayStart)) {
        startIdx = jsonStart;
      } else if (arrayStart !== -1) {
        startIdx = arrayStart;
      }

      const jsonStr = raw.substring(startIdx);
      return JSON.parse(jsonStr) as T;
    } catch {
      throw new Error(`Failed to parse JSON response from script: ${raw.slice(0, 200)}...`);
    }
  }

  /**
   * Enumerate all visible application windows on the desktop using Win32 EnumDesktopWindows.
   * Filters out cloaked windows, background services, and tooltips.
   */
  static async getVisibleWindows(): Promise<VisibleWindow[]> {
    try {
      const result = await this.runScriptFile<VisibleWindow[]>(WINDOW_MANAGER_SCRIPT, ["-Action", "list"]);
      return Array.isArray(result) ? result : result ? [result] : [];
    } catch (err: any) {
      console.warn("[WindowsBridge] getVisibleWindows error, falling back:", err?.message);
      return [];
    }
  }

  /**
   * Gets details of the currently active / foreground window.
   */
  static async getActiveWindowInfo(): Promise<{
    title: string;
    processName: string;
    processId: number;
    hwnd: number;
  }> {
    try {
      const active = await this.runScriptFile<{
        title: string;
        processName: string;
        processId: number;
        hwnd: number;
      }>(WINDOW_MANAGER_SCRIPT, ["-Action", "active"]);

      if (active && (active.title || active.processName)) {
        return active;
      }
    } catch {
      // Fallback to in-process WinActive script below
    }

    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinActive {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinActive').Type) {
    Add-Type -TypeDefinition $code
}

$hwnd = [WinActive]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[WinActive]::GetWindowText($hwnd, $sb, 512) | Out-Null
$pidOut = 0
[WinActive]::GetWindowThreadProcessId($hwnd, [ref]$pidOut) | Out-Null

$pName = ""
if ($pidOut -gt 0) {
    try {
        $p = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
        if ($p) { $pName = $p.ProcessName }
    } catch {}
}

@{
    hwnd = $hwnd.ToInt64()
    title = $sb.ToString().Trim()
    processId = [int]$pidOut
    processName = $pName
} | ConvertTo-Json -Compress
`;
    return await this.runPowerShellJson<{
      title: string;
      processName: string;
      processId: number;
      hwnd: number;
    }>(script);
  }

  /**
   * Focus an application window by title, process name, or HWND.
   * Restores minimized window, shows it, and brings it to top.
   */
  static async focusWindow(titleOrProcessOrHwnd: string): Promise<boolean> {
    try {
      const res = await this.runScriptFile<{ success: boolean }>(WINDOW_MANAGER_SCRIPT, [
        "-Action",
        "focus",
        "-Target",
        titleOrProcessOrHwnd,
      ]);
      if (res && res.success) return true;
    } catch {
      // Fallback to WScript.Shell
    }

    const jsonTarget = JSON.stringify(titleOrProcessOrHwnd);
    const script = `
$wshell = New-Object -ComObject WScript.Shell
$target = ${jsonTarget}
$success = $wshell.AppActivate($target)
@{ success = $success } | ConvertTo-Json -Compress
`;
    try {
      const res = await this.runPowerShellJson<{ success: boolean }>(script);
      return Boolean(res.success);
    } catch {
      return false;
    }
  }

  /**
   * Safely closes an application window using Win32 WM_CLOSE message.
   * Avoids killing entire process tree or ApplicationFrameHost.
   */
  static async closeWindow(titleOrProcessOrHwnd: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.runScriptFile<{ success: boolean; error?: string }>(WINDOW_MANAGER_SCRIPT, [
        "-Action",
        "close",
        "-Target",
        titleOrProcessOrHwnd,
      ]);
      return res;
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to close window." };
    }
  }
}
