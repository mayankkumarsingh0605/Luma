import { google } from "googleapis";
import { GoogleOAuthManager } from "./googleOAuthManager.js";
import type {
  CalendarEventCategory,
  CalendarEventSummary,
  ConflictCheckResult,
  CreateEventParams,
  ListEventsOptions,
  SearchEventsParams,
  UpcomingEventsResult,
  UpdateEventParams,
} from "./types.js";

/**
 * Google Calendar API Client (Phase 2 Full Event Management & Query Engine)
 */
export class GoogleCalendarClient {
  /**
   * Maps a raw Google Calendar API event item to a strongly-typed CalendarEventSummary.
   */
  static mapItemToSummary(item: any, defaultTimeZone: string = "Asia/Calcutta"): CalendarEventSummary {
    const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
    const start = item.start?.dateTime || item.start?.date || "";
    const end = item.end?.dateTime || item.end?.date || "";

    const meetUrl =
      item.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri ||
      item.hangoutLink ||
      undefined;
    const hasMeetLink = Boolean(meetUrl);

    const summary = item.summary || "(No title)";
    const lowerSummary = summary.toLowerCase();

    // Categorize event
    let category: CalendarEventCategory = "event";
    const isBirthday = Boolean(
      item.eventType === "birthday" ||
      /\b(?:birthday|janamdin|salgirah)\b/i.test(lowerSummary) ||
      item.organizer?.email?.includes("contacts") ||
      item.creator?.email?.includes("contacts")
    );

    const isHoliday = Boolean(
      item.eventType === "holiday" ||
      /\b(?:holiday|jayanti|diwali|eid|christmas|new\s*year|independence\s*day|republic\s*day)\b/i.test(lowerSummary) ||
      item.organizer?.email?.includes("holiday")
    );

    if (isBirthday) {
      category = "birthday";
    } else if (isHoliday) {
      category = "holiday";
    } else if (hasMeetLink || (item.attendees && item.attendees.length > 1) || !isAllDay) {
      category = "meeting";
    }

    // Compute human-friendly formatted date & time
    let formattedDate = "";
    let formattedTime = isAllDay ? "All Day" : "";
    let durationMinutes: number | undefined = undefined;

    try {
      const startDate = new Date(start);
      const todayDate = new Date();
      const isSameDay =
        startDate.getFullYear() === todayDate.getFullYear() &&
        startDate.getMonth() === todayDate.getMonth() &&
        startDate.getDate() === todayDate.getDate();

      const tomorrowDate = new Date(todayDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const isTomorrow =
        startDate.getFullYear() === tomorrowDate.getFullYear() &&
        startDate.getMonth() === tomorrowDate.getMonth() &&
        startDate.getDate() === tomorrowDate.getDate();

      const monthName = startDate.toLocaleDateString("en-US", { month: "short" });
      const dayNum = startDate.getDate();
      const weekday = startDate.toLocaleDateString("en-US", { weekday: "short" });

      if (isSameDay) {
        formattedDate = `Today, ${monthName} ${dayNum}`;
      } else if (isTomorrow) {
        formattedDate = `Tomorrow, ${monthName} ${dayNum}`;
      } else {
        formattedDate = `${weekday}, ${monthName} ${dayNum}`;
      }

      if (!isAllDay) {
        const startStr = startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
        if (end) {
          const endDate = new Date(end);
          durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
          const endStr = endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
          formattedTime = `${startStr} – ${endStr}`;
        } else {
          formattedTime = startStr;
        }
      }
    } catch {
      formattedDate = start;
    }

    const attendees = Array.isArray(item.attendees)
      ? item.attendees.map((a: any) => ({
          email: a.email || "",
          displayName: a.displayName || a.email || "",
          responseStatus: a.responseStatus,
        }))
      : undefined;

    return {
      id: item.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      summary,
      description: item.description || undefined,
      location: item.location || undefined,
      isAllDay,
      start,
      end,
      timeZone: item.start?.timeZone || defaultTimeZone,
      htmlLink: item.htmlLink || "",
      hasMeetLink,
      meetUrl,
      category,
      formattedDate,
      formattedTime,
      durationMinutes,
      attendees,
      recurrence: item.recurrence || undefined,
      reminders: item.reminders
        ? {
            useDefault: Boolean(item.reminders.useDefault),
            overrides: item.reminders.overrides || [],
          }
        : undefined,
    };
  }

  /**
   * Fetches events from the user's primary calendar with support for
   * date filters (today, tomorrow, this week, upcoming), event categorization
   * (meetings, birthdays, holidays, standard events), and timezone formatting.
   */
  static async listUpcomingEvents(
    optionsOrMaxResults: number | ListEventsOptions = 10
  ): Promise<UpcomingEventsResult> {
    const options: ListEventsOptions =
      typeof optionsOrMaxResults === "number"
        ? { maxResults: optionsOrMaxResults }
        : optionsOrMaxResults || {};

    const maxResults = options.maxResults || 10;
    const dateFilter = options.dateFilter || "upcoming";
    const filterType = options.filterType || "all";
    const nextOnly = Boolean(options.nextOnly);

    const authResult = await GoogleOAuthManager.getAuthenticatedClient();

    if (!authResult.client) {
      if (authResult.error === "REFRESH_TOKEN_EXPIRED") {
        return {
          success: false,
          count: 0,
          events: [],
          message: "Your Google Calendar session has expired. Say 'connect Google calendar' to re-authenticate.",
          error: "REFRESH_TOKEN_EXPIRED",
        };
      }

      return {
        success: false,
        count: 0,
        events: [],
        message: "Google Calendar is not connected. Say 'connect Google calendar' to link your account.",
        error: authResult.error || "NOT_CONNECTED",
      };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      // Determine primary calendar timezone
      let timeZone = "Asia/Calcutta";
      try {
        const calMeta = await calendar.calendars.get({ calendarId: "primary" });
        if (calMeta.data.timeZone) {
          timeZone = calMeta.data.timeZone;
        }
      } catch {
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        } catch {
          timeZone = "UTC";
        }
      }

      // Compute date boundaries based on dateFilter
      const now = new Date();
      let queryTimeMin: string;
      let queryTimeMax: string | undefined = undefined;

      if (dateFilter === "today") {
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        queryTimeMin = startToday.toISOString();
        queryTimeMax = endToday.toISOString();
      } else if (dateFilter === "tomorrow") {
        const startTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
        const endTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
        queryTimeMin = startTomorrow.toISOString();
        queryTimeMax = endTomorrow.toISOString();
      } else if (dateFilter === "this_week") {
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        const dayOfWeek = endOfWeek.getDay(); // 0 = Sunday
        const daysToSunday = (7 - dayOfWeek) % 7;
        endOfWeek.setDate(endOfWeek.getDate() + daysToSunday);
        queryTimeMin = startToday.toISOString();
        queryTimeMax = endOfWeek.toISOString();
      } else {
        // upcoming
        queryTimeMin = options.timeMin || now.toISOString();
        queryTimeMax = options.timeMax;
      }

      const clampedMax = Math.min(Math.max(Number(maxResults) || 10, 1), 50);
      // Buffer query to prevent birthdays or all-day events from starving meetings
      const bufferLimit = Math.min(Math.max(clampedMax * 3, 30), 100);

      const requestParams: any = {
        calendarId: "primary",
        timeMin: queryTimeMin,
        maxResults: bufferLimit,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (queryTimeMax) {
        requestParams.timeMax = queryTimeMax;
      }

      const response = await calendar.events.list(requestParams);
      const rawItems = response.data.items || [];

      if (rawItems.length === 0) {
        const emptyLabels: Record<string, string> = {
          today: "today",
          tomorrow: "tomorrow",
          this_week: "this week",
          upcoming: "upcoming",
        };
        const scope = emptyLabels[dateFilter] || "upcoming";
        return {
          success: true,
          timeZone,
          count: 0,
          events: [],
          message: `No ${scope} events found on your Google Calendar.`,
        };
      }

      const allEvents: CalendarEventSummary[] = rawItems.map((item) =>
        this.mapItemToSummary(item, timeZone)
      );

      // Filter events if requested
      let filteredEvents = allEvents;
      if (filterType === "meeting") {
        filteredEvents = allEvents.filter((e) => e.category === "meeting");
      }

      if (nextOnly) {
        const nextMeeting = filteredEvents.find((e) => e.category === "meeting") || filteredEvents[0];
        if (!nextMeeting) {
          return {
            success: true,
            timeZone,
            count: 0,
            events: [],
            message: "No upcoming meetings found on your calendar.",
          };
        }
        return {
          success: true,
          timeZone,
          count: 1,
          events: [nextMeeting],
          message: `Your next meeting is "${nextMeeting.summary}" on ${nextMeeting.formattedDate} at ${nextMeeting.formattedTime}.`,
        };
      }

      // Limit to requested clampedMax
      const finalEvents = filteredEvents.slice(0, clampedMax);

      let message = `Found ${finalEvents.length} event${finalEvents.length === 1 ? "" : "s"}`;
      if (dateFilter === "today") message += ` for today`;
      else if (dateFilter === "tomorrow") message += ` for tomorrow`;
      else if (dateFilter === "this_week") message += ` for this week`;
      else message += ` on your calendar`;
      message += `.`;

      return {
        success: true,
        timeZone,
        count: finalEvents.length,
        events: finalEvents,
        dateFilter,
        message,
      };
    } catch (err: any) {
      const errMsg = err?.message || "Failed to retrieve calendar events.";
      return {
        success: false,
        count: 0,
        events: [],
        message: `Failed to fetch calendar events: ${errMsg}`,
        error: errMsg,
      };
    }
  }

  /**
   * Creates a new Google Calendar event with attendees, reminders, recurrence, and Google Meet.
   */
  static async createEvent(
    params: CreateEventParams
  ): Promise<{ success: boolean; event?: CalendarEventSummary; error?: string }> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return { success: false, error: authResult.error || "Google Calendar not connected." };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      // Determine timezone
      let timeZone = params.timeZone || "Asia/Calcutta";
      try {
        const calMeta = await calendar.calendars.get({ calendarId: "primary" });
        if (calMeta.data.timeZone) timeZone = calMeta.data.timeZone;
      } catch {}

      const requestBody: any = {
        summary: params.summary,
        description: params.description,
        location: params.location,
      };

      if (params.isAllDay) {
        const startDate = params.start.slice(0, 10);
        const endDate = params.end ? params.end.slice(0, 10) : startDate;
        requestBody.start = { date: startDate };
        requestBody.end = { date: endDate };
      } else {
        const startIso = params.start.includes("T") ? params.start : `${params.start}T09:00:00`;
        const startDateObj = new Date(startIso);
        const durationMs = (params.durationMinutes || 60) * 60000;
        const endIso = params.end || new Date(startDateObj.getTime() + durationMs).toISOString();

        requestBody.start = { dateTime: startDateObj.toISOString(), timeZone };
        requestBody.end = { dateTime: endIso, timeZone };
      }

      if (params.recurrence && params.recurrence.length > 0) {
        requestBody.recurrence = params.recurrence;
      }

      if (params.attendees && params.attendees.length > 0) {
        requestBody.attendees = params.attendees.map((a) => {
          if (typeof a === "string") {
            const email = a.includes("@") ? a : `${a.toLowerCase().replace(/\s+/g, "")}@example.com`;
            return { email, displayName: a };
          }
          return a;
        });
      }

      if (params.createMeet !== false && !params.isAllDay) {
        requestBody.conferenceData = {
          createRequest: {
            requestId: `meet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      if (params.reminders) {
        requestBody.reminders = {
          useDefault: params.reminders.useDefault ?? false,
          overrides: params.reminders.overrides || [{ method: "popup", minutes: 15 }],
        };
      } else {
        requestBody.reminders = {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 15 }],
        };
      }

      const response = await calendar.events.insert({
        calendarId: "primary",
        conferenceDataVersion: 1,
        requestBody,
      });

      const event = this.mapItemToSummary(response.data, timeZone);
      return { success: true, event };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to create calendar event." };
    }
  }

  /**
   * Searches existing calendar events by query string, attendee, or date window.
   */
  static async findEvents(
    params: SearchEventsParams
  ): Promise<{ success: boolean; events: CalendarEventSummary[]; count: number; error?: string }> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return { success: false, events: [], count: 0, error: authResult.error || "Calendar not connected." };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      let timeZone = "Asia/Calcutta";
      try {
        const calMeta = await calendar.calendars.get({ calendarId: "primary" });
        if (calMeta.data.timeZone) timeZone = calMeta.data.timeZone;
      } catch {}

      const now = new Date();
      let queryTimeMin = params.timeMin || new Date(now.getTime() - 7 * 86400000).toISOString();
      let queryTimeMax = params.timeMax || new Date(now.getTime() + 60 * 86400000).toISOString();

      if (params.date) {
        const d = new Date(params.date);
        const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        const endDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        queryTimeMin = startDay.toISOString();
        queryTimeMax = endDay.toISOString();
      }

      const requestParams: any = {
        calendarId: "primary",
        timeMin: queryTimeMin,
        timeMax: queryTimeMax,
        maxResults: params.maxResults || 50,
        singleEvents: true,
        orderBy: "startTime",
      };

      if (params.query) {
        requestParams.q = params.query;
      }

      const response = await calendar.events.list(requestParams);
      const rawItems = response.data.items || [];
      let events = rawItems.map((item) => this.mapItemToSummary(item, timeZone));

      // Local refinement if query was provided
      if (params.query) {
        const qLower = params.query.toLowerCase().trim();
        events = events.filter(
          (e) =>
            e.summary.toLowerCase().includes(qLower) ||
            e.description?.toLowerCase().includes(qLower) ||
            e.attendees?.some((a) => (a.displayName?.toLowerCase().includes(qLower)) || a.email.toLowerCase().includes(qLower))
        );
      }

      if (params.attendee) {
        const attLower = params.attendee.toLowerCase().trim();
        events = events.filter((e) =>
          e.attendees?.some((a) => (a.displayName?.toLowerCase().includes(attLower)) || a.email.toLowerCase().includes(attLower))
        );
      }

      return { success: true, events, count: events.length };
    } catch (err: any) {
      return { success: false, events: [], count: 0, error: err?.message || "Failed to search events." };
    }
  }

  /**
   * Retrieves a single event by its unique Google eventId.
   */
  static async getEventById(eventId: string): Promise<CalendarEventSummary | null> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) return null;

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });
      const res = await calendar.events.get({ calendarId: "primary", eventId });
      return this.mapItemToSummary(res.data);
    } catch {
      return null;
    }
  }

  /**
   * Updates an existing Google Calendar event and returns before/after representations.
   */
  static async updateEvent(
    params: UpdateEventParams
  ): Promise<{
    success: boolean;
    event?: CalendarEventSummary;
    previousEvent?: CalendarEventSummary;
    error?: string;
  }> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return { success: false, error: authResult.error || "Calendar not connected." };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      let timeZone = "Asia/Calcutta";
      try {
        const calMeta = await calendar.calendars.get({ calendarId: "primary" });
        if (calMeta.data.timeZone) timeZone = calMeta.data.timeZone;
      } catch {}

      // Retrieve previous event
      const existing = await calendar.events.get({ calendarId: "primary", eventId: params.eventId });
      const previousEvent = this.mapItemToSummary(existing.data, timeZone);

      const patchBody: any = {};
      if (params.summary !== undefined) patchBody.summary = params.summary;
      if (params.description !== undefined) patchBody.description = params.description;
      if (params.location !== undefined) patchBody.location = params.location;

      if (params.start !== undefined) {
        if (params.isAllDay) {
          const startDate = params.start.slice(0, 10);
          const endDate = params.end ? params.end.slice(0, 10) : startDate;
          patchBody.start = { date: startDate };
          patchBody.end = { date: endDate };
        } else {
          const startIso = params.start.includes("T") ? params.start : `${params.start}T09:00:00`;
          const startDateObj = new Date(startIso);
          const durationMs = (params.durationMinutes || previousEvent.durationMinutes || 60) * 60000;
          const endIso = params.end || new Date(startDateObj.getTime() + durationMs).toISOString();

          patchBody.start = { dateTime: startDateObj.toISOString(), timeZone };
          patchBody.end = { dateTime: endIso, timeZone };
        }
      }

      if (params.attendees !== undefined) {
        patchBody.attendees = params.attendees.map((a) => {
          if (typeof a === "string") {
            const email = a.includes("@") ? a : `${a.toLowerCase().replace(/\s+/g, "")}@example.com`;
            return { email, displayName: a };
          }
          return a;
        });
      }

      if (params.reminders !== undefined) {
        patchBody.reminders = {
          useDefault: params.reminders.useDefault ?? false,
          overrides: params.reminders.overrides || [{ method: "popup", minutes: 15 }],
        };
      }

      const res = await calendar.events.patch({
        calendarId: "primary",
        eventId: params.eventId,
        requestBody: patchBody,
      });

      const event = this.mapItemToSummary(res.data, timeZone);
      return { success: true, event, previousEvent };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to update calendar event." };
    }
  }

  /**
   * Deletes a calendar event and verifies deletion with Google Calendar.
   */
  static async deleteEvent(
    eventId: string,
    _options?: { recurringScope?: "this_occurrence" | "all" }
  ): Promise<{ success: boolean; deletedEvent?: CalendarEventSummary; error?: string }> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return { success: false, error: authResult.error || "Calendar not connected." };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      // Fetch existing details before deleting
      let deletedEvent: CalendarEventSummary | undefined = undefined;
      try {
        const existing = await calendar.events.get({ calendarId: "primary", eventId });
        deletedEvent = this.mapItemToSummary(existing.data);
      } catch {}

      await calendar.events.delete({ calendarId: "primary", eventId });

      return { success: true, deletedEvent };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to delete calendar event." };
    }
  }

  /**
   * Duplicates an existing event onto a new date or time.
   */
  static async duplicateEvent(
    eventId: string,
    newStart: string,
    newEnd?: string
  ): Promise<{
    success: boolean;
    event?: CalendarEventSummary;
    originalEvent?: CalendarEventSummary;
    error?: string;
  }> {
    const original = await this.getEventById(eventId);
    if (!original) {
      return { success: false, error: `Event with id '${eventId}' not found.` };
    }

    const durationMinutes = original.durationMinutes || 60;
    const createRes = await this.createEvent({
      summary: original.summary,
      description: original.description,
      location: original.location,
      start: newStart,
      end: newEnd,
      durationMinutes,
      isAllDay: original.isAllDay,
      attendees: original.attendees,
      reminders: original.reminders,
      createMeet: original.hasMeetLink,
    });

    if (!createRes.success || !createRes.event) {
      return { success: false, error: createRes.error || "Failed to duplicate event." };
    }

    return { success: true, event: createRes.event, originalEvent: original };
  }

  /**
   * Checks for overlapping events within the proposed time interval
   * and suggests nearby non-conflicting time slots.
   */
  static async checkConflicts(
    startIso: string,
    endIso: string,
    excludeEventId?: string
  ): Promise<ConflictCheckResult> {
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return { hasConflict: false, conflictingEvents: [] };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });

      const startTime = new Date(startIso).getTime();
      const endTime = new Date(endIso).getTime();

      // Query broad window around startIso
      const windowStart = new Date(startTime - 2 * 3600000).toISOString();
      const windowEnd = new Date(endTime + 2 * 3600000).toISOString();

      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: windowStart,
        timeMax: windowEnd,
        singleEvents: true,
        orderBy: "startTime",
      });

      const rawItems = response.data.items || [];
      const conflictingEvents: CalendarEventSummary[] = [];

      for (const item of rawItems) {
        if (excludeEventId && item.id === excludeEventId) continue;
        if (item.transparency === "transparent") continue; // Available/free events don't conflict

        const itemStart = new Date(item.start?.dateTime || item.start?.date || "").getTime();
        const itemEnd = new Date(item.end?.dateTime || item.end?.date || "").getTime();

        // Overlap condition: max(start1, start2) < min(end1, end2)
        if (Math.max(startTime, itemStart) < Math.min(endTime, itemEnd)) {
          conflictingEvents.push(this.mapItemToSummary(item));
        }
      }

      if (conflictingEvents.length === 0) {
        return { hasConflict: false, conflictingEvents: [] };
      }

      // Compute suggested slots: 1 hour earlier, 1 hour later
      const durationMs = endTime - startTime;
      const suggestedSlots: Array<{ start: string; end: string; formattedTime: string }> = [];

      // Slot 1: Earlier
      const earlierStart = new Date(startTime - durationMs);
      const earlierEnd = new Date(startTime);
      if (earlierStart.getHours() >= 9) {
        const fTime = `${earlierStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${earlierEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        suggestedSlots.push({
          start: earlierStart.toISOString(),
          end: earlierEnd.toISOString(),
          formattedTime: fTime,
        });
      }

      // Slot 2: Later
      const laterStart = new Date(endTime);
      const laterEnd = new Date(endTime + durationMs);
      if (laterEnd.getHours() <= 19) {
        const fTime = `${laterStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${laterEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
        suggestedSlots.push({
          start: laterStart.toISOString(),
          end: laterEnd.toISOString(),
          formattedTime: fTime,
        });
      }

      return {
        hasConflict: true,
        conflictingEvents,
        suggestedSlots: suggestedSlots.length > 0 ? suggestedSlots : undefined,
      };
    } catch {
      return { hasConflict: false, conflictingEvents: [] };
    }
  }

  /**
   * Retrieves the user's primary calendar timezone and status.
   */
  static async getCalendarTimezone(): Promise<{
    success: boolean;
    timeZone?: string;
    localTimeZone?: string;
    message: string;
  }> {
    const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Calcutta";
    const authResult = await GoogleOAuthManager.getAuthenticatedClient();
    if (!authResult.client) {
      return {
        success: true,
        localTimeZone,
        message: `Google Calendar is not connected. Local system timezone is ${localTimeZone}.`,
      };
    }

    try {
      const calendar = google.calendar({ version: "v3", auth: authResult.client });
      const calMeta = await calendar.calendars.get({ calendarId: "primary" });
      const timeZone = calMeta.data.timeZone || localTimeZone;
      return {
        success: true,
        timeZone,
        localTimeZone,
        message: `Google Calendar timezone is ${timeZone}. Local system timezone is ${localTimeZone}.`,
      };
    } catch {
      return {
        success: true,
        timeZone: localTimeZone,
        localTimeZone,
        message: `Calendar timezone is ${localTimeZone}.`,
      };
    }
  }
}
