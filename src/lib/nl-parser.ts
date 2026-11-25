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

export interface LocalDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
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
 * Extracts the user's true local wall-clock year, month, day, hour, minute in their browser's timeZone
 * even when running on a UTC serverless node (like Vercel)!
 */
export function getWallClockInTimeZone(
  isoString: string,
  timeZone: string = "Asia/Kolkata"
): { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number } {
  try {
    const dt = new Date(isoString);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
      hour12: false,
    });
    const parts = fmt.formatToParts(dt);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    const wkMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const hr = parseInt(map.hour || "0", 10);
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour: hr === 24 ? 0 : hr,
      minute: parseInt(map.minute || "0", 10),
      dayOfWeek: wkMap[map.weekday] ?? dt.getDay(),
    };
  } catch {
    const d = new Date(isoString);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      dayOfWeek: d.getDay(),
    };
  }
}

/**
 * Converts a user's local wall-clock date & time (year, month 1-12, day, hour 0-23, minute)
 * in `timeZone` (e.g. "Asia/Kolkata") into an exact UTC ISO string so Vercel (UTC) and
 * the user's browser ALWAYS show the exact same wall-clock time!
 */
export function wallClockToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = "Asia/Kolkata"
): string {
  // Handle hour >= 24 rollover (e.g. 24:00 midnight end of day)
  const baseUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + (hour * 60 + minute) * 60000);

  try {
    // Compute the offset between UTC and target timeZone at this timestamp
    const utcDate = new Date(baseUtc.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(baseUtc.toLocaleString("en-US", { timeZone }));
    const offsetMs = tzDate.getTime() - utcDate.getTime();
    return new Date(baseUtc.getTime() - offsetMs).toISOString();
  } catch {
    // Fallback for Asia/Kolkata (+05:30 = 330 mins)
    return new Date(baseUtc.getTime() - 330 * 60000).toISOString();
  }
}

/**
 * Adds `daysToAdd` to a { year, month, day } tuple cleanly
 */
function addDaysToParts(parts: LocalDateParts, daysToAdd: number): LocalDateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + daysToAdd, 12, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(),
  };
}

/**
 * Resolves the target { year, month, day } in the user's timeZone
 */
export function parseTargetDateParts(
  text: string,
  currentTimeIso: string,
  currentEvents: GCalEvent[],
  timeZone: string = "Asia/Kolkata"
): LocalDateParts {
  const lower = text
    .toLowerCase()
    .replace(
      /\b(?:not|instead of|rather than)\s+(?:on\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi,
      ""
    );

  const nowWall = getWallClockInTimeZone(currentTimeIso, timeZone);
  const todayParts: LocalDateParts = {
    year: nowWall.year,
    month: nowWall.month,
    day: nowWall.day,
    dayOfWeek: nowWall.dayOfWeek,
  };

  // 1. Explicit date ("27th nov", "nov 27")
  const dmRegex =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const mdRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;

  const dmMatch = lower.match(dmRegex);
  if (dmMatch) {
    const dayNum = parseInt(dmMatch[1], 10);
    const monthIdx = MONTHS[dmMatch[2].toLowerCase()];
    if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      return addDaysToParts({ year: todayParts.year, month: monthIdx + 1, day: dayNum, dayOfWeek: 0 }, 0);
    }
  }

  const mdMatch = lower.match(mdRegex);
  if (mdMatch) {
    const monthIdx = MONTHS[mdMatch[1].toLowerCase()];
    const dayNum = parseInt(mdMatch[2], 10);
    if (monthIdx !== undefined && dayNum >= 1 && dayNum <= 31) {
      return addDaysToParts({ year: todayParts.year, month: monthIdx + 1, day: dayNum, dayOfWeek: 0 }, 0);
    }
  }

  // Determine the Monday of the active calendar week in user's timeZone
  let refForMonday = todayParts;
  if (currentEvents.length > 0 && currentEvents[0].start?.dateTime) {
    const firstWall = getWallClockInTimeZone(currentEvents[0].start.dateTime, timeZone);
    refForMonday = {
      year: firstWall.year,
      month: firstWall.month,
      day: firstWall.day,
      dayOfWeek: firstWall.dayOfWeek,
    };
  }
  const diffToMonday = refForMonday.dayOfWeek === 0 ? -6 : 1 - refForMonday.dayOfWeek;
  const weekMonday = addDaysToParts(refForMonday, diffToMonday);

  if (lower.includes("day after tomorrow")) {
    return addDaysToParts(todayParts, 2);
  }
  if (lower.includes("tomorrow")) {
    return addDaysToParts(todayParts, 1);
  }
  if (lower.includes("today")) {
    return todayParts;
  }

  for (const [dayName, dayIndex] of Object.entries(WEEKDAYS)) {
    const regex = new RegExp(`\\b${dayName}\\b`, "i");
    if (regex.test(lower)) {
      const offset = dayIndex === 0 ? 6 : dayIndex - 1;
      return addDaysToParts(weekMonday, offset);
    }
  }

  return todayParts;
}

/**
 * Parses time range in the user's local timeZone and returns exact ISO strings
 */
export function parseTimeRangeIso(
  text: string,
  dateParts: LocalDateParts,
  timeZone: string = "Asia/Kolkata"
): { startIso: string; endIso: string; hasExplicitTime: boolean } {
  const lower = normalizeMeridiem(text).toLowerCase();

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
    if (mer2 === "am" && h2 === 12) {
      // Crucial human convention fix:
      // If start is morning AM (e.g. "10 to 12 am" or "9am to 12am"), people almost always mean 10:00 AM to 12:00 PM (Noon, 12), NOT a 14-hour meeting until midnight!
      // Whereas if start is night PM (e.g. "11pm to 12am" or "10 to 12am" at night), 12am means midnight (24).
      if (mer1 === "am" && h1 >= 6 && h1 <= 11) {
        h2 = 12; // 12:00 PM Noon
      } else {
        h2 = 24; // 12:00 AM Midnight
      }
    }

    if (h2 < h1 || (h2 === h1 && m2 <= m1)) {
      h2 = h1 + 1;
    }

    return {
      startIso: wallClockToIso(dateParts.year, dateParts.month, dateParts.day, h1, m1, timeZone),
      endIso: wallClockToIso(dateParts.year, dateParts.month, dateParts.day, h2, m2, timeZone),
      hasExplicitTime: true,
    };
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

    const sIso = wallClockToIso(dateParts.year, dateParts.month, dateParts.day, h1, m1, timeZone);
    const eIso = new Date(new Date(sIso).getTime() + durationMin * 60000).toISOString();

    return { startIso: sIso, endIso: eIso, hasExplicitTime: true };
  }

  // 3. Morning / Afternoon / Evening defaults
  let defH1 = 11;
  let defH2 = 12;
  if (lower.includes("morning")) {
    defH1 = 10;
    defH2 = 11;
  } else if (lower.includes("evening") || lower.includes("night")) {
    defH1 = 19;
    defH2 = 20;
  } else if (lower.includes("afternoon")) {
    defH1 = 14;
    defH2 = 15;
  }

  return {
    startIso: wallClockToIso(dateParts.year, dateParts.month, dateParts.day, defH1, 0, timeZone),
    endIso: wallClockToIso(dateParts.year, dateParts.month, dateParts.day, defH2, 0, timeZone),
    hasExplicitTime: false,
  };
}

/**
 * Extracts a clean event title from conversational prompts (including common typos like "ceate a mitiing")
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

  for (let i = 0; i < 4; i++) {
    text = text.replace(
      /^(ok|okay|hey|hi|hello|please|can you|could you|would you|will you|i want to|i need to|i have to|let's|lets)[,\s]+/i,
      ""
    );
  }

  // Tolerate common typos in verbs ("ceate", "craete", "scedule", "ad") and nouns ("mitiing", "meting", "meating", "cal")
  text = text
    .replace(
      /^(add|ad|book|schedule|scedule|create|ceate|craete|creat|make|set up|setup|put|arrange|organize)\s+(one\s+|an\s+|a\s+)?(new\s+)?(event|meeting|mitiing|meting|meating|meet|call|cal|appointment|slot|sync|session)?\s*(on\s+|for\s+|about\s+|of\s+)?/i,
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
    .replace(/^(meeting|mitiing|meting|meating|event|call)$/i, "")
    .replace(/[.,!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < 2) {
    return "Business Meeting";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Formats an ISO timestamp range nicely in the user's timeZone (so Vercel UTC server prints IST times!)
 */
export function formatRangeInTimeZone(
  startIso: string,
  endIso: string,
  timeZone: string = "Asia/Kolkata"
): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const dateStr = s.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const sTime = s.toLocaleTimeString("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const eTime = e.toLocaleTimeString("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateStr}, ${sTime} – ${eTime}`;
}

/**
 * Finds the exact event in `currentEvents` matching a delete/move prompt
 * using timezone-aware weekday and hour matching!
 */
export function findBestMatchingEvent(
  prompt: string,
  currentEvents: GCalEvent[],
  lastModifiedEventId?: string,
  timeZone: string = "Asia/Kolkata"
): GCalEvent | null {
  if (currentEvents.length === 0) return null;
  const lower = normalizeMeridiem(prompt).toLowerCase().trim();

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
    const evWall = ev.start.dateTime
      ? getWallClockInTimeZone(ev.start.dateTime, timeZone)
      : null;

    if (targetDayOfWeek !== null && evWall) {
      if (evWall.dayOfWeek === targetDayOfWeek) {
        score += 50;
      } else {
        score -= 20;
      }
    }

    if (targetHour !== null && evWall) {
      if (evWall.hour === targetHour) {
        score += 60;
      } else if (Math.abs(evWall.hour - targetHour) <= 1) {
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
