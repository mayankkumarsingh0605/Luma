import type { IntentMatchResult } from "./types.js";
import { CalendarParser } from "../../../server/calendar/calendarParser.js";

/**
 * LUMA Calendar Intent Matcher (Phase 2 Full Event Management)
 *
 * Deterministic regex matching for calendar authentication, connection status,
 * timezone verification, disconnect/revocation, upcoming events, next meeting,
 * event creation, editing/rescheduling, cancellation/deletion, duplication,
 * search, and conflict availability in English and Hinglish.
 */
export function matchCalendarIntent(
  normalized: string,
  raw: string
): IntentMatchResult | null {
  const clean = normalized.toLowerCase().trim();
  const rawClean = raw.toLowerCase().trim();

  // 1. Connect / Login to Google Calendar
  if (
    /^(?:connect|link|login\s+to|sign\s+in\s+to|integrate)\s+(?:my\s+)?(?:google\s+)?calendar$/i.test(clean) ||
    /^(?:google\s+)?calendar\s+(?:connect|link|login|jodo)(?:\s*karo)?$/i.test(clean) ||
    /^(?:connect|link)\s+google\s+calendar$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_AUTH_LOGIN",
      ruleName: "RULE_CALENDAR_AUTH_LOGIN",
      arguments: {},
      toolToExecute: "calendar_auth_login",
    };
  }

  // 2. Calendar Timezone Query
  if (
    /^(?:check\s+)?(?:calendar|event)\s+timezone$/i.test(clean) ||
    /^(?:what\s+is\s+(?:my\s+)?(?:calendar\s+)?timezone)$/i.test(clean) ||
    /^(?:check\s+(?:my\s+)?calendar\s+timezone)$/i.test(clean) ||
    /^(?:calendar\s+)?timezone\s+(?:check\s+karo|batao|kya\s+hai)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_TIMEZONE",
      ruleName: "RULE_CALENDAR_TIMEZONE",
      arguments: {},
      toolToExecute: "calendar_get_timezone",
    };
  }

  // 3. Calendar Connection Status
  if (
    /^(?:check\s+)?(?:google\s+)?calendar\s+status$/i.test(clean) ||
    /^(?:is\s+(?:my\s+)?(?:google\s+)?calendar\s+connected)$/i.test(clean) ||
    /^(?:is\s+(?:my\s+)?(?:google\s+)?calendar\s+(?:linked|active))$/i.test(clean) ||
    /^(?:check\s+(?:my\s+)?(?:google\s+)?calendar\s+connection)$/i.test(clean) ||
    /^(?:google\s+)?calendar\s+status\s+(?:check\s+karo|batao|kya\s+hai)$/i.test(clean) ||
    /^(?:(?:kya\s+)?(?:mera\s+)?(?:google\s+)?calendar\s+connected\s+hai(?:\s+kya)?)$/i.test(clean) ||
    /^(?:google\s+)?calendar\s+connected\s+hai(?:\s+kya)?$/i.test(clean) ||
    /^(?:kya\s+calendar\s+connected\s+hai)$/i.test(clean) ||
    /^(?:calendar\s+status)$/i.test(rawClean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_AUTH_STATUS",
      ruleName: "RULE_CALENDAR_AUTH_STATUS",
      arguments: {},
      toolToExecute: "calendar_auth_status",
    };
  }

  // 4. Disconnect / Logout of Google Calendar
  if (
    /^(?:disconnect|unlink|logout\s+(?:of|from)|sign\s+out\s+(?:of|from))\s+(?:my\s+)?(?:google\s+)?calendar$/i.test(clean) ||
    /^(?:google\s+)?calendar\s+(?:disconnect|unlink|logout|hatao)(?:\s*karo)?$/i.test(clean) ||
    /^(?:disconnect|unlink)\s+google\s+calendar$/i.test(rawClean) ||
    /^(?:test\s+)?logout(?:\s+without\s+confirmation)?$/i.test(clean) ||
    /^(?:calendar\s+logout)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_AUTH_LOGOUT",
      ruleName: "RULE_CALENDAR_AUTH_LOGOUT",
      arguments: { confirmed: false },
      toolToExecute: "calendar_auth_logout",
    };
  }

  // 5. Parse Event Management Actions using CalendarParser
  const parsed = CalendarParser.parseCommand(raw);

  if (parsed.action === "availability") {
    return {
      matched: true,
      intent: "CALENDAR_CHECK_AVAILABILITY",
      ruleName: "RULE_CALENDAR_CHECK_AVAILABILITY",
      arguments: { parsed },
      toolToExecute: "calendar_check_conflicts",
    };
  }

  if (parsed.action === "duplicate") {
    return {
      matched: true,
      intent: "CALENDAR_DUPLICATE_EVENT",
      ruleName: "RULE_CALENDAR_DUPLICATE_EVENT",
      arguments: { parsed },
      toolToExecute: "calendar_duplicate_event",
    };
  }

  if (parsed.action === "reminder_preference") {
    return {
      matched: true,
      intent: "CALENDAR_UPDATE_REMINDER_PREFERENCE",
      ruleName: "RULE_CALENDAR_UPDATE_REMINDER_PREFERENCE",
      arguments: { parsed },
      toolToExecute: "calendar_auth_status",
    };
  }

  if (parsed.action === "search") {
    return {
      matched: true,
      intent: "CALENDAR_SEARCH_EVENTS",
      ruleName: "RULE_CALENDAR_SEARCH_EVENTS",
      arguments: { parsed },
      toolToExecute: "calendar_find_events",
    };
  }

  if (parsed.action === "delete") {
    return {
      matched: true,
      intent: "CALENDAR_DELETE_EVENT",
      ruleName: "RULE_CALENDAR_DELETE_EVENT",
      arguments: { parsed },
      toolToExecute: "calendar_delete_event",
    };
  }

  if (parsed.action === "update") {
    return {
      matched: true,
      intent: "CALENDAR_UPDATE_EVENT",
      ruleName: "RULE_CALENDAR_UPDATE_EVENT",
      arguments: { parsed },
      toolToExecute: "calendar_update_event",
    };
  }

  if (parsed.action === "create") {
    return {
      matched: true,
      intent: "CALENDAR_CREATE_EVENT",
      ruleName: "RULE_CALENDAR_CREATE_EVENT",
      arguments: { parsed },
      toolToExecute: "calendar_create_event",
    };
  }

  // 6. Next Meeting Query (Single immediate upcoming meeting)
  if (
    /^(?:what\s+is|what's|tell\s+me|show|get)\s+(?:my\s+)?next\s+(?:meeting|call|event|appointment)$/i.test(clean) ||
    /^(?:my\s+)?next\s+(?:meeting|call|event|appointment)$/i.test(clean) ||
    /^(?:next\s+(?:meeting|event)\s+(?:kab\s+hai|kya\s+hai|konsi\s+hai|batao))$/i.test(clean) ||
    /^(?:agli\s+meeting(?:\s+konsi\s+hai|\s+kab\s+hai|\s+batao)?)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_NEXT_MEETING",
      ruleName: "RULE_CALENDAR_NEXT_MEETING",
      arguments: { maxResults: 1, nextOnly: true, filterType: "meeting" },
      toolToExecute: "calendar_list_upcoming_events",
    };
  }

  // 7. Today's Events
  if (
    /^(?:show|list|get|what\s+are|tell\s+me)\s+(?:my\s+)?today(?:\s+s|'s|s)?\s+(?:calendar\s+)?(?:events|meetings|appointments|schedule)$/i.test(clean) ||
    /^(?:today(?:\s+s|'s|s)?\s+(?:events|meetings|appointments|schedule))$/i.test(clean) ||
    /^(?:what\s+do\s+i\s+have\s+today|what's\s+on\s+(?:my\s+)?(?:schedule\s+)?today)$/i.test(clean) ||
    /^(?:events|meetings)\s+today$/i.test(clean) ||
    /^(?:aaj\s+ke\s+(?:events|meetings|schedule)|aaj\s+ki\s+meetings|aaj\s+kya\s+hai)$/i.test(clean) ||
    /^(?:aaj\s+ka\s+schedule(?:\s+dikhao|\s+batao)?)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_LIST_TODAY",
      ruleName: "RULE_CALENDAR_LIST_TODAY",
      arguments: { dateFilter: "today", maxResults: 20 },
      toolToExecute: "calendar_list_upcoming_events",
    };
  }

  // 8. Tomorrow's Events
  if (
    /^(?:show|list|get|what\s+are|tell\s+me)\s+(?:my\s+)?tomorrow(?:\s+s|'s|s)?\s+(?:calendar\s+)?(?:events|meetings|appointments|schedule)$/i.test(clean) ||
    /^(?:tomorrow(?:\s+s|'s|s)?\s+(?:events|meetings|appointments|schedule))$/i.test(clean) ||
    /^(?:what\s+do\s+i\s+have\s+tomorrow|what's\s+on\s+(?:my\s+)?(?:schedule\s+)?tomorrow)$/i.test(clean) ||
    /^(?:events|meetings)\s+tomorrow$/i.test(clean) ||
    /^(?:kal\s+ke\s+(?:events|meetings|schedule)|kal\s+ki\s+meetings|kal\s+kya\s+hai)$/i.test(clean) ||
    /^(?:kal\s+ka\s+schedule(?:\s+dikhao|\s+batao)?)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_LIST_TOMORROW",
      ruleName: "RULE_CALENDAR_LIST_TOMORROW",
      arguments: { dateFilter: "tomorrow", maxResults: 20 },
      toolToExecute: "calendar_list_upcoming_events",
    };
  }

  // 9. This Week's Events
  if (
    /^(?:show|list|get|what\s+are|tell\s+me)\s+(?:my\s+)?this\s+week(?:\s+s|'s|s)?\s+(?:calendar\s+)?(?:events|meetings|appointments|schedule)$/i.test(clean) ||
    /^(?:this\s+week(?:\s+s|'s|s)?\s+(?:events|meetings|appointments|schedule))$/i.test(clean) ||
    /^(?:events|meetings)\s+this\s+week$/i.test(clean) ||
    /^(?:is\s+hafte\s+ke\s+(?:events|meetings|schedule)|is\s+hafte\s+ki\s+meetings|is\s+week\s+ke\s+events)$/i.test(clean) ||
    /^(?:is\s+hafte\s+ka\s+schedule(?:\s+dikhao|\s+batao)?)$/i.test(clean)
  ) {
    return {
      matched: true,
      intent: "CALENDAR_LIST_WEEK",
      ruleName: "RULE_CALENDAR_LIST_WEEK",
      arguments: { dateFilter: "this_week", maxResults: 30 },
      toolToExecute: "calendar_list_upcoming_events",
    };
  }

  // 10. Upcoming Events (General)
  const upcomingMatch =
    clean.match(/^(?:show|list|get|what\s+are|tell\s+me)\s+(?:(?:my|mere|meri|mera)\s+)?(?:next\s+(\d+)\s+)?upcoming\s+(?:calendar\s+)?(?:events|meetings|appointments|schedule)$/i) ||
    clean.match(/^(?:what\s+is\s+on\s+my\s+calendar|show\s+my\s+schedule|upcoming\s+(?:events|meetings|appointments))$/i) ||
    clean.match(/^(?:show\s+)?(?:next\s+(\d+)\s+)?upcoming\s+(?:events|meetings)$/i) ||
    clean.match(/^(?:(?:mere|meri|mera)\s+)?(?:next\s+(\d+)\s+)?(?:upcoming\s+)?(?:events|meetings)\s+dikhao$/i) ||
    clean.match(/^(?:(?:mere|meri|mera)\s+)?upcoming\s+(?:events|meetings)$/i);

  if (upcomingMatch) {
    const countStr = upcomingMatch[1];
    const maxResults = countStr ? parseInt(countStr, 10) : 10;
    return {
      matched: true,
      intent: "CALENDAR_LIST_UPCOMING",
      ruleName: "RULE_CALENDAR_LIST_UPCOMING",
      arguments: { maxResults: isNaN(maxResults) ? 10 : maxResults, dateFilter: "upcoming" },
      toolToExecute: "calendar_list_upcoming_events",
    };
  }

  return null;
}
