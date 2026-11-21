param (
    [Parameter(Mandatory = $true)]
    [ValidateSet("list", "active", "focus", "close", "minimize", "restore", "restore_all", "previous")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$Target
)

$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class WinWindowManager {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint processAccess, bool bInheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool QueryFullProcessImageName(IntPtr hProcess, int flags, StringBuilder text, ref int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

    public const int DWMWA_CLOAKED = 14;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_TOOLWINDOW = 0x00000080;
    public const int SW_RESTORE = 9;
    public const int SW_SHOW = 5;
    public const int SW_MINIMIZE = 6;
    public const byte VK_MENU = 0x12;
    public const uint KEYEVENTF_KEYUP = 0x0002;
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

            if (string.IsNullOrEmpty(pName) && procId > 0) {
                try {
                    IntPtr hProc = OpenProcess(0x1000, false, procId);
                    if (hProc != IntPtr.Zero) {
                        var sbPath = new StringBuilder(1024);
                        int sz = sbPath.Capacity;
                        if (QueryFullProcessImageName(hProc, 0, sbPath, ref sz)) {
                            pName = System.IO.Path.GetFileNameWithoutExtension(sbPath.ToString());
                        }
                        CloseHandle(hProc);
                    }
                } catch {}
            }

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
        if (list.Count == 0) {
            EnumWindows(proc, IntPtr.Zero);
        }

        return list;
    }

    public static Dictionary<string, object> ActivateAndVerify(long targetHwndLong, int expectedPid) {
        IntPtr targetHwnd = (IntPtr)targetHwndLong;
        var result = new Dictionary<string, object>();
        result["requestedHwnd"] = targetHwndLong;
        result["expectedPid"] = expectedPid;

        var worker = new Thread(() => {
            IntPtr hDesk = OpenInputDesktop(0, false, 0x0100 | 0x0040);
            if (hDesk != IntPtr.Zero) {
                SetThreadDesktop(hDesk);
            }

            if (!IsWindow(targetHwnd)) {
                result["success"] = false;
                result["error"] = "Invalid or closed window handle.";
                if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
                return;
            }

            IntPtr curFg = GetForegroundWindow();
            if (curFg == targetHwnd) {
                result["success"] = true;
                result["alreadyForeground"] = true;
                result["finalHwnd"] = targetHwndLong;
                uint curPid = 0;
                GetWindowThreadProcessId(targetHwnd, out curPid);
                result["finalPid"] = (int)curPid;
                var sbCur = new StringBuilder(512);
                GetWindowText(targetHwnd, sbCur, 512);
                result["finalTitle"] = sbCur.ToString().Trim();
                if (hDesk != IntPtr.Zero) CloseDesktop(hDesk);
                return;
            }

            // Unminimize if minimized
            if (IsIconic(targetHwnd)) {
                ShowWindowAsync(targetHwnd, SW_RESTORE);
            }
            ShowWindowAsync(targetHwnd, SW_SHOW);
            BringWindowToTop(targetHwnd);
            SwitchToThisWindow(targetHwnd, true);

            uint fgPid;
            uint fgThread = (curFg != IntPtr.Zero) ? GetWindowThreadProcessId(curFg, out fgPid) : 0;
            uint targetPid;
            uint targetThread = GetWindowThreadProcessId(targetHwnd, out targetPid);
            uint curThread = GetCurrentThreadId();

            bool a1 = false;
            bool a2 = false;
            if (fgThread != 0 && fgThread != curThread) a1 = AttachThreadInput(curThread, fgThread, true);
            if (targetThread != 0 && targetThread != curThread) a2 = AttachThreadInput(curThread, targetThread, true);

            keybd_event(VK_MENU, 0, 0, 0);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);

            bool sfw = SetForegroundWindow(targetHwnd);
            BringWindowToTop(targetHwnd);

            if (a1) AttachThreadInput(curThread, fgThread, false);
            if (a2) AttachThreadInput(curThread, targetThread, false);

            IntPtr finalFg = IntPtr.Zero;
            for (int i = 0; i < 8; i++) {
                Thread.Sleep(50);
                finalFg = GetForegroundWindow();
                if (finalFg == targetHwnd) break;
            }

            finalFg = GetForegroundWindow();
            uint finalPid = 0;
            GetWindowThreadProcessId(finalFg, out finalPid);
            var sb = new StringBuilder(512);
            GetWindowText(finalFg, sb, 512);
            string finalTitle = sb.ToString().Trim();

            string pName = "";
            try {
                var p = System.Diagnostics.Process.GetProcessById((int)finalPid);
                if (p != null) pName = p.ProcessName;
            } catch {}

            if (string.IsNullOrEmpty(pName) && finalPid > 0) {
                try {
                    IntPtr hProc = OpenProcess(0x1000, false, finalPid);
                    if (hProc != IntPtr.Zero) {
                        var sbPath = new StringBuilder(1024);
                        int sz = sbPath.Capacity;
                        if (QueryFullProcessImageName(hProc, 0, sbPath, ref sz)) {
                            pName = System.IO.Path.GetFileNameWithoutExtension(sbPath.ToString());
                        }
                        CloseHandle(hProc);
                    }
                } catch {}
            }

            bool isFg = (finalFg == targetHwnd || (expectedPid > 0 && finalPid == expectedPid));
            result["success"] = isFg;
            result["finalHwnd"] = finalFg.ToInt64();
            result["finalPid"] = (int)finalPid;
            result["finalTitle"] = finalTitle;
            result["finalProcess"] = pName;

            if (hDesk != IntPtr.Zero) {
                CloseDesktop(hDesk);
            }
        });

        worker.SetApartmentState(ApartmentState.STA);
        worker.Start();
        worker.Join();

        return result;
    }

    public static bool CloseTargetWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        SendMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        return true;
    }

    public static bool MinimizeTargetWindow(IntPtr hWnd) {
        if (!IsWindow(hWnd)) return false;
        ShowWindowAsync(hWnd, SW_MINIMIZE);
        for (int i = 0; i < 6; i++) {
            Thread.Sleep(50);
            if (IsIconic(hWnd)) return true;
        }
        return IsIconic(hWnd);
    }

    public static bool RestoreTargetWindow(IntPtr hWnd) {
        if (!IsWindow(hWnd)) return false;
        ShowWindowAsync(hWnd, SW_RESTORE);
        ShowWindowAsync(hWnd, SW_SHOW);
        for (int i = 0; i < 6; i++) {
            Thread.Sleep(50);
            if (!IsIconic(hWnd)) return true;
        }
        return !IsIconic(hWnd);
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
            if (-not $t) {
                $t = if ($pName) { "$pName Window" } else { "[No Title]" }
            }
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
        if (-not $windows -or $windows.Count -eq 0) {
            @{ success = $false; error = "No open visible windows found on the desktop." } | ConvertTo-Json -Compress
            return
        }

        $matched = $null

        # 1. Direct HWND numeric match
        if ($Target -match '^\d+$') {
            $hNum = [int64]$Target
            $matched = $windows | Where-Object { $_.hwnd -eq $hNum } | Select-Object -First 1
        }

        $tClean = $Target.ToLower().Trim()
        $tNormalized = $tClean -replace '\s+(window|app|application)$', ''

        # 2. Exact Title Match
        if (-not $matched) {
            $matched = $windows | Where-Object {
                $_.title.ToLower() -eq $tClean -or $_.title.ToLower() -eq $tNormalized
            } | Select-Object -First 1
        }

        # 3. Title contains target (prefer restored, topmost)
        if (-not $matched) {
            $candidates = $windows | Where-Object {
                $_.title.ToLower().Contains($tNormalized) -or $_.title.ToLower().Contains($tClean)
            }
            if ($candidates) {
                $matched = ($candidates | Where-Object { $_.isMinimized -eq $false } | Select-Object -First 1)
                if (-not $matched) {
                    $matched = $candidates | Select-Object -First 1
                }
            }
        }

        # 4. Process Name Match (e.g. "chrome", "code", "notepad", "mspaint", "explorer")
        if (-not $matched) {
            $procCandidates = $windows | Where-Object {
                $p = $_.processName.ToLower()
                $p -eq $tNormalized -or
                $p -eq $tClean -or
                $p.Contains($tNormalized) -or
                ($p.Length -ge 3 -and $tNormalized.Contains($p))
            }
            if ($procCandidates) {
                $matched = ($procCandidates | Where-Object { $_.isMinimized -eq $false } | Select-Object -First 1)
                if (-not $matched) {
                    $matched = $procCandidates | Select-Object -First 1
                }
            }
        }

        if ($matched) {
            $actRes = [WinWindowManager]::ActivateAndVerify($matched.hwnd, [int]$matched.processId)
            $isSuccess = [bool]$actRes["success"]
            if ($isSuccess) {
                @{
                    success = $true
                    hwnd = $actRes["finalHwnd"]
                    title = $actRes["finalTitle"]
                    processName = $actRes["finalProcess"]
                    processId = $actRes["finalPid"]
                    message = "Switched to '$($actRes["finalTitle"])' ($($actRes["finalProcess"]))."
                } | ConvertTo-Json -Compress
            } else {
                @{
                    success = $false
                    hwnd = $matched.hwnd
                    title = $matched.title
                    processName = $matched.processName
                    foregroundHwnd = $actRes["finalHwnd"]
                    foregroundTitle = $actRes["finalTitle"]
                    foregroundProcess = $actRes["finalProcess"]
                    error = "Windows prevented activating '$($matched.title)'. Current foreground window is '$($actRes["finalTitle"])'."
                } | ConvertTo-Json -Compress
            }
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
    "minimize" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        if (-not $windows -or $windows.Count -eq 0) {
            @{ success = $false; error = "No open visible windows found to minimize." } | ConvertTo-Json -Compress
            return
        }

        $matched = $null
        if ($Target -match '^\d+$') {
            $hNum = [int64]$Target
            $matched = $windows | Where-Object { $_.hwnd -eq $hNum } | Select-Object -First 1
        }

        $tClean = $Target.ToLower().Trim()
        $tNormalized = $tClean -replace '\s+(window|app|application)$', ''

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $_.title.ToLower() -eq $tClean -or $_.title.ToLower() -eq $tNormalized
            } | Select-Object -First 1
        }

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $_.title.ToLower().Contains($tNormalized) -or $_.title.ToLower().Contains($tClean)
            } | Select-Object -First 1
        }

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $p = $_.processName.ToLower()
                $p -eq $tNormalized -or $p -eq $tClean -or $p.Contains($tNormalized)
            } | Select-Object -First 1
        }

        if ($matched) {
            $targetHwnd = [IntPtr][int64]$matched.hwnd
            $minOk = [WinWindowManager]::MinimizeTargetWindow($targetHwnd)
            @{
                success = $minOk
                hwnd = $matched.hwnd
                title = $matched.title
                processName = $matched.processName
                message = "Minimized '$($matched.title)' ($($matched.processName))."
            } | ConvertTo-Json -Compress
        } else {
            @{ success = $false; error = "Window not found matching '$Target' to minimize." } | ConvertTo-Json -Compress
        }
    }
    "restore" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        if (-not $windows -or $windows.Count -eq 0) {
            @{ success = $false; error = "No open visible windows found to restore." } | ConvertTo-Json -Compress
            return
        }

        $matched = $null
        if ($Target -match '^\d+$') {
            $hNum = [int64]$Target
            $matched = $windows | Where-Object { $_.hwnd -eq $hNum } | Select-Object -First 1
        }

        $tClean = $Target.ToLower().Trim()
        $tNormalized = $tClean -replace '\s+(window|app|application)$', ''

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $_.title.ToLower() -eq $tClean -or $_.title.ToLower() -eq $tNormalized
            } | Select-Object -First 1
        }

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $_.title.ToLower().Contains($tNormalized) -or $_.title.ToLower().Contains($tClean)
            } | Select-Object -First 1
        }

        if (-not $matched) {
            $matched = $windows | Where-Object {
                $p = $_.processName.ToLower()
                $p -eq $tNormalized -or $p -eq $tClean -or $p.Contains($tNormalized)
            } | Select-Object -First 1
        }

        if ($matched) {
            $targetHwnd = [IntPtr][int64]$matched.hwnd
            $restOk = [WinWindowManager]::RestoreTargetWindow($targetHwnd)
            $actRes = [WinWindowManager]::ActivateAndVerify($matched.hwnd, [int]$matched.processId)
            @{
                success = $restOk
                hwnd = $matched.hwnd
                title = $matched.title
                processName = $matched.processName
                message = "Restored '$($matched.title)' ($($matched.processName))."
            } | ConvertTo-Json -Compress
        } else {
            @{ success = $false; error = "Window not found matching '$Target' to restore." } | ConvertTo-Json -Compress
        }
    }
    "restore_all" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        $minimized = $windows | Where-Object { $_.isMinimized -eq $true }
        $restoredCount = 0
        $restoredList = @()

        if ($minimized) {
            foreach ($w in $minimized) {
                $h = [IntPtr][int64]$w.hwnd
                if ([WinWindowManager]::RestoreTargetWindow($h)) {
                    $restoredCount++
                    $restoredList += $w.title
                }
            }
        }

        @{
            success = $true
            count = $restoredCount
            restored = $restoredList
            message = if ($restoredCount -gt 0) { "Restored $restoredCount minimized application window(s)." } else { "No minimized application windows found to restore." }
        } | ConvertTo-Json -Compress
    }
    "previous" {
        $windows = [WinWindowManager]::GetVisibleWindows()
        if (-not $windows -or $windows.Count -lt 2) {
            @{ success = $false; error = "Not enough open application windows to switch to previous window." } | ConvertTo-Json -Compress
            return
        }

        $fg = [WinWindowManager]::GetForegroundWindow()
        # Find first visible top-level window whose HWND != $fg
        $prev = $windows | Where-Object { $_.hwnd -ne $fg.ToInt64() -and $_.title.Trim().Length -gt 0 } | Select-Object -First 1

        if ($prev) {
            $actRes = [WinWindowManager]::ActivateAndVerify($prev.hwnd, [int]$prev.processId)
            $isSuccess = [bool]$actRes["success"]
            if ($isSuccess) {
                @{
                    success = $true
                    hwnd = $actRes["finalHwnd"]
                    title = $actRes["finalTitle"]
                    processName = $actRes["finalProcess"]
                    processId = $actRes["finalPid"]
                    message = "Switched to previous window: '$($actRes["finalTitle"])' ($($actRes["finalProcess"]))."
                } | ConvertTo-Json -Compress
            } else {
                @{
                    success = $false
                    error = "Could not activate previous window '$($prev.title)'."
                } | ConvertTo-Json -Compress
            }
        } else {
            @{ success = $false; error = "No previous window found in Z-order." } | ConvertTo-Json -Compress
        }
    }
}
