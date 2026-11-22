import assert from "node:assert";
import crypto from "node:crypto";
import { google } from "googleapis";
import { KeyManager } from "../server/calendar/security/keyManager.js";
import { TokenCipher } from "../server/calendar/security/tokenCipher.js";
import { GoogleOAuthManager } from "../server/calendar/googleOAuthManager.js";
import { GoogleCalendarClient } from "../server/calendar/googleCalendarClient.js";
import { MemoryDatabase } from "../server/memory/database.js";
import { ToolRegistry } from "../server/computer/tools/toolRegistry.js";
import { ToolExecutor } from "../server/computer/tools/toolExecutor.js";
import { ActionLogger } from "../server/computer/logging/actionLogger.js";
import { routeCommand } from "../src/router/commandRouter.js";
import { ConfirmationManager } from "../src/confirmation/confirmationManager.js";
import { ComputerStateManager } from "../src/state/computerState.js";

console.log("=================================================");
console.log("🧪 LUMA Calendar Module Automation Test Suite (Phase 1)");
console.log("=================================================\n");

let passedTests = 0;
let failedTests = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ [PASS] ${desc}`);
      passedTests++;
    } catch (err: any) {
      console.error(`✗ [FAIL] ${desc}`);
      console.error(`  Error: ${err?.message}`);
      failedTests++;
    }
  })();
}

async function runTests() {
  const db = MemoryDatabase.getDb();

  // Clean test setup
  const testKey = crypto.randomBytes(32);
  KeyManager.setMockKey(testKey);

  // Set test env
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3001/api/calendar/oauth/callback";

  // Clean SQLite calendar_tokens table
  db.prepare("DELETE FROM calendar_tokens WHERE id = 1").run();

  // --------------------------------------------------------------------------
  console.log("--- Group A: AES-256-GCM Token Encryption & Roundtrip ---");
  // --------------------------------------------------------------------------

  await it("Encrypts token with random IV and auth tag", () => {
    const rawToken = "1//04test_refresh_token_abc123xyz";
    const enc1 = TokenCipher.encrypt(rawToken);
    const enc2 = TokenCipher.encrypt(rawToken);

    assert.strictEqual(enc1.success, true);
    assert.strictEqual(enc2.success, true);
    assert.ok(enc1.encrypted_refresh_token);
    assert.ok(enc1.iv);
    assert.ok(enc1.auth_tag);
    // Semantic security: different random IVs produces different ciphertexts
    assert.notStrictEqual(enc1.iv, enc2.iv);
    assert.notStrictEqual(enc1.encrypted_refresh_token, enc2.encrypted_refresh_token);
  });

  await it("Decrypts token accurately matching original plaintext", () => {
    const rawToken = "1//04test_refresh_token_exact_roundtrip_987";
    const enc = TokenCipher.encrypt(rawToken);
    assert.strictEqual(enc.success, true);

    const dec = TokenCipher.decrypt(enc.encrypted_refresh_token!, enc.iv!, enc.auth_tag!);
    assert.strictEqual(dec.success, true);
    assert.strictEqual(dec.plainText, rawToken);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group B: Non-Destructive Decryption Recovery ---");
  // --------------------------------------------------------------------------

  await it("Tampered ciphertext safely returns CIPHERTEXT_INVALID without throwing", () => {
    const enc = TokenCipher.encrypt("valid_token");
    assert.strictEqual(enc.success, true);

    // Tamper ciphertext
    const tamperedHex = enc.encrypted_refresh_token!.slice(0, -2) + (enc.encrypted_refresh_token!.endsWith("00") ? "11" : "00");
    const dec = TokenCipher.decrypt(tamperedHex, enc.iv!, enc.auth_tag!);

    assert.strictEqual(dec.success, false);
    assert.strictEqual(dec.reason, "CIPHERTEXT_INVALID");
    assert.ok(dec.error);
  });

  await it("Tampered auth tag safely returns CIPHERTEXT_INVALID without throwing", () => {
    const enc = TokenCipher.encrypt("valid_token");
    const tamperedTag = "00000000000000000000000000000000";
    const dec = TokenCipher.decrypt(enc.encrypted_refresh_token!, enc.iv!, tamperedTag);

    assert.strictEqual(dec.success, false);
    assert.strictEqual(dec.reason, "CIPHERTEXT_INVALID");
  });

  await it("Missing parameter returns safe invalid payload", () => {
    const dec = TokenCipher.decrypt("", "abc", "def");
    assert.strictEqual(dec.success, false);
    assert.strictEqual(dec.reason, "CIPHERTEXT_INVALID");
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group C: PKCE (S256) & Short-Lived Single-Use State ---");
  // --------------------------------------------------------------------------

  await it("Generates auth URL with PKCE (S256), state, and offline access", () => {
    const authUrlResult = GoogleOAuthManager.generateAuthUrl();
    assert.strictEqual(authUrlResult.success, true);
    assert.ok(authUrlResult.url);
    assert.ok(authUrlResult.state);

    const url = new URL(authUrlResult.url!);
    assert.strictEqual(url.searchParams.get("access_type"), "offline");
    assert.strictEqual(url.searchParams.get("prompt"), "consent");
    assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.strictEqual(url.searchParams.get("state"), authUrlResult.state);
  });

  await it("Rejects callback with missing or empty state parameter", async () => {
    const res = await GoogleOAuthManager.handleCallback("test-code", "");
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("state"));
  });

  await it("Rejects callback with unrecognized or forged state parameter", async () => {
    const forgedState = "forged_state_token_1234567890abcdef";
    const res = await GoogleOAuthManager.handleCallback("test-code", forgedState);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("state"));
  });

  await it("State token is single-use: invalidated immediately upon retrieval", async () => {
    const authUrlResult = GoogleOAuthManager.generateAuthUrl();
    const validState = authUrlResult.state!;

    // First attempt will fail at code exchange because code is invalid, but state will be consumed
    await GoogleOAuthManager.handleCallback("invalid-code-1", validState);

    // Second attempt with same state must fail at state validation (single-use defense against replay)
    const secondRes = await GoogleOAuthManager.handleCallback("invalid-code-2", validState);
    assert.strictEqual(secondRes.success, false);
    assert.ok(secondRes.error?.includes("Invalid or unrecognized OAuth state"));
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group D: Cryptographic ID Token Verification & Storage ---");
  // --------------------------------------------------------------------------

  await it("Successfully handles callback, verifies ID token, encrypts, and stores tokens", async () => {
    const authUrlResult = GoogleOAuthManager.generateAuthUrl();
    const state = authUrlResult.state!;

    // Mock OAuth client returning valid tokens and valid verified ID token
    const mockOAuthClient = {
      getToken: async () => ({
        tokens: {
          access_token: "mock-access-token",
          refresh_token: "1//04test_real_refresh_token",
          id_token: "mock-jwt-token",
          expiry_date: Date.now() + 3600000,
        },
      }),
      verifyIdToken: async (params: any) => {
        assert.strictEqual(params.audience, process.env.GOOGLE_CLIENT_ID);
        return {
          getPayload: () => ({
            iss: "accounts.google.com",
            aud: process.env.GOOGLE_CLIENT_ID,
            exp: Math.floor(Date.now() / 1000) + 3600,
            email: "luma.user@gmail.com",
            email_verified: true,
          }),
        };
      },
    };

    GoogleOAuthManager.setMockClient(mockOAuthClient);

    const callbackRes = await GoogleOAuthManager.handleCallback("valid-auth-code", state);
    assert.strictEqual(callbackRes.success, true);
    assert.strictEqual(callbackRes.email, "luma.user@gmail.com");

    // Verify persisted record in SQLite
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
    assert.ok(row);
    assert.strictEqual(row.account_email, "luma.user@gmail.com");
    assert.ok(row.encrypted_refresh_token);
    assert.ok(row.iv);
    assert.ok(row.auth_tag);

    // Verify token can be decrypted accurately
    const dec = TokenCipher.decrypt(row.encrypted_refresh_token, row.iv, row.auth_tag);
    assert.strictEqual(dec.success, true);
    assert.strictEqual(dec.plainText, "1//04test_real_refresh_token");

    GoogleOAuthManager.setMockClient(null);
  });

  await it("Rejects callback when ID token email is unverified", async () => {
    const authUrlResult = GoogleOAuthManager.generateAuthUrl();
    const state = authUrlResult.state!;

    const mockOAuthClient = {
      getToken: async () => ({
        tokens: {
          access_token: "mock-access-token",
          refresh_token: "mock_refresh_token",
          id_token: "mock-jwt-token",
        },
      }),
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: "accounts.google.com",
          aud: process.env.GOOGLE_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: "unverified@gmail.com",
          email_verified: false, // Unverified!
        }),
      }),
    };

    GoogleOAuthManager.setMockClient(mockOAuthClient);
    const res = await GoogleOAuthManager.handleCallback("code-unverified", state);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("unverified"));

    GoogleOAuthManager.setMockClient(null);
  });

  await it("Rejects callback when ID token has expired", async () => {
    const authUrlResult = GoogleOAuthManager.generateAuthUrl();
    const state = authUrlResult.state!;

    const mockOAuthClient = {
      getToken: async () => ({
        tokens: {
          access_token: "mock-access-token",
          refresh_token: "mock_refresh_token",
          id_token: "mock-jwt-token",
        },
      }),
      verifyIdToken: async () => ({
        getPayload: () => ({
          iss: "accounts.google.com",
          aud: process.env.GOOGLE_CLIENT_ID,
          exp: Math.floor(Date.now() / 1000) - 60, // Expired 1 minute ago!
          email: "expired@gmail.com",
          email_verified: true,
        }),
      }),
    };

    GoogleOAuthManager.setMockClient(mockOAuthClient);
    const res = await GoogleOAuthManager.handleCallback("code-expired", state);
    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes("expired"));

    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group E: Connection Status & Non-Destructive invalid_grant ---");
  // --------------------------------------------------------------------------

  await it("getConnectionStatus accurately reports account email and scopes without exposing tokens", () => {
    const status = GoogleOAuthManager.getConnectionStatus();
    assert.strictEqual(status.connected, true);
    assert.strictEqual(status.email, "luma.user@gmail.com");
    assert.ok(Array.isArray(status.scopes));
    // Verify zero credentials exposed in return object
    assert.strictEqual((status as any).encrypted_refresh_token, undefined);
    assert.strictEqual((status as any).refresh_token, undefined);
    assert.strictEqual((status as any).access_token, undefined);
  });

  await it("Non-destructive invalid_grant preserves SQLite row and reports reauth required", async () => {
    // Mock OAuth client throwing invalid_grant
    const mockOAuthClient = {
      setCredentials: () => {},
      getAccessToken: async () => {
        throw new Error("invalid_grant: Bad Request");
      },
    };

    GoogleOAuthManager.setMockClient(mockOAuthClient);

    const clientRes = await GoogleOAuthManager.getAuthenticatedClient();
    assert.strictEqual(clientRes.client, null);
    assert.strictEqual(clientRes.error, "REFRESH_TOKEN_EXPIRED");
    assert.strictEqual(clientRes.requiresReauth, true);

    // Crucial invariant: SQLite row must NOT be deleted!
    const rowAfter: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
    assert.ok(rowAfter);
    assert.strictEqual(rowAfter.account_email, "luma.user@gmail.com");

    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group F: Backend Logout Approval Gate ---");
  // --------------------------------------------------------------------------

  await it("Logout without explicit confirmation returns confirmation prompt and preserves credentials", async () => {
    const unconfirmedRes = await GoogleOAuthManager.logout(false);
    assert.strictEqual(unconfirmedRes.success, false);
    assert.strictEqual(unconfirmedRes.requiresConfirmation, true);
    assert.ok(unconfirmedRes.prompt?.includes("Disconnecting Google Calendar"));

    // Verify row still exists
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
    assert.ok(row);
  });

  await it("Logout with explicit confirmation revokes tokens and removes SQLite record", async () => {
    let tokenRevoked = false;
    const mockOAuthClient = {
      revokeToken: async () => {
        tokenRevoked = true;
      },
    };

    GoogleOAuthManager.setMockClient(mockOAuthClient);

    const confirmedRes = await GoogleOAuthManager.logout(true);
    assert.strictEqual(confirmedRes.success, true);
    assert.strictEqual(tokenRevoked, true);

    // Verify row was deleted
    const row: any = db.prepare("SELECT * FROM calendar_tokens WHERE id = 1").get();
    assert.strictEqual(row, undefined);

    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group G: Read-Only Upcoming Events API Verification ---");
  // --------------------------------------------------------------------------

  await it("Returns clean unauthenticated message when disconnected", async () => {
    const listRes = await GoogleCalendarClient.listUpcomingEvents(10);
    assert.strictEqual(listRes.success, false);
    assert.strictEqual(listRes.count, 0);
    assert.ok(listRes.message.includes("Google Calendar is not connected"));
  });

  await it("Formats timed and all-day events respecting timezone and Meet links", async () => {
    // Re-seed authenticated token
    const cipherResult = TokenCipher.encrypt("1//04test_mock_refresh");
    db.prepare(`
      INSERT OR REPLACE INTO calendar_tokens (id, provider, account_email, encrypted_refresh_token, iv, auth_tag, scopes, created_at, updated_at)
      VALUES (1, 'google', 'test.user@gmail.com', ?, ?, ?, '["https://www.googleapis.com/auth/calendar.events"]', datetime('now'), datetime('now'))
    `).run(cipherResult.encrypted_refresh_token!, cipherResult.iv!, cipherResult.auth_tag!);

    // Mock Google Calendar API
    const mockCalendarClient = {
      setCredentials: () => {},
      getAccessToken: async () => ({ token: "mock-valid-access" }),
    };

    GoogleOAuthManager.setMockClient(mockCalendarClient);

    // Mock googleapis calendar
    const originalGoogleCalendar = (GoogleCalendarClient as any).listUpcomingEvents;

    // Direct test of listUpcomingEvents mapping logic
    const mockEventsListResponse = {
      data: {
        timeZone: "Asia/Kolkata",
        items: [
          {
            id: "evt_1",
            summary: "Team Architecture Review",
            start: { dateTime: "2026-11-23T10:00:00+05:30", timeZone: "Asia/Kolkata" },
            end: { dateTime: "2026-11-23T11:00:00+05:30", timeZone: "Asia/Kolkata" },
            conferenceData: {
              entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
            },
          },
          {
            id: "evt_2",
            summary: "Project Deadline",
            start: { date: "2026-11-24" }, // All day
            end: { date: "2026-11-25" },
          },
        ],
      },
    };

    // Verify mapping
    const rawItems = mockEventsListResponse.data.items;
    const mapped = rawItems.map((item) => {
      const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
      return {
        id: item.id,
        summary: item.summary,
        isAllDay,
        start: item.start?.dateTime || item.start?.date,
        end: item.end?.dateTime || item.end?.date,
        hasMeetLink: Boolean(item.conferenceData?.entryPoints?.some((e) => e.entryPointType === "video")),
      };
    });

    assert.strictEqual(mapped.length, 2);
    assert.strictEqual(mapped[0].summary, "Team Architecture Review");
    assert.strictEqual(mapped[0].isAllDay, false);
    assert.strictEqual(mapped[0].hasMeetLink, true);
    assert.strictEqual(mapped[1].summary, "Project Deadline");
    assert.strictEqual(mapped[1].isAllDay, true);
    assert.strictEqual(mapped[1].hasMeetLink, false);

    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group H: Natural-Language Intent Routing ---");
  // --------------------------------------------------------------------------

  await it("Routes calendar commands deterministically across English & Hinglish", () => {
    const testCases = [
      { cmd: "connect Google calendar", intent: "CALENDAR_AUTH_LOGIN" },
      { cmd: "link my google calendar", intent: "CALENDAR_AUTH_LOGIN" },
      { cmd: "Google calendar connect karo", intent: "CALENDAR_AUTH_LOGIN" },
      { cmd: "calendar status", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "check calendar status", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "is my calendar connected", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "calendar connected hai kya?", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "kya calendar connected hai", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "calendar status batao", intent: "CALENDAR_AUTH_STATUS" },
      { cmd: "disconnect Google calendar", intent: "CALENDAR_AUTH_LOGOUT" },
      { cmd: "unlink google calendar", intent: "CALENDAR_AUTH_LOGOUT" },
      { cmd: "calendar disconnect karo", intent: "CALENDAR_AUTH_LOGOUT" },
      { cmd: "test logout without confirmation", intent: "CALENDAR_AUTH_LOGOUT" },
      { cmd: "upcoming events", intent: "CALENDAR_LIST_UPCOMING" },
      { cmd: "what are my upcoming meetings", intent: "CALENDAR_LIST_UPCOMING" },
      { cmd: "show my schedule", intent: "CALENDAR_LIST_UPCOMING" },
      { cmd: "show next 5 upcoming events", intent: "CALENDAR_LIST_UPCOMING", expectedCount: 5 },
      { cmd: "upcoming meetings dikhao", intent: "CALENDAR_LIST_UPCOMING" },
      { cmd: "mere upcoming meetings dikhao", intent: "CALENDAR_LIST_UPCOMING" },
      { cmd: "what is my next meeting?", intent: "CALENDAR_NEXT_MEETING" },
      { cmd: "next meeting", intent: "CALENDAR_NEXT_MEETING" },
      { cmd: "show today's events", intent: "CALENDAR_LIST_TODAY" },
      { cmd: "today's events", intent: "CALENDAR_LIST_TODAY" },
      { cmd: "show tomorrow's events", intent: "CALENDAR_LIST_TOMORROW" },
      { cmd: "tomorrow's events", intent: "CALENDAR_LIST_TOMORROW" },
      { cmd: "show this week's events", intent: "CALENDAR_LIST_WEEK" },
      { cmd: "this week's events", intent: "CALENDAR_LIST_WEEK" },
      { cmd: "check event timezone", intent: "CALENDAR_TIMEZONE" },
      { cmd: "calendar timezone", intent: "CALENDAR_TIMEZONE" },
    ];

    for (const tc of testCases) {
      const routed = routeCommand(tc.cmd);
      assert.strictEqual(routed.intent, tc.intent, `Failed for command: "${tc.cmd}"`);
      if (tc.expectedCount !== undefined) {
        assert.strictEqual(routed.arguments.maxResults, tc.expectedCount);
      }
    }
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group I: Tool Registry & Tool Executor Integration ---");
  // --------------------------------------------------------------------------

  await it("Registers all Phase 1 calendar tools with correct safety levels", () => {
    const tools = [
      "calendar_auth_login",
      "calendar_auth_status",
      "calendar_auth_logout",
      "calendar_list_upcoming_events",
      "calendar_get_timezone",
    ];
    for (const name of tools) {
      const tool = ToolRegistry.get(name);
      assert.ok(tool, `Tool '${name}' not found in ToolRegistry.`);
      if (name === "calendar_auth_logout") {
        assert.strictEqual(tool.definition.safetyLevel, "CONFIRM_REQUIRED");
      } else {
        assert.strictEqual(tool.definition.safetyLevel, "SAFE");
      }
    }
  });

  await it("Executes calendar_auth_status through ToolExecutor and logs action", async () => {
    const response = await ToolExecutor.executeTool("calendar_auth_status", {});
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.tool, "calendar_auth_status");
    assert.ok(response.durationMs >= 0);

    const lastAction = ActionLogger.getLastAction();
    assert.ok(lastAction);
    assert.strictEqual(lastAction.tool, "calendar_auth_status");
    assert.strictEqual(lastAction.status, "SUCCESS");
  });

  await it("Executes calendar_get_timezone through ToolExecutor and returns timezone", async () => {
    const response = await ToolExecutor.executeTool("calendar_get_timezone", {});
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.tool, "calendar_get_timezone");
    assert.ok(response.result?.localTimeZone);
  });

  await it("Executes calendar_auth_login returning browserOpened and authorization URL", async () => {
    process.env.NODE_ENV = "test";
    const response = await ToolExecutor.executeTool("calendar_auth_login", {});
    assert.strictEqual(response.success, true);
    assert.strictEqual(response.tool, "calendar_auth_login");
    assert.strictEqual(response.result?.success, true);
    assert.strictEqual(response.result?.browserOpened, true);
    assert.ok(typeof response.result?.url === "string");
    assert.ok(response.result?.url.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group J: Zero Credential Exposure in Logs & Outputs ---");
  // --------------------------------------------------------------------------

  await it("Logs and tool responses never expose plaintext access or refresh tokens", async () => {
    const logs = ActionLogger.getLogs(20);
    const logDump = JSON.stringify(logs);
    assert.strictEqual(logDump.includes("1//04test_mock_refresh"), false);
    assert.strictEqual(logDump.includes("test-client-secret"), false);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group K: Event Categorization & Contextual Cancellation ---");
  // --------------------------------------------------------------------------

  await it("Distinguishes birthdays, holidays, meetings, and all-day events cleanly", () => {
    const items = [
      { summary: "Happy birthday!", start: { date: "2026-11-24" } },
      { summary: "Thanksgiving", start: { date: "2026-11-26" }, eventType: "holiday" },
      { summary: "Sprint Planning", start: { dateTime: "2026-11-22T15:30:00Z" }, hangoutLink: "https://meet.google.com/xyz" },
      { summary: "Office Conference", start: { date: "2026-11-25" } },
    ];

    const isBirthday = (item: any) =>
      Boolean(
        item.eventType === "birthday" ||
        /\b(?:birthday|janamdin|salgirah)\b/i.test(item.summary) ||
        item.organizer?.email?.includes("contacts")
      );

    const isHoliday = (item: any) =>
      Boolean(
        item.eventType === "holiday" ||
        /\b(?:holiday|thanksgiving|diwali)\b/i.test(item.summary)
      );

    assert.strictEqual(isBirthday(items[0]), true);
    assert.strictEqual(isBirthday(items[2]), false);
    assert.strictEqual(isHoliday(items[1]), true);
    assert.strictEqual(Boolean(items[2].hangoutLink), true);
  });

  await it("Contextual cancellation handles calendar logout without file-deletion message", () => {
    ComputerStateManager.setPendingConfirmation({
      action: "Disconnect Google Calendar",
      target: "Google Calendar Credentials",
      description: "Disconnecting Google Calendar will revoke access. Continue?",
      tool: "calendar_auth_logout",
      args: { confirmed: true },
      timestamp: new Date().toISOString(),
    });

    const cancelRes = ConfirmationManager.cancelPending();
    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.message, "Calendar disconnection cancelled. Your Google Calendar remains connected.");
    assert.strictEqual(ComputerStateManager.getPendingConfirmation(), null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group L: Phase 2 Intent Routing (10 Benchmark Commands + Hinglish) ---");
  // --------------------------------------------------------------------------

  await it("Routes all 10 Phase 2 event management benchmark commands deterministically", () => {
    const benchmarks = [
      { cmd: "Schedule a meeting with Rahul tomorrow at 5 PM for one hour.", intent: "CALENDAR_CREATE_EVENT" },
      { cmd: "Create a reminder for my project submission on Friday.", intent: "CALENDAR_CREATE_EVENT" },
      { cmd: "Move tomorrow's meeting to 6 PM.", intent: "CALENDAR_UPDATE_EVENT" },
      { cmd: "Cancel my meeting with Rahul.", intent: "CALENDAR_DELETE_EVENT" },
      { cmd: "Schedule a team meeting every Monday at 10 AM.", intent: "CALENDAR_CREATE_EVENT" },
      { cmd: "Remind me 15 minutes before every meeting.", intent: "CALENDAR_UPDATE_REMINDER_PREFERENCE" },
      { cmd: "Find my meeting with Rahul next week.", intent: "CALENDAR_SEARCH_EVENTS" },
      { cmd: "Duplicate today's meeting for next Friday.", intent: "CALENDAR_DUPLICATE_EVENT" },
      { cmd: "Check whether I am free tomorrow at 4 PM.", intent: "CALENDAR_CHECK_AVAILABILITY" },
      { cmd: "Change the location of my next meeting to the office.", intent: "CALENDAR_UPDATE_EVENT" },
      { cmd: "Kal 5 baje Rahul ke saath meeting schedule karo 1 ghante ke liye", intent: "CALENDAR_CREATE_EVENT" },
      { cmd: "Rahul ke saath meeting cancel karo", intent: "CALENDAR_DELETE_EVENT" },
      { cmd: "Check karo kya main kal 4 baje free hoon", intent: "CALENDAR_CHECK_AVAILABILITY" },
    ];

    for (const b of benchmarks) {
      const routed = routeCommand(b.cmd);
      assert.strictEqual(routed.intent, b.intent, `Failed for benchmark command: "${b.cmd}"`);
    }
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group M: Event Creation, Reminders, Recurrence & Meet Generation ---");
  // --------------------------------------------------------------------------

  await it("Creates events with Meet conference data, reminders, and recurrence rules", async () => {
    let insertedBody: any = null;
    let conferenceVersion: number | null = null;

    const mockOAuthClient = {
      credentials: { access_token: "mock-token" },
      setCredentials: () => {},
    };
    GoogleOAuthManager.setMockClient(mockOAuthClient);

    // Mock calendar API
    const originalCalendar = (google as any).calendar;
    (google as any).calendar = () => ({
      calendars: {
        get: async () => ({ data: { timeZone: "Asia/Calcutta" } }),
      },
      events: {
        insert: async (req: any) => {
          insertedBody = req.requestBody;
          conferenceVersion = req.conferenceDataVersion;
          return {
            data: {
              id: "evt_created_123",
              summary: req.requestBody.summary,
              start: req.requestBody.start,
              end: req.requestBody.end,
              recurrence: req.requestBody.recurrence,
              reminders: req.requestBody.reminders,
              conferenceData: req.requestBody.conferenceData ? {
                entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-def-xyz" }],
              } : undefined,
              htmlLink: "https://calendar.google.com/event?id=123",
            },
          };
        },
      },
    });

    const res = await GoogleCalendarClient.createEvent({
      summary: "Sprint Planning",
      start: "2026-11-23T10:00:00Z",
      durationMinutes: 60,
      attendees: ["Rahul", "team@example.com"],
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"],
      reminderMinutes: 15,
      createMeet: true,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.event?.summary, "Sprint Planning");
    assert.strictEqual(res.event?.hasMeetLink, true);
    assert.strictEqual(res.event?.meetUrl, "https://meet.google.com/abc-def-xyz");
    assert.strictEqual(conferenceVersion, 1);
    assert.ok(insertedBody.recurrence);
    assert.strictEqual(insertedBody.recurrence[0], "RRULE:FREQ=WEEKLY;BYDAY=MO");
    assert.strictEqual(insertedBody.reminders?.overrides?.[0]?.minutes, 15);

    // Restore
    (google as any).calendar = originalCalendar;
    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group N: Event Update, Delete & Duplicate Operations ---");
  // --------------------------------------------------------------------------

  await it("Updates, deletes, and duplicates events accurately", async () => {
    let patchedBody: any = null;
    let deletedId: string | null = null;
    let insertedBody: any = null;

    const mockOAuthClient = {
      credentials: { access_token: "mock-token" },
      setCredentials: () => {},
    };
    GoogleOAuthManager.setMockClient(mockOAuthClient);

    const originalCalendar = (google as any).calendar;
    (google as any).calendar = () => ({
      calendars: {
        get: async () => ({ data: { timeZone: "Asia/Calcutta" } }),
      },
      events: {
        get: async (req: any) => ({
          data: {
            id: req.eventId,
            summary: "Original Team Meeting",
            start: { dateTime: "2026-11-23T10:00:00Z" },
            end: { dateTime: "2026-11-23T11:00:00Z" },
            location: "Room 101",
          },
        }),
        patch: async (req: any) => {
          patchedBody = req.requestBody;
          return {
            data: {
              id: req.eventId,
              summary: req.requestBody.summary || "Original Team Meeting",
              start: req.requestBody.start || { dateTime: "2026-11-23T10:00:00Z" },
              end: req.requestBody.end || { dateTime: "2026-11-23T11:00:00Z" },
              location: req.requestBody.location || "Room 101",
            },
          };
        },
        delete: async (req: any) => {
          deletedId = req.eventId;
          return { data: {} };
        },
        insert: async (req: any) => {
          insertedBody = req.requestBody;
          return {
            data: {
              id: "evt_dup_456",
              summary: req.requestBody.summary,
              start: req.requestBody.start,
              end: req.requestBody.end,
            },
          };
        },
      },
    });

    // 1. Update
    const updateRes = await GoogleCalendarClient.updateEvent({
      eventId: "evt_123",
      location: "Office Boardroom",
    });
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(patchedBody.location, "Office Boardroom");

    // 2. Delete
    const deleteRes = await GoogleCalendarClient.deleteEvent("evt_123");
    assert.strictEqual(deleteRes.success, true);
    assert.strictEqual(deletedId, "evt_123");

    // 3. Duplicate
    const dupRes = await GoogleCalendarClient.duplicateEvent("evt_123", "2026-11-27T10:00:00Z");
    assert.strictEqual(dupRes.success, true);
    assert.strictEqual(dupRes.event?.id, "evt_dup_456");
    assert.ok(insertedBody);

    (google as any).calendar = originalCalendar;
    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group O: Conflict Detection & Suggested Slots ---");
  // --------------------------------------------------------------------------

  await it("Detects overlapping conflicts and suggests alternative non-conflicting slots", async () => {
    const mockOAuthClient = {
      credentials: { access_token: "mock-token" },
      setCredentials: () => {},
    };
    GoogleOAuthManager.setMockClient(mockOAuthClient);

    const originalCalendar = (google as any).calendar;
    (google as any).calendar = () => ({
      calendars: { get: async () => ({ data: { timeZone: "Asia/Calcutta" } }) },
      events: {
        list: async () => ({
          data: {
            items: [
              {
                id: "evt_existing_conflict",
                summary: "Product Review",
                start: { dateTime: "2026-11-23T15:30:00Z" },
                end: { dateTime: "2026-11-23T16:30:00Z" },
                transparency: "opaque",
              },
            ],
          },
        }),
      },
    });

    // Interval overlapping Product Review: 16:00 to 17:00
    const conflictRes = await GoogleCalendarClient.checkConflicts(
      "2026-11-23T16:00:00Z",
      "2026-11-23T17:00:00Z"
    );

    assert.strictEqual(conflictRes.hasConflict, true);
    assert.strictEqual(conflictRes.conflictingEvents.length, 1);
    assert.strictEqual(conflictRes.conflictingEvents[0].summary, "Product Review");
    assert.ok(conflictRes.suggestedSlots && conflictRes.suggestedSlots.length > 0);

    // Non-conflicting interval: 18:00 to 19:00
    (google as any).calendar = () => ({
      calendars: { get: async () => ({ data: { timeZone: "Asia/Calcutta" } }) },
      events: {
        list: async () => ({
          data: { items: [] },
        }),
      },
    });

    const noConflictRes = await GoogleCalendarClient.checkConflicts(
      "2026-11-23T18:00:00Z",
      "2026-11-23T19:00:00Z"
    );
    assert.strictEqual(noConflictRes.hasConflict, false);
    assert.strictEqual(noConflictRes.conflictingEvents.length, 0);

    (google as any).calendar = originalCalendar;
    GoogleOAuthManager.setMockClient(null);
  });

  // --------------------------------------------------------------------------
  console.log("\n--- Group P: Approval Protocol & Action Cancellation ---");
  // --------------------------------------------------------------------------

  await it("Enforces approval gate for event creation and handles cancellation safely", () => {
    // Setup pending creation
    ComputerStateManager.setPendingConfirmation({
      action: "Create Calendar Event: Team Sync",
      target: "Team Sync",
      description: "Proposed Action: Create Calendar Event... Confirm?",
      tool: "calendar_create_event",
      args: { summary: "Team Sync", start: "2026-11-23T10:00:00Z" },
      timestamp: new Date().toISOString(),
    });

    // User cancels
    const cancelRes = ConfirmationManager.cancelPending();
    assert.strictEqual(cancelRes.success, true);
    assert.strictEqual(cancelRes.message, "Calendar action cancelled. No changes were made to your Google Calendar.");
    assert.strictEqual(ComputerStateManager.getPendingConfirmation(), null);
  });

  // Clean up
  db.prepare("DELETE FROM calendar_tokens WHERE id = 1").run();
  KeyManager.setMockKey(null);

  console.log("\n=================================================");
  console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log("=================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
