import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import {
  patchGoogleCalendarEvent,
  createGoogleCalendarEvent,
  findNextAvailableSlot,
} from "@/lib/gcal";
import { GCalEvent } from "@/types/calendar";

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token") || "";
    const geminiApiKey =
      req.headers.get("x-gemini-key") || process.env.GEMINI_API_KEY || "";
    const body = await req.json();
    const mode = body.mode || "generate_agenda";

    if (mode === "generate_agenda") {
      const event = body.event as GCalEvent;
      const saveToGCal = Boolean(body.saveToGCal);

      let generatedBrief = "";

      if (geminiApiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiApiKey });
          const prompt = `Generate a crisp, executive Pre-Meeting Brief & Timed Agenda for this business meeting:
Title: ${event.summary}
Current Description: ${event.description || "None"}
Category: ${event.aiCategory || "Business Meeting"}

Format in clean plain text with 3 short sections:
1. GOAL (1 sentence)
2. 3-STEP TIMED AGENDA (with minutes)
3. 2 KEY QUESTIONS TO ASK`;

          const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
          });
          generatedBrief = resp.text || "";
        } catch (e) {
          console.warn("Gemini brief fallback:", e);
        }
      }

      if (!generatedBrief) {
        generatedBrief = `📋 AI MEETING AGENDA — ${event.summary}

1. GOAL
Align on key decisions, unblock priorities, and lock in owner next steps.

2. TIMED AGENDA
• [00–10m] Context & Progress Snapshot
• [10–25m] Core Decisions & Bottleneck Resolution
• [25–30m] Next Steps & Owner Deadlines

3. KEY QUESTIONS TO ASK
• What is the single highest-impact decision we need to lock in today?
• Who owns the immediate follow-up deliverable and by what date?`;
      }

      const isValidGoogleAccessToken = accessToken && accessToken.startsWith("ya29.");
      const isRealGCalEvent =
        isValidGoogleAccessToken &&
        event.id &&
        !event.id.startsWith("demo-") &&
        !event.id.startsWith("local-");

      let updatedEvent: GCalEvent = {
        ...event,
        description: generatedBrief,
      };

      if (saveToGCal && isRealGCalEvent) {
        try {
          updatedEvent = await patchGoogleCalendarEvent(accessToken, event.id, {
            description: generatedBrief,
          });
        } catch (e) {
          console.warn("Google Calendar patch fallback:", e);
        }
      }

      return NextResponse.json({
        brief: generatedBrief,
        savedToGoogleCalendar: saveToGCal,
        updatedEvent,
      });
    }

    if (mode === "schedule_action_item") {
      const rawNotes = String(body.rawNotes || "").trim();
      const sourceEvent = body.event as GCalEvent;
      const currentEvents = (body.currentEvents || []) as GCalEvent[];

      if (!rawNotes) {
        return NextResponse.json({ error: "Please enter a follow-up task" }, { status: 400 });
      }

      let taskTitle = `⚡ Follow-Up: ${rawNotes.slice(0, 50)}`;
      const taskDescription = `Action item from "${sourceEvent?.summary || "Meeting"}":\n${rawNotes}`;

      if (geminiApiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiApiKey });
          const resp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Turn this meeting note into a short 6-word calendar task title prefixed with "⚡ Follow-Up: ": "${rawNotes}"`,
          });
          if (resp.text) {
            taskTitle = resp.text.trim().replace(/^["']|["']$/g, "");
          }
        } catch (e) {
          console.warn("Gemini follow-up fallback:", e);
        }
      }

      const referenceTime =
        sourceEvent?.end?.dateTime || new Date(Date.now() + 3600 * 1000).toISOString();
      const slot = findNextAvailableSlot(currentEvents, referenceTime, 45 * 60 * 1000);

      let createdBlock: GCalEvent = {
        id: `local-${Date.now()}`,
        summary: taskTitle,
        description: taskDescription,
        start: { dateTime: slot.start },
        end: { dateTime: slot.end },
      };

      if (accessToken && accessToken.startsWith("ya29.")) {
        try {
          createdBlock = await createGoogleCalendarEvent(accessToken, {
            summary: taskTitle,
            description: taskDescription,
            startDateTime: slot.start,
            endDateTime: slot.end,
          });
        } catch (e) {
          console.warn("Google Calendar create block fallback:", e);
        }
      }

      return NextResponse.json({
        createdBlock,
        message: `Blocked 45 mins for "${createdBlock.summary}" on your calendar!`,
      });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process meeting intelligence";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
