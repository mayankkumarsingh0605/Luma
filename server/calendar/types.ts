/**
 * LUMA Calendar Module Types (Phase 1)
 */

export type DecryptionFailureReason =
  | "KEY_FILE_MISSING"
  | "DPAPI_UNPROTECT_FAILED"
  | "CIPHERTEXT_INVALID"
  | "FS_ERROR";

export interface CalendarConnectionStatus {
  connected: boolean;
  email?: string;
  scopes?: string[];
  timeZone?: string;
  requiresReauth?: boolean;
  error?: string;
  recoveryReason?: DecryptionFailureReason;
  message?: string;
}

export type CalendarEventCategory = "meeting" | "birthday" | "holiday" | "event";

export interface CalendarEventSummary {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  start: string;
  end: string;
  timeZone?: string;
  htmlLink?: string;
  hasMeetLink?: boolean;
  meetUrl?: string;
  category: CalendarEventCategory;
  formattedDate?: string;
  formattedTime?: string;
  durationMinutes?: number;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  recurrence?: string[];
  reminders?: {
    useDefault: boolean;
    overrides?: EventReminderSetting[];
  };
}

export interface EventReminderSetting {
  method: "popup" | "email";
  minutes: number;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string } | string>;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: EventReminderSetting[];
  };
  createMeet?: boolean;
}

export interface UpdateEventParams {
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  isAllDay?: boolean;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string } | string>;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: EventReminderSetting[];
  };
  recurringScope?: "this_occurrence" | "this_and_following" | "all";
}

export interface SearchEventsParams {
  query?: string;
  date?: string;
  dateFilter?: "all" | "today" | "tomorrow" | "this_week" | "upcoming" | "custom";
  timeMin?: string;
  timeMax?: string;
  attendee?: string;
  maxResults?: number;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictingEvents: CalendarEventSummary[];
  suggestedSlots?: Array<{ start: string; end: string; formattedTime: string }>;
}

export interface CalendarEventOperationResult {
  success: boolean;
  operation: "create" | "update" | "delete" | "duplicate" | "search" | "availability";
  event?: CalendarEventSummary;
  previousEvent?: CalendarEventSummary;
  events?: CalendarEventSummary[];
  count?: number;
  message: string;
  conflict?: ConflictCheckResult;
  requiresConfirmation?: boolean;
  prompt?: string;
  error?: string;
}

export interface PendingOAuthSession {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

export interface CalendarAuthResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  requiresConfirmation?: boolean;
  prompt?: string;
}

export interface ListEventsOptions {
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
  dateFilter?: "all" | "today" | "tomorrow" | "this_week" | "upcoming";
  filterType?: "all" | "meeting" | "event";
  nextOnly?: boolean;
}

export interface UpcomingEventsResult {
  success: boolean;
  timeZone?: string;
  count: number;
  events: CalendarEventSummary[];
  message: string;
  dateFilter?: string;
  error?: string;
}
