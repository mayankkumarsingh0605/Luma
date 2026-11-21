# LUMA System & Process Observer Script
# Safely queries installed applications and background processes without terminating or altering any state.

param (
    [Parameter(Mandatory=$true)]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$Filter = "background"
)

$code = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class WinSystemObserver {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct PROCESSENTRY32 {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    public static List<Dictionary<string, object>> GetSystemProcesses() {
        var list = new List<Dictionary<string, object>>();
        IntPtr hSnap = CreateToolhelp32Snapshot(0x00000002, 0); // TH32CS_SNAPPROCESS
        if (hSnap == (IntPtr)(-1)) return list;

        var pe = new PROCESSENTRY32();
        pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));

        if (Process32First(hSnap, ref pe)) {
            do {
                var d = new Dictionary<string, object>();
                d["pid"] = (int)pe.th32ProcessID;
                d["name"] = pe.szExeFile;
                d["parentPid"] = (int)pe.th32ParentProcessID;
                d["threads"] = (int)pe.cntThreads;
                list.Add(d);
            } while (Process32Next(hSnap, ref pe));
        }

        CloseHandle(hSnap);
        return list;
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'WinSystemObserver').Type) {
    Add-Type -TypeDefinition $code
}

switch ($Action) {
    "installed_apps" {
        $apps = @()
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

        # 1. Query Win32 Uninstall Registry Keys
        $regKeys = @(
            "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )

        foreach ($key in $regKeys) {
            try {
                $items = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
                foreach ($item in $items) {
                    if (-not $item.DisplayName) { continue }
                    $dName = $item.DisplayName.Trim()
                    if ($dName.Length -eq 0) { continue }
                    if ($item.SystemComponent -eq 1) { continue }
                    if ($item.ParentKeyName) { continue }

                    if ($seen.Add($dName)) {
                        $apps += @{
                            name = $dName.ToLower()
                            displayName = $dName
                            version = if ($item.DisplayVersion) { [string]$item.DisplayVersion } else { "" }
                            publisher = if ($item.Publisher) { [string]$item.Publisher.Trim() } else { "" }
                            installLocation = if ($item.InstallLocation) { [string]$item.InstallLocation } else { "" }
                            type = "Desktop Application"
                        }
                    }
                }
            } catch {}
        }

        # 2. Query Modern Packaged / UWP Apps via Get-StartApps
        try {
            $startApps = Get-StartApps -ErrorAction SilentlyContinue
            foreach ($s in $startApps) {
                if (-not $s.Name) { continue }
                $sName = $s.Name.Trim()
                if ($sName.Length -eq 0) { continue }

                $isUWP = ($s.AppID -match '!' -or $s.AppID -match '_8wekyb3d8bbwe')

                if ($seen.Add($sName)) {
                    $apps += @{
                        name = $sName.ToLower()
                        displayName = $sName
                        version = ""
                        publisher = if ($isUWP) { "Microsoft / Windows Store" } else { "" }
                        appId = [string]$s.AppID
                        type = if ($isUWP) { "Windows App" } else { "Desktop Application" }
                    }
                }
            }
        } catch {}

        # Sort alphabetically
        $sorted = $apps | Sort-Object { $_.displayName }

        if (-not $sorted -or $sorted.Count -eq 0) {
            Write-Output "[]"
        } elseif ($sorted.Count -eq 1) {
            $single = $sorted[0] | ConvertTo-Json -Compress
            Write-Output "[$single]"
        } else {
            Write-Output ($sorted | ConvertTo-Json -Compress)
        }
    }

    "processes" {
        # 1. Enumerate all running processes across the system via Win32 Toolhelp32
        $rawList = [WinSystemObserver]::GetSystemProcesses()

        # 2. Query open windows to identify which PIDs possess visible top-level windows
        $windowScript = Join-Path $PSScriptRoot "windowManager.ps1"
        $visiblePids = New-Object 'System.Collections.Generic.HashSet[int]'
        if (Test-Path $windowScript) {
            try {
                $winOutput = & powershell.exe -NoProfile -NonInteractive -File "$windowScript" -Action list
                if ($winOutput) {
                    $wins = $winOutput | ConvertFrom-Json
                    foreach ($w in $wins) {
                        if ($w.processId -and $w.processId -gt 0) {
                            $visiblePids.Add([int]$w.processId) | Out-Null
                        }
                    }
                }
            } catch {}
        }

        $results = @()
        foreach ($proc in $rawList) {
            $pidInt = [int]$proc["pid"]
            $nameStr = [string]$proc["name"]
            if (-not $nameStr -or $nameStr.Length -eq 0) { continue }

            $hasWin = $visiblePids.Contains($pidInt)
            $isBg = (-not $hasWin)

            if ($Filter -eq "background" -and -not $isBg) { continue }
            if ($Filter -eq "visible" -and -not $hasWin) { continue }

            $results += @{
                pid = $pidInt
                name = $nameStr
                hasWindow = $hasWin
                isBackground = $isBg
                threads = [int]$proc["threads"]
            }
        }

        # Sort by process name
        $sorted = $results | Sort-Object { $_.name }

        if (-not $sorted -or $sorted.Count -eq 0) {
            Write-Output "[]"
        } elseif ($sorted.Count -eq 1) {
            $single = $sorted[0] | ConvertTo-Json -Compress
            Write-Output "[$single]"
        } else {
            Write-Output ($sorted | ConvertTo-Json -Compress)
        }
    }

    default {
        @{ error = "Unknown action: $Action" } | ConvertTo-Json -Compress
    }
}
