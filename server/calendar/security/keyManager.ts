import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import type { DecryptionFailureReason } from "../types.js";

/**
 * Windows DPAPI Master Key Manager
 *
 * Generates a cryptographically random 256-bit AES master key and protects it
 * using Windows DPAPI (CurrentUser scope) via PowerShell System.Security.Cryptography.ProtectedData.
 *
 * Caches the unprotected key in memory for high-speed operation.
 */
export class KeyManager {
  private static cachedKey: Buffer | null = null;
  private static mockKey: Buffer | null = null;
  private static keyFilePath = path.resolve(process.cwd(), "data", ".luma_calendar_key.dpapi");

  /**
   * For unit tests: allow injecting a deterministic test key.
   */
  static setMockKey(key: Buffer | null): void {
    this.mockKey = key;
    this.cachedKey = key;
  }

  /**
   * Clears the in-memory key cache (forces re-reading from disk/DPAPI).
   */
  static clearCache(): void {
    this.cachedKey = null;
  }

  /**
   * Resets key state completely (for tests).
   */
  static reset(): void {
    this.cachedKey = null;
    this.mockKey = null;
    if (fs.existsSync(this.keyFilePath)) {
      try {
        fs.unlinkSync(this.keyFilePath);
      } catch {}
    }
  }

  /**
   * Gets or initializes the 256-bit AES master key.
   * If the key file doesn't exist, generates a new random key and protects it with DPAPI.
   */
  static getOrCreateMasterKey(): {
    key: Buffer | null;
    error?: string;
    reason?: DecryptionFailureReason;
  } {
    if (this.mockKey) {
      return { key: this.mockKey };
    }

    if (this.cachedKey) {
      return { key: this.cachedKey };
    }

    // Ensure data directory exists
    const dataDir = path.dirname(this.keyFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!fs.existsSync(this.keyFilePath)) {
      // Generate new 256-bit master key
      const newKey = crypto.randomBytes(32);
      const protectResult = this.protectWithDpapi(newKey);
      if (!protectResult.success) {
        return {
          key: null,
          reason: "DPAPI_UNPROTECT_FAILED",
          error: `Failed to DPAPI-protect new calendar master key: ${protectResult.error}`,
        };
      }

      try {
        fs.writeFileSync(this.keyFilePath, protectResult.encryptedBase64!, "utf-8");
      } catch (err: any) {
        return {
          key: null,
          reason: "FS_ERROR",
          error: `Failed to write DPAPI key file: ${err?.message}`,
        };
      }

      this.cachedKey = newKey;
      return { key: newKey };
    }

    // Key file exists: load and unprotect
    return this.getMasterKey();
  }

  /**
   * Retrieves and unprotects the existing master key without creating a new one.
   */
  static getMasterKey(): {
    key: Buffer | null;
    error?: string;
    reason?: DecryptionFailureReason;
  } {
    if (this.mockKey) {
      return { key: this.mockKey };
    }

    if (this.cachedKey) {
      return { key: this.cachedKey };
    }

    if (!fs.existsSync(this.keyFilePath)) {
      return {
        key: null,
        reason: "KEY_FILE_MISSING",
        error: "DPAPI key file not found on disk.",
      };
    }

    let encryptedBase64: string;
    try {
      encryptedBase64 = fs.readFileSync(this.keyFilePath, "utf-8").trim();
    } catch (err: any) {
      return {
        key: null,
        reason: "FS_ERROR",
        error: `Could not read DPAPI key file: ${err?.message}`,
      };
    }

    const unprotectResult = this.unprotectWithDpapi(encryptedBase64);
    if (!unprotectResult.success || !unprotectResult.key) {
      return {
        key: null,
        reason: "DPAPI_UNPROTECT_FAILED",
        error: unprotectResult.error || "Windows DPAPI could not unprotect the master key.",
      };
    }

    this.cachedKey = unprotectResult.key;
    return { key: this.cachedKey };
  }

  /**
   * Protects a Buffer with Windows DPAPI (CurrentUser scope) via PowerShell.
   */
  private static protectWithDpapi(data: Buffer): { success: boolean; encryptedBase64?: string; error?: string } {
    try {
      const hex = data.toString("hex");
      const psCommand = `& {
        Add-Type -AssemblyName System.Security;
        $hex = '${hex}';
        $bytes = [byte[]] -split ($hex -replace '..', '0x$& ') | Where-Object { $_ -ne '' };
        $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser;
        $enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope);
        [Convert]::ToBase64String($enc)
      }`;

      const stdout = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
        encoding: "utf-8",
        windowsHide: true,
      }).trim();

      if (!stdout) {
        return { success: false, error: "Empty output from DPAPI protect command." };
      }

      return { success: true, encryptedBase64: stdout };
    } catch (err: any) {
      return { success: false, error: err?.message || "DPAPI protect execution failed." };
    }
  }

  /**
   * Unprotects a DPAPI-encrypted base64 string via PowerShell.
   */
  private static unprotectWithDpapi(encryptedBase64: string): { success: boolean; key?: Buffer; error?: string } {
    try {
      const psCommand = `& {
        Add-Type -AssemblyName System.Security;
        $b64 = '${encryptedBase64}';
        $enc = [Convert]::FromBase64String($b64);
        $scope = [System.Security.Cryptography.DataProtectionScope]::CurrentUser;
        $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, $scope);
        [System.BitConverter]::ToString($dec) -replace '-'
      }`;

      const stdout = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCommand], {
        encoding: "utf-8",
        windowsHide: true,
      }).trim();

      if (!stdout) {
        return { success: false, error: "Empty output from DPAPI unprotect command." };
      }

      const keyBuffer = Buffer.from(stdout, "hex");
      if (keyBuffer.length !== 32) {
        return { success: false, error: `Unprotected key length is ${keyBuffer.length}, expected 32 bytes.` };
      }

      return { success: true, key: keyBuffer };
    } catch (err: any) {
      return { success: false, error: err?.message || "DPAPI unprotect execution failed." };
    }
  }
}
