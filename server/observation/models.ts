/**
 * Structured observation models for LUMA Read-Only Observation Engine
 */

export type ObservationStatus = "SUCCESS" | "PARTIAL" | "UNAVAILABLE" | "ERROR";

export type PageStatus = "LOADED" | "LOADING" | "ERROR" | "UNAVAILABLE";

export interface WindowsObservation {
  active_window: string | null;
  process_name: string | null;
  process_id: number | null;
  window_available: boolean;
  hwnd?: number | null;
  visibility?: "visible" | "minimized" | "hidden" | "unknown";
}

export interface BrowserObservation {
  running: boolean;
  connected: boolean;
  current_url: string | null;
  page_title: string | null;
  page_status: PageStatus;
  ready_state?: string | null;
  details?: string;
}

export interface ScreenObservation {
  available: boolean;
  width: number | null;
  height: number | null;
  screenshot_available: boolean;
  error?: string | null;
}

export interface ComputerObservationResult {
  timestamp: string;
  windows: WindowsObservation;
  browser: BrowserObservation;
  screen: ScreenObservation;
  observation_status: ObservationStatus;
  errors: string[];
}
