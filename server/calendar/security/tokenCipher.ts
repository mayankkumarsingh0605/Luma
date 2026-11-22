import crypto from "node:crypto";
import { KeyManager } from "./keyManager.js";
import type { DecryptionFailureReason } from "../types.js";

export interface EncryptedPayload {
  success: boolean;
  encrypted_refresh_token?: string;
  iv?: string;
  auth_tag?: string;
  error?: string;
  reason?: DecryptionFailureReason;
}

export interface DecryptedPayload {
  success: boolean;
  plainText?: string;
  error?: string;
  reason?: DecryptionFailureReason;
}

/**
 * AES-256-GCM Token Cipher
 *
 * Uses authenticated encryption (AES-256-GCM) with 12-byte random IVs and 16-byte authentication tags.
 * Decryption failures are classified safely without modifying the database.
 */
export class TokenCipher {
  private static ALGORITHM = "aes-256-gcm";
  private static IV_LENGTH = 12;

  /**
   * Encrypts a plaintext refresh token.
   */
  static encrypt(plainText: string): EncryptedPayload {
    if (!plainText || typeof plainText !== "string") {
      return { success: false, error: "Plaintext token must be a non-empty string." };
    }

    const keyResult = KeyManager.getOrCreateMasterKey();
    if (!keyResult.key) {
      return {
        success: false,
        error: keyResult.error || "Failed to acquire master encryption key.",
        reason: keyResult.reason,
      };
    }

    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, keyResult.key, iv);

      const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
      const authTag = (cipher as any).getAuthTag() as Buffer;

      return {
        success: true,
        encrypted_refresh_token: encrypted.toString("hex"),
        iv: iv.toString("hex"),
        auth_tag: authTag.toString("hex"),
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Encryption failed: ${err?.message}`,
      };
    }
  }

  /**
   * Decrypts an encrypted refresh token using AES-256-GCM.
   * If decryption fails, returns a safe, non-destructive error without altering storage.
   */
  static decrypt(encryptedHex: string, ivHex: string, authTagHex: string): DecryptedPayload {
    if (!encryptedHex || !ivHex || !authTagHex) {
      return {
        success: false,
        reason: "CIPHERTEXT_INVALID",
        error: "Missing encrypted token, IV, or authentication tag.",
      };
    }

    const keyResult = KeyManager.getMasterKey();
    if (!keyResult.key) {
      return {
        success: false,
        reason: keyResult.reason,
        error: keyResult.error || "Master key is unavailable.",
      };
    }

    try {
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const encryptedData = Buffer.from(encryptedHex, "hex");

      const decipher = crypto.createDecipheriv(this.ALGORITHM, keyResult.key, iv);
      (decipher as any).setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

      return {
        success: true,
        plainText: decrypted.toString("utf8"),
      };
    } catch (err: any) {
      return {
        success: false,
        reason: "CIPHERTEXT_INVALID",
        error: `Decryption tag validation failed: ${err?.message}`,
      };
    }
  }
}
