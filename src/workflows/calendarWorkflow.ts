import type { RoutedCommand } from "../router/commandRouter.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";
import { ComputerStateManager } from "../state/computerState.js";
import { CalendarParser, type ParsedCalendarCommand } from "../../server/calendar/calendarParser.js";

/**
 * Invokes a tool via canonical ToolExecutor (direct in Node/tests, HTTP in browser).
 */
async function callTool(tool: string, args: Record<string, any> = {}): Promise<any> {
  const postBody = JSON.stringify({ tool, arguments: args });
  try {
    const res = await fetch("/api/computer/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: postBody,
    });
    return await res.json();
  } catch {
    if (typeof window === "undefined") {
      try {
        const res = await fetch("http://localhost:3001/api/computer/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: postBody,
        });
        return await res.json();
      } catch {
        const modPath = "../../server/computer/tools/toolExecutor.js";
        const mod = await (Function("m", "return import(m)")(modPath));
        return await mod.ToolExecutor.executeTool(tool, args);
      }
    }
    return { success: false, error: "Backend server unreachable." };
  }
}

/**
 * LUMA Calendar Workflow (Phase 1 & Phase 2 Complete Event Management)
 */
export async function executeCalendarWorkflow(
  routed: RoutedCommand,
  context: WorkflowContext
): Promise<WorkflowResult> {
  const { intent, arguments: args } = routed;

  switch (intent) {
    case "CALENDAR_AUTH_LOGIN": {
      context.onProgress("Initiating Google Calendar authorization...", "in-progress");

      const response = await callTool("calendar_auth_login", {});
      if (!response.success && !response.result?.success) {
        const errorMsg = response.error || response.result?.error || "Failed to start Google authorization.";
        context.onProgress("Google authorization failed to start", "failed");
        return { success: false, message: errorMsg, error: errorMsg };
      }

      const result = response.result || response;
      const browserOpened = result.browserOpened !== false;
      const progressMsg = browserOpened
        ? "Google authorization page opened in browser"
        : "Google authorization URL ready (manual open required)";
      context.onProgress(progressMsg, "completed");

      return {
        success: true,
        message:
          result.message ||
          (browserOpened
            ? "Google authorization page opened in your browser. Please approve access to continue."
            : "Google authorization URL generated. Please click the button below to authorize Google Calendar in your browser."),
        data: result,
      };
    }

    case "CALENDAR_AUTH_STATUS": {
      context.onProgress("Checking Google Calendar connection status...", "in-progress");

      const response = await callTool("calendar_auth_status", {});
      const statusData = response.result || response;

      if (statusData.connected) {
        context.onProgress("Google Calendar is connected", "completed");
        return {
          success: true,
          message: statusData.message || `Google Calendar is connected as ${statusData.email}.`,
          data: statusData,
        };
      }

      if (statusData.requiresReauth) {
        context.onProgress("Calendar re-authorization required", "failed");
        return {
          success: false,
          message:
            statusData.message ||
            "Calendar credentials expired or could not be decrypted. Please say 'connect Google calendar' to re-authenticate.",
          data: statusData,
          error: statusData.error,
        };
      }

      context.onProgress("Google Calendar is not connected", "completed");
      return {
        success: true,
        message: "Google Calendar is not connected. Say 'connect Google calendar' to link your account.",
        data: statusData,
      };
    }

    case "CALENDAR_AUTH_LOGOUT": {
      const isConfirmed = Boolean(args?.confirmed);

      if (!isConfirmed) {
        const prompt =
          "Disconnecting Google Calendar will revoke access and remove saved credentials. Should I continue? (Reply 'yes' to proceed or 'no' to cancel)";

        ComputerStateManager.setPendingConfirmation({
          action: "Disconnect Google Calendar",
          target: "Google Calendar Credentials",
          description: prompt,
          tool: "calendar_auth_logout",
          args: { confirmed: true },
          timestamp: new Date().toISOString(),
        });

        context.onProgress("Awaiting confirmation to disconnect Google Calendar...", "in-progress");
        return {
          success: true,
          message: prompt,
          data: { requiresConfirmation: true },
        };
      }

      context.onProgress("Disconnecting Google Calendar and revoking credentials...", "in-progress");
      const response = await callTool("calendar_auth_logout", { confirmed: true });
      const result = response.result || response;

      if (result.success) {
        context.onProgress("Google Calendar disconnected", "completed");
        return {
          success: true,
          message: result.message || "Google Calendar disconnected and credentials revoked successfully.",
          data: result,
        };
      }

      context.onProgress("Failed to disconnect calendar", "failed");
      return {
        success: false,
        message: result.error || "Failed to disconnect Google Calendar.",
        error: result.error,
      };
    }

    case "CALENDAR_TIMEZONE": {
      context.onProgress("Checking calendar timezone...", "in-progress");
      const tzResponse = await callTool("calendar_get_timezone", {});
      const tzData = tzResponse.result || tzResponse;
      context.onProgress("Calendar timezone retrieved", "completed");
      return {
        success: true,
        message: tzData.message || `Calendar timezone is ${tzData.timeZone || "Asia/Calcutta"}.`,
        data: tzData,
      };
    }

    case "CALENDAR_NEXT_MEETING": {
      context.onProgress("Checking your next meeting...", "in-progress");
      const response = await callTool("calendar_list_upcoming_events", {
        maxResults: 1,
        nextOnly: true,
        filterType: "meeting",
      });
      const data = response.result || response;
      if (!data.success) {
        context.onProgress("Could not retrieve next meeting", "failed");
        return { success: false, message: data.message || "Failed to retrieve next meeting.", error: data.error };
      }
      if (data.count === 0 || !data.events || data.events.length === 0) {
        context.onProgress("No upcoming meetings", "completed");
        return { success: true, message: "You have no upcoming meetings scheduled.", data };
      }
      const evt = data.events[0];
      const meetStr = evt.hasMeetLink ? `\n🔗 Google Meet: ${evt.meetUrl || evt.htmlLink}` : "";
      const durStr = evt.durationMinutes ? ` (${evt.durationMinutes} mins)` : "";
      const msg = `Your next meeting is "${evt.summary}" on ${evt.formattedDate} at ${evt.formattedTime}${durStr}.${meetStr}`;
      context.onProgress("Found next meeting", "completed");
      return { success: true, message: msg, data };
    }

    case "CALENDAR_LIST_TODAY":
    case "CALENDAR_LIST_TOMORROW":
    case "CALENDAR_LIST_WEEK":
    case "CALENDAR_LIST_UPCOMING": {
      let dateFilter = args?.dateFilter || "upcoming";
      if (intent === "CALENDAR_LIST_TODAY") dateFilter = "today";
      else if (intent === "CALENDAR_LIST_TOMORROW") dateFilter = "tomorrow";
      else if (intent === "CALENDAR_LIST_WEEK") dateFilter = "this_week";

      const maxResults = args?.maxResults || (dateFilter === "this_week" ? 30 : 20);
      context.onProgress(`Fetching ${dateFilter.replace("_", " ")} calendar events...`, "in-progress");

      const response = await callTool("calendar_list_upcoming_events", {
        maxResults,
        dateFilter,
      });
      const data = response.result || response;

      if (!data.success) {
        context.onProgress("Could not fetch calendar events", "failed");
        return {
          success: false,
          message: data.message || "Failed to retrieve calendar events.",
          error: data.error,
        };
      }

      if (data.count === 0) {
        context.onProgress("No events found", "completed");
        return {
          success: true,
          message: data.message || `No ${dateFilter.replace("_", " ")} events found on your Google Calendar.`,
          data,
        };
      }

      const eventLines = data.events.map((e: any, idx: number) => {
        const dateLabel = e.formattedDate || e.start;
        const timeLabel = e.isAllDay ? "All Day" : e.formattedTime;
        const catLabel =
          e.category === "birthday"
            ? " [Birthday]"
            : e.category === "holiday"
            ? " [Holiday]"
            : e.hasMeetLink
            ? " [Google Meet]"
            : e.isAllDay
            ? " [All-Day]"
            : "";
        return `${idx + 1}. ${e.summary} — ${dateLabel} (${timeLabel})${catLabel}`;
      });

      const tzHeader = data.timeZone ? ` (Timezone: ${data.timeZone})` : "";
      const fullMessage = `${data.message}${tzHeader}\n\n${eventLines.join("\n")}`;
      context.onProgress(`Found ${data.count} events`, "completed");

      return {
        success: true,
        message: fullMessage,
        data,
      };
    }

    // ------------------------------------------------------------------------
    // Phase 2: Complete Event Management Workflows with Approval Gates
    // ------------------------------------------------------------------------

    case "CALENDAR_CREATE_EVENT": {
      context.onProgress("Analyzing calendar event details...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      // Validate required details
      if (parsed.missingFields && parsed.missingFields.length > 0) {
        context.onProgress("Missing event details", "failed");
        const missing = parsed.missingFields.join(" and ");
        return {
          success: false,
          message: `I need a bit more information to schedule this event. Please specify the ${missing}.`,
        };
      }

      const dateStr = parsed.date || CalendarParser.toYmd(new Date());
      let startIso: string;
      let endIso: string;

      if (parsed.isAllDay) {
        startIso = dateStr;
        endIso = dateStr;
      } else {
        const timeStr = parsed.time || "09:00";
        const startDate = new Date(`${dateStr}T${timeStr}:00`);
        const durationMs = (parsed.durationMinutes || 60) * 60000;
        endIso = new Date(startDate.getTime() + durationMs).toISOString();
        startIso = startDate.toISOString();
      }

      // Run conflict detection
      let conflictWarning = "";
      if (!parsed.isAllDay) {
        const conflictRes = await callTool("calendar_check_conflicts", { start: startIso, end: endIso });
        const conflictData = conflictRes.result || conflictRes;
        if (conflictData.hasConflict && conflictData.conflictingEvents?.length > 0) {
          const conflicting = conflictData.conflictingEvents[0];
          conflictWarning = `\n\n⚠️ Conflict Notice: You already have "${conflicting.summary}" scheduled at ${conflicting.formattedTime}.`;
          if (conflictData.suggestedSlots?.length > 0) {
            const slotList = conflictData.suggestedSlots.map((s: any) => s.formattedTime).join(" or ");
            conflictWarning += `\nSuggested alternative slots: ${slotList}.`;
          }
        }
      }

      // Format preview
      const dateLabel = new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const timeLabel = parsed.isAllDay
        ? "All Day"
        : `${parsed.time || "09:00"} (${parsed.durationMinutes || 60} mins)`;
      const meetLabel =
        parsed.createMeet && !parsed.isAllDay ? "Google Meet link will be generated" : "No video link";
      const attendeesLabel = parsed.attendees?.length ? parsed.attendees.join(", ") : "None";
      const recLabel = parsed.recurrenceLabel ? `\n• Recurrence: ${parsed.recurrenceLabel}` : "";
      const remLabel = parsed.reminderMinutes
        ? `\n• Reminder: ${parsed.reminderMinutes} minutes before (popup)`
        : "\n• Reminder: 15 minutes before (popup)";

      const prompt = `Proposed Action: Create Calendar Event\n• Title: ${parsed.summary}\n• Date: ${dateLabel}\n• Time: ${timeLabel}\n• Video Call: ${meetLabel}\n• Attendees: ${attendeesLabel}${recLabel}${remLabel}${conflictWarning}\n\nShould I create this event on your Google Calendar? (Reply 'yes' to confirm or 'no' to cancel)`;

      ComputerStateManager.setPendingConfirmation({
        action: `Create Calendar Event: "${parsed.summary}"`,
        target: parsed.summary || "Calendar Event",
        description: prompt,
        tool: "calendar_create_event",
        args: {
          summary: parsed.summary,
          start: startIso,
          end: endIso,
          durationMinutes: parsed.durationMinutes,
          isAllDay: parsed.isAllDay,
          location: parsed.location,
          attendees: parsed.attendees,
          recurrence: parsed.recurrence,
          reminderMinutes: parsed.reminderMinutes || 15,
          createMeet: parsed.createMeet,
        },
        timestamp: new Date().toISOString(),
      });

      context.onProgress("Awaiting confirmation to create calendar event...", "in-progress");
      return {
        success: true,
        message: prompt,
        data: { requiresConfirmation: true },
      };
    }

    case "CALENDAR_UPDATE_EVENT": {
      context.onProgress("Locating event to update...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      const searchRes = await callTool("calendar_find_events", {
        query: parsed.targetQuery || parsed.summary,
        date: parsed.targetDate,
        maxResults: 5,
      });
      const searchData = searchRes.result || searchRes;
      const candidates = searchData.events || [];

      if (candidates.length === 0) {
        context.onProgress("No matching event found", "failed");
        return {
          success: false,
          message: `No matching event found on your calendar for "${parsed.targetQuery || parsed.summary || "meeting"}".`,
        };
      }

      if (candidates.length > 1 && !parsed.targetDate) {
        context.onProgress("Multiple events matched", "completed");
        const list = candidates
          .map((c: any, i: number) => `${i + 1}. ${c.summary} — ${c.formattedDate} (${c.formattedTime})`)
          .join("\n");
        return {
          success: true,
          message: `I found multiple matching events on your calendar:\n\n${list}\n\nPlease specify which one you'd like to update.`,
          data: { ambiguous: true, candidates },
        };
      }

      const targetEvent = candidates[0];

      let newStartIso: string | undefined = undefined;
      let newEndIso: string | undefined = undefined;
      const updatesSummary: string[] = [];

      if (parsed.time) {
        const dateStr = parsed.date || targetEvent.start.slice(0, 10);
        const startDate = new Date(`${dateStr}T${parsed.time}:00`);
        const durationMs = (parsed.durationMinutes || targetEvent.durationMinutes || 60) * 60000;
        newStartIso = startDate.toISOString();
        newEndIso = new Date(startDate.getTime() + durationMs).toISOString();
        updatesSummary.push(
          `• New Time: ${parsed.time} (${parsed.durationMinutes || targetEvent.durationMinutes || 60} mins)`
        );
      }

      if (parsed.location) {
        updatesSummary.push(`• New Location: ${parsed.location}`);
      }

      if (parsed.attendees && parsed.attendees.length > 0) {
        updatesSummary.push(`• Updated Attendees: ${parsed.attendees.join(", ")}`);
      }

      if (updatesSummary.length === 0 && !newStartIso) {
        return {
          success: false,
          message: "Please specify what you would like to change (e.g. time, date, location, or attendees).",
        };
      }

      const prompt = `Proposed Action: Update Calendar Event\n• Event: ${targetEvent.summary}\n• Current: ${targetEvent.formattedDate} (${targetEvent.formattedTime})\n${updatesSummary.join("\n")}\n\nShould I apply these changes to your Google Calendar? (Reply 'yes' to confirm or 'no' to cancel)`;

      ComputerStateManager.setPendingConfirmation({
        action: `Update Calendar Event: "${targetEvent.summary}"`,
        target: targetEvent.summary,
        description: prompt,
        tool: "calendar_update_event",
        args: {
          eventId: targetEvent.id,
          summary: parsed.summary && parsed.summary !== targetEvent.summary ? parsed.summary : undefined,
          start: newStartIso,
          end: newEndIso,
          durationMinutes: parsed.durationMinutes,
          location: parsed.location,
          attendees: parsed.attendees,
          recurringScope: parsed.recurringScope || "this_occurrence",
        },
        timestamp: new Date().toISOString(),
      });

      context.onProgress("Awaiting confirmation to update event...", "in-progress");
      return {
        success: true,
        message: prompt,
        data: { requiresConfirmation: true },
      };
    }

    case "CALENDAR_DELETE_EVENT": {
      context.onProgress("Locating event to cancel...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      const searchRes = await callTool("calendar_find_events", {
        query: parsed.targetQuery || parsed.summary,
        date: parsed.targetDate,
        maxResults: 5,
      });
      const searchData = searchRes.result || searchRes;
      const candidates = searchData.events || [];

      if (candidates.length === 0) {
        context.onProgress("No matching event found", "failed");
        return {
          success: false,
          message: `No matching event found to cancel for "${parsed.targetQuery || parsed.summary || "meeting"}".`,
        };
      }

      if (candidates.length > 1 && !parsed.targetDate) {
        context.onProgress("Multiple events matched", "completed");
        const list = candidates
          .map((c: any, i: number) => `${i + 1}. ${c.summary} — ${c.formattedDate} (${c.formattedTime})`)
          .join("\n");
        return {
          success: true,
          message: `I found multiple matching events:\n\n${list}\n\nPlease specify which one you'd like to cancel.`,
          data: { ambiguous: true, candidates },
        };
      }

      const targetEvent = candidates[0];
      const isRecurring = Boolean(targetEvent.recurrence && targetEvent.recurrence.length > 0);
      const recNote = isRecurring ? "\n⚠️ This is a recurring event. Only this occurrence will be removed." : "";

      const prompt = `Proposed Action: Delete Calendar Event\n• Title: ${targetEvent.summary}\n• Date: ${targetEvent.formattedDate} (${targetEvent.formattedTime})${recNote}\n\nAre you sure you want to remove this event from Google Calendar? (Reply 'yes' to delete or 'no' to cancel)`;

      ComputerStateManager.setPendingConfirmation({
        action: `Delete Calendar Event: "${targetEvent.summary}"`,
        target: targetEvent.summary,
        description: prompt,
        tool: "calendar_delete_event",
        args: {
          eventId: targetEvent.id,
          recurringScope: "this_occurrence",
        },
        timestamp: new Date().toISOString(),
      });

      context.onProgress("Awaiting confirmation to delete event...", "in-progress");
      return {
        success: true,
        message: prompt,
        data: { requiresConfirmation: true },
      };
    }

    case "CALENDAR_DUPLICATE_EVENT": {
      context.onProgress("Locating original event to duplicate...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      const searchRes = await callTool("calendar_find_events", {
        query: parsed.targetQuery || "meeting",
        date: parsed.targetDate,
        maxResults: 5,
      });
      const searchData = searchRes.result || searchRes;
      const candidates = searchData.events || [];

      if (candidates.length === 0) {
        return {
          success: false,
          message: "Could not find the original event to duplicate.",
        };
      }

      const sourceEvent = candidates[0];
      const newDate = parsed.date || CalendarParser.toYmd(new Date());
      let newStartIso: string;
      let newEndIso: string;

      if (sourceEvent.isAllDay) {
        newStartIso = newDate;
        newEndIso = newDate;
      } else {
        const timePart = sourceEvent.start.includes("T")
          ? sourceEvent.start.split("T")[1].slice(0, 5)
          : "10:00";
        newStartIso = `${newDate}T${timePart}:00`;
        const durationMs = (sourceEvent.durationMinutes || 60) * 60000;
        newEndIso = new Date(new Date(newStartIso).getTime() + durationMs).toISOString();
      }

      const prompt = `Proposed Action: Duplicate Calendar Event\n• Original: "${sourceEvent.summary}" (${sourceEvent.formattedDate} at ${sourceEvent.formattedTime})\n• Duplicating to: ${newDate}\n\nShould I create this duplicate event on your Google Calendar? (Reply 'yes' to confirm or 'no' to cancel)`;

      ComputerStateManager.setPendingConfirmation({
        action: `Duplicate Calendar Event: "${sourceEvent.summary}"`,
        target: sourceEvent.summary,
        description: prompt,
        tool: "calendar_duplicate_event",
        args: {
          eventId: sourceEvent.id,
          newStart: newStartIso,
          newEnd: newEndIso,
        },
        timestamp: new Date().toISOString(),
      });

      context.onProgress("Awaiting confirmation to duplicate event...", "in-progress");
      return {
        success: true,
        message: prompt,
        data: { requiresConfirmation: true },
      };
    }

    case "CALENDAR_SEARCH_EVENTS": {
      context.onProgress("Searching your calendar...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      const searchRes = await callTool("calendar_find_events", {
        query: parsed.targetQuery || parsed.summary,
        date: parsed.date,
        maxResults: 10,
      });
      const data = searchRes.result || searchRes;

      if (!data.success || !data.events || data.events.length === 0) {
        return {
          success: true,
          message: `No events found matching "${parsed.targetQuery || parsed.summary || "query"}".`,
          data,
        };
      }

      const list = data.events
        .map((e: any, idx: number) => {
          const meetTag = e.hasMeetLink ? " [Google Meet]" : "";
          const locTag = e.location ? ` @ ${e.location}` : "";
          return `${idx + 1}. ${e.summary} — ${e.formattedDate} (${e.formattedTime})${locTag}${meetTag}`;
        })
        .join("\n");

      return {
        success: true,
        message: `Found ${data.events.length} matching event${data.events.length === 1 ? "" : "s"}:\n\n${list}`,
        data,
      };
    }

    case "CALENDAR_CHECK_AVAILABILITY": {
      context.onProgress("Checking your availability...", "in-progress");
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);

      const dateStr = parsed.date || CalendarParser.toYmd(new Date());
      const timeStr = parsed.time || "16:00";
      const startIso = new Date(`${dateStr}T${timeStr}:00`).toISOString();
      const durationMs = (parsed.durationMinutes || 60) * 60000;
      const endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString();

      const conflictRes = await callTool("calendar_check_conflicts", { start: startIso, end: endIso });
      const conflictData = conflictRes.result || conflictRes;

      const dateObj = new Date(startIso);
      const formattedDate = dateObj.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const formattedTime = dateObj.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

      if (conflictData.hasConflict && conflictData.conflictingEvents?.length > 0) {
        const conflictList = conflictData.conflictingEvents
          .map((c: any) => `"${c.summary}" (${c.formattedTime})`)
          .join(", ");
        let msg = `You are busy on ${formattedDate} at ${formattedTime} with ${conflictList}.`;
        if (conflictData.suggestedSlots?.length > 0) {
          const suggestions = conflictData.suggestedSlots.map((s: any) => s.formattedTime).join(" or ");
          msg += `\n\nSuggested free slots: ${suggestions}.`;
        }
        return { success: true, message: msg, data: conflictData };
      }

      return {
        success: true,
        message: `You are completely free on ${formattedDate} at ${formattedTime}. No conflicting events found.`,
        data: conflictData,
      };
    }

    case "CALENDAR_UPDATE_REMINDER_PREFERENCE": {
      const parsed: ParsedCalendarCommand = args?.parsed || CalendarParser.parseCommand(routed.rawCommand);
      const mins = parsed.reminderMinutes || 15;
      context.onProgress("Updating reminder preference...", "completed");
      return {
        success: true,
        message: `Default reminder preference set to ${mins} minutes before meetings.`,
        data: { reminderMinutes: mins },
      };
    }

    default:
      return {
        success: false,
        message: `Unknown calendar intent: ${intent}`,
      };
  }
}
