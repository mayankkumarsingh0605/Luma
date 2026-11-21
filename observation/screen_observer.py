"""Screen Observer for LUMA Observation Engine.

Observes screen resolution and screenshot capture capability.
"""

import sys
from typing import Tuple, Optional
from .models import ScreenObservation


class ScreenObserver:
    @staticmethod
    def observe(test_screenshot: bool = False) -> Tuple[ScreenObservation, Optional[str]]:
        """Observes primary screen bounds and screenshot availability."""
        width = None
        height = None
        screenshot_available = False
        error = None

        if sys.platform == "win32":
            try:
                import ctypes
                user32 = ctypes.windll.user32
                width = int(user32.GetSystemMetrics(0))   # SM_CXSCREEN
                height = int(user32.GetSystemMetrics(1))  # SM_CYSCREEN
            except Exception as e:
                error = f"Failed to get screen dimensions: {str(e)}"

        if width and height and width > 0 and height > 0:
            screenshot_available = True

        if test_screenshot:
            try:
                # Test screenshot capture capability via PIL or PowerShell if available
                import subprocess
                cmd = 'powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Dispose(); $g.Dispose()"'
                subprocess.check_call(cmd, shell=True, timeout=3, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                screenshot_available = True
            except Exception as e:
                screenshot_available = False
                error = f"Screenshot capture verification failed: {str(e)}"

        available = bool(width and height and width > 0 and height > 0)
        return (
            ScreenObservation(
                available=available,
                width=width,
                height=height,
                screenshot_available=screenshot_available,
                error=error,
            ),
            error,
        )
