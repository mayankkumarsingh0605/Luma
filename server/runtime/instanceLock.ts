import fs from "fs";
import path from "path";

export interface LockInfo {
  pid: number;
  port: number;
  startTime: string;
}

export class InstanceLockManager {
  private static readonly LOCK_FILE = path.resolve(process.cwd(), ".luma_runtime.lock");
  private static lockAcquired = false;

  /**
   * Checks whether a process with the given PID is currently running on Windows.
   */
  static isProcessRunning(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      // process.kill(pid, 0) tests process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err?.code === "EPERM"; // EPERM means process exists but we lack kill permission
    }
  }

  /**
   * Attempts to acquire the single-instance lock.
   * If an active instance is running, requests it to focus/open the UI and returns false.
   */
  static async acquireLock(port: number = 3001): Promise<{ acquired: boolean; existingPid?: number; existingPort?: number }> {
    if (fs.existsSync(this.LOCK_FILE)) {
      try {
        const raw = fs.readFileSync(this.LOCK_FILE, "utf-8");
        const info: LockInfo = JSON.parse(raw);

        if (info.pid && this.isProcessRunning(info.pid) && info.pid !== process.pid) {
          console.log(`[InstanceLock] Another active LUMA instance is already running (PID: ${info.pid}, Port: ${info.port}).`);
          // Try to trigger UI open on existing instance
          try {
            await fetch(`http://localhost:${info.port}/api/system/open-ui`, { method: "POST" });
          } catch {
            // Non-fatal if server is booting
          }
          return { acquired: false, existingPid: info.pid, existingPort: info.port };
        } else {
          console.log(`[InstanceLock] Found stale lock file (PID ${info.pid} is no longer running). Reclaiming lock.`);
        }
      } catch {
        // If file is corrupted, overwrite it
      }
    }

    const currentInfo: LockInfo = {
      pid: process.pid,
      port,
      startTime: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(this.LOCK_FILE, JSON.stringify(currentInfo, null, 2), "utf-8");
      this.lockAcquired = true;

      // Register process exit hooks
      const cleanup = () => {
        this.releaseLock();
      };

      process.once("exit", cleanup);
      process.once("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
      process.once("SIGTERM", () => {
        cleanup();
        process.exit(0);
      });

      return { acquired: true };
    } catch (err: any) {
      console.error("[InstanceLock] Could not write lock file:", err.message);
      return { acquired: false };
    }
  }

  /**
   * Releases the single-instance lock file.
   */
  static releaseLock(): void {
    if (!this.lockAcquired) return;
    try {
      if (fs.existsSync(this.LOCK_FILE)) {
        const raw = fs.readFileSync(this.LOCK_FILE, "utf-8");
        const info: LockInfo = JSON.parse(raw);
        if (info.pid === process.pid) {
          fs.unlinkSync(this.LOCK_FILE);
          this.lockAcquired = false;
        }
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
