import { GCalEvent } from "@/types/calendar";

const WEEKDAYS: Record<string, number> = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 0,
  sun: 0,
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/**
 * Resolves a target date from natural language:
 * - Explicit calendar dates ("27th nov", "nov 27", "26 november")
 * - Relative dates ("tomorrow", "today", "day after tomorrow")
 * - Weekdays ("monday", "friday")
 * while ignoring negated phrases like "not today" or "instead of wednesday".
 */
export function parseTargetDate(
  text: string,
  currentTimeIso: string,
  currentEvents: GCalEvent[]
): Date {
  // Strip negated date phrases first
  const lower = text
    .toLowerCase()
    .replace(
      /\b(?:not|instead of|rather than)\s+(?:on\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi,
      ""
    );
  const now = new Date(currentTimeIso);

  // 1. Check explicit day + month ("27th nov", "27 november", "nov 27th")
  const dmRegex =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const mdRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

  const dmMatch = lower.match(dmRegex);
  if (dmMatch) {
    const dayNum = parseInt(dmMatch[1], 10);
    const monthIdx = MONTHS[dmMatch[2].toLowerCase()];
    if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      const explicit = new Date(now);
      explicit.setMonth(monthIdx, dayNum);
      return explicit;
    }
  }

  const mdMatch = lower.match(mdRegex);
  if (mdMatch) {
    const monthIdx = MONTHS[mdMatch[1].toLowerCase()];
    const dayNum = parseInt(mdMatch[2], 10);
    if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      const explicit = new Date(now);
      explicit.setMonth(monthIdx, dayNum);
      return explicit;
    }
  }

  // Determine the Monday of the week currently being viewed
  let weekMonday = new Date(now);
  if (currentEvents.length > 0 && currentEvents[0].start?.dateTime) {
    const firstEvDate = new Date(currentEvents[0].start.dateTime);
    const d = firstEvDate.getDay();
    const diff = firstEvDate.getDate() - d + (d === 0 ? -6 : 1);
    weekMonday = new Date(firstEvDate);
    weekMonday.setDate(diff);
    weekMonday.setHours(0, 0, 0, 0);
  } else {
    const d = weekMonday.getDay();
    const diff = weekMonday.getDate() - d + (d === 0 ? -6 : 1);
    weekMonday.setDate(diff);
    weekMonday.setHours(0, 0, 0, 0);
  }

  if (lower.includes("day after tomorrow")) {
    const dat = new Date(now);
    dat.setDate(now.getDate() + 2);
    return dat;
  }

  if (lower.includes("tomorrow")) {
    const tom = new Date(now);
    tom.setDate(now.getDate() + 1);
    return tom;
  }

  if (lower.includes("today")) {
    return new Date(now);
  }

  for (const [dayName, dayIndex] of Object.entries(WEEKDAYS)) {
    const regex = new RegExp(`\\b${dayName}\\b`, "i");
    if (regex.test(lower)) {
      const target = new Date(weekMonday);
      const offset = dayIndex === 0 ? 6 : dayIndex - 1;
      target.setDate(weekMonday.getDate() + offset);
      return target;
    }
  }

  return new Date(now);
}

/**
 * Normalizes dotted meridiem markers ("10:00 p.m.", "11:00 a.m.") into "pm" / "am"
 */
export function normalizeMeridiem(input: string): string {
  return input
    .replace(/\bp\.?\s*m\.?(?=\s|$|[.,!?])/gi, "pm")
    .replace(/\ba\.?\s*m\.?(?=\s|$|[.,!?])/gi, "am");
}

/**
 * Parses time range like "from 10 to 11 pm", "10:00 p.m. to 11:00 p.m.", "11 to 1 pm", "11pm to 12am", or single time "at 3 pm"
 */
export function parseTimeRange(
  text: string,
  baseDate: Date
): { start: Date; end: Date; hasExplicitTime: boolean } {
  const lower = normalizeMeridiem(text).toLowerCase();
  const start = new Date(baseDate);
  const end = new Date(baseDate);

  // 1. Match range: "(from )? HH(:MM)? (am|pm)? (to|-) HH(:MM)? (am|pm)"
  const rangeRegex =
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const rangeMatch = lower.match(rangeRegex);

  if (rangeMatch) {
    const rawH1 = parseInt(rangeMatch[1], 10);
    const m1 = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    const rawH2 = parseInt(rangeMatch[4], 10);
    const m2 = rangeMatch[5] ? parseInt(rangeMatch[5], 10) : 0;
    const mer2 = rangeMatch[6].toLowerCase();

    // Smart meridiem inference when first time omits am/pm:
    // e.g. "11 to 1 pm" -> rawH1 (11) > rawH2 (1) and rawH1 !== 12, so 11 is AM and 1 is PM!
    // whereas "12 to 2 pm" -> rawH1 === 12, so 12 is PM!
    // whereas "10 to 11 pm" -> rawH1 (10) < rawH2 (11), so both are PM!
    let mer1 = rangeMatch[3] ? rangeMatch[3].toLowerCase() : mer2;
    if (!rangeMatch[3]) {
      if (mer2 === "pm" && rawH1 > rawH2 && rawH1 !== 12) {
        mer1 = "am";
      } else if (mer2 === "am" && rawH1 > rawH2 && rawH1 !== 12) {
        mer1 = "pm";
      }
    }

    let h1 = rawH1;
    let h2 = rawH2;

    if (mer1 === "pm" && h1 < 12) h1 += 12;
    if (mer1 === "am" && h1 === 12) h1 = 0;

    if (mer2 === "pm" && h2 < 12) h2 += 12;
    if (mer2 === "am" && h2 === 12) h2 = 24;

    start.setHours(h1, m1, 0, 0);
    end.setHours(h2, m2, 0, 0);
    if (end.getTime() <= start.getTime()) {
      end.setTime(start.getTime() + 60 * 60 * 1000);
    }
    return { start, end, hasExplicitTime: true };
  }

  // 2. Match single time: "at 3 pm" or "10:30 am"
  const singleRegex = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
  const singleMatch = lower.match(singleRegex);
  if (singleMatch) {
    let h1 = parseInt(singleMatch[1], 10);
    const m1 = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;
    const mer = singleMatch[3].toLowerCase();
    if (mer === "pm" && h1 < 12) h1 += 12;
    if (mer === "am" && h1 === 12) h1 = 0;

    const durMatch = lower.match(/(\d+)\s*(?:min|mins|minute|minutes)/i);
    const durationMin = durMatch ? parseInt(durMatch[1], 10) : 60;

    start.setHours(h1, m1, 0, 0);
    end.setTime(start.getTime() + durationMin * 60 * 1000);
    return { start, end, hasExplicitTime: true };
  }

  if (lower.includes("morning")) {
    start.setHours(10, 0, 0, 0);
    end.setHours(11, 0, 0, 0);
    return { start, end, hasExplicitTime: false };
  }
  if (lower.includes("evening") || lower.includes("night")) {
    start.setHours(19, 0, 0, 0);
    end.setHours(20, 0, 0, 0);
    return { start, end, hasExplicitTime: false };
  }
  if (lower.includes("afternoon")) {
    start.setHours(14, 0, 0, 0);
    end.setHours(15, 0, 0, 0);
    return { start, end, hasExplicitTime: false };
  }

  start.setHours(11, 0, 0, 0);
  end.setHours(12, 0, 0, 0);
  return { start, end, hasExplicitTime: false };
}

/**
 * Extracts a clean event title from conversational prompts
 */
export function extractCleanEventTitle(prompt: string): string {
  let text = normalizeMeridiem(prompt).trim();

  if (/\btake an interview\b/i.test(text) || /\binterview\b/i.test(text)) {
    const withMatch = text.match(
      /interview\s+(?:with|for)\s+([a-zA-Z0-9\s]+?)(?:\s+from|\s+at|\s+on|\s+tomorrow|\s+today|\s+monday|\s+tuesday|\s+wednesday|\s+thursday|\s+friday|$)/i
    );
    if (withMatch && withMatch[1].trim()) {
      return `Interview with ${withMatch[1].trim()}`;
    }
    return "Candidate Interview";
  }

  // Iteratively strip leading conversational fillers ("hello", "can you", "please", "ok", etc.)
  for (let i = 0; i < 4; i++) {
    text = text.replace(
      /^(ok|okay|hey|hi|hello|please|can you|could you|would you|will you|i want to|i need to|i have to|let's|lets)[,\s]+/i,
      ""
    );
  }

  text = text
    .replace(
      /^(add|book|schedule|create|set up|setup|put|arrange|organize)\s+(one\s+|an\s+|a\s+)?(new\s+)?(event|meeting|call|appointment|slot|sync|session)?\s*(on\s+|for\s+|about\s+|of\s+)?/i,
      ""
    )
    .replace(/\b(i have to|i need to|i want to|to)\s+(take|attend|do|have)\s+(an\s+|a\s+)?/gi, "")
    .replace(
      /\b(from\s+)?\d{1,2}(:\d{2})?\s*(am|pm)?\s*(to|-|–|till|until)\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/gi,
      ""
    )
    .replace(/\b(at\s+)?\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, "")
    .replace(
      /\b(on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi,
      ""
    )
    .replace(
      /\b(on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi,
      ""
    )
    .replace(
      /\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|day after tomorrow|tomorrow|today)\b/gi,
      ""
    )
    .replace(/\b(morning|afternoon|evening|night)\b/gi, "")
    .replace(/\b(30-min|45-min|60-min|1-hour|30 mins|45 mins|1 hour)\b/gi, "")
    .replace(/^\s*(of|for|about|on)\s+/i, "Meeting of ")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 2) {
    return "Business Meeting";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Finds the exact event in `currentEvents` matching a delete/move prompt
 * by checking contextual pronouns ("delete it", "remove that"), weekday, time, and title keywords.
 */
export function findBestMatchingEvent(
  prompt: string,
  currentEvents: GCalEvent[],
  lastModifiedEventId?: string
): GCalEvent | null {
  if (currentEvents.length === 0) return null;
  const lower = normalizeMeridiem(prompt).toLowerCase().trim();

  // If user says "delete it", "remove that", "cancel it", "delete last one"
  if (
    /\b(it|that|this|last one|previous one)\b/i.test(lower) &&
    lastModifiedEventId
  ) {
    const lastEv = currentEvents.find((e) => e.id === lastModifiedEventId);
    if (lastEv) return lastEv;
  }

  let targetDayOfWeek: number | null = null;
  for (const [dayName, dayIndex] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${dayName}\\b`, "i").test(lower)) {
      targetDayOfWeek = dayIndex;
      break;
    }
  }

  let targetHour: number | null = null;
  const rangeMatch = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );
  if (rangeMatch) {
    let h1 = parseInt(rangeMatch[1], 10);
    const mer1 = (rangeMatch[3] || rangeMatch[6]).toLowerCase();
    if (mer1 === "pm" && h1 < 12) h1 += 12;
    if (mer1 === "am" && h1 === 12) h1 = 0;
    targetHour = h1;
  } else {
    const singleMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (singleMatch) {
      let h1 = parseInt(singleMatch[1], 10);
      const mer = singleMatch[3].toLowerCase();
      if (mer === "pm" && h1 < 12) h1 += 12;
      if (mer === "am" && h1 === 12) h1 = 0;
      targetHour = h1;
    }
  }

  let bestEvent: GCalEvent | null = null;
  let bestScore = -1;

  for (const ev of currentEvents) {
    let score = 0;
    const evStart = ev.start.dateTime ? new Date(ev.start.dateTime) : null;

    if (targetDayOfWeek !== null && evStart) {
      if (evStart.getDay() === targetDayOfWeek) {
        score += 50;
      } else {
        score -= 20;
      }
    }

    if (targetHour !== null && evStart) {
      if (evStart.getHours() === targetHour) {
        score += 60;
      } else if (Math.abs(evStart.getHours() - targetHour) <= 1) {
        score += 20;
      }
    }

    const titleWords = (ev.summary || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "and", "for", "with", "one", "from"].includes(w));

    for (const w of titleWords) {
      if (lower.includes(w)) {
        score += 30;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestEvent = ev;
    }
  }

  if (bestScore > 0 && bestEvent) return bestEvent;
  if (lastModifiedEventId) {
    const lastEv = currentEvents.find((e) => e.id === lastModifiedEventId);
    if (lastEv) return lastEv;
  }
  return currentEvents[currentEvents.length - 1];
}
