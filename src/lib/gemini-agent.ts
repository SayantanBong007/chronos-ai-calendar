import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
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

/**
 * Native Function Declarations for Gemini 2.5 Flash (Zero LangChain / LangGraph overhead)
 */
export const calendarToolDeclarations: FunctionDeclaration[] = [
  {
    name: "createCalendarEvent",
    description:
      "Create a new meeting, call, or Deep Work / Focus block directly on the user's real Google Calendar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: "Title of the event (e.g., '🧠 Deep Work: System Architecture' or 'Q4 Strategy Review with Rahul')",
        },
        startDateTime: {
          type: Type.STRING,
          description: "ISO 8601 start timestamp with timezone offset (e.g. '2026-11-26T14:00:00+05:30')",
        },
        endDateTime: {
          type: Type.STRING,
          description: "ISO 8601 end timestamp with timezone offset (e.g. '2026-11-26T15:00:00+05:30')",
        },
        description: {
          type: Type.STRING,
          description: "Agenda, purpose, or preparation notes for the event",
        },
      },
      required: ["summary", "startDateTime", "endDateTime"],
    },
  },
  {
    name: "moveOrUpdateCalendarEvent",
    description:
      "Reschedule an existing Google Calendar event to a new time, or update its title/agenda description.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: "The exact event ID from the user's current calendar context list",
        },
        newStartDateTime: {
          type: Type.STRING,
          description: "Optional new ISO 8601 start timestamp if moving/rescheduling the event",
        },
        newEndDateTime: {
          type: Type.STRING,
          description: "Optional new ISO 8601 end timestamp if moving/rescheduling the event",
        },
        newSummary: {
          type: Type.STRING,
          description: "Optional updated title for the event",
        },
        newDescription: {
          type: Type.STRING,
          description: "Optional updated agenda or executive brief description",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "deleteCalendarEvent",
    description:
      "Delete or cancel an event from the user's Google Calendar by its exact eventId.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        eventId: {
          type: Type.STRING,
          description: "The exact event ID from the user's current calendar context list",
        },
        reason: {
          type: Type.STRING,
          description: "Brief explanation of why this event is being deleted",
        },
      },
      required: ["eventId"],
    },
  },
  {
    name: "findOptimalFreeSlot",
    description:
      "Find the next conflict-free time slot on the user's calendar for a given date and duration.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        preferredDateTimeIso: {
          type: Type.STRING,
          description: "ISO 8601 reference date/time to start searching from",
        },
        durationMinutes: {
          type: Type.NUMBER,
          description: "Required meeting or focus block length in minutes (e.g. 30, 60, 120)",
        },
      },
      required: ["preferredDateTimeIso", "durationMinutes"],
    },
  },
];

/**
 * Native Multi-Step Agent Loop using @google/genai
 */
export async function runCalendarAgentLoop(params: {
  prompt: string;
  accessToken: string;
  geminiApiKey: string;
  currentEvents: GCalEvent[];
  currentTimeIso: string;
  timeZone: string;
}): Promise<{
  reply: string;
  toolLogs: AgentToolExecutionLog[];
}> {
  const { prompt, accessToken, geminiApiKey, currentEvents, currentTimeIso, timeZone } = params;
  const toolLogs: AgentToolExecutionLog[] = [];

  const compactSchedule = currentEvents.map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.start.dateTime || e.start.date,
    end: e.end.dateTime || e.end.date,
    category: e.aiCategory,
    priorityScore: e.aiPriorityScore,
    hasConflict: e.hasConflict || false,
  }));

  const systemInstruction = `You are Chronos AI, an autonomous AI Chief of Staff built inside Google Calendar for busy business users.
Current Local Time: ${currentTimeIso} (TimeZone: ${timeZone})

Here is the user's live Google Calendar schedule for the active week:
${JSON.stringify(compactSchedule, null, 2)}

YOUR RULES:
1. You have live tools connected to the user's real Google Calendar API (createCalendarEvent, moveOrUpdateCalendarEvent, deleteCalendarEvent, findOptimalFreeSlot).
2. When the user asks to schedule, block focus time, resolve clashes, reschedule, move, or cancel meetings, DO NOT ask for confirmation—proactively execute the appropriate tool calls right away!
3. Always use the user's timezone offset from Current Local Time (${currentTimeIso}) when constructing ISO timestamps.
4. When creating Deep Work or Focus blocks, prefix the summary with "🧠 Deep Work: " so the semantic engine classifies it properly.
5. After executing tools, provide a crisp, executive-style summary of what you changed and why it improves their schedule health.`;

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  // Build conversation history array for multi-step tool loop
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];

  let response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction,
      tools: [{ functionDeclarations: calendarToolDeclarations }],
      temperature: 0.2,
    },
  });

  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (response.functionCalls && response.functionCalls.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const modelParts = response.candidates?.[0]?.content?.parts || [];
    contents.push({
      role: "model",
      parts: modelParts,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const functionResponseParts: any[] = [];

    for (const call of response.functionCalls) {
      const args = (call.args || {}) as Record<string, unknown>;
      let toolResult: Record<string, unknown> = {};

      try {
        if (call.name === "createCalendarEvent") {
          const created = await createGoogleCalendarEvent(accessToken, {
            summary: String(args.summary || "New Event"),
            startDateTime: String(args.startDateTime),
            endDateTime: String(args.endDateTime),
            description: args.description ? String(args.description) : undefined,
          });
          toolResult = {
            status: "success",
            eventId: created.id,
            summary: created.summary,
            start: created.start,
            end: created.end,
          };
          toolLogs.push({
            toolName: "createCalendarEvent",
            args,
            resultSummary: `Created "${created.summary}" on Google Calendar`,
            status: "success",
          });
        } else if (call.name === "moveOrUpdateCalendarEvent") {
          const updated = await patchGoogleCalendarEvent(accessToken, String(args.eventId), {
            summary: args.newSummary ? String(args.newSummary) : undefined,
            description: args.newDescription ? String(args.newDescription) : undefined,
            startDateTime: args.newStartDateTime ? String(args.newStartDateTime) : undefined,
            endDateTime: args.newEndDateTime ? String(args.newEndDateTime) : undefined,
          });
          toolResult = {
            status: "success",
            eventId: updated.id,
            summary: updated.summary,
            start: updated.start,
            end: updated.end,
          };
          toolLogs.push({
            toolName: "moveOrUpdateCalendarEvent",
            args,
            resultSummary: `Updated "${updated.summary}" on Google Calendar`,
            status: "success",
          });
        } else if (call.name === "deleteCalendarEvent") {
          await deleteGoogleCalendarEvent(accessToken, String(args.eventId));
          toolResult = {
            status: "success",
            deletedEventId: args.eventId,
          };
          toolLogs.push({
            toolName: "deleteCalendarEvent",
            args,
            resultSummary: `Removed event (${String(args.eventId)}) from Google Calendar`,
            status: "success",
          });
        } else if (call.name === "findOptimalFreeSlot") {
          const durationMs = Number(args.durationMinutes || 60) * 60 * 1000;
          const slot = findNextAvailableSlot(
            currentEvents,
            String(args.preferredDateTimeIso || currentTimeIso),
            durationMs
          );
          toolResult = {
            status: "success",
            freeSlotStart: slot.start,
            freeSlotEnd: slot.end,
          };
          toolLogs.push({
            toolName: "findOptimalFreeSlot",
            args,
            resultSummary: `Found free slot: ${new Date(slot.start).toLocaleString()}`,
            status: "success",
          });
        } else {
          toolResult = { status: "error", message: `Unknown tool ${call.name}` };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        toolResult = { status: "error", message };
        toolLogs.push({
          toolName: call.name || "unknownTool",
          args,
          resultSummary: `Error: ${message}`,
          status: "error",
        });
      }

      functionResponseParts.push({
        functionResponse: {
          name: call.name,
          response: toolResult,
        },
      });
    }

    contents.push({
      role: "user",
      parts: functionResponseParts,
    });

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

  return {
    reply:
      response.text ||
      (toolLogs.length > 0
        ? `Executed ${toolLogs.length} calendar action(s) on your Google Calendar.`
        : "I reviewed your schedule."),
    toolLogs,
  };
}
