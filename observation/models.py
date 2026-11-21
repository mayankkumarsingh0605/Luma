"""Structured observation models for LUMA Read-Only Observation Engine."""

from dataclasses import dataclass, field, asdict
from typing import Optional, List, Literal, Any, Dict

ObservationStatus = Literal["SUCCESS", "PARTIAL", "UNAVAILABLE", "ERROR"]
PageStatus = Literal["LOADED", "LOADING", "ERROR", "UNAVAILABLE"]
WindowVisibility = Literal["visible", "minimized", "hidden", "unknown"]


@dataclass
class WindowsObservation:
    active_window: Optional[str] = None
    process_name: Optional[str] = None
    process_id: Optional[int] = None
    window_available: bool = False
    hwnd: Optional[int] = None
    visibility: WindowVisibility = "unknown"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class BrowserObservation:
    running: bool = False
    connected: bool = False
    current_url: Optional[str] = None
    page_title: Optional[str] = None
    page_status: PageStatus = "UNAVAILABLE"
    ready_state: Optional[str] = None
    details: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ScreenObservation:
    available: bool = False
    width: Optional[int] = None
    height: Optional[int] = None
    screenshot_available: bool = False
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ComputerObservationResult:
    timestamp: str
    windows: WindowsObservation
    browser: BrowserObservation
    screen: ScreenObservation
    observation_status: ObservationStatus
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "windows": self.windows.to_dict(),
            "browser": self.browser.to_dict(),
            "screen": self.screen.to_dict(),
            "observation_status": self.observation_status,
            "errors": list(self.errors),
        }
