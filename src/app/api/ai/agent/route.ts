import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { calendarToolDeclarations } from "@/lib/gemini-agent";
import {
  GCalEvent,
  AgentToolExecutionLog,
} from "@/types/calendar";
import {
  createGoogleCalendarEvent,
  patchGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  findNextAvailableSlot,
} from "@/lib/gcal";
import {
  parseTargetDateParts,
  parseTimeRangeIso,
  extractCleanEventTitle,
  findBestMatchingEvent,
  getWallClockInTimeZone,
  wallClockToIso,
  formatRangeInTimeZone,
} from "@/lib/nl-parser";

export interface CalendarMutationOp {
  type: "create" | "update" | "delete";
  event?: GCalEvent;
  eventId?: string;
}

async function executeToolAction(params: {
  toolName: string;
  args: Record<string, unknown>;
  accessToken: string;
  workingEvents: GCalEvent[];
  currentTimeIso: string;
}): Promise<{
  toolResult: Record<string, unknown>;
  log: AgentToolExecutionLog;
  mutation?: CalendarMutationOp;
}> {
  const { toolName, args, accessToken, workingEvents, currentTimeIso } = params;
  const isValidGoogleAccessToken = accessToken && accessToken.startsWith("ya29.");

  if (toolName === "createCalendarEvent") {
    const summary = String(args.summary || "New Event");
    const startDateTime = String(args.startDateTime);
    const endDateTime = String(args.endDateTime);
    const description = args.description ? String(args.description) : "Scheduled by Chronos AI";

    if (isValidGoogleAccessToken) {
      try {
        const created = await createGoogleCalendarEvent(accessToken, {
          summary,
          startDateTime,
          endDateTime,
          description,
        });
        workingEvents.push(created);
        return {
          toolResult: { status: "success", event: created },
          log: {
            toolName,
            args,
            resultSummary: `Created "${created.summary}"`,
            status: "success",
          },
          mutation: { type: "create", event: created },
        };
      } catch (e) {
        console.warn("Google Calendar API fallback to local workspace:", e);
      }
    }

    const localCreated: GCalEvent = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      summary,
      description,
      start: { dateTime: new Date(startDateTime).toISOString() },
      end: { dateTime: new Date(endDateTime).toISOString() },
    };
    workingEvents.push(localCreated);
    return {
      toolResult: { status: "success", event: localCreated },
      log: {
        toolName,
        args,
        resultSummary: `Created "${localCreated.summary}"`,
        status: "success",
      },
      mutation: { type: "create", event: localCreated },
    };
  }

  if (toolName === "moveOrUpdateCalendarEvent") {
    const eventId = String(args.eventId);
    const target = workingEvents.find((e) => e.id === eventId);

    if (
      isValidGoogleAccessToken &&
      !eventId.startsWith("demo-") &&
      !eventId.startsWith("local-")
    ) {
      try {
        const updated = await patchGoogleCalendarEvent(accessToken, eventId, {
          summary: args.newSummary ? String(args.newSummary) : undefined,
          description: args.newDescription ? String(args.newDescription) : undefined,
          startDateTime: args.newStartDateTime ? String(args.newStartDateTime) : undefined,
          endDateTime: args.newEndDateTime ? String(args.newEndDateTime) : undefined,
        });
        return {
          toolResult: { status: "success", event: updated },
          log: {
            toolName,
            args,
            resultSummary: `Updated "${updated.summary}"`,
            status: "success",
          },
          mutation: { type: "update", event: updated },
        };
      } catch (e) {
        console.warn("Google Calendar API update fallback:", e);
      }
    }

    const updatedLocal: GCalEvent = {
      ...(target || {
        id: eventId,
        summary: "Updated Meeting",
        start: { dateTime: currentTimeIso },
        end: { dateTime: currentTimeIso },
      }),
      summary: args.newSummary ? String(args.newSummary) : target?.summary || "Updated Event",
      description: args.newDescription
        ? String(args.newDescription)
        : target?.description,
      start: {
        dateTime: args.newStartDateTime
          ? new Date(String(args.newStartDateTime)).toISOString()
          : target?.start.dateTime,
      },
      end: {
        dateTime: args.newEndDateTime
          ? new Date(String(args.newEndDateTime)).toISOString()
          : target?.end.dateTime,
      },
    };
    return {
      toolResult: { status: "success", event: updatedLocal },
      log: {
        toolName,
        args,
        resultSummary: `Moved/Updated "${updatedLocal.summary}"`,
        status: "success",
      },
      mutation: { type: "update", event: updatedLocal },
    };
  }

  if (toolName === "deleteCalendarEvent") {
    const eventId = String(args.eventId);
    const target = workingEvents.find((e) => e.id === eventId);
    if (
      isValidGoogleAccessToken &&
      !eventId.startsWith("demo-") &&
      !eventId.startsWith("local-")
    ) {
      try {
        await deleteGoogleCalendarEvent(accessToken, eventId);
      } catch (e) {
        console.warn("Google Calendar API delete fallback:", e);
      }
    }
    return {
      toolResult: { status: "success", deletedEventId: eventId },
      log: {
        toolName,
        args,
        resultSummary: `Removed "${target?.summary || eventId}"`,
        status: "success",
      },
      mutation: { type: "delete", eventId },
    };
  }

  if (toolName === "findOptimalFreeSlot") {
    const durationMs = Number(args.durationMinutes || 60) * 60 * 1000;
    const slot = findNextAvailableSlot(
      workingEvents,
      String(args.preferredDateTimeIso || currentTimeIso),
      durationMs
    );
    return {
      toolResult: {
        status: "success",
        freeSlotStart: slot.start,
        freeSlotEnd: slot.end,
      },
      log: {
        toolName,
        args,
        resultSummary: `Found open slot`,
        status: "success",
      },
    };
  }

  return {
    toolResult: { status: "error", message: "Unknown tool" },
    log: {
      toolName,
      args,
      resultSummary: "Unknown tool",
      status: "error",
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token") || "";
    const geminiApiKey =
      req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || "";

    const body = await req.json();
    const prompt = String(body.prompt || "").trim();
    const currentEvents = [...((body.currentEvents || []) as GCalEvent[])];
    const currentTimeIso = String(body.currentTimeIso || new Date().toISOString());
    const timeZone = String(body.timeZone || "Asia/Kolkata");
    const lastModifiedEventId = body.lastModifiedEventId ? String(body.lastModifiedEventId) : "";

    if (!prompt) {
      return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
    }

    const toolLogs: AgentToolExecutionLog[] = [];
    const mutations: CalendarMutationOp[] = [];

    // 1. If a real Gemini AI Studio Key (starts with AIza) is present, use Gemini 2.5 Flash
    if (geminiApiKey && geminiApiKey.startsWith("AIza")) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const compactSchedule = currentEvents.map((e) => ({
          id: e.id,
          title: e.summary,
          start: e.start.dateTime || e.start.date,
          end: e.end.dateTime || e.end.date,
          category: e.aiCategory,
          priorityScore: e.aiPriorityScore,
          hasConflict: e.hasConflict || false,
        }));

        const systemInstruction = `You are Chronos AI, an autonomous AI Chief of Staff inside Google Calendar.
Current Local Time: ${currentTimeIso} (User TimeZone: ${timeZone})
Last Modified Event ID: ${lastModifiedEventId || "none"}
Active Week Events:
${JSON.stringify(compactSchedule, null, 2)}

RULES:
1. Immediately execute the tools (createCalendarEvent, moveOrUpdateCalendarEvent, deleteCalendarEvent, findOptimalFreeSlot) to fulfill the user's request.
2. Always generate timestamps in the user's timezone (${timeZone}).
3. Extract a clean, concise professional title (e.g., "Business Meeting" or "Candidate Interview", NOT the entire sentence).
4. Keep your final response concise, friendly, and clear (2 sentences max).`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contents: any[] = [{ role: "user", parts: [{ text: prompt }] }];

        let response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: calendarToolDeclarations }],
            temperature: 0.2,
          },
        });

        let iter = 0;
        while (response.functionCalls && response.functionCalls.length > 0 && iter < 5) {
          iter++;
          contents.push({
            role: "model",
            parts: response.candidates?.[0]?.content?.parts || [],
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fnResponses: any[] = [];
          for (const call of response.functionCalls) {
            const { toolResult, log, mutation } = await executeToolAction({
              toolName: call.name || "",
              args: (call.args || {}) as Record<string, unknown>,
              accessToken,
              workingEvents: currentEvents,
              currentTimeIso,
            });
            toolLogs.push(log);
            if (mutation) mutations.push(mutation);
            fnResponses.push({
              functionResponse: {
                name: call.name,
                response: toolResult,
              },
            });
          }

          contents.push({ role: "user", parts: fnResponses });
          response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: calendarToolDeclarations }],
              temperature: 0.2,
            },
          });
        }

        return NextResponse.json({
          reply: response.text || "Done! I updated your calendar.",
          toolLogs,
          mutations,
        });
      } catch (geminiErr) {
        console.warn("Gemini API fallback triggered:", geminiErr);
      }
    }

    // 2. Timezone-Safe Smart Natural Language Parser Engine
    const lower = prompt
      .replace(/\bp\.?\s*m\.?(?=\s|$|[.,!?])/gi, "pm")
      .replace(/\ba\.?\s*m\.?(?=\s|$|[.,!?])/gi, "am")
      .toLowerCase()
      .trim();

    // A. Greetings / Help
    if (
      /^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup|help|what can you do|who are you)[\s!?.]*$/i.test(
        lower
      )
    ) {
      const clashCount = currentEvents.filter((e) => e.hasConflict).length;
      return NextResponse.json({
        reply: `Hi there! You currently have **${currentEvents.length} events** on your calendar${
          clashCount > 0 ? ` (with **${Math.ceil(clashCount / 2)} clash(es)**)` : ""
        }.\n\nTry telling me:\n• *"Add an interview on Friday from 10 to 11 PM"*\n• *"Delete the Friday 11 AM to 12 PM event"*\n• *"Fix my clashing meetings"*`,
        toolLogs: [],
        mutations: [],
      });
    }

    // B1. Follow-up Rename!
    const renameMatch = prompt.match(
      /^(?:please\s+)?(?:actually\s+)?(?:rename|change\s+(?:the\s+)?(?:title|name)|call)\s+(?:it|that|this|the\s+event|the\s+meeting)?\s*(?:to|as)\s+(.+)$/i
    );
    if (renameMatch && currentEvents.length > 0) {
      const newTitle = renameMatch[1].trim().replace(/^["']|["']$/g, "");
      const targetEv =
        currentEvents.find((e) => e.id === lastModifiedEventId) ||
        currentEvents[currentEvents.length - 1];
      if (targetEv) {
        const { log, mutation } = await executeToolAction({
          toolName: "moveOrUpdateCalendarEvent",
          args: {
            eventId: targetEv.id,
            newSummary: newTitle,
          },
          accessToken,
          workingEvents: currentEvents,
          currentTimeIso,
        });
        toolLogs.push(log);
        if (mutation) mutations.push(mutation);

        return NextResponse.json({
          reply: `Renamed event to **"${newTitle}"**.`,
          toolLogs,
          mutations,
        });
      }
    }

    // B2. Follow-up time or day correction!
    const isPureTimeCorrection =
      /^(?:actually\s+)?(?:make it|change it to|change to|no|wait|sorry|set it to|from)?\s*(?:from\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-|–|till|until)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*$/i.test(
        lower
      );

    const hasCreateVerb = /\b(add|ad|book|schedule|scedule|create|ceate|craete|creat|set up|setup|new)\b/i.test(
      lower
    );
    const hasWeekdayOrRelative =
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i.test(lower);
    const isFollowUpDayOrTimeCorrection =
      !hasCreateVerb &&
      hasWeekdayOrRelative &&
      (/\bnot\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/i.test(lower) ||
        /^(?:no|actually|sorry|wait|make it|put it|move it|on|for)\b/i.test(lower) ||
        lower.split(/\s+/).length <= 5);

    if ((isPureTimeCorrection || isFollowUpDayOrTimeCorrection) && currentEvents.length > 0) {
      const targetEv =
        currentEvents.find((e) => e.id === lastModifiedEventId) ||
        currentEvents[currentEvents.length - 1];

      if (targetEv && targetEv.start.dateTime && targetEv.end.dateTime) {
        const oldStartWall = getWallClockInTimeZone(targetEv.start.dateTime, timeZone);
        const durationMs = Math.max(
          30 * 60 * 1000,
          new Date(targetEv.end.dateTime).getTime() - new Date(targetEv.start.dateTime).getTime()
        );

        const dateParts = hasWeekdayOrRelative
          ? parseTargetDateParts(prompt, currentTimeIso, currentEvents, timeZone)
          : {
              year: oldStartWall.year,
              month: oldStartWall.month,
              day: oldStartWall.day,
              dayOfWeek: oldStartWall.dayOfWeek,
            };

        const { startIso, endIso, hasExplicitTime } = parseTimeRangeIso(prompt, dateParts, timeZone);

        let finalStartIso = startIso;
        let finalEndIso = endIso;
        if (!hasExplicitTime) {
          finalStartIso = wallClockToIso(
            dateParts.year,
            dateParts.month,
            dateParts.day,
            oldStartWall.hour,
            oldStartWall.minute,
            timeZone
          );
          finalEndIso = new Date(new Date(finalStartIso).getTime() + durationMs).toISOString();
        }

        const { log, mutation } = await executeToolAction({
          toolName: "moveOrUpdateCalendarEvent",
          args: {
            eventId: targetEv.id,
            newStartDateTime: finalStartIso,
            newEndDateTime: finalEndIso,
          },
          accessToken,
          workingEvents: currentEvents,
          currentTimeIso,
        });
        toolLogs.push(log);
        if (mutation) mutations.push(mutation);

        return NextResponse.json({
          reply: `${hasWeekdayOrRelative ? "Moved" : "Updated"} **"${targetEv.summary}"** to **${formatRangeInTimeZone(
            finalStartIso,
            finalEndIso,
            timeZone
          )}**.`,
          toolLogs,
          mutations,
        });
      }
    }

    // C. Delete / Cancel an event
    if (
      lower.includes("delete") ||
      lower.includes("cancel") ||
      lower.includes("remove") ||
      lower.includes("not deleted")
    ) {
      const targetEv = findBestMatchingEvent(prompt, currentEvents, lastModifiedEventId, timeZone);

      if (targetEv) {
        const { log, mutation } = await executeToolAction({
          toolName: "deleteCalendarEvent",
          args: { eventId: targetEv.id },
          accessToken,
          workingEvents: currentEvents,
          currentTimeIso,
        });
        toolLogs.push(log);
        if (mutation) mutations.push(mutation);

        const startTimeStr = targetEv.start.dateTime
          ? new Date(targetEv.start.dateTime).toLocaleString("en-US", {
              timeZone,
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        return NextResponse.json({
          reply: `Deleted **"${targetEv.summary}"** (${startTimeStr}) from your calendar.`,
          toolLogs,
          mutations,
        });
      }
    }

    // D. Fix Clashes / Conflicts
    if (
      lower.includes("clash") ||
      lower.includes("conflict") ||
      lower.includes("overlap") ||
      (lower.includes("fix") && !lower.includes("delete")) ||
      lower.includes("resolve")
    ) {
      const clashing = currentEvents.filter((e) => e.hasConflict);
      if (clashing.length >= 2) {
        const lowestPriority = [...clashing].sort(
          (a, b) => (a.aiPriorityScore || 50) - (b.aiPriorityScore || 50)
        )[0];

        const sMs = new Date(lowestPriority.start.dateTime!).getTime();
        const eMs = new Date(lowestPriority.end.dateTime!).getTime();
        const slot = findNextAvailableSlot(
          currentEvents,
          lowestPriority.start.dateTime!,
          eMs - sMs,
          lowestPriority.id
        );

        const { log, mutation } = await executeToolAction({
          toolName: "moveOrUpdateCalendarEvent",
          args: {
            eventId: lowestPriority.id,
            newStartDateTime: slot.start,
            newEndDateTime: slot.end,
          },
          accessToken,
          workingEvents: currentEvents,
          currentTimeIso,
        });
        toolLogs.push(log);
        if (mutation) mutations.push(mutation);

        return NextResponse.json({
          reply: `Fixed! I moved **"${lowestPriority.summary}"** to the next open slot at **${new Date(
            slot.start
          ).toLocaleTimeString("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
          })}** so your high-priority call stays protected.`,
          toolLogs,
          mutations,
        });
      } else {
        return NextResponse.json({
          reply: "Your calendar currently has zero double-booking clashes!",
          toolLogs: [],
          mutations: [],
        });
      }
    }

    // E. Move / Reschedule an event
    if (
      lower.includes("move") ||
      lower.includes("reschedule") ||
      lower.includes("shift") ||
      lower.includes("change")
    ) {
      const targetEv = findBestMatchingEvent(prompt, currentEvents, lastModifiedEventId, timeZone);
      if (targetEv && targetEv.start.dateTime && targetEv.end.dateTime) {
        const dateParts = parseTargetDateParts(prompt, currentTimeIso, currentEvents, timeZone);
        const { startIso, endIso, hasExplicitTime } = parseTimeRangeIso(prompt, dateParts, timeZone);

        const durationMs =
          new Date(targetEv.end.dateTime).getTime() -
          new Date(targetEv.start.dateTime).getTime();

        const finalSlot = hasExplicitTime
          ? { start: startIso, end: endIso }
          : findNextAvailableSlot(
              currentEvents,
              startIso,
              durationMs,
              targetEv.id
            );

        const { log, mutation } = await executeToolAction({
          toolName: "moveOrUpdateCalendarEvent",
          args: {
            eventId: targetEv.id,
            newStartDateTime: finalSlot.start,
            newEndDateTime: finalSlot.end,
          },
          accessToken,
          workingEvents: currentEvents,
          currentTimeIso,
        });
        toolLogs.push(log);
        if (mutation) mutations.push(mutation);

        return NextResponse.json({
          reply: `Moved **"${targetEv.summary}"** to **${formatRangeInTimeZone(
            finalSlot.start,
            finalSlot.end,
            timeZone
          )}**.`,
          toolLogs,
          mutations,
        });
      }
    }

    // F. Focus Work / Deep Work Block
    if (
      lower.includes("focus") ||
      lower.includes("deep work") ||
      lower.includes("coding") ||
      lower.includes("block")
    ) {
      const dateParts = parseTargetDateParts(prompt, currentTimeIso, currentEvents, timeZone);
      const { startIso, endIso, hasExplicitTime } = parseTimeRangeIso(prompt, dateParts, timeZone);
      const nineAmIso = wallClockToIso(
        dateParts.year,
        dateParts.month,
        dateParts.day,
        9,
        0,
        timeZone
      );
      const slot = hasExplicitTime
        ? { start: startIso, end: endIso }
        : findNextAvailableSlot(currentEvents, nineAmIso, 2 * 3600 * 1000);

      const { log, mutation } = await executeToolAction({
        toolName: "createCalendarEvent",
        args: {
          summary: "🧠 Deep Work: Protected Execution Block",
          startDateTime: slot.start,
          endDateTime: slot.end,
          description: "2-hour uninterrupted Deep Work block protected by Chronos AI.",
        },
        accessToken,
        workingEvents: currentEvents,
        currentTimeIso,
      });
      toolLogs.push(log);
      if (mutation) mutations.push(mutation);

      return NextResponse.json({
        reply: `Protected a **Deep Work Block** on **${formatRangeInTimeZone(
          slot.start,
          slot.end,
          timeZone
        )}**.`,
        toolLogs,
        mutations,
      });
    }

    // G. Schedule Summary / Questions
    if (
      (lower.includes("how") ||
        lower.includes("what") ||
        lower.includes("show") ||
        lower.includes("list")) &&
      !hasCreateVerb
    ) {
      const deepBlocks = currentEvents.filter((e) => e.aiCategory === "DEEP_WORK");
      const highRoi = currentEvents.filter((e) => e.aiCategory === "HIGH_ROI");
      const clashes = currentEvents.filter((e) => e.hasConflict);
      return NextResponse.json({
        reply: `Here is your week at a glance:\n• **Total Events:** ${currentEvents.length} (${highRoi.length} important client/exec calls)\n• **Focus Work:** ${deepBlocks.length * 2} hours\n• **Clashes:** ${
          clashes.length > 0 ? `${Math.ceil(clashes.length / 2)} overlapping pair(s)` : "0 clashes"
        }`,
        toolLogs: [],
        mutations: [],
      });
    }

    // H. Book / Add / Create a new Event (Tolerates typos like "ceate a mitiing" and computes exact timezone-safe ISO timestamps!)
    const hasSchedulingIntent =
      /\b(book|schedule|scedule|add|ad|create|ceate|craete|creat|set up|setup|meet|meeting|mitiing|meting|meating|call|cal|sync|catchup|catch-up|interview|demo|review|lunch|coffee|session|event|take|have|at|from|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
        lower
      );

    if (hasSchedulingIntent) {
      const dateParts = parseTargetDateParts(prompt, currentTimeIso, currentEvents, timeZone);
      const { startIso, endIso, hasExplicitTime } = parseTimeRangeIso(prompt, dateParts, timeZone);
      const summary = extractCleanEventTitle(prompt);

      const durationMs = Math.max(
        30 * 60 * 1000,
        new Date(endIso).getTime() - new Date(startIso).getTime()
      );
      const finalSlot = hasExplicitTime
        ? { start: startIso, end: endIso }
        : findNextAvailableSlot(currentEvents, startIso, durationMs);

      const { log, mutation } = await executeToolAction({
        toolName: "createCalendarEvent",
        args: {
          summary,
          startDateTime: finalSlot.start,
          endDateTime: finalSlot.end,
          description: `Scheduled via AI Assistant: "${prompt}"`,
        },
        accessToken,
        workingEvents: currentEvents,
        currentTimeIso,
      });
      toolLogs.push(log);
      if (mutation) mutations.push(mutation);

      return NextResponse.json({
        reply: `Scheduled **"${summary}"** for **${formatRangeInTimeZone(
          finalSlot.start,
          finalSlot.end,
          timeZone
        )}**.`,
        toolLogs,
        mutations,
      });
    }

    return NextResponse.json({
      reply: `I can help you manage your calendar! Try telling me:\n• *"Add an interview on Friday from 10 to 11 PM"*\n• *"Delete the Friday 11 AM to 12 PM event"*\n• *"Fix my clashing meetings"*`,
      toolLogs: [],
      mutations: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Agent execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
