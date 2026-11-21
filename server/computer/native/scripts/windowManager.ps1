param (
    [Parameter(Mandatory = $true)]
    [ValidateSet("list", "active", "focus", "close")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$Target
)

$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class WinWindowManager {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

    public const int DWMWA_CLOAKED = 14;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int SW_RESTORE = 9;
    public const int SW_SHOW = 5;
    public const uint WM_CLOSE = 0x0010;

    public static List<Dictionary<string, object>> GetVisibleWindows() {
        var list = new List<Dictionary<string, object>>();
        IntPtr fg = GetForegroundWindow();

        IntPtr hDesktop = OpenInputDesktop(0, false, 0x0100 | 0x0040);

        EnumWindowsProc proc = (hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;

            int len = GetWindowTextLength(hWnd);
            if (len == 0) return true;

            int cloaked = 0;
            DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, sizeof(int));
            if (cloaked != 0) return true;

            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            if ((exStyle & WS_EX_TOOLWINDOW) != 0) return true;

            var sb = new StringBuilder(len + 1);
            GetWindowText(hWnd, sb, sb.Capacity);
            string title = sb.ToString().Trim();

            if (string.IsNullOrEmpty(title)) return true;
            if (title == "Program Manager" || title == "Windows Input Experience") return true;

            uint procId = 0;
            GetWindowThreadProcessId(hWnd, out procId);

            string pName = "";
            try {
                var p = System.Diagnostics.Process.GetProcessById((int)procId);
                if (p != null) pName = p.ProcessName;
            } catch {}

            var dict = new Dictionary<string, object>();
            dict["hwnd"] = hWnd.ToInt64();
            dict["title"] = title;
            dict["processId"] = (int)procId;
            dict["processName"] = pName;
            dict["isForeground"] = (hWnd == fg);
            dict["isMinimized"] = IsIconic(hWnd);

            list.Add(dict);
            return true;
        };

        if (hDesktop != IntPtr.Zero) {
            EnumDesktopWindows(hDesktop, proc, IntPtr.Zero);
            CloseDesktop(hDesktop);
        }

        return list;
    }

    public static bool FocusTargetWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        if (IsIconic(hWnd)) {
            ShowWindowAsync(hWnd, SW_RESTORE);
        }
        ShowWindowAsync(hWnd, SW_SHOW);
        BringWindowToTop(hWnd);
        return SetForegroundWindow(hWnd);
    }

    public static bool CloseTargetWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        SendMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        return true;
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'WinWindowManager').Type) {
    Add-Type -TypeDefinition $code
}

switch ($Action) {
    "list" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        if (-not $windows -or $windows.Count -eq 0) {
            Write-Output "[]"
        } elseif ($windows.Count -eq 1) {
            $single = $windows[0] | ConvertTo-Json -Compress
            Write-Output "[$single]"
        } else {
            Write-Output ($windows | ConvertTo-Json -Compress)
        }
    }
    "active" {
        $fg = [WinWindowManager]::GetForegroundWindow()
        $windows = [WinWindowManager]::GetVisibleWindows()
        $active = $null
        
        if ($fg -ne [IntPtr]::Zero) {
            $active = $windows | Where-Object { $_.hwnd -eq $fg.ToInt64() } | Select-Object -First 1
        }

        if (-not $active -and $fg -ne [IntPtr]::Zero) {
            $sb = New-Object System.Text.StringBuilder 512
            [WinWindowManager]::GetWindowText($fg, $sb, 512) | Out-Null
            $foundPid = 0
            [WinWindowManager]::GetWindowThreadProcessId($fg, [ref]$foundPid) | Out-Null
            $pName = ""
            if ($foundPid -gt 0) {
                try { $pName = (Get-Process -Id $foundPid -ErrorAction SilentlyContinue).ProcessName } catch {}
            }
            $t = $sb.ToString().Trim()
            if ($t -or $pName) {
                $active = @{
                    hwnd = $fg.ToInt64()
                    title = $t
                    processId = [int]$foundPid
                    processName = $pName
                    isForeground = $true
                    isMinimized = $false
                }
            }
        }

        if (-not $active) {
            # Check if any window is marked isForeground
            $active = $windows | Where-Object { $_.isForeground -eq $true } | Select-Object -First 1
        }

        if (-not $active -and $windows.Count -gt 0) {
            $active = $windows[0]
        }

        if (-not $active) {
            $active = @{
                hwnd = 0
                title = "Desktop"
                processId = 0
                processName = "explorer"
                isForeground = $true
                isMinimized = $false
            }
        }

        $active | ConvertTo-Json -Compress
    }
    "focus" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        $matched = $null

        if ($Target -match '^\d+$') {
            $hNum = [int64]$Target
            $matched = $windows | Where-Object { $_.hwnd -eq $hNum } | Select-Object -First 1
        }

        if (-not $matched) {
            $tLower = $Target.ToLower().Trim()
            $matched = $windows | Where-Object {
                $_.title.ToLower().Contains($tLower) -or $_.processName.ToLower().Contains($tLower)
            } | Select-Object -First 1
        }

        if ($matched) {
            $targetHwnd = [IntPtr][int64]$matched.hwnd
            $ok = [WinWindowManager]::FocusTargetWindow($targetHwnd)
            @{ success = $true; hwnd = $matched.hwnd; title = $matched.title; processName = $matched.processName } | ConvertTo-Json -Compress
        } else {
            @{ success = $false; error = "Window not found matching '$Target'." } | ConvertTo-Json -Compress
        }
    }
    "close" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        $matched = $null

        if ($Target -match '^\d+$') {
            $hNum = [int64]$Target
            $matched = $windows | Where-Object { $_.hwnd -eq $hNum } | Select-Object -First 1
        }

        if (-not $matched) {
            $tLower = $Target.ToLower().Trim()
            $matched = $windows | Where-Object {
                $_.title.ToLower().Contains($tLower) -or $_.processName.ToLower().Contains($tLower)
            } | Select-Object -First 1
        }

        if ($matched) {
            $targetHwnd = [IntPtr][int64]$matched.hwnd
            [WinWindowManager]::CloseTargetWindow($targetHwnd) | Out-Null
            @{ success = $true; hwnd = $matched.hwnd; title = $matched.title; processName = $matched.processName } | ConvertTo-Json -Compress
        } else {
            @{ success = $false; error = "Window not found matching '$Target'." } | ConvertTo-Json -Compress
        }
    }
}
