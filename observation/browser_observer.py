"""Browser Observer for LUMA Observation Engine.

Inspects browser connection and page status without launching a secondary browser.
"""

import json
import socket
import urllib.request
from typing import Tuple, Optional
from .models import BrowserObservation


class BrowserObserver:
    CDP_HOST = "127.0.0.1"
    CDP_PORT = 9222
    SOCKET_TIMEOUT = 0.15
    HTTP_TIMEOUT = 0.5

    @classmethod
    def observe(cls, is_chrome_running: bool) -> Tuple[BrowserObservation, Optional[str]]:
        """Observes browser state adhering strictly to the 4-state model."""
        if not is_chrome_running:
            return (
                BrowserObservation(
                    running=False,
                    connected=False,
                    current_url=None,
                    page_title=None,
                    page_status="UNAVAILABLE",
                    ready_state=None,
                    details="Chrome is not running.",
                ),
                None,
            )

        # Chrome is running. First do an instantaneous TCP port check
        is_port_open = False
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(cls.SOCKET_TIMEOUT)
                if s.connect_ex((cls.CDP_HOST, cls.CDP_PORT)) == 0:
                    is_port_open = True
        except Exception:
            is_port_open = False

        if is_port_open:
            # Port is open, read tabs JSON
            try:
                url = f"http://{cls.CDP_HOST}:{cls.CDP_PORT}/json/list"
                req = urllib.request.Request(url, headers={"User-Agent": "LumaObserver"})
                with urllib.request.urlopen(req, timeout=cls.HTTP_TIMEOUT) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        for tab in data:
                            if tab.get("type") == "page" and tab.get("url"):
                                return (
                                    BrowserObservation(
                                        running=True,
                                        connected=True,
                                        current_url=tab.get("url"),
                                        page_title=tab.get("title"),
                                        page_status="LOADED",
                                        ready_state="complete",
                                        details="Connected via Chrome DevTools Protocol.",
                                    ),
                                    None,
                                )
                        return (
                            BrowserObservation(
                                running=True,
                                connected=True,
                                current_url=None,
                                page_title=None,
                                page_status="LOADED",
                                details="Connected via CDP, but no active page tab found.",
                            ),
                            None,
                        )
            except Exception:
                pass

        # Native OS launch: Chrome is running, but browser inspection is unavailable
        return (
            BrowserObservation(
                running=True,
                connected=False,
                current_url=None,
                page_title=None,
                page_status="UNAVAILABLE",
                ready_state=None,
                details="Chrome is running, but browser inspection is unavailable (no remote debugging port).",
            ),
            None,
        )
