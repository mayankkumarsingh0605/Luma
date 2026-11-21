"""Process Observer for LUMA Observation Engine.

Inspects running system processes using Win32 Toolhelp snapshot API on Windows.
"""

import sys
from typing import Tuple, Optional, Dict, Any, List


class ProcessObserver:
    RELEVANT_PROCESSES = {
        "chrome.exe",
        "msedge.exe",
        "code.exe",
        "notepad.exe",
        "explorer.exe",
        "powershell.exe",
        "cmd.exe",
        "spotify.exe",
        "whatsapp.exe",
    }

    @classmethod
    def observe(cls) -> Tuple[Dict[str, Any], Optional[str]]:
        """Queries running processes via Win32 Toolhelp API."""
        if sys.platform != "win32":
            return (
                {
                    "chrome_running": False,
                    "chrome_pid": None,
                    "chrome_instances": 0,
                    "running_apps": [],
                },
                "ProcessObserver: Non-Windows platform not supported",
            )

        try:
            import ctypes
            from ctypes import wintypes

            class PROCESSENTRY32(ctypes.Structure):
                _fields_ = [
                    ("dwSize", wintypes.DWORD),
                    ("cntUsage", wintypes.DWORD),
                    ("th32ProcessID", wintypes.DWORD),
                    ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
                    ("th32ModuleID", wintypes.DWORD),
                    ("cntThreads", wintypes.DWORD),
                    ("th32ParentProcessID", wintypes.DWORD),
                    ("pcPriClassBase", ctypes.c_long),
                    ("dwFlags", wintypes.DWORD),
                    ("szExeFile", ctypes.c_char * 260),
                ]

            kernel32 = ctypes.windll.kernel32
            # TH32CS_SNAPPROCESS = 0x00000002
            h_snap = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
            if h_snap == -1 or not h_snap:
                return (
                    {
                        "chrome_running": False,
                        "chrome_pid": None,
                        "chrome_instances": 0,
                        "running_apps": [],
                    },
                    "ProcessObserver: Failed to create process snapshot",
                )

            pe = PROCESSENTRY32()
            pe.dwSize = ctypes.sizeof(PROCESSENTRY32)

            chrome_running = False
            chrome_pid = None
            chrome_count = 0
            running_apps: List[Dict[str, Any]] = []
            seen_apps = set()

            if kernel32.Process32First(h_snap, ctypes.byref(pe)):
                while True:
                    exe_name = pe.szExeFile.decode("latin1", errors="ignore").strip()
                    pid = pe.th32ProcessID
                    lower_name = exe_name.lower()

                    if lower_name == "chrome.exe":
                        chrome_running = True
                        chrome_count += 1
                        if chrome_pid is None and pid > 0:
                            chrome_pid = pid

                    if lower_name in cls.RELEVANT_PROCESSES and lower_name not in seen_apps:
                        seen_apps.add(lower_name)
                        running_apps.append({"name": exe_name, "pid": pid})

                    if not kernel32.Process32Next(h_snap, ctypes.byref(pe)):
                        break

            kernel32.CloseHandle(h_snap)

            result = {
                "chrome_running": chrome_running,
                "chrome_pid": chrome_pid,
                "chrome_instances": chrome_count,
                "running_apps": running_apps,
            }
            return result, None
        except Exception as e:
            return (
                {
                    "chrome_running": False,
                    "chrome_pid": None,
                    "chrome_instances": 0,
                    "running_apps": [],
                },
                f"ProcessObserver error: {str(e)}",
            )
