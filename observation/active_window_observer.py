"""Active Window Observer for LUMA Observation Engine.

Inspects the foreground window on Windows using native user32 and kernel32 APIs.
"""

import sys
import os
from typing import Tuple, Optional
from .models import WindowsObservation


class ActiveWindowObserver:
    @staticmethod
    def observe() -> Tuple[WindowsObservation, Optional[str]]:
        """Inspects the foreground window on Windows."""
        if sys.platform != "win32":
            return (
                WindowsObservation(
                    active_window=None,
                    process_name=None,
                    process_id=None,
                    window_available=False,
                    hwnd=None,
                    visibility="unknown",
                ),
                "ActiveWindowObserver: Non-Windows platform not supported",
            )

        try:
            import ctypes
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            hwnd = user32.GetForegroundWindow()
            if not hwnd:
                return (
                    WindowsObservation(
                        active_window="Desktop",
                        process_name="explorer.exe",
                        process_id=None,
                        window_available=True,
                        hwnd=None,
                        visibility="visible",
                    ),
                    None,
                )

            # Get Window Text
            length = user32.GetWindowTextLengthW(hwnd)
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip() or "Desktop"

            # Get Process ID
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            proc_id = pid.value if pid.value > 0 else None

            # Get Process Name via QueryFullProcessImageNameW (instantaneous)
            proc_name = None
            if proc_id:
                try:
                    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                    h_proc = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, proc_id)
                    if h_proc:
                        buf = ctypes.create_unicode_buffer(512)
                        size = ctypes.c_ulong(512)
                        if kernel32.QueryFullProcessImageNameW(h_proc, 0, buf, ctypes.byref(size)):
                            proc_name = os.path.basename(buf.value)
                        kernel32.CloseHandle(h_proc)
                except Exception:
                    proc_name = None

            # Visibility checks
            is_visible = bool(user32.IsWindowVisible(hwnd))
            is_iconic = bool(user32.IsIconic(hwnd))

            if is_iconic:
                visibility = "minimized"
            elif is_visible:
                visibility = "visible"
            else:
                visibility = "hidden"

            return (
                WindowsObservation(
                    active_window=title,
                    process_name=proc_name,
                    process_id=proc_id,
                    window_available=True,
                    hwnd=int(hwnd),
                    visibility=visibility,
                ),
                None,
            )
        except Exception as e:
            return (
                WindowsObservation(
                    active_window=None,
                    process_name=None,
                    process_id=None,
                    window_available=False,
                    hwnd=None,
                    visibility="unknown",
                ),
                f"ActiveWindowObserver error: {str(e)}",
            )
