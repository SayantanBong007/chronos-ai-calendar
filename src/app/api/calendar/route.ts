import { NextRequest, NextResponse } from "next/server";
import {
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent,
  patchGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  analyzeCalendarWeek,
} from "@/lib/gcal";

export async function GET(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token");
    if (!accessToken) {
      return NextResponse.json(
        { error: "Missing Google OAuth access token. Please sign in with Google." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const timeMin =
      searchParams.get("timeMin") ||
      new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const timeMax =
      searchParams.get("timeMax") ||
      new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const rawEvents = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
    const { events, audit } = analyzeCalendarWeek(rawEvents, timeMin);

    return NextResponse.json({ events, audit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load Google Calendar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Google OAuth token" }, { status: 401 });
    }

    const body = await req.json();
    const created = await createGoogleCalendarEvent(accessToken, {
      summary: body.summary,
      description: body.description,
      startDateTime: body.startDateTime,
      endDateTime: body.endDateTime,
      attendees: body.attendees,
    });

    return NextResponse.json({ event: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const accessToken = req.headers.get("x-gcal-token");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing Google OAuth token" }, { status: 401 });
    }

    const body = await req.json();
    if (!body.eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }

    const updated = await patchGoogleCalendarEvent(accessToken, body.eventId, {
      summary: body.summary,
      description: body.description,
      startDateTime: body.startDateTime,
      endDateTime: body.endDateTime,
    });

    return NextResponse.json({ event: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update event";
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
    const eventId = searchParams.get("eventId");
    if (!eventId) {
      return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
    }

    await deleteGoogleCalendarEvent(accessToken, eventId);
    return NextResponse.json({ deleted: true, eventId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete event";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
