import {
  GCalEvent,
  EventPriorityCategory,
  ConflictResolutionSuggestion,
  FocusBlockSuggestion,
  ScheduleAuditReport,
} from "@/types/calendar";

const GCAL_BASE_URL = "https://www.googleapis.com/calendar/v3";

/**
 * Semantic AI Rule + Keyword Classifier for immediate zero-latency enrichment
 * on every event fetched from Google Calendar.
 */
export function classifyEventSemantically(event: GCalEvent): GCalEvent {
  const title = (event.summary || "Untitled Event").toLowerCase();
  const desc = (event.description || "").toLowerCase();
  const attendeeCount = (event.attendees?.length || 0) + 1;

  const startMs = new Date(event.start.dateTime || event.start.date || Date.now()).getTime();
  const endMs = new Date(event.end.dateTime || event.end.date || startMs + 3600000).getTime();
  const durationHours = Math.max(0.25, (endMs - startMs) / (1000 * 60 * 60));

  let category: EventPriorityCategory = "COLLABORATION";
  let priorityScore = 65;
  let reason = "Core team collaboration & alignment";

  if (
    title.includes("deep work") ||
    title.includes("focus") ||
    title.includes("coding") ||
    title.includes("architecture") ||
    title.includes("strategy block") ||
    title.includes("heads down") ||
    title.includes("🧠")
  ) {
    category = "DEEP_WORK";
    priorityScore = 92;
    reason = "Protected maker time / strategic execution";
  } else if (
    title.includes("client") ||
    title.includes("customer") ||
    title.includes("pitch") ||
    title.includes("board") ||
    title.includes("demo") ||
    title.includes("renewal") ||
    title.includes("investor") ||
    title.includes("closing") ||
    title.includes("executive") ||
    desc.includes("high priority") ||
    desc.includes("revenue")
  ) {
    category = "HIGH_ROI";
    priorityScore = 96;
    reason = "High business impact / external stakeholder or decision milestone";
  } else if (
    title.includes("catchup") ||
    title.includes("catch-up") ||
    title.includes("sync") ||
    title.includes("standup") ||
    title.includes("check-in") ||
    title.includes("status") ||
    title.includes("optional") ||
    title.includes("coffee") ||
    title.includes("fyi")
  ) {
    category = "LOW_ROI_SYNC";
    priorityScore = 35;
    reason = "Routine sync—candidate for async update or flexible rescheduling";
  } else if (
    title.includes("1:1") ||
    title.includes("one on one") ||
    title.includes("design") ||
    title.includes("review") ||
    title.includes("planning") ||
    title.includes("sprint")
  ) {
    category = "COLLABORATION";
    priorityScore = 72;
    reason = "Team alignment & coaching session";
  }

  // Average loaded engineering/business hourly rate ($95/hr per person)
  const estimatedCost =
    category === "DEEP_WORK" ? 0 : Math.round(durationHours * attendeeCount * 95);

  return {
    ...event,
    aiCategory: category,
    aiPriorityScore: priorityScore,
    aiEstimatedCost: estimatedCost,
    aiReason: reason,
  };
}

/**
 * Find next open slot of `durationMs` on the same day (or next business day) between 09:00 and 18:30
 */
export function findNextAvailableSlot(
  events: GCalEvent[],
  referenceStartIso: string,
  durationMs: number,
  excludeEventId?: string
): { start: string; end: string } {
  const refDate = new Date(referenceStartIso);
  // Check same day first, then next 3 days
  for (let dayOffset = 0; dayOffset < 4; dayOffset++) {
    const candidateDay = new Date(refDate);
    candidateDay.setDate(refDate.getDate() + dayOffset);

    // Start searching from 9:00 AM (or after current event on same day)
    const dayStart = new Date(candidateDay);
    dayStart.setHours(9, 0, 0, 0);

    const dayEnd = new Date(candidateDay);
    dayEnd.setHours(18, 30, 0, 0);

    // Test every 30-min increment
    for (
      let cursor = dayStart.getTime();
      cursor + durationMs <= dayEnd.getTime();
      cursor += 30 * 60 * 1000
    ) {
      // Avoid suggesting the exact same start time
      if (Math.abs(cursor - refDate.getTime()) < 15 * 60 * 1000) continue;

      const slotStart = cursor;
      const slotEnd = cursor + durationMs;

      const hasOverlap = events.some((ev) => {
        if (ev.id === excludeEventId) return false;
        if (!ev.start.dateTime || !ev.end.dateTime) return false;
        const evStart = new Date(ev.start.dateTime).getTime();
        const evEnd = new Date(ev.end.dateTime).getTime();
        return slotStart < evEnd && slotEnd > evStart;
      });

      if (!hasOverlap) {
        return {
          start: new Date(slotStart).toISOString(),
          end: new Date(slotEnd).toISOString(),
        };
      }
    }
  }

  // Fallback: 2 hours after reference start
  const fallbackStart = new Date(refDate.getTime() + 2 * 3600 * 1000);
  return {
    start: fallbackStart.toISOString(),
    end: new Date(fallbackStart.getTime() + durationMs).toISOString(),
  };
}

/**
 * Enriches events with semantic categories, detects overlaps, and generates
 * the full Proactive Schedule Audit Report (Clashes, Deep Work Score, Focus Block opportunities).
 */
export function analyzeCalendarWeek(
  rawEvents: GCalEvent[],
  weekStartIso: string
): { events: GCalEvent[]; audit: ScheduleAuditReport } {
  const timedEvents = rawEvents
    .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
    .map(classifyEventSemantically)
    .sort((a, b) => {
      const aTime = new Date(a.start.dateTime || a.start.date || 0).getTime();
      const bTime = new Date(b.start.dateTime || b.start.date || 0).getTime();
      return aTime - bTime;
    });

  const conflicts: ConflictResolutionSuggestion[] = [];
  const conflictPairSet = new Set<string>();

  let totalMeetingHours = 0;
  let deepWorkHours = 0;
  let highRoiHours = 0;
  let lowRoiHours = 0;
  let estimatedWeeklyMeetingCost = 0;

  for (let i = 0; i < timedEvents.length; i++) {
    const evA = timedEvents[i];
    if (!evA.start.dateTime || !evA.end.dateTime) continue;

    const startA = new Date(evA.start.dateTime).getTime();
    const endA = new Date(evA.end.dateTime).getTime();
    const hoursA = Math.max(0.25, (endA - startA) / (1000 * 3600));

    if (evA.aiCategory === "DEEP_WORK") {
      deepWorkHours += hoursA;
    } else {
      totalMeetingHours += hoursA;
      estimatedWeeklyMeetingCost += evA.aiEstimatedCost || 0;
      if (evA.aiCategory === "HIGH_ROI") highRoiHours += hoursA;
      if (evA.aiCategory === "LOW_ROI_SYNC") lowRoiHours += hoursA;
    }

    for (let j = i + 1; j < timedEvents.length; j++) {
      const evB = timedEvents[j];
      if (!evB.start.dateTime || !evB.end.dateTime) continue;

      const startB = new Date(evB.start.dateTime).getTime();
      const endB = new Date(evB.end.dateTime).getTime();

      if (startA < endB && endA > startB) {
        evA.hasConflict = true;
        evB.hasConflict = true;
        evA.conflictingWithIds = [...(evA.conflictingWithIds || []), evB.id];
        evB.conflictingWithIds = [...(evB.conflictingWithIds || []), evA.id];

        const pairKey = [evA.id, evB.id].sort().join("--");
        if (!conflictPairSet.has(pairKey)) {
          conflictPairSet.add(pairKey);
          const scoreA = evA.aiPriorityScore || 50;
          const scoreB = evB.aiPriorityScore || 50;
          const keepEvent = scoreA >= scoreB ? evA : evB;
          const moveEvent = scoreA >= scoreB ? evB : evA;

          const moveStartMs = new Date(moveEvent.start.dateTime!).getTime();
          const moveEndMs = new Date(moveEvent.end.dateTime!).getTime();
          const durationMs = Math.max(30 * 60 * 1000, moveEndMs - moveStartMs);

          const optimalSlot = findNextAvailableSlot(
            timedEvents,
            moveEvent.start.dateTime!,
            durationMs,
            moveEvent.id
          );

          conflicts.push({
            id: pairKey,
            eventA: evA,
            eventB: evB,
            keepEvent,
            moveEvent,
            suggestedStart: optimalSlot.start,
            suggestedEnd: optimalSlot.end,
            reason: `"${keepEvent.summary}" has higher business priority (${keepEvent.aiPriorityScore}/100) than "${moveEvent.summary}" (${moveEvent.aiPriorityScore}/100). Recommended moving "${moveEvent.summary}" to the next open slot.`,
          });
        }
      }
    }
  }

  // Analyze Monday-Friday for Focus Block opportunities
  const suggestedFocusBlocks: FocusBlockSuggestion[] = [];
  let fragmentedDaysCount = 0;
  const baseMonday = new Date(weekStartIso);

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  for (let d = 0; d < 5; d++) {
    const dayDate = new Date(baseMonday);
    dayDate.setDate(baseMonday.getDate() + d);
    const dayDateStr = dayDate.toISOString().split("T")[0];

    const dayEvents = timedEvents.filter((ev) => {
      if (!ev.start.dateTime) return false;
      const evDay = new Date(ev.start.dateTime);
      return (
        evDay.getFullYear() === dayDate.getFullYear() &&
        evDay.getMonth() === dayDate.getMonth() &&
        evDay.getDate() === dayDate.getDate()
      );
    });

    const hasFocusBlockAlready = dayEvents.some((e) => e.aiCategory === "DEEP_WORK");
    if (dayEvents.length >= 3 && !hasFocusBlockAlready) {
      fragmentedDaysCount++;
    }

    if (!hasFocusBlockAlready && suggestedFocusBlocks.length < 3) {
      // Find a clean 2-hour focus block between 9:00 AM and 5:30 PM on this day
      const twoHoursMs = 2 * 60 * 60 * 1000;
      const nineAm = new Date(dayDate);
      nineAm.setHours(9, 0, 0, 0);
      const fiveThirtyPm = new Date(dayDate);
      fiveThirtyPm.setHours(17, 30, 0, 0);

      for (
        let cursor = nineAm.getTime();
        cursor + twoHoursMs <= fiveThirtyPm.getTime();
        cursor += 60 * 60 * 1000
      ) {
        const slotEnd = cursor + twoHoursMs;
        const overlaps = dayEvents.some((ev) => {
          const s = new Date(ev.start.dateTime!).getTime();
          const e = new Date(ev.end.dateTime!).getTime();
          return cursor < e && slotEnd > s;
        });

        if (!overlaps) {
          suggestedFocusBlocks.push({
            id: `focus-${dayDateStr}`,
            dayLabel: dayNames[d] || dayDate.toLocaleDateString("en-US", { weekday: "long" }),
            dateStr: dayDateStr,
            start: new Date(cursor).toISOString(),
            end: new Date(slotEnd).toISOString(),
            durationMinutes: 120,
            reason:
              dayEvents.length >= 2
                ? `${dayNames[d]} has ${dayEvents.length} meetings and 0 hrs of protected maker time.`
                : `Open 2-hour high-energy morning window on ${dayNames[d]}.`,
          });
          break;
        }
      }
    }
  }

  // Calculate Deep Work Score (0 to 100)
  const rawScore =
    65 +
    Math.min(25, deepWorkHours * 4.5) -
    conflicts.length * 14 -
    fragmentedDaysCount * 7 -
    Math.max(0, lowRoiHours - 3) * 4;
  const deepWorkScore = Math.max(12, Math.min(98, Math.round(rawScore)));

  let executiveSummary = "Your schedule is well-balanced with healthy focus windows.";
  if (conflicts.length > 0) {
    executiveSummary = `Action needed: ${conflicts.length} double-booking clash(es) detected and ${fragmentedDaysCount} day(s) lack protected Deep Work blocks.`;
  } else if (deepWorkHours < 4) {
    executiveSummary = `Low Deep Work alert: Only ${deepWorkHours.toFixed(1)}h of protected focus time scheduled against ${totalMeetingHours.toFixed(1)}h of meetings.`;
  }

  return {
    events: timedEvents,
    audit: {
      deepWorkScore,
      totalMeetingHours: Number(totalMeetingHours.toFixed(1)),
      deepWorkHours: Number(deepWorkHours.toFixed(1)),
      highRoiHours: Number(highRoiHours.toFixed(1)),
      lowRoiHours: Number(lowRoiHours.toFixed(1)),
      estimatedWeeklyMeetingCost,
      fragmentedDaysCount,
      conflicts,
      suggestedFocusBlocks,
      executiveSummary,
    },
  };
}

/**
 * Direct REST calls to live Google Calendar API v3 using the user's OAuth 2.0 Bearer token
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const res = await fetch(`${GCAL_BASE_URL}/calendars/primary/events?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  return (data.items || []) as GCalEvent[];
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  eventPayload: {
    summary: string;
    description?: string;
    startDateTime: string;
    endDateTime: string;
    attendees?: string[];
  }
): Promise<GCalEvent> {
  const body: Record<string, unknown> = {
    summary: eventPayload.summary,
    description: eventPayload.description || "Scheduled autonomously by Chronos AI Calendar Copilot",
    start: { dateTime: new Date(eventPayload.startDateTime).toISOString() },
    end: { dateTime: new Date(eventPayload.endDateTime).toISOString() },
  };

  if (eventPayload.attendees && eventPayload.attendees.length > 0) {
    body.attendees = eventPayload.attendees
      .filter((email) => email.includes("@"))
      .map((email) => ({ email: email.trim() }));
  }

  const res = await fetch(`${GCAL_BASE_URL}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to create event (${res.status}): ${errBody}`);
  }

  return (await res.json()) as GCalEvent;
}

export async function patchGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  updates: {
    summary?: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
  }
): Promise<GCalEvent> {
  const body: Record<string, unknown> = {};
  if (updates.summary !== undefined) body.summary = updates.summary;
  if (updates.description !== undefined) body.description = updates.description;
  if (updates.startDateTime) {
    body.start = { dateTime: new Date(updates.startDateTime).toISOString() };
  }
  if (updates.endDateTime) {
    body.end = { dateTime: new Date(updates.endDateTime).toISOString() };
  }

  const res = await fetch(
    `${GCAL_BASE_URL}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to update event (${res.status}): ${errBody}`);
  }

  return (await res.json()) as GCalEvent;
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${GCAL_BASE_URL}/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok && res.status !== 204 && res.status !== 410) {
    const errBody = await res.text();
    throw new Error(`Failed to delete event (${res.status}): ${errBody}`);
  }
}
