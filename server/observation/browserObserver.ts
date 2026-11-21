import type { BrowserObservation } from "./models.js";

/**
 * BrowserObserver
 * Inspects browser availability, connection status, and page state.
 *
 * Adheres strictly to the 4-state model:
 * 1. Chrome running (Process level)
 * 2. Chrome window active (Foreground window level - handled in active window observer)
 * 3. Browser connection available (CDP / debugging bridge level)
 * 4. Browser page accessible (Active tab loaded in inspected session)
 *
 * Does NOT launch a second browser.
 * Does NOT equate window title with browser URL.
 */
export class BrowserObserver {
  private static readonly CDP_PORT = 9222;
  private static readonly PROBE_TIMEOUT_MS = 400;

  /**
   * Observe browser state given Chrome's running status.
   *
   * @param isChromeRunning - Whether Chrome process was detected by ProcessObserver
   * @param allowCdp - Whether to attempt CDP remote debugging probe (default true)
   */
  static async observe(
    isChromeRunning: boolean,
    allowCdp: boolean = true
  ): Promise<{ observation: BrowserObservation; error?: string }> {
    if (!isChromeRunning) {
      return {
        observation: {
          running: false,
          connected: false,
          current_url: null,
          page_title: null,
          page_status: "UNAVAILABLE",
          ready_state: null,
          details: "Chrome is not running.",
        },
      };
    }

    // Chrome process is running. Probe whether an inspection connection (CDP) is accessible.
    if (allowCdp) {
      try {
        const cdpResult = await this.probeCdpSession();
        if (cdpResult.connected) {
          return { observation: cdpResult };
        }
      } catch {
        // Non-fatal: CDP probe failed or timed out
      }
    }

    // Standard LUMA behavior: Chrome is running via native OS process launch,
    // so URL and DOM inspection are not currently available through that mechanism.
    return {
      observation: {
        running: true,
        connected: false,
        current_url: null,
        page_title: null,
        page_status: "UNAVAILABLE",
        ready_state: null,
        details:
          "Chrome is running, but browser inspection is unavailable through the current OS launch mechanism (remote debugging port is not open).",
      },
    };
  }

  /**
   * Non-invasively probes the local Chrome DevTools Protocol (CDP) endpoint.
   * Does NOT launch or modify any browser process.
   */
  private static async probeCdpSession(): Promise<BrowserObservation> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.PROBE_TIMEOUT_MS);

    try {
      const endpoint = `http://127.0.0.1:${this.CDP_PORT}/json/list`;
      const res = await fetch(endpoint, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return {
          running: true,
          connected: false,
          current_url: null,
          page_title: null,
          page_status: "UNAVAILABLE",
          details: `CDP endpoint returned HTTP ${res.status}`,
        };
      }

      const tabs = (await res.json()) as Array<{
        type: string;
        url?: string;
        title?: string;
      }>;

      // Find first visible page tab
      const pageTab = tabs.find((t) => t.type === "page");
      if (pageTab && pageTab.url) {
        return {
          running: true,
          connected: true,
          current_url: pageTab.url,
          page_title: pageTab.title || null,
          page_status: "LOADED",
          ready_state: "complete",
          details: "Connected via Chrome DevTools Protocol.",
        };
      }

      return {
        running: true,
        connected: true,
        current_url: null,
        page_title: null,
        page_status: "LOADED",
        details: "Connected via CDP, but no active page tabs found.",
      };
    } catch {
      clearTimeout(timer);
      return {
        running: true,
        connected: false,
        current_url: null,
        page_title: null,
        page_status: "UNAVAILABLE",
      };
    }
  }
}
