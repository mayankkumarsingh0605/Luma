"""Observation Manager for LUMA Observation Engine.

Central interface combining active window, process, browser, and screen observations.
"""

from datetime import datetime, timezone
from typing import Optional, List
from .models import (
    ComputerObservationResult,
    ObservationStatus,
    WindowsObservation,
    BrowserObservation,
    ScreenObservation,
)
from .active_window_observer import ActiveWindowObserver
from .process_observer import ProcessObserver
from .browser_observer import BrowserObserver
from .screen_observer import ScreenObserver


class ObservationManager:
    @classmethod
    def observe_computer_state(
        cls, test_screenshot: bool = False
    ) -> ComputerObservationResult:
        """Gathers unified observation across all observers without mutating computer state."""
        timestamp = datetime.now(timezone.utc).isoformat()
        errors: List[str] = []

        # 1. Process Observation
        proc_data, proc_err = ProcessObserver.observe()
        if proc_err:
            errors.append(proc_err)
        chrome_running = proc_data.get("chrome_running", False)

        # 2. Active Window Observation
        win_obs, win_err = ActiveWindowObserver.observe()
        if win_err:
            errors.append(win_err)

        # 3. Browser Observation
        browser_obs, browser_err = BrowserObserver.observe(chrome_running)
        if browser_err:
            errors.append(browser_err)

        # 4. Screen Observation
        screen_obs, screen_err = ScreenObserver.observe(test_screenshot=test_screenshot)
        if screen_err:
            errors.append(screen_err)

        # 5. Determine Overall Status
        status = cls._determine_status(win_obs, browser_obs, screen_obs, errors)

        return ComputerObservationResult(
            timestamp=timestamp,
            windows=win_obs,
            browser=browser_obs,
            screen=screen_obs,
            observation_status=status,
            errors=errors,
        )

    @staticmethod
    def _determine_status(
        windows: WindowsObservation,
        browser: BrowserObservation,
        screen: ScreenObservation,
        errors: List[str],
    ) -> ObservationStatus:
        if not windows.window_available and not screen.available:
            return "UNAVAILABLE"

        if browser.running and not browser.connected:
            return "PARTIAL"

        if errors:
            return "PARTIAL"

        if windows.window_available and screen.available:
            return "SUCCESS"

        return "PARTIAL"
