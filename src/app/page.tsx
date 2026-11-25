"use client";

import React, { useState, useEffect, useCallback } from "react";
import Script from "next/script";
import {
  GCalEvent,
  ScheduleAuditReport,
  ConflictResolutionSuggestion,
  FocusBlockSuggestion,
} from "@/types/calendar";
import { analyzeCalendarWeek } from "@/lib/gcal";
import { getInitialBusinessWeekEvents } from "@/lib/demo-data";
import { CalendarMutationOp } from "@/app/api/ai/agent/route";
import ProactiveAuditPanel from "@/components/ProactiveAuditPanel";
import CalendarGrid from "@/components/CalendarGrid";
import CommandCopilot from "@/components/CommandCopilot";
import MeetingDossierModal from "@/components/MeetingDossierModal";
import CaseStudyModal from "@/components/CaseStudyModal";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Check,
  RotateCcw,
  Settings,
  X,
  Plus,
} from "lucide-react";

function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function ChronosCalendarApp() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [viewMode, setViewMode] = useState<"week" | "agenda">("week");

  const [rawEvents, setRawEvents] = useState<GCalEvent[]>(() =>
    getInitialBusinessWeekEvents(getMondayOfWeek(new Date()).toISOString())
  );
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [audit, setAudit] = useState<ScheduleAuditReport | null>(null);

  const [accessToken, setAccessToken] = useState<string>("");
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [googleClientId] = useState<string>(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      "338567217288-94fmc98m35plhmlpqh9hcgncm0j327g5.apps.googleusercontent.com"
  );
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const [selectedEvent, setSelectedEvent] = useState<GCalEvent | null>(null);
  const [showCaseStudy, setShowCaseStudy] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [quickCreateIso, setQuickCreateIso] = useState<string | null>(null);
  const [quickCreateTitle, setQuickCreateTitle] = useState<string>("");

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  useEffect(() => {
    const { events: enriched, audit: report } = analyzeCalendarWeek(
      rawEvents,
      weekStart.toISOString()
    );
    setEvents(enriched);
    setAudit(report);
  }, [rawEvents, weekStart]);

  useEffect(() => {
    const savedGemini = localStorage.getItem("chronos_gemini_key") || "";
    const savedToken = localStorage.getItem("chronos_gcal_token") || "";
    if (savedGemini) setGeminiApiKey(savedGemini);
    if (savedToken && savedToken.startsWith("ya29.")) {
      setAccessToken(savedToken);
    } else if (savedToken) {
      localStorage.removeItem("chronos_gcal_token");
    }
  }, []);

  const syncLiveGoogleCalendar = useCallback(
    async (token: string) => {
      if (!token || !token.startsWith("ya29.")) return;
      try {
        const timeMin = new Date(weekStart).toISOString();
        const timeMaxDate = new Date(weekStart);
        timeMaxDate.setDate(timeMaxDate.getDate() + 7);
        const res = await fetch(
          `/api/calendar?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(
            timeMaxDate.toISOString()
          )}`,
          {
            headers: { "x-gcal-token": token },
          }
        );
        const data = await res.json();
        if (res.ok && data.events) {
          setRawEvents(data.events);
          triggerToast(`Synced with Google Calendar (${data.events.length} events)`);
        } else if (res.status === 401 || (data.error && data.error.includes("401"))) {
          setAccessToken("");
          localStorage.removeItem("chronos_gcal_token");
          triggerToast("Session expired. Click 'Connect Google Calendar' to reconnect.");
        }
      } catch {
        // Keep active workspace
      }
    },
    [weekStart]
  );

  const handleSeedLiveGoogleCalendar = async () => {
    if (!accessToken || !accessToken.startsWith("ya29.")) return;
    triggerToast("Seeding sample business week into your Google Calendar...");
    try {
      const res = await fetch("/api/calendar/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gcal-token": accessToken,
        },
        body: JSON.stringify({
          weekStartIso: weekStart.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to seed sample week");
      await syncLiveGoogleCalendar(accessToken);
      triggerToast("Added 8 sample business events to your Google Calendar");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error seeding Google Calendar");
    }
  };

  useEffect(() => {
    if (accessToken) {
      syncLiveGoogleCalendar(accessToken);
    }
  }, [accessToken, weekStart, syncLiveGoogleCalendar]);

  const handleResolveConflict = async (c: ConflictResolutionSuggestion) => {
    if (
      accessToken &&
      accessToken.startsWith("ya29.") &&
      !c.moveEvent.id.startsWith("demo-") &&
      !c.moveEvent.id.startsWith("local-")
    ) {
      try {
        await fetch("/api/calendar", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-gcal-token": accessToken,
          },
          body: JSON.stringify({
            eventId: c.moveEvent.id,
            startDateTime: c.suggestedStart,
            endDateTime: c.suggestedEnd,
          }),
        });
      } catch {
        // Fallback
      }
    }

    setRawEvents((prev) =>
      prev.map((ev) =>
        ev.id === c.moveEvent.id
          ? {
              ...ev,
              start: { dateTime: c.suggestedStart },
              end: { dateTime: c.suggestedEnd },
            }
          : ev
      )
    );

    triggerToast(
      `Moved "${c.moveEvent.summary}" to ${new Date(
        c.suggestedStart
      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    );
  };

  const handleInsertFocusBlock = async (fb: FocusBlockSuggestion) => {
    const newBlock: GCalEvent = {
      id: `local-focus-${Date.now()}`,
      summary: `🧠 Deep Work: Protected Focus Block`,
      description: `2-hour uninterrupted Deep Work block (${fb.reason})`,
      start: { dateTime: fb.start },
      end: { dateTime: fb.end },
    };

    if (accessToken && accessToken.startsWith("ya29.")) {
      try {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gcal-token": accessToken,
          },
          body: JSON.stringify({
            summary: newBlock.summary,
            description: newBlock.description,
            startDateTime: fb.start,
            endDateTime: fb.end,
          }),
        });
        const data = await res.json();
        if (res.ok && data.event) {
          newBlock.id = data.event.id;
        }
      } catch {
        // Fallback
      }
    }

    setRawEvents((prev) => [...prev, newBlock]);
    triggerToast(`Protected 2h Focus Block on ${fb.dayLabel}`);
  };

  const handleApplyAgentMutations = (
    mutations: CalendarMutationOp[],
    toastMsg: string
  ) => {
    setRawEvents((prev) => {
      let next = [...prev];
      for (const m of mutations) {
        if (m.type === "create" && m.event) {
          next.push(m.event);
        } else if (m.type === "update" && m.event) {
          next = next.map((e) => (e.id === m.event!.id ? m.event! : e));
        } else if (m.type === "delete" && m.eventId) {
          next = next.filter((e) => e.id !== m.eventId);
        }
      }
      return next;
    });
    triggerToast(toastMsg);
  };

  const handleQuickCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreateIso || !quickCreateTitle.trim()) return;

    const startDt = new Date(quickCreateIso);
    const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);

    const newEv: GCalEvent = {
      id: `local-${Date.now()}`,
      summary: quickCreateTitle.trim(),
      description: "Created in Google Calendar AI",
      start: { dateTime: startDt.toISOString() },
      end: { dateTime: endDt.toISOString() },
    };

    if (accessToken && accessToken.startsWith("ya29.")) {
      try {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-gcal-token": accessToken,
          },
          body: JSON.stringify({
            summary: newEv.summary,
            startDateTime: startDt.toISOString(),
            endDateTime: endDt.toISOString(),
          }),
        });
        const data = await res.json();
        if (res.ok && data.event) newEv.id = data.event.id;
      } catch {
        // Fallback
      }
    }

    setRawEvents((prev) => [...prev, newEv]);
    setQuickCreateIso(null);
    setQuickCreateTitle("");
    triggerToast(`Created "${newEv.summary}"`);
  };

  const handleResetDemoWeek = () => {
    const freshMonday = getMondayOfWeek(new Date());
    setWeekStart(freshMonday);
    setRawEvents(getInitialBusinessWeekEvents(freshMonday.toISOString()));
    triggerToast("Reset sample week");
  };

  const handleGoogleSignInClick = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const googleObj = (window as any).google;
    if (!googleObj?.accounts?.oauth2) {
      alert("Google Sign-In is initializing. Try again in a moment.");
      return;
    }

    const tokenClient = googleObj.accounts.oauth2.initTokenClient({
      client_id: googleClientId.trim(),
      scope:
        "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          setAccessToken(tokenResponse.access_token);
          localStorage.setItem("chronos_gcal_token", tokenResponse.access_token);
          triggerToast("Connected to Google Calendar");
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-[#37352F] antialiased">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* Minimalist Notion Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg bg-[#37352F] px-4 py-2 text-xs font-medium text-white shadow-lg">
          <Check className="h-3.5 w-3.5 text-[#66C088] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Notion Calendar Top Navigation Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#E9E9E7] bg-[#FBFBFA] px-4 select-none">
        <div className="flex items-center gap-3">
          {/* Brand Monogram Badge */}
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[5px] border border-[#E0E0DE] bg-[#37352F] text-xs font-bold text-white shadow-2xs">
              G
            </div>
            <span className="text-xs font-semibold text-[#37352F]">
              Google Calendar AI
            </span>
            <span className="rounded bg-[#F3F0F8] px-1.5 py-0.5 text-[10px] font-medium text-[#6940A5]">
              Chronos
            </span>
          </div>

          <div className="h-4 w-px bg-[#E9E9E7] mx-1" />

          {/* Date Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
              className="rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1 text-xs font-medium text-[#37352F] hover:bg-[#F1F1EF] transition"
            >
              Today
            </button>
            <button
              onClick={() => {
                const prev = new Date(weekStart);
                prev.setDate(prev.getDate() - 7);
                setWeekStart(prev);
              }}
              className="rounded-md p-1 text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const next = new Date(weekStart);
                next.setDate(next.getDate() + 7);
                setWeekStart(next);
              }}
              className="rounded-md p-1 text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-1 text-xs font-semibold text-[#37352F]">
              {weekStart.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="flex items-center rounded-md border border-[#E9E9E7] bg-[#F1F1EF] p-0.5 text-xs">
            <button
              onClick={() => setViewMode("week")}
              className={`rounded-[4px] px-2.5 py-0.5 text-[11px] font-medium transition ${
                viewMode === "week"
                  ? "bg-white text-[#37352F] shadow-2xs"
                  : "text-[#787774] hover:text-[#37352F]"
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("agenda")}
              className={`rounded-[4px] px-2.5 py-0.5 text-[11px] font-medium transition ${
                viewMode === "agenda"
                  ? "bg-white text-[#37352F] shadow-2xs"
                  : "text-[#787774] hover:text-[#37352F]"
              }`}
            >
              Agenda
            </button>
          </div>

          {accessToken ? (
            <button
              onClick={handleSeedLiveGoogleCalendar}
              className="flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#37352F] hover:bg-[#F1F1EF] transition"
            >
              + Seed Sample Week to GCal
            </button>
          ) : (
            <button
              onClick={handleResetDemoWeek}
              className="flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#787774] hover:bg-[#F1F1EF] hover:text-[#37352F] transition"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Sample
            </button>
          )}

          <button
            onClick={() => setShowCaseStudy(true)}
            className="flex items-center gap-1.5 rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#37352F] hover:bg-[#F1F1EF] transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#6940A5]" />
            Thought Process
          </button>

          {accessToken ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => syncLiveGoogleCalendar(accessToken)}
                className="flex items-center gap-1.5 rounded-md bg-[#EDF3EC] px-2.5 py-1 text-[11px] font-medium text-[#2B5339] hover:bg-[#E4EDE2] transition"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#448361]" />
                GCal Connected
              </button>
              <button
                onClick={() => {
                  setAccessToken("");
                  localStorage.removeItem("chronos_gcal_token");
                  handleResetDemoWeek();
                }}
                className="rounded-md px-2 py-1 text-[11px] text-[#787774] hover:bg-[#FDEBEC] hover:text-[#9F2F2D] transition"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleGoogleSignInClick}
              title="In the Google popup, click 'Advanced -> Go to App (unsafe)' to grant Calendar access"
              className="flex items-center gap-1.5 rounded-md bg-[#37352F] px-3 py-1 text-[11px] font-medium text-white hover:bg-[#2F2D28] transition"
            >
              Connect Google Calendar
            </button>
          )}

          <button
            onClick={() => setShowSettingsModal(true)}
            title="API Keys"
            className="rounded-md p-1.5 text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F] transition"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main 3-Column Notion Workspace */}
      <div className="flex flex-1 overflow-hidden">
        <ProactiveAuditPanel
          audit={audit}
          weekStart={weekStart}
          onResolveConflict={handleResolveConflict}
          onInsertFocusBlock={handleInsertFocusBlock}
        />

        <CalendarGrid
          events={events}
          weekStart={weekStart}
          viewMode={viewMode}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
          onQuickCreateSlot={(iso) => setQuickCreateIso(iso)}
        />

        <CommandCopilot
          accessToken={accessToken}
          geminiApiKey={geminiApiKey}
          currentEvents={events}
          onApplyMutations={handleApplyAgentMutations}
        />
      </div>

      {/* Notion Page Drawer for Event Details */}
      <MeetingDossierModal
        event={selectedEvent}
        allEvents={events}
        accessToken={accessToken}
        geminiApiKey={geminiApiKey}
        onClose={() => setSelectedEvent(null)}
        onUpdateEventLocalOrRemote={(updated, msg) => {
          setRawEvents((prev) =>
            prev.map((e) => (e.id === updated.id ? updated : e))
          );
          setSelectedEvent(updated);
          triggerToast(msg);
        }}
        onCreateEventLocalOrRemote={(created, msg) => {
          setRawEvents((prev) => [...prev, created]);
          triggerToast(msg);
        }}
        onDeleteEventLocalOrRemote={(id, msg) => {
          setRawEvents((prev) => prev.filter((e) => e.id !== id));
          triggerToast(msg);
        }}
      />

      <CaseStudyModal
        isOpen={showCaseStudy}
        onClose={() => setShowCaseStudy(false)}
      />

      {/* Quick Create Event Modal */}
      {quickCreateIso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px] p-4">
          <form
            onSubmit={handleQuickCreateSubmit}
            className="w-full max-w-sm rounded-xl border border-[#E9E9E7] bg-white p-5 space-y-3.5 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#37352F] flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-[#787774]" />
                New Event
              </h3>
              <button
                type="button"
                onClick={() => setQuickCreateIso(null)}
                className="text-[#787774] hover:text-[#37352F]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-[11px] text-[#787774]">
              {new Date(quickCreateIso).toLocaleString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · 1h
            </div>
            <input
              type="text"
              autoFocus
              required
              value={quickCreateTitle}
              onChange={(e) => setQuickCreateTitle(e.target.value)}
              placeholder="Event title..."
              className="w-full rounded-md border border-[#E9E9E7] bg-[#FBFBFA] px-3 py-2 text-xs text-[#37352F] placeholder-[#9B9A97] focus:border-[#37352F] focus:bg-white focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setQuickCreateIso(null)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[#787774] hover:bg-[#EFEFEF]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-[#37352F] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#2F2D28]"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Optional Keys Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E9E9E7] bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E9E9E7] pb-2.5">
              <div>
                <h3 className="text-sm font-semibold text-[#37352F]">
                  Workspace API Settings
                </h3>
                <p className="text-[11px] text-[#787774]">
                  Optional Gemini API key or manual OAuth token
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded-md p-1 text-[#787774] hover:bg-[#EFEFEF]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#37352F] block">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-md border border-[#E9E9E7] bg-[#FBFBFA] px-3 py-1.5 text-xs text-[#37352F] focus:border-[#37352F] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-[#37352F] block">
                  Google OAuth Access Token
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ya29.a0..."
                  className="w-full rounded-md border border-[#E9E9E7] bg-[#FBFBFA] px-3 py-1.5 text-xs text-[#37352F] focus:border-[#37352F] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-[#787774] hover:bg-[#EFEFEF]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  localStorage.setItem("chronos_gemini_key", geminiApiKey.trim());
                  if (accessToken.trim().startsWith("ya29.")) {
                    localStorage.setItem("chronos_gcal_token", accessToken.trim());
                  }
                  setShowSettingsModal(false);
                  triggerToast("Saved settings");
                }}
                className="rounded-md bg-[#37352F] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2F2D28]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
