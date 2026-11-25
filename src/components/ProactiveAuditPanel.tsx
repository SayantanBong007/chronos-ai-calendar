"use client";

import React, { useState } from "react";
import {
  ScheduleAuditReport,
  ConflictResolutionSuggestion,
  FocusBlockSuggestion,
} from "@/types/calendar";
import {
  AlertCircle,
  Sparkles,
  Brain,
  Clock,
  Check,
  ArrowRight,
  Loader2,
  Plus,
  Calendar as CalendarIcon,
} from "lucide-react";

interface ProactiveAuditPanelProps {
  audit: ScheduleAuditReport | null;
  weekStart: Date;
  onResolveConflict: (conflict: ConflictResolutionSuggestion) => Promise<void>;
  onInsertFocusBlock: (block: FocusBlockSuggestion) => Promise<void>;
}

export default function ProactiveAuditPanel({
  audit,
  weekStart,
  onResolveConflict,
  onInsertFocusBlock,
}: ProactiveAuditPanelProps) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [blockingFocusId, setBlockingFocusId] = useState<string | null>(null);

  const handleResolve = async (c: ConflictResolutionSuggestion) => {
    setResolvingId(c.id);
    try {
      await onResolveConflict(c);
    } finally {
      setResolvingId(null);
    }
  };

  const handleFocus = async (fb: FocusBlockSuggestion) => {
    setBlockingFocusId(fb.id);
    try {
      await onInsertFocusBlock(fb);
    } finally {
      setBlockingFocusId(null);
    }
  };

  const score = audit?.deepWorkScore || 0;

  // Mini month calendar days for Notion-style left sidebar
  const year = weekStart.getFullYear();
  const month = weekStart.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
  const miniDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <aside className="flex flex-col w-64 shrink-0 border-r border-[#E9E9E7] bg-[#FBFBFA] text-[#37352F] select-none overflow-y-auto px-3.5 py-4 space-y-6">
      {/* 1. Notion-style Mini Month Calendar */}
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between text-xs font-semibold text-[#37352F]">
          <span>
            {weekStart.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </span>
          <CalendarIcon className="h-3.5 w-3.5 text-[#787774]" />
        </div>
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-[#787774] pt-1">
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
          <span>Su</span>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
          {Array.from({ length: offset }).map((_, idx) => (
            <span key={`empty-${idx}`} />
          ))}
          {miniDays.map((d) => {
            const isToday =
              d === new Date().getDate() &&
              month === new Date().getMonth();
            const isInActiveWeek =
              d >= weekStart.getDate() && d <= weekStart.getDate() + 4;
            return (
              <span
                key={d}
                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md text-[11px] transition ${
                  isToday
                    ? "bg-[#EB5757] text-white font-semibold"
                    : isInActiveWeek
                    ? "bg-[#EFEFEF] text-[#37352F] font-medium"
                    : "text-[#787774] hover:bg-[#EFEFEF]"
                }`}
              >
                {d}
              </span>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-[#E9E9E7]" />

      {/* 2. Notion Property List: Time Audit */}
      <div className="space-y-2">
        <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
          Time Intelligence
        </div>
        <div className="rounded-lg border border-[#E9E9E7] bg-white p-3 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#787774]">Schedule Health</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                score >= 75
                  ? "bg-[#EDF3EC] text-[#346538]"
                  : score >= 55
                  ? "bg-[#FBF3DB] text-[#89632A]"
                  : "bg-[#FDEBEC] text-[#9F2F2D]"
              }`}
            >
              {score} / 100
            </span>
          </div>

          {/* Minimalist Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F1F1EF]">
            <div
              style={{ width: `${Math.min(100, score)}%` }}
              className={`h-full transition-all duration-300 ${
                score >= 75
                  ? "bg-[#448361]"
                  : score >= 55
                  ? "bg-[#D9730D]"
                  : "bg-[#D44C47]"
              }`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
            <div className="rounded-md bg-[#F7F6F3] px-2.5 py-2">
              <div className="text-[10px] text-[#787774] flex items-center gap-1">
                <Brain className="h-3 w-3 text-[#6940A5]" /> Deep Work
              </div>
              <div className="text-sm font-semibold text-[#37352F] mt-0.5">
                {audit?.deepWorkHours || 0}h
              </div>
            </div>
            <div className="rounded-md bg-[#F7F6F3] px-2.5 py-2">
              <div className="text-[10px] text-[#787774] flex items-center gap-1">
                <Clock className="h-3 w-3 text-[#337EA9]" /> Meetings
              </div>
              <div className="text-sm font-semibold text-[#37352F] mt-0.5">
                {audit?.totalMeetingHours || 0}h
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Conflict Triage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
            Conflicts
          </span>
          <span className="rounded bg-[#F1F1EF] px-1.5 py-0.2 text-[10px] font-semibold text-[#787774]">
            {audit?.conflicts.length || 0}
          </span>
        </div>

        {!audit || audit.conflicts.length === 0 ? (
          <div className="rounded-lg border border-[#E9E9E7] bg-white px-3 py-2.5 text-xs text-[#787774] flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-[#448361] shrink-0" />
            <span>No overlapping events</span>
          </div>
        ) : (
          <div className="space-y-2">
            {audit.conflicts.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-[#F3D5D5] bg-white p-3 space-y-2 shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#9F2F2D]">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Overlap Detected</span>
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Keep <strong className="text-[#37352F]">{c.keepEvent.summary}</strong> and move{" "}
                  <strong className="text-[#37352F]">{c.moveEvent.summary}</strong>:
                </p>
                <div className="rounded bg-[#F7F6F3] px-2 py-1.5 text-[11px] text-[#37352F] flex items-center justify-between">
                  <span className="truncate max-w-[100px] font-medium">
                    {c.moveEvent.summary}
                  </span>
                  <ArrowRight className="h-3 w-3 text-[#787774] shrink-0" />
                  <span className="font-semibold text-[#346538] shrink-0">
                    {new Date(c.suggestedStart).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <button
                  onClick={() => handleResolve(c)}
                  disabled={resolvingId === c.id}
                  className="w-full flex items-center justify-center gap-1.5 rounded-md bg-[#37352F] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#2F2D28] disabled:opacity-50 transition"
                >
                  {resolvingId === c.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Resolve Conflict
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Focus Time Suggestions */}
      <div className="space-y-2">
        <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
          Focus Blocks
        </div>
        {audit?.suggestedFocusBlocks.map((fb) => (
          <div
            key={fb.id}
            className="rounded-lg border border-[#E9E9E7] bg-white p-3 space-y-2 shadow-2xs"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#37352F]">{fb.dayLabel}</span>
              <span className="rounded bg-[#F3F0F8] px-1.5 py-0.5 text-[10px] font-medium text-[#5A398E]">
                {new Date(fb.start).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · 2h
              </span>
            </div>
            <p className="text-[11px] text-[#787774] leading-snug">{fb.reason}</p>
            <button
              onClick={() => handleFocus(fb)}
              disabled={blockingFocusId === fb.id}
              className="w-full flex items-center justify-center gap-1 rounded-md border border-[#E9E9E7] bg-[#F7F6F3] px-2.5 py-1.5 text-xs font-medium text-[#37352F] hover:bg-[#EFEFEF] disabled:opacity-50 transition"
            >
              {blockingFocusId === fb.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 text-[#787774]" />
              )}
              Protect 2h Block
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
