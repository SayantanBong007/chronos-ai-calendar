"use client";

import React from "react";
import { GCalEvent } from "@/types/calendar";
import { AlertCircle, Clock } from "lucide-react";

interface CalendarGridProps {
  events: GCalEvent[];
  weekStart: Date;
  viewMode: "week" | "agenda";
  onSelectEvent: (ev: GCalEvent) => void;
  onQuickCreateSlot: (dateIso: string) => void;
}

export default function CalendarGrid({
  events,
  weekStart,
  viewMode,
  onSelectEvent,
  onQuickCreateSlot,
}: CalendarGridProps) {
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: 16 }, (_, i) => i + 8); // 8 AM to 11 PM

  // Notion Calendar authentic muted card colors
  const categoryStyles: Record<string, string> = {
    HIGH_ROI:
      "border-l-[3px] border-l-[#448361] bg-[#EDF3EC]/95 text-[#2B5339] hover:bg-[#E4EDE2]",
    DEEP_WORK:
      "border-l-[3px] border-l-[#6940A5] bg-[#F3F0F8]/95 text-[#4C2D73] hover:bg-[#EAE4F3]",
    COLLABORATION:
      "border-l-[3px] border-l-[#337EA9] bg-[#EBF3F8]/95 text-[#225473] hover:bg-[#E0ECF4]",
    LOW_ROI_SYNC:
      "border-l-[3px] border-l-[#D9730D] bg-[#FBF3DB]/95 text-[#734C1D] hover:bg-[#F5E9C6]",
  };

  const categoryLabels: Record<string, string> = {
    HIGH_ROI: "Client / Key Decision",
    DEEP_WORK: "Deep Work",
    COLLABORATION: "Team Sync",
    LOW_ROI_SYNC: "Flexible / Routine",
  };

  if (viewMode === "agenda") {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
        {days.map((day) => {
          const dayEvents = events.filter((ev) => {
            const raw = ev.start.dateTime || ev.start.date;
            if (!raw) return false;
            const d = new Date(raw);
            return (
              d.getFullYear() === day.getFullYear() &&
              d.getMonth() === day.getMonth() &&
              d.getDate() === day.getDate()
            );
          });

          return (
            <div
              key={day.toISOString()}
              className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-[#F1F1EF] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#37352F]">
                    {day.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="rounded bg-[#F7F6F3] px-2 py-0.5 text-[11px] text-[#787774]">
                    {dayEvents.length}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const slot = new Date(day);
                    slot.setHours(10, 0, 0, 0);
                    onQuickCreateSlot(slot.toISOString());
                  }}
                  className="text-xs text-[#787774] hover:text-[#37352F] font-medium"
                >
                  + New event
                </button>
              </div>

              {dayEvents.length === 0 ? (
                <p className="text-xs text-[#9B9A97] py-1">No scheduled events</p>
              ) : (
                <div className="space-y-1.5">
                  {dayEvents.map((ev) => {
                    const s = ev.start.dateTime ? new Date(ev.start.dateTime) : null;
                    const e = ev.end.dateTime ? new Date(ev.end.dateTime) : null;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => onSelectEvent(ev)}
                        className={`cursor-pointer rounded-md px-3 py-2.5 transition flex items-center justify-between ${
                          categoryStyles[ev.aiCategory || "COLLABORATION"]
                        } ${ev.hasConflict ? "ring-1 ring-[#D44C47]" : ""}`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{ev.summary}</span>
                            {ev.hasConflict && (
                              <span className="inline-flex items-center gap-1 rounded bg-[#D44C47] px-1.5 py-0.2 text-[9px] font-semibold text-white">
                                <AlertCircle className="h-2.5 w-2.5" /> Conflict
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] opacity-80 flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            {s && e
                              ? `${s.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })} – ${e.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : "All Day"}
                          </div>
                        </div>
                        <span className="rounded bg-white/70 px-2 py-0.5 text-[11px] font-medium">
                          {categoryLabels[ev.aiCategory || "COLLABORATION"]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white select-none">
      {/* Subtle Notion Status & Category Bar */}
      <div className="flex items-center justify-between border-b border-[#E9E9E7] bg-[#FBFBFA] px-5 py-1.5 text-[11px] text-[#787774]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-[#448361]" />
            Client / Key Decision
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-[#6940A5]" />
            Deep Work
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-[#337EA9]" />
            Team Sync
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-xs bg-[#D9730D]" />
            Routine / Flexible
          </span>
        </div>
        <span className="text-[#9B9A97]">
          Click event to open AI Brief · Click slot to create
        </span>
      </div>

      {/* Notion Calendar Header Row */}
      <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-[#E9E9E7] bg-white">
        <div className="py-2.5 pr-2 text-right text-[10px] font-medium text-[#9B9A97] border-r border-[#E9E9E7]">
          GMT+5:30
        </div>
        {days.map((day) => {
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div
              key={day.toISOString()}
              className="flex items-center justify-center gap-1.5 py-2.5 border-r border-[#E9E9E7]"
            >
              <span
                className={`text-xs font-medium ${
                  isToday ? "text-[#EB5757]" : "text-[#787774]"
                }`}
              >
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${
                  isToday
                    ? "bg-[#EB5757] text-white"
                    : "text-[#37352F]"
                }`}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Scrollable Hour Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[60px_repeat(5,1fr)] relative min-h-[1024px]">
          {/* Left Time Column */}
          <div className="border-r border-[#E9E9E7] bg-white">
            {hours.map((hr) => (
              <div
                key={hr}
                className="h-16 pr-2 -mt-2 text-right text-[10px] font-medium text-[#9B9A97]"
              >
                {hr === 12 ? "12 PM" : hr > 12 ? `${hr - 12} PM` : `${hr} AM`}
              </div>
            ))}
          </div>

          {/* 5 Workweek Columns */}
          {days.map((day) => {
            const dayEvents = events.filter((ev) => {
              if (!ev.start.dateTime) return false;
              const d = new Date(ev.start.dateTime);
              return (
                d.getFullYear() === day.getFullYear() &&
                d.getMonth() === day.getMonth() &&
                d.getDate() === day.getDate()
              );
            });

            return (
              <div
                key={day.toISOString()}
                className="relative border-r border-[#E9E9E7]"
              >
                {hours.map((hr) => (
                  <div
                    key={hr}
                    onClick={() => {
                      const clickedSlot = new Date(day);
                      clickedSlot.setHours(hr, 0, 0, 0);
                      onQuickCreateSlot(clickedSlot.toISOString());
                    }}
                    className="h-16 border-b border-[#F1F1EF] hover:bg-[#F7F6F3]/70 cursor-pointer transition"
                  />
                ))}

                {dayEvents.map((ev, index) => {
                  const startDt = new Date(ev.start.dateTime!);
                  const endDt = new Date(
                    ev.end.dateTime || startDt.getTime() + 3600000
                  );

                  const startHourDecimal =
                    startDt.getHours() + startDt.getMinutes() / 60;
                  const endHourDecimal =
                    endDt.getHours() + endDt.getMinutes() / 60;

                  const clampedStart = Math.max(8, Math.min(23.5, startHourDecimal));
                  const durationHours = Math.max(
                    0.5,
                    Math.min(24 - clampedStart, endHourDecimal - startHourDecimal)
                  );

                  const topPx = (clampedStart - 8) * 64;
                  const heightPx = Math.max(30, durationHours * 64 - 2);

                  const isSecondInConflict =
                    ev.hasConflict &&
                    dayEvents.findIndex(
                      (other) =>
                        other.id !== ev.id &&
                        ev.conflictingWithIds?.includes(other.id)
                    ) < index;

                  return (
                    <div
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: isSecondInConflict ? "50%" : "3px",
                        right: ev.hasConflict && !isSecondInConflict ? "50%" : "3px",
                      }}
                      className={`absolute z-10 cursor-pointer overflow-hidden rounded-[5px] px-2 py-1 transition ${
                        categoryStyles[ev.aiCategory || "COLLABORATION"]
                      } ${
                        ev.hasConflict
                          ? "ring-1 ring-[#D44C47]"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[11px] font-semibold leading-tight line-clamp-2">
                          {ev.summary}
                        </span>
                        {ev.hasConflict && (
                          <span className="shrink-0 rounded-[3px] bg-[#D44C47] px-1 py-0.2 text-[8px] font-semibold text-white">
                            CLASH
                          </span>
                        )}
                      </div>
                      {heightPx >= 42 && (
                        <div className="mt-0.5 text-[10px] opacity-75">
                          {startDt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {endDt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
