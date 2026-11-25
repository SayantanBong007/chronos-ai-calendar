import { GCalEvent } from "@/types/calendar";

/**
 * Generates a realistic business user's week (Monday–Friday of the given weekStart)
 * so the calendar loads INSTANTLY with zero setup or token copy-pasting required.
 * When the user optionally connects their real Google Calendar, it seamlessly switches
 * to live Google Calendar events.
 */
export function getInitialBusinessWeekEvents(weekMondayIso: string): GCalEvent[] {
  const monday = new Date(weekMondayIso);
  monday.setHours(0, 0, 0, 0);

  const slot = (dayOffset: number, startH: number, startM: number, durationMin: number) => {
    const s = new Date(monday);
    s.setDate(monday.getDate() + dayOffset);
    s.setHours(startH, startM, 0, 0);
    const e = new Date(s.getTime() + durationMin * 60 * 1000);
    return {
      start: { dateTime: s.toISOString() },
      end: { dateTime: e.toISOString() },
    };
  };

  return [
    {
      id: "demo-1",
      summary: "Enterprise Renewal Pitch — Acme Corp ($120K ARR)",
      description:
        "Critical Q4 renewal and expansion call with Acme VP of Engineering. Need to finalize enterprise SLA terms.",
      attendees: [
        { email: "vp-eng@acmecorp.com", displayName: "Sarah Jenkins (Acme)" },
        { email: "ae@company.com", displayName: "Rohit Sharma" },
      ],
      ...slot(0, 10, 0, 60), // Monday 10:00 - 11:00
    },
    {
      id: "demo-2",
      summary: "Optional Weekly Marketing Status Sync",
      description: "Routine weekly status update across marketing channels.",
      attendees: [
        { email: "marketing@company.com", displayName: "Marketing Team" },
      ],
      ...slot(0, 10, 0, 45), // Monday 10:00 - 10:45 (INTENTIONAL CLASH WITH ACME PITCH)
    },
    {
      id: "demo-3",
      summary: "Product & Engineering Sprint Planning",
      description: "Lock in Q4 AI Calendar milestones and engineering assignments.",
      attendees: [
        { email: "eng-team@company.com", displayName: "Core Engineering" },
        { email: "pm@company.com", displayName: "Priya Nair" },
      ],
      ...slot(0, 14, 0, 60), // Monday 14:00 - 15:00
    },
    {
      id: "demo-4",
      summary: "Quick Vendor Check-in Call",
      description: "Short check-in on cloud infrastructure billing.",
      ...slot(1, 9, 30, 30), // Tuesday 09:30 - 10:00
    },
    {
      id: "demo-5",
      summary: "1:1 Coaching Sync with Rahul (Frontend Lead)",
      description: "Career growth and UI architecture review.",
      attendees: [{ email: "rahul@company.com", displayName: "Rahul Verma" }],
      ...slot(1, 11, 30, 45), // Tuesday 11:30 - 12:15
    },
    {
      id: "demo-6",
      summary: "UX Design Review: New Onboarding Flow",
      description: "Walkthrough of Figma prototypes for business workspace.",
      ...slot(1, 15, 0, 60), // Tuesday 15:00 - 16:00
    },
    {
      id: "demo-7",
      summary: "🧠 Deep Work: System Architecture & Core Coding",
      description: "Protected 2-hour uninterrupted maker time block.",
      ...slot(2, 9, 0, 120), // Wednesday 09:00 - 11:00
    },
    {
      id: "demo-8",
      summary: "Customer Discovery Call — FinTech Lead",
      description: "Understanding enterprise scheduling pain points for 200-person org.",
      attendees: [{ email: "cto@fintech.io", displayName: "Alex Rivera" }],
      ...slot(2, 14, 0, 60), // Wednesday 14:00 - 15:00
    },
    {
      id: "demo-9",
      summary: "Board & Investor Q4 Forecast Presentation",
      description: "Executive review of Q4 revenue targets and AI product metrics.",
      attendees: [
        { email: "partner@vc.com", displayName: "Board Partner" },
        { email: "ceo@company.com", displayName: "Founder" },
      ],
      ...slot(3, 15, 0, 60), // Thursday 15:00 - 16:00
    },
    {
      id: "demo-10",
      summary: "Internal IT & Tooling Catch-up",
      description: "Low-priority internal admin sync.",
      ...slot(3, 15, 0, 45), // Thursday 15:00 - 15:45 (INTENTIONAL CLASH WITH BOARD CALL)
    },
    {
      id: "demo-11",
      summary: "Friday Team Demo & Retro",
      description: "Weekly product demo of shipped features.",
      ...slot(4, 11, 0, 60), // Friday 11:00 - 12:00
    },
  ];
}
