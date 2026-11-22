/**
 * LUMA Calendar Natural Language Parser (Phase 2)
 *
 * Deterministic parser for natural language calendar operations across English and Hinglish.
 * Extracts intents, summaries, dates, times, durations, attendees, locations,
 * recurrence rules (RRULE), and reminders.
 */

export interface ParsedCalendarCommand {
  action:
    | "create"
    | "update"
    | "delete"
    | "duplicate"
    | "search"
    | "availability"
    | "reminder_preference"
    | "unknown";
  summary?: string;
  targetQuery?: string;
  targetDate?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm (24h)
  durationMinutes?: number;
  isAllDay?: boolean;
  location?: string;
  attendees?: string[];
  recurrence?: string[];
  recurrenceLabel?: string;
  reminderMinutes?: number;
  reminderMethod?: "popup" | "email";
  recurringScope?: "this_occurrence" | "this_and_following" | "all";
  missingFields?: string[];
  createMeet?: boolean;
  rawText: string;
}

export class CalendarParser {
  private static WEEKDAYS: Record<string, number> = {
    sunday: 0,
    raviwar: 0,
    itwar: 0,
    monday: 1,
    somwar: 1,
    somvaar: 1,
    tuesday: 2,
    mangalwar: 2,
    mangalvaar: 2,
    wednesday: 3,
    budhwar: 3,
    budhvaar: 3,
    thursday: 4,
    guruwar: 4,
    guruvaar: 4,
    brihaspatiwar: 4,
    friday: 5,
    shukrawar: 5,
    shukravaar: 5,
    jumma: 5,
    saturday: 6,
    shaniwar: 6,
    shanivaar: 6,
  };

  private static RRULE_DAYS: Record<string, string> = {
    monday: "MO",
    somwar: "MO",
    somvaar: "MO",
    tuesday: "TU",
    mangalwar: "TU",
    mangalvaar: "TU",
    wednesday: "WE",
    budhwar: "WE",
    budhvaar: "WE",
    thursday: "TH",
    guruwar: "TH",
    guruvaar: "TH",
    friday: "FR",
    shukrawar: "FR",
    shukravaar: "FR",
    saturday: "SA",
    shaniwar: "SA",
    shanivaar: "SA",
    sunday: "SU",
    raviwar: "SU",
  };

  /**
   * Formats a Date object to YYYY-MM-DD
   */
  static toYmd(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Parses a natural language calendar instruction.
   */
  static parseCommand(text: string, baseDate: Date = new Date()): ParsedCalendarCommand {
    const raw = text.trim();
    const clean = raw.toLowerCase().replace(/[!?,;:"'`~*^]+/g, " ").replace(/\s+/g, " ").trim();

    // 1. Identify Primary Action
    let action: ParsedCalendarCommand["action"] = "unknown";

    // Exclude read queries (e.g. "show my schedule", "show upcoming events")
    const isReadQuery =
      /^(?:show|list|get|what\s+is|what\s+are|tell\s+me)\s+(?:(?:my|mere|meri|mera)\s+)?(?:schedule|calendar|upcoming\s+(?:events|meetings)|events|meetings)$/i.test(clean) ||
      /^(?:schedule\s+dikhao|schedule\s+batao|upcoming\s+meetings\s+dikhao|show\s+my\s+schedule)$/i.test(clean);

    if (isReadQuery) {
      return {
        action: "unknown",
        summary: clean,
        rawText: raw,
      };
    }

    const isFileOrSystem = /\b(?:folder|file|directory|window|tab|app|application|shortcut)\b/i.test(clean);

    if (
      /\b(?:check\s+whether\s+i\s+am\s+free|check\s+if\s+i\s+am\s+free|am\s+i\s+free|check\s+availability|is\s+my\s+schedule\s+open)\b/i.test(clean) ||
      /\b(?:kya\s+main.*free\s+hoon|free\s+hoon\s+kya|free\s+hai\s+kya|check.*free\s+hoon)\b/i.test(clean)
    ) {
      action = "availability";
    } else if (
      /\b(?:duplicate|copy\s+(?:the\s+)?meeting|repeat\s+(?:this\s+)?meeting)\b/i.test(clean) ||
      /\b(?:duplicate\s*karo|copy\s*karo)\b/i.test(clean)
    ) {
      action = "duplicate";
    } else if (
      /\b(?:remind\s+me\s+\d+\s+min(?:utes)?\s+before\s+every\s+meeting|set\s+default\s+reminder)\b/i.test(clean) ||
      /\b(?:har\s+meeting\s+se\s+\d+\s+min(?:utes)?\s+pehle\s+reminder)\b/i.test(clean)
    ) {
      action = "reminder_preference";
    } else if (
      !isFileOrSystem &&
      /\b(?:find|search\s+for|look\s+for|where\s+is)\b/i.test(clean) &&
      /\b(?:meeting|call|event|appointment)\b/i.test(clean) &&
      !/\b(?:schedule|create|cancel|delete|move)\b/i.test(clean)
    ) {
      action = "search";
    } else if (
      !isFileOrSystem &&
      /\b(?:cancel|delete|remove|drop)\b/i.test(clean) &&
      /\b(?:meeting|event|reminder|appointment|schedule)\b/i.test(clean)
    ) {
      action = "delete";
    } else if (
      !isFileOrSystem &&
      /\b(?:move|reschedule|postpone|shift|change\s+the\s+time|change\s+the\s+location|update)\b/i.test(clean) &&
      /\b(?:meeting|event|appointment|call|schedule|location|time)\b/i.test(clean)
    ) {
      action = "update";
    } else if (
      !isFileOrSystem &&
      !/^(?:show|list|get|what\s+are|what\s+is|tell\s+me)\b/i.test(clean) &&
      (
        /\b(?:schedule|reschedule)\b/i.test(clean) ||
        (/\b(?:create|book|add|set\s+up|plan)\b/i.test(clean) &&
          /\b(?:meeting|call|event|reminder|appointment|sync|session|discussion|catchup|interview|webinar|calendar)\b/i.test(clean)) ||
        /\b(?:meeting\s+schedule|meeting\s+rakho|meeting\s+lagao|meeting\s+fix\s+karo)\b/i.test(clean) ||
        /\b(?:create\s+(?:a\s+)?reminder|set\s+(?:a\s+)?reminder)\b/i.test(clean) ||
        /\b(?:calendar\s+(?:mein|me)\s+(?:add|daalo|rakho))\b/i.test(clean)
      )
    ) {
      action = "create";
    }

    // 2. Parse Recurrence (RRULE)
    let recurrence: string[] | undefined = undefined;
    let recurrenceLabel: string | undefined = undefined;

    const everyDayMatch = clean.match(/\b(?:every\s+day|daily|rozana|har\s+din|har\s+roz)\b/i);
    const everyWeekdayMatch = clean.match(/\b(?:every\s+weekday|har\s+working\s+day)\b/i);
    const everyMonthMatch = clean.match(/\b(?:every\s+month|monthly|har\s+mahine)\b/i);
    const everyDayOfWeekMatch = clean.match(/\b(?:every|har)\s+(monday|somwar|somvaar|tuesday|mangalwar|mangalvaar|wednesday|budhwar|budhvaar|thursday|guruwar|guruvaar|friday|shukrawar|shukravaar|saturday|shaniwar|shanivaar|sunday|raviwar)\b/i);

    if (everyWeekdayMatch) {
      recurrence = ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"];
      recurrenceLabel = "Every weekday (Monday to Friday)";
    } else if (everyDayOfWeekMatch && everyDayOfWeekMatch[1]) {
      const dayName = everyDayOfWeekMatch[1].toLowerCase();
      const code = this.RRULE_DAYS[dayName] || "MO";
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      recurrence = [`RRULE:FREQ=WEEKLY;BYDAY=${code}`];
      recurrenceLabel = `Every ${capDay}`;
    } else if (everyDayMatch) {
      recurrence = ["RRULE:FREQ=DAILY"];
      recurrenceLabel = "Every day";
    } else if (everyMonthMatch) {
      recurrence = ["RRULE:FREQ=MONTHLY"];
      recurrenceLabel = "Monthly";
    }

    // 3. Parse Date
    let parsedDate: string | undefined = undefined;
    let targetDate: string | undefined = undefined;

    const todayMatch = clean.match(/\b(?:today|aaj)\b/i);
    const tomorrowMatch = clean.match(/\b(?:tomorrow|kal)\b/i);
    const dayAfterMatch = clean.match(/\b(?:day\s+after\s+tomorrow|parso|parson)\b/i);

    if (dayAfterMatch) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 2);
      parsedDate = this.toYmd(d);
    } else if (tomorrowMatch) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + 1);
      parsedDate = this.toYmd(d);
    } else if (todayMatch) {
      parsedDate = this.toYmd(baseDate);
    }

    // Weekday references e.g. "on Friday", "this Friday", "next Monday", "next Friday"
    const nextWeekdayMatch = clean.match(/\b(?:next|agle)\s+(monday|somwar|somvaar|tuesday|mangalwar|mangalvaar|wednesday|budhwar|budhvaar|thursday|guruwar|guruvaar|friday|shukrawar|shukravaar|saturday|shaniwar|shanivaar|sunday|raviwar)\b/i);
    const thisWeekdayMatch = clean.match(/\b(?:on|this|coming|ko)?\s*(monday|somwar|somvaar|tuesday|mangalwar|mangalvaar|wednesday|budhwar|budhvaar|thursday|guruwar|guruvaar|friday|shukrawar|shukravaar|saturday|shaniwar|shanivaar|sunday|raviwar)\b/i);

    if (!parsedDate) {
      if (nextWeekdayMatch && nextWeekdayMatch[1]) {
        const targetDay = this.WEEKDAYS[nextWeekdayMatch[1].toLowerCase()] ?? 1;
        const d = new Date(baseDate);
        const currentDay = d.getDay();
        let daysUntil = (targetDay - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        daysUntil += 7; // "next" means following week
        d.setDate(d.getDate() + daysUntil);
        parsedDate = this.toYmd(d);
      } else if (thisWeekdayMatch && thisWeekdayMatch[1] && !everyDayOfWeekMatch) {
        const targetDay = this.WEEKDAYS[thisWeekdayMatch[1].toLowerCase()] ?? 1;
        const d = new Date(baseDate);
        const currentDay = d.getDay();
        let daysUntil = (targetDay - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        d.setDate(d.getDate() + daysUntil);
        parsedDate = this.toYmd(d);
      }
    }

    // For duplicate: "Duplicate today's meeting for next Friday"
    if (action === "duplicate") {
      if (todayMatch) targetDate = this.toYmd(baseDate);
      else if (tomorrowMatch) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + 1);
        targetDate = this.toYmd(d);
      }
      if (nextWeekdayMatch && nextWeekdayMatch[1]) {
        const targetDay = this.WEEKDAYS[nextWeekdayMatch[1].toLowerCase()] ?? 5;
        const d = new Date(baseDate);
        const currentDay = d.getDay();
        let daysUntil = (targetDay - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7;
        daysUntil += 7;
        d.setDate(d.getDate() + daysUntil);
        parsedDate = this.toYmd(d);
      }
    }

    // Fallback date: default to today or tomorrow if not specified
    if (!parsedDate && action === "create" && recurrence) {
      parsedDate = this.toYmd(baseDate);
    }

    // 4. Parse Time
    let parsedTime: string | undefined = undefined;

    // 12-hour e.g. "5 PM", "5:30 PM", "10 AM", "6 pm"
    const time12Match = clean.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    // 24-hour e.g. "17:00", "14:30"
    const time24Match = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    // Hinglish e.g. "5 baje", "10 baje", "sham 5 baje", "subah 10 baje"
    const bajeMatch = clean.match(/\b(?:(subah|sham|shaam|dopahar|raat)\s+)?(\d{1,2})(?::(\d{2}))?\s*baje\b/i);

    if (time12Match) {
      let hour = parseInt(time12Match[1], 10);
      const minute = time12Match[2] ? parseInt(time12Match[2], 10) : 0;
      const meridiem = time12Match[3].toLowerCase();
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      parsedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    } else if (bajeMatch) {
      const modifier = bajeMatch[1]?.toLowerCase();
      let hour = parseInt(bajeMatch[2], 10);
      const minute = bajeMatch[3] ? parseInt(bajeMatch[3], 10) : 0;
      if (modifier === "sham" || modifier === "shaam" || modifier === "raat") {
        if (hour < 12) hour += 12;
      } else if (modifier === "subah") {
        if (hour === 12) hour = 0;
      } else {
        // In natural Hinglish: 1-7 is afternoon/evening PM, 8-11 is morning AM
        if (hour >= 1 && hour <= 7) hour += 12;
      }
      parsedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    } else if (time24Match) {
      parsedTime = `${String(time24Match[1]).padStart(2, "0")}:${String(time24Match[2]).padStart(2, "0")}`;
    }

    // 5. Parse Duration
    let durationMinutes = 60; // default 1 hour
    const hourDuration = clean.match(/\bfor\s+(one|1|two|2|three|3)\s+hours?\b/i) || clean.match(/\b(one|1|two|2)\s+ghante?\b/i);
    const minuteDuration = clean.match(/\bfor\s+(\d+)\s+min(?:ute)?s?\b/i) || clean.match(/\b(\d+)\s+min(?:ute)?s?\s*(?:ke\s+liye)?\b/i);
    const halfHour = clean.match(/\b(?:for\s+half\s+an\s+hour|aadha\s+ghanta|aadhe\s+ghante)\b/i);

    if (minuteDuration && minuteDuration[1]) {
      durationMinutes = parseInt(minuteDuration[1], 10);
    } else if (halfHour) {
      durationMinutes = 30;
    } else if (hourDuration && hourDuration[1]) {
      const word = hourDuration[1].toLowerCase();
      if (word === "two" || word === "2") durationMinutes = 120;
      else if (word === "three" || word === "3") durationMinutes = 180;
      else durationMinutes = 60;
    }

    // 6. Parse Location
    let location: string | undefined = undefined;
    const locationMatch =
      clean.match(/\blocation\s+(?:to|at|is)\s+(?:the\s+)?([^,.]+)/i) ||
      clean.match(/\bto\s+the\s+(office|home|conference\s+room|boardroom|studio)\b/i) ||
      clean.match(/\bat\s+(?:the\s+)?(office|home|conference\s+room|boardroom|studio)\b/i) ||
      clean.match(/\b(office|home)\s+mein\b/i);

    if (locationMatch && locationMatch[1]) {
      location = locationMatch[1].trim();
      location = location.charAt(0).toUpperCase() + location.slice(1);
    }

    // 7. Parse Attendees
    const attendees: string[] = [];
    const stopWords = new Set([
      "tomorrow",
      "today",
      "yesterday",
      "at",
      "on",
      "for",
      "every",
      "next",
      "this",
      "kal",
      "aaj",
      "baje",
      "sham",
      "shaam",
      "subah",
      "mein",
      "me",
      "ke",
      "saath",
      "one",
      "two",
      "three",
      "hour",
      "hours",
      "minute",
      "minutes",
    ]);

    const withAttendeeMatch =
      clean.match(/\bwith\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i) ||
      clean.match(/\bwith\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\b/i) ||
      clean.match(/\b([a-zA-Z]+)\s+ke\s+saath\b/i);

    if (withAttendeeMatch && withAttendeeMatch[1]) {
      const parts = withAttendeeMatch[1].trim().split(/\s+/);
      const filteredParts: string[] = [];
      for (const p of parts) {
        if (stopWords.has(p.toLowerCase())) break;
        filteredParts.push(p);
      }
      if (filteredParts.length > 0) {
        const att = filteredParts.join(" ");
        const forbidden = ["me", "us", "them", "everyone", "all"];
        if (!forbidden.includes(att.toLowerCase())) {
          const capAtt = att
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");
          attendees.push(capAtt);
        }
      }
    }

    // 8. Parse Reminders
    let reminderMinutes: number | undefined = undefined;
    const reminderMatch =
      clean.match(/\bremind\s+(?:me\s+)?(\d+)\s+min(?:ute)?s?\s*(?:before|pehle)?\b/i) ||
      clean.match(/\b(\d+)\s+min(?:ute)?s?\s+pehle\s+reminder\b/i) ||
      clean.match(/\breminder\s+(\d+)\s+min(?:ute)?s?\b/i);

    if (reminderMatch && reminderMatch[1]) {
      reminderMinutes = parseInt(reminderMatch[1], 10);
    }

    // 9. Parse Summary / Target Query
    let summary: string | undefined = undefined;
    let targetQuery: string | undefined = undefined;

    if (clean.includes("project submission")) {
      summary = "Project Submission";
    } else if (attendees.length > 0) {
      summary = `Meeting with ${attendees[0]}`;
      targetQuery = `Meeting with ${attendees[0]}`;
    } else if (clean.includes("team meeting") || clean.includes("team sync")) {
      summary = "Team Meeting";
      targetQuery = "Team Meeting";
    } else if (clean.includes("sprint planning")) {
      summary = "Sprint Planning";
      targetQuery = "Sprint Planning";
    } else {
      // General extraction
      let cand = raw
        .replace(/^(?:schedule|create|book|add|set\s+up|move|cancel|delete|duplicate|find)\s+(?:a\s+|an\s+|the\s+|my\s+)?/i, "")
        .replace(/\s+(?:tomorrow|today|yesterday|on\s+friday|on\s+monday|next\s+week|at\s+\d+.*)$/i, "")
        .trim();
      if (cand.length > 2) {
        summary = cand.charAt(0).toUpperCase() + cand.slice(1);
        targetQuery = summary;
      }
    }

    // For updates / moves: "Move tomorrow's meeting to 6 PM"
    if (action === "update" || action === "delete") {
      if (!targetQuery && clean.includes("meeting")) {
        targetQuery = "meeting";
      }
    }

    // Check missing fields for event creation
    const missingFields: string[] = [];
    if (action === "create") {
      if (!summary) missingFields.push("title");
      if (!parsedDate && !recurrence) missingFields.push("date");
      if (!parsedTime && !clean.includes("reminder") && !clean.includes("all day")) {
        missingFields.push("time");
      }
    }

    const isAllDay = clean.includes("all day") || clean.includes("reminder for") || !parsedTime;

    return {
      action,
      summary: summary || "Calendar Event",
      targetQuery,
      targetDate,
      date: parsedDate,
      time: parsedTime,
      durationMinutes,
      isAllDay: isAllDay && action === "create" && !parsedTime,
      location,
      attendees: attendees.length > 0 ? attendees : undefined,
      recurrence,
      recurrenceLabel,
      reminderMinutes,
      reminderMethod: "popup",
      missingFields: missingFields.length > 0 ? missingFields : undefined,
      createMeet: true,
      rawText: raw,
    };
  }
}
