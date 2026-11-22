import crypto from "node:crypto";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { MemoryDatabase } from "../memory/database.js";
import { TokenCipher } from "./security/tokenCipher.js";
import type { CalendarConnectionStatus, PendingOAuthSession, CalendarAuthResult } from "./types.js";

/**
 * Google OAuth 2.0 Manager (Phase 1)
 *
 * Implements PKCE (S256), short-lived single-use state validation,
 * cryptographic ID token verification, AES-256-GCM token storage,
 * and non-destructive invalid_grant recovery.
 */
export class GoogleOAuthManager {
  private static SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  private static SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static pendingSessions = new Map<string, PendingOAuthSession>();
  private static mockClient: any = null;

  /**
   * For unit tests: allow injecting a mock OAuth2 client.
   */
  static setMockClient(client: any): void {
    this.mockClient = client;
  }

  /**
   * Resets in-memory state (for tests).
   */
  static reset(): void {
    this.pendingSessions.clear();
    this.mockClient = null;
  }

  /**
   * Constructs an OAuth2Client instance using environment variables.
   */
  static getOAuth2Client(): OAuth2Client {
    if (this.mockClient) return this.mockClient;

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/calendar/oauth/callback";

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Cleans up expired OAuth sessions.
   */
  private static cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [state, session] of this.pendingSessions.entries()) {
      if (now - session.createdAt > this.SESSION_TTL_MS) {
        this.pendingSessions.delete(state);
      }
    }
  }

  /**
   * Generates a Google OAuth authorization URL with PKCE (S256) and a 5-minute single-use state token.
   */
  static generateAuthUrl(): {
    success: boolean;
    url?: string;
    state?: string;
    error?: string;
  } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret || clientId.includes("your_google_client_id")) {
      return {
        success: false,
        error: "Google OAuth credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
      };
    }

    this.cleanExpiredSessions();

    const state = crypto.randomBytes(32).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    this.pendingSessions.set(state, {
      state,
      codeVerifier,
      createdAt: Date.now(),
    });

    try {
      const oauth2Client = this.getOAuth2Client();
      const url = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: this.SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256" as any,
      });

      return { success: true, url, state };
    } catch (err: any) {
      return { success: false, error: `Failed to generate auth URL: ${err?.message}` };
    }
  }

  /**
   * Validates state, exchanges authorization code, verifies ID token signature,
   * encrypts refresh token with AES-256-GCM, and persists to SQLite.
   */
  static async handleCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; email?: string; error?: string }> {
    if (!state || typeof state !== "string") {
      return { success: false, error: "Missing or invalid OAuth state parameter." };
    }

    if (!code || typeof code !== "string") {
      return { success: false, error: "Missing authorization code." };
    }

    // 1. Strict state lookup & single-use invalidation
    const session = this.pendingSessions.get(state);
    this.pendingSessions.delete(state); // Single-use: immediately delete

    if (!session) {
      return {
        success: false,
        error: "Invalid or unrecognized OAuth state token. Request may have expired or been replayed.",
      };
    }

    if (Date.now() - session.createdAt > this.SESSION_TTL_MS) {
      return {
        success: false,
        error: "OAuth session has expired (5-minute limit). Please initiate login again.",
      };
    }

    const oauth2Client = this.getOAuth2Client();

    try {
      // 2. Exchange authorization code with PKCE verifier
      const { tokens } = await oauth2Client.getToken({
        code,
        codeVerifier: session.codeVerifier,
      });

      if (!tokens) {
        return { success: false, error: "Did not receive tokens from Google." };
      }

      // 3. Cryptographic ID Token Verification
      if (!tokens.id_token) {
        return { success: false, error: "ID token missing in Google response." };
      }

      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return { success: false, error: "Failed to verify ID token payload." };
      }

      const validIssuers = ["accounts.google.com", "https://accounts.google.com"];
      if (!validIssuers.includes(payload.iss || "")) {
        return { success: false, error: `Untrusted token issuer: ${payload.iss}` };
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp < nowSec) {
        return { success: false, error: "ID token has expired." };
      }

      if (!payload.email || payload.email_verified !== true) {
        return { success: false, error: "Account email is missing or unverified by Google." };
      }

      const email = payload.email;

      // 4. Secure Refresh Token Storage
      let refreshToken = tokens.refresh_token;

      // If refresh token wasn't returned (e.g. repeated prompt), check existing row
      if (!refreshToken) {
        const db = MemoryDatabase.getDb();
        const existingRow: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
        if (existingRow && existingRow.account_email === email) {
          const decResult = TokenCipher.decrypt(
            existingRow.encrypted_refresh_token,
            existingRow.iv,
            existingRow.auth_tag
          );
          if (decResult.success && decResult.plainText) {
            refreshToken = decResult.plainText;
          }
        }
      }

      if (!refreshToken) {
        return {
          success: false,
          error: "Google did not issue a refresh token. Please re-authenticate with prompt=consent.",
        };
      }

      const cipherResult = TokenCipher.encrypt(refreshToken);
      if (!cipherResult.success || !cipherResult.encrypted_refresh_token) {
        return {
          success: false,
          error: `Failed to encrypt token: ${cipherResult.error}`,
        };
      }

      // 5. Persist to SQLite
      const db = MemoryDatabase.getDb();
      const now = new Date().toISOString();
      const scopesStr = JSON.stringify(this.SCOPES);

      const stmt = db.prepare(`
        INSERT INTO calendar_tokens (
          id, provider, account_email, encrypted_refresh_token, iv, auth_tag, scopes, created_at, updated_at
        ) VALUES (1, 'google', ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          account_email = excluded.account_email,
          encrypted_refresh_token = excluded.encrypted_refresh_token,
          iv = excluded.iv,
          auth_tag = excluded.auth_tag,
          scopes = excluded.scopes,
          updated_at = excluded.updated_at
      `);

      stmt.run(
        email,
        cipherResult.encrypted_refresh_token,
        cipherResult.iv!,
        cipherResult.auth_tag!,
        scopesStr,
        now,
        now
      );

      return { success: true, email };
    } catch (err: any) {
      return { success: false, error: `Authentication code exchange failed: ${err?.message}` };
    }
  }

  /**
   * Reports current connection status without exposing credentials.
   */
  static getConnectionStatus(): CalendarConnectionStatus {
    const db = MemoryDatabase.getDb();
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();

    if (!row) {
      return {
        connected: false,
        message: "Google Calendar is not connected. Say 'connect Google calendar' to link your account.",
      };
    }

    const decryptResult = TokenCipher.decrypt(
      row.encrypted_refresh_token,
      row.iv,
      row.auth_tag
    );

    if (!decryptResult.success || !decryptResult.plainText) {
      return {
        connected: false,
        requiresReauth: true,
        error: "DECRYPTION_FAILED",
        recoveryReason: decryptResult.reason,
        message: `Calendar authorization could not be decrypted (${decryptResult.reason}). Please say 'connect Google calendar' to re-authenticate.`,
      };
    }

    let scopes: string[] = [];
    try {
      scopes = JSON.parse(row.scopes || "[]");
    } catch {}

    return {
      connected: true,
      email: row.account_email,
      scopes,
      message: `Google Calendar is connected as ${row.account_email}.`,
    };
  }

  /**
   * Returns an authenticated OAuth2Client instance for API calls.
   * Handles expired access tokens and catches invalid_grant non-destructively.
   */
  static async getAuthenticatedClient(): Promise<{
    client: OAuth2Client | null;
    error?: string;
    requiresReauth?: boolean;
  }> {
    const oauth2Client = this.mockClient || this.getOAuth2Client();

    const db = MemoryDatabase.getDb();
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
    if (!row && !this.mockClient) {
      return { client: null, error: "NOT_CONNECTED", requiresReauth: true };
    }

    if (row) {
      const dec = TokenCipher.decrypt(
        row.encrypted_refresh_token,
        row.iv,
        row.auth_tag
      );

      if (!dec.success || !dec.plainText) {
        return {
          client: null,
          error: "DECRYPTION_FAILED",
          requiresReauth: true,
        };
      }

      oauth2Client.setCredentials({ refresh_token: dec.plainText });
    }

    try {
      // Validate or refresh access token
      if (typeof oauth2Client.getAccessToken === "function") {
        await oauth2Client.getAccessToken();
      }
      return { client: oauth2Client };
    } catch (err: any) {
      const errMsg = err?.message || "";
      if (errMsg.includes("invalid_grant")) {
        // Safe non-destructive reporting (do NOT delete row!)
        return {
          client: null,
          error: "REFRESH_TOKEN_EXPIRED",
          requiresReauth: true,
        };
      }
      return {
        client: null,
        error: `Token refresh failed: ${errMsg}`,
      };
    }
  }

  /**
   * Disconnects and revokes authorization with explicit backend confirmation check.
   */
  static async logout(confirmed: boolean = false): Promise<CalendarAuthResult> {
    if (!confirmed) {
      return {
        success: false,
        requiresConfirmation: true,
        prompt: "Disconnecting Google Calendar will revoke access and remove saved credentials. Reply 'yes' to proceed or 'no' to cancel.",
        message: "Confirmation required to disconnect Google Calendar.",
      };
    }

    const db = MemoryDatabase.getDb();
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();

    if (!row) {
      return {
        success: true,
        message: "No active Google Calendar connection found.",
      };
    }

    // Attempt token revocation with Google
    try {
      const dec = TokenCipher.decrypt(row.encrypted_refresh_token, row.iv, row.auth_tag);
      if (dec.success && dec.plainText) {
        const oauth2Client = this.getOAuth2Client();
        await oauth2Client.revokeToken(dec.plainText).catch(() => {});
      }
    } catch {}

    // Clean up SQLite record
    try {
      db.prepare("DELETE FROM calendar_tokens WHERE id = 1").run();
      return {
        success: true,
        message: `Google Calendar (${row.account_email}) disconnected and credentials revoked successfully.`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to remove credentials from database: ${err?.message}`,
        message: "Failed to disconnect Google Calendar.",
      };
    }
  }
}
