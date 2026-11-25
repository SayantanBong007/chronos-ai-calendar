"use client";

import React from "react";
import {
  X,
  Brain,
  Sparkles,
  ArrowRight,
  Clock,
  AlertCircle,
  TrendingUp,
  Layers,
  Cpu,
} from "lucide-react";

interface CaseStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CaseStudyModal({ isOpen, onClose }: CaseStudyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4">
      <div className="relative w-full max-w-3xl max-h-[86vh] overflow-y-auto rounded-xl bg-white border border-[#E9E9E7] text-[#37352F] shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E9E9E7] bg-[#FBFBFA] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E9E9E7] bg-white text-[#6940A5] shadow-2xs">
              <Brain className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
                Product Strategy &amp; System Architecture
              </span>
              <h2 className="text-base font-bold text-[#37352F]">
                Reimagining Google Calendar for Business Users (10x AI Value)
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 p-6">
          {/* 1. Core Problem */}
          <section className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#37352F] flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[#6940A5]" />
              1. The Core Problem with Traditional Calendars
            </h3>
            <p className="text-xs text-[#787774] leading-relaxed">
              Standard calendars act as a <strong className="text-[#37352F]">passive 2D time grid</strong>. They record <em>when</em> a user is busy, but lack awareness of <strong className="text-[#37352F]">business priority</strong>, <strong className="text-[#37352F]">schedule fragmentation</strong>, or <strong className="text-[#37352F]">meeting preparation &amp; follow-through</strong>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
                <div className="text-xs font-semibold text-[#9F2F2D] mb-1 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> No Priority Context
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  High-stakes client calls and optional status syncs appear identical. Double-bookings must be triaged manually.
                </p>
              </div>
              <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
                <div className="text-xs font-semibold text-[#D9730D] mb-1 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Fragmented Workdays
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Scattered 30-minute meetings create small, unusable gaps that prevent uninterrupted deep work.
                </p>
              </div>
              <div className="rounded-md border border-[#E9E9E7] bg-white p-3">
                <div className="text-xs font-semibold text-[#448361] mb-1 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Missing Lifecycle
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Most invites lack structured agendas, and post-meeting action items rarely get blocked on the calendar.
                </p>
              </div>
            </div>
          </section>

          {/* 2. 10x AI Pillars */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#37352F] flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-[#6940A5]" />
              2. The 10x AI-Native Solution
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-1">
                <div className="text-xs font-semibold text-[#37352F]">
                  A. Natural Language &amp; Voice Copilot
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Create, reschedule, rename, or cancel events by typing or speaking natural commands, including contextual follow-ups (<em>&ldquo;on Friday not today&rdquo;</em>, <em>&ldquo;make it 2pm to 4pm&rdquo;</em>).
                </p>
              </div>
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-1">
                <div className="text-xs font-semibold text-[#37352F]">
                  B. Semantic Priority &amp; 1-Click Conflict Resolution
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Automatically categorizes events (<em>Client / Key Decision</em>, <em>Deep Work</em>, <em>Team Sync</em>, <em>Flexible Sync</em>), detects overlaps, and moves the lower-priority meeting to the next open slot in 1 click.
                </p>
              </div>
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-1">
                <div className="text-xs font-semibold text-[#37352F]">
                  C. Schedule Health &amp; Focus Block Shield
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Audits weekly Deep Work vs. Meeting hours, computes a Schedule Health Score (0–100), and identifies open 2-hour morning windows to protect maker time.
                </p>
              </div>
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-4 space-y-1">
                <div className="text-xs font-semibold text-[#37352F]">
                  D. Pre-Meeting Agendas &amp; Post-Meeting Action Blocker
                </div>
                <p className="text-[11px] text-[#787774] leading-relaxed">
                  Generates a structured 3-point timed agenda saved directly to the calendar invite, and converts post-meeting takeaway notes into scheduled 45-minute execution blocks.
                </p>
              </div>
            </div>
          </section>

          {/* 3. Technical Architecture */}
          <section className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#37352F] flex items-center gap-2">
              <Cpu className="h-3.5 w-3.5 text-[#6940A5]" />
              3. Technical Architecture
            </h3>
            <p className="text-xs text-[#787774] leading-relaxed">
              Built with <strong className="text-[#37352F]">Next.js (App Router + TypeScript)</strong>, <strong className="text-[#37352F]">Google Identity Services OAuth 2.0</strong>, <strong className="text-[#37352F]">Google Calendar REST API v3</strong>, and a native <strong className="text-[#37352F]">Gemini 2.5 Flash Function-Calling Agent Loop</strong> paired with a deterministic Natural Language Date/Time Parser and Web Speech API voice input.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium bg-white p-3 rounded-md border border-[#E9E9E7] text-[#37352F]">
              <span className="px-2 py-1 rounded bg-[#F7F6F3]">
                1. Voice / Text Input + Live Calendar Context
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#9B9A97]" />
              <span className="px-2 py-1 rounded bg-[#F3F0F8] text-[#5A398E]">
                2. Gemini Tool Calling &amp; NL Parser
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#9B9A97]" />
              <span className="px-2 py-1 rounded bg-[#EDF3EC] text-[#2B5339]">
                3. Live Google Calendar API v3 Sync
              </span>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#E9E9E7] bg-[#FBFBFA] px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md bg-[#37352F] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#2F2D28] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
