import { WindowsBridge } from "../computer/native/windowsBridge.js";
import type { WindowsObservation } from "./models.js";

/**
 * ActiveWindowObserver
 * Retrieves the currently active foreground window details via native Windows APIs.
 */
export class ActiveWindowObserver {
  private static readonly TIMEOUT_MS = 2500;

  /**
   * Observe the current foreground window state safely within timeout boundaries.
   */
  static async observe(): Promise<{ observation: WindowsObservation; error?: string }> {
    try {
      const result = await Promise.race([
        this.fetchActiveWindow(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Active window observer timed out")), this.TIMEOUT_MS)
        ),
      ]);

      return { observation: result };
    } catch (err: any) {
      const errorMsg = `ActiveWindowObserver error: ${err?.message || "Unknown error"}`;
      return {
        observation: {
          active_window: null,
          process_name: null,
          process_id: null,
          window_available: false,
          hwnd: null,
          visibility: "unknown",
        },
        error: errorMsg,
      };
    }
  }

  private static async fetchActiveWindow(): Promise<WindowsObservation> {
    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinActiveObs {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinActiveObs').Type) {
    Add-Type -TypeDefinition $code
}

$hwnd = [WinActiveObs]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[WinActiveObs]::GetWindowText($hwnd, $sb, 512) | Out-Null
$pidOut = 0
[WinActiveObs]::GetWindowThreadProcessId($hwnd, [ref]$pidOut) | Out-Null

$pName = ""
if ($pidOut -gt 0) {
    try {
        $p = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
        if ($p) { $pName = $p.ProcessName }
    } catch {}
}

$isVisible = $false
$isMinimized = $false
if ($hwnd -ne [IntPtr]::Zero) {
    try {
        $isVisible = [WinActiveObs]::IsWindowVisible($hwnd)
        $isMinimized = [WinActiveObs]::IsIconic($hwnd)
    } catch {}
}

$visibility = "unknown"
if ($hwnd -ne [IntPtr]::Zero) {
    if ($isMinimized) {
        $visibility = "minimized"
    } elseif ($isVisible) {
        $visibility = "visible"
    } else {
        $visibility = "hidden"
    }
}

@{
    hwnd = $hwnd.ToInt64()
    title = $sb.ToString()
    processId = [int]$pidOut
    processName = $pName
    visibility = $visibility
} | ConvertTo-Json -Compress
`;

    try {
      const data = await WindowsBridge.runPowerShellJson<{
        hwnd: number;
        title: string;
        processId: number;
        processName: string;
        visibility?: "visible" | "minimized" | "hidden" | "unknown";
      }>(script);

      const isValidHwnd = typeof data.hwnd === "number" && data.hwnd > 0;
      const title = data.title?.trim() || (isValidHwnd ? "Desktop" : null);

      return {
        active_window: title,
        process_name: data.processName?.trim() || null,
        process_id: data.processId && data.processId > 0 ? data.processId : null,
        window_available: isValidHwnd && Boolean(title || data.processName),
        hwnd: isValidHwnd ? data.hwnd : null,
        visibility: data.visibility || (isValidHwnd ? "visible" : "unknown"),
      };
    } catch {
      // Fallback to existing WindowsBridge.getActiveWindowInfo() if custom script had issues
      const base = await WindowsBridge.getActiveWindowInfo();
      const isValidHwnd = typeof base.hwnd === "number" && base.hwnd > 0;
      return {
        active_window: base.title?.trim() || (isValidHwnd ? "Desktop" : null),
        process_name: base.processName?.trim() || null,
        process_id: base.processId && base.processId > 0 ? base.processId : null,
        window_available: isValidHwnd,
        hwnd: isValidHwnd ? base.hwnd : null,
        visibility: isValidHwnd ? "visible" : "unknown",
      };
    }
  }
}
