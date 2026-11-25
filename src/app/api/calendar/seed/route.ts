import { NextRequest, NextResponse } from "next/server";
import {
  createGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
  deleteGoogleCalendarEvent,
} from "@/lib/gcal";

/**
 * POST /api/calendar/seed
 * Seeds 8 realistic business events (with an intentional double-booking conflict,
 * a fragmented "Swiss cheese" day, high-ROI client calls, and low-ROI syncs)
 * directly into the user's real Google Calendar so evaluators can test 100% of
 * the AI features immediately.
 *
 * DELETE /api/calendar/seed
 * Removes all [Chronos Demo] events from the user's Google Calendar in 1 click.
 */
export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Google OAuth token" }, { status: 401 });
    }

    const body = await req.json();
    const weekMonday = new Date(body.weekStartIso || Date.now());
    weekMonday.setHours(0, 0, 0, 0);

    const makeSlot = (dayOffset: number, startHour: number, startMin: number, durationMin: number) => {
      const start = new Date(weekMonday);
      start.setDate(weekMonday.getDate() + dayOffset);
      start.setHours(startHour, startMin, 0, 0);
      const end = new Date(start.getTime() + durationMin * 60 * 1000);
      return {
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
      };
    };

    const sampleEvents = [
      {
        summary: "[Chronos Demo] Enterprise Client Renewal Pitch — Acme Corp",
        description:
          "High-priority $120K ARR Q4 renewal discussion with VP of Engineering at Acme Corp.",
        ...makeSlot(0, 10, 0, 60), // Monday 10:00 - 11:00
      },
      {
        summary: "[Chronos Demo] Optional Weekly Marketing Status Sync",
        description: "Routine status round-table. Clashes with Acme Client Renewal Pitch!",
        ...makeSlot(0, 10, 15, 45), // Monday 10:15 - 11:00 (INTENTIONAL CLASH #1)
      },
      {
        summary: "[Chronos Demo] Product & Engineering Sprint Planning",
        description: "Finalize Q4 AI Calendar roadmap milestones and sprint velocity.",
        ...makeSlot(1, 9, 30, 60), // Tuesday 09:30 - 10:30
      },
      {
        summary: "[Chronos Demo] Quick Vendor Check-in Call",
        description: "Fragmented mid-day check-in.",
        ...makeSlot(1, 11, 30, 30), // Tuesday 11:30 - 12:00
      },
      {
        summary: "[Chronos Demo] Design Review: Mobile Navigation",
        description: "Review Figma prototypes with UX lead.",
        ...makeSlot(1, 14, 0, 45), // Tuesday 14:00 - 14:45
      },
      {
        summary: "[Chronos Demo] Brain Deep Work: Core AI Engine Architecture",
        description: "Protected maker time for system architecture and code review.",
        ...makeSlot(2, 9, 30, 120), // Wednesday 09:30 - 11:30
      },
      {
        summary: "[Chronos Demo] Board & Investor Q4 Forecast Review",
        description: "Critical executive presentation of ARR growth and unit economics.",
        ...makeSlot(3, 15, 0, 60), // Thursday 15:00 - 16:00
      },
      {
        summary: "[Chronos Demo] Internal IT & Tooling Catch-up",
        description: "Low-priority internal admin sync overlapping with Board Review!",
        ...makeSlot(3, 15, 0, 45), // Thursday 15:00 - 15:45 (INTENTIONAL CLASH #2)
      },
    ];

    const createdEvents = [];
    for (const ev of sampleEvents) {
      const created = await createGoogleCalendarEvent(accessToken, ev);
      createdEvents.push(created);
    }

    return NextResponse.json({
      createdCount: createdEvents.length,
      message: "Seeded 8 realistic business events (with 2 clashes) into your Google Calendar.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to seed sample week";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Google OAuth token" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const timeMin =
      searchParams.get("timeMin") ||
      new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const timeMax =
      searchParams.get("timeMax") ||
      new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString();

    const events = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
    const demoEvents = events.filter((e) => (e.summary || "").includes("[Chronos Demo]"));

    let deletedCount = 0;
    for (const demoEv of demoEvents) {
      await deleteGoogleCalendarEvent(accessToken, demoEv.id);
      deletedCount++;
    }

    return NextResponse.json({
      deletedCount,
      message: `Cleaned up ${deletedCount} [Chronos Demo] events from your Google Calendar.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to clean up demo events";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
