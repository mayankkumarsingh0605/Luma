import { WindowsBridge } from "../computer/native/windowsBridge.js";

export interface ProcessItem {
  name: string;
  pid: number;
}

export interface ProcessObservationResult {
  chrome_running: boolean;
  chrome_pid: number | null;
  chrome_instances: number;
  running_apps: ProcessItem[];
}

/**
 * ProcessObserver
 * Inspects system processes via WindowsBridge to observe whether Chrome and other relevant apps are running.
 */
export class ProcessObserver {
  private static readonly TIMEOUT_MS = 2500;

  /**
   * Observe whether Chrome and other key processes are currently running.
   */
  static async observe(): Promise<{ observation: ProcessObservationResult; error?: string }> {
    try {
      const result = await Promise.race([
        this.fetchProcesses(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Process observer timed out")), this.TIMEOUT_MS)
        ),
      ]);

      return { observation: result };
    } catch (err: any) {
      return {
        observation: {
          chrome_running: false,
          chrome_pid: null,
          chrome_instances: 0,
          running_apps: [],
        },
        error: `ProcessObserver error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  private static async fetchProcesses(): Promise<ProcessObservationResult> {
    const script = `
$targetNames = @('chrome', 'msedge', 'code', 'notepad', 'explorer', 'powershell', 'cmd', 'spotify', 'whatsapp')
$foundProcs = @()
$chromeProcs = @()

try {
    $all = Get-Process -ErrorAction SilentlyContinue
    foreach ($p in $all) {
        if ($p.ProcessName -eq 'chrome') {
            $chromeProcs += $p
        }
        if ($targetNames -contains $p.ProcessName) {
            $foundProcs += @{ name = ($p.ProcessName + '.exe'); pid = [int]$p.Id }
        }
    }
} catch {}

$isChromeRunning = ($chromeProcs.Count -gt 0)
$firstPid = if ($isChromeRunning) { [int]$chromeProcs[0].Id } else { $null }

@{
    chrome_running = $isChromeRunning
    chrome_pid = $firstPid
    chrome_instances = $chromeProcs.Count
    running_apps = $foundProcs
} | ConvertTo-Json -Compress
`;

    try {
      const data = await WindowsBridge.runPowerShellJson<{
        chrome_running: boolean;
        chrome_pid: number | null;
        chrome_instances: number;
        running_apps: Array<{ name: string; pid: number }>;
      }>(script);

      return {
        chrome_running: Boolean(data.chrome_running),
        chrome_pid: data.chrome_pid ?? null,
        chrome_instances: data.chrome_instances || 0,
        running_apps: Array.isArray(data.running_apps) ? data.running_apps : [],
      };
    } catch (err: any) {
      throw new Error(`Failed to query process list: ${err?.message || String(err)}`);
    }
  }
}
