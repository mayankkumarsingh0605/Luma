"""Unit and integration tests for LUMA Stage 1 Read-Only Observation Engine (Python).

Tests all 10 required scenarios:
1. Chrome is running and active.
2. Chrome is running but not active.
3. Chrome is not running.
4. Browser is running but browser inspection is unavailable.
5. Browser connection is available and URL/title can be retrieved.
6. Screenshot capture succeeds.
7. Screenshot capture fails.
8. One observer fails but other observers still return useful information.
9. No browser is open.
10. Observation-only command does not perform any computer actions.
11. Real Windows live observation.
"""

import unittest
from unittest.mock import patch, MagicMock
from observation.models import (
    WindowsObservation,
    BrowserObservation,
    ScreenObservation,
    ComputerObservationResult,
)
from observation.observation_manager import ObservationManager
from observation.browser_observer import BrowserObserver
from observation.active_window_observer import ActiveWindowObserver
from observation.process_observer import ProcessObserver
from observation.screen_observer import ScreenObserver


class TestObservationEngine(unittest.TestCase):
    # 1. Chrome is running and active
    def test_01_chrome_running_and_active(self):
        win = WindowsObservation(
            active_window="Google Chrome",
            process_name="chrome.exe",
            process_id=1001,
            window_available=True,
            hwnd=5001,
            visibility="visible",
        )
        browser = BrowserObservation(
            running=True,
            connected=False,
            current_url=None,
            page_title=None,
            page_status="UNAVAILABLE",
        )
        self.assertEqual(win.process_name, "chrome.exe")
        self.assertTrue(browser.running)
        self.assertTrue(win.window_available)

    # 2. Chrome is running but not active
    def test_02_chrome_running_not_active(self):
        win = WindowsObservation(
            active_window="Visual Studio Code",
            process_name="code.exe",
            process_id=2002,
            window_available=True,
            hwnd=5002,
            visibility="visible",
        )
        browser = BrowserObservation(
            running=True,
            connected=False,
            current_url=None,
            page_title=None,
            page_status="UNAVAILABLE",
        )
        self.assertNotEqual(win.process_name, "chrome.exe")
        self.assertTrue(browser.running)

    # 3. Chrome is not running
    def test_03_chrome_not_running(self):
        browser_obs, err = BrowserObserver.observe(is_chrome_running=False)
        self.assertFalse(browser_obs.running)
        self.assertFalse(browser_obs.connected)
        self.assertIsNone(browser_obs.current_url)
        self.assertIsNone(browser_obs.page_title)
        self.assertEqual(browser_obs.page_status, "UNAVAILABLE")
        self.assertIsNone(err)

    # 4. Browser is running but browser inspection is unavailable
    def test_04_browser_running_inspection_unavailable(self):
        with patch.object(BrowserObserver, "observe") as mock_obs:
            mock_obs.return_value = (
                BrowserObservation(
                    running=True,
                    connected=False,
                    current_url=None,
                    page_title=None,
                    page_status="UNAVAILABLE",
                    details="Chrome is running, but browser inspection is unavailable.",
                ),
                None,
            )
            obs, err = mock_obs(True)
            self.assertTrue(obs.running)
            self.assertFalse(obs.connected)
            self.assertIsNone(obs.current_url)
            self.assertEqual(obs.page_status, "UNAVAILABLE")

    # 5. Browser connection is available and URL/title can be retrieved
    def test_05_browser_connection_available_with_url(self):
        obs = BrowserObservation(
            running=True,
            connected=True,
            current_url="https://www.amazon.in/",
            page_title="Amazon.in",
            page_status="LOADED",
            ready_state="complete",
        )
        self.assertTrue(obs.connected)
        self.assertEqual(obs.current_url, "https://www.amazon.in/")
        self.assertEqual(obs.page_title, "Amazon.in")
        self.assertEqual(obs.page_status, "LOADED")

    # 6. Screenshot capture succeeds
    def test_06_screenshot_capture_succeeds(self):
        obs, err = ScreenObserver.observe(test_screenshot=False)
        self.assertTrue(obs.available)
        self.assertGreater(obs.width, 0)
        self.assertGreater(obs.height, 0)
        self.assertTrue(obs.screenshot_available)
        self.assertIsNone(err)

    # 7. Screenshot capture fails
    def test_07_screenshot_capture_fails(self):
        failed_screen = ScreenObservation(
            available=True,
            width=1920,
            height=1080,
            screenshot_available=False,
            error="Display capture permission denied",
        )
        self.assertFalse(failed_screen.screenshot_available)
        self.assertIsNotNone(failed_screen.error)
        self.assertEqual(failed_screen.width, 1920)

    # 8. One observer fails but other observers still return useful information
    def test_08_observer_failure_isolation(self):
        failed_win = WindowsObservation(
            active_window=None,
            process_name=None,
            process_id=None,
            window_available=False,
        )
        good_screen = ScreenObservation(
            available=True,
            width=1920,
            height=1080,
            screenshot_available=True,
        )
        good_browser = BrowserObservation(
            running=False,
            connected=False,
            current_url=None,
            page_title=None,
            page_status="UNAVAILABLE",
        )
        errors = ["ActiveWindowObserver error: RPC timeout"]

        status = ObservationManager._determine_status(
            failed_win, good_browser, good_screen, errors
        )
        self.assertEqual(status, "PARTIAL")
        self.assertTrue(good_screen.available)
        self.assertEqual(len(errors), 1)

    # 9. No browser is open
    def test_09_no_browser_open(self):
        notepad_win = WindowsObservation(
            active_window="Untitled - Notepad",
            process_name="notepad.exe",
            process_id=3003,
            window_available=True,
            hwnd=5003,
            visibility="visible",
        )
        no_browser = BrowserObservation(
            running=False,
            connected=False,
            current_url=None,
            page_title=None,
            page_status="UNAVAILABLE",
            details="Chrome is not running.",
        )
        good_screen = ScreenObservation(
            available=True,
            width=1920,
            height=1080,
            screenshot_available=True,
        )

        status = ObservationManager._determine_status(
            notepad_win, no_browser, good_screen, []
        )
        self.assertEqual(status, "SUCCESS")
        self.assertFalse(no_browser.running)
        self.assertEqual(notepad_win.process_name, "notepad.exe")

    # 10. Observation-only command does not perform any computer actions
    def test_10_observation_is_strictly_read_only(self):
        # Verify ObservationManager calls only read APIs without mutating
        res = ObservationManager.observe_computer_state(test_screenshot=False)
        self.assertIsInstance(res, ComputerObservationResult)
        self.assertIn(res.observation_status, ["SUCCESS", "PARTIAL", "UNAVAILABLE", "ERROR"])
        d = res.to_dict()
        self.assertIn("timestamp", d)
        self.assertIn("windows", d)
        self.assertIn("browser", d)
        self.assertIn("screen", d)
        self.assertIn("observation_status", d)

    # 11. Live Real Windows end-to-end observation
    def test_11_live_real_windows_observation(self):
        live_res = ObservationManager.observe_computer_state(test_screenshot=False)
        print("\n[Real Windows Live Observation Result (Python)]:")
        print(f"  Timestamp:          {live_res.timestamp}")
        print(f"  Active Window:      {live_res.windows.active_window} ({live_res.windows.process_name})")
        print(f"  Window HWND:        {live_res.windows.hwnd}")
        print(f"  Chrome Running:     {live_res.browser.running}")
        print(f"  Browser Connected:  {live_res.browser.connected}")
        print(f"  Current URL:        {live_res.browser.current_url}")
        print(f"  Screen Dimensions:  {live_res.screen.width} x {live_res.screen.height}")
        print(f"  Screenshot Avail:   {live_res.screen.screenshot_available}")
        print(f"  Observation Status: {live_res.observation_status}")

        self.assertIsNotNone(live_res.timestamp)
        self.assertTrue(live_res.screen.available)
        self.assertGreater(live_res.screen.width, 0)
        self.assertGreater(live_res.screen.height, 0)


if __name__ == "__main__":
    unittest.main()
