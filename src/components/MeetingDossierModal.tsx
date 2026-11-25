"use client";

import React, { useState, useEffect } from "react";
import { GCalEvent } from "@/types/calendar";
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  Tag,
} from "lucide-react";

interface MeetingDossierModalProps {
  event: GCalEvent | null;
  allEvents: GCalEvent[];
  accessToken: string;
  geminiApiKey: string;
  onClose: () => void;
  onUpdateEventLocalOrRemote: (updated: GCalEvent, msg: string) => void;
  onCreateEventLocalOrRemote: (created: GCalEvent, msg: string) => void;
  onDeleteEventLocalOrRemote: (eventId: string, msg: string) => void;
}

export default function MeetingDossierModal({
  event,
  allEvents,
  accessToken,
  geminiApiKey,
  onClose,
  onUpdateEventLocalOrRemote,
  onCreateEventLocalOrRemote,
  onDeleteEventLocalOrRemote,
}: MeetingDossierModalProps) {
  const [generatedBrief, setGeneratedBrief] = useState<string>("");
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [postCallNotes, setPostCallNotes] = useState("");
  const [isSchedulingAction, setIsSchedulingAction] = useState(false);

  useEffect(() => {
    setGeneratedBrief("");
    setPostCallNotes("");
  }, [event?.id]);

  if (!event) return null;

  const startDt = event.start.dateTime ? new Date(event.start.dateTime) : null;
  const endDt = event.end.dateTime ? new Date(event.end.dateTime) : null;

  const handleGenerateBrief = async () => {
    setIsGeneratingBrief(true);
    try {
      const res = await fetch("/api/ai/brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gcal-token": accessToken,
          "x-gemini-key": geminiApiKey,
        },
        body: JSON.stringify({
          mode: "generate_agenda",
          event,
          saveToGCal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate agenda");

      setGeneratedBrief(data.brief);
      if (data.updatedEvent) {
        onUpdateEventLocalOrRemote(
          data.updatedEvent,
          `Saved AI Agenda to "${event.summary}"`
        );
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error generating brief");
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const handleScheduleFollowUp = async () => {
    if (!postCallNotes.trim()) return;
    setIsSchedulingAction(true);
    try {
      const res = await fetch("/api/ai/brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gcal-token": accessToken,
          "x-gemini-key": geminiApiKey,
        },
        body: JSON.stringify({
          mode: "schedule_action_item",
          rawNotes: postCallNotes,
          event,
          currentEvents: allEvents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule task");

      setPostCallNotes("");
      if (data.createdBlock) {
        onCreateEventLocalOrRemote(data.createdBlock, data.message);
      }
      onClose();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error scheduling task");
    } finally {
      setIsSchedulingAction(false);
    }
  };

  const handleDelete = async () => {
    if (
      accessToken &&
      accessToken.startsWith("ya29.") &&
      !event.id.startsWith("demo-") &&
      !event.id.startsWith("local-")
    ) {
      await fetch(`/api/calendar?eventId=${encodeURIComponent(event.id)}`, {
        method: "DELETE",
        headers: { "x-gcal-token": accessToken },
      });
    }
    onDeleteEventLocalOrRemote(event.id, `Deleted "${event.summary}"`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/20 backdrop-blur-[1px]">
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-[#E9E9E7] bg-white text-[#37352F] shadow-xl">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[#E9E9E7] px-6 py-3.5">
          <span className="text-xs font-medium text-[#787774]">
            Event Page
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Notion Page Style Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-[#37352F] tracking-tight">
              {event.summary}
            </h2>

            {/* Notion Properties Table */}
            <div className="mt-4 space-y-2 border-y border-[#E9E9E7] py-3 text-xs">
              <div className="grid grid-cols-[100px_1fr] items-center">
                <span className="text-[#787774] flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Date
                </span>
                <span className="font-medium text-[#37352F]">
                  {startDt
                    ? startDt.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Today"}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center">
                <span className="text-[#787774] flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Time
                </span>
                <span className="font-medium text-[#37352F]">
                  {startDt && endDt
                    ? `${startDt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} – ${endDt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Flexible"}
                </span>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center">
                <span className="text-[#787774] flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> Priority
                </span>
                <div>
                  <span className="rounded bg-[#F1F1EF] px-2 py-0.5 text-[11px] font-medium text-[#37352F]">
                    {event.aiPriorityScore}/100 · {event.aiCategory?.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {event.hasConflict && (
            <div className="flex items-start gap-2 rounded-lg border border-[#F3D5D5] bg-[#FDEBEC]/60 p-3 text-xs text-[#9F2F2D]">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Conflict Detected:</strong> Overlaps with another event. Click{" "}
                <strong>Resolve Conflict</strong> in the left sidebar.
              </span>
            </div>
          )}

          {/* Description / Notes */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#787774]">
              Agenda &amp; Notes
            </label>
            <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-3.5 text-xs text-[#37352F] whitespace-pre-wrap leading-relaxed">
              {generatedBrief || event.description || "No agenda added yet."}
            </div>
          </div>

          {/* 1-Click AI Agenda Writer */}
          <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#37352F] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#6940A5]" />
              AI Agenda Generator
            </h3>
            <p className="text-[11px] text-[#787774]">
              Generate a structured 3-point timed agenda and key decision questions:
            </p>
            <button
              onClick={handleGenerateBrief}
              disabled={isGeneratingBrief}
              className="w-full flex items-center justify-center gap-1.5 rounded-md bg-[#37352F] px-3 py-2 text-xs font-medium text-white hover:bg-[#2F2D28] disabled:opacity-50 transition"
            >
              {isGeneratingBrief ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Generate &amp; Save Agenda
            </button>
          </div>

          {/* Post-Meeting Action Item Blocker */}
          <div className="rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#37352F]">
              Post-Meeting Follow-Up Blocker
            </h3>
            <p className="text-[11px] text-[#787774]">
              Type your action item and AI will block a 45-min slot on your calendar:
            </p>
            <textarea
              rows={2}
              value={postCallNotes}
              onChange={(e) => setPostCallNotes(e.target.value)}
              placeholder="e.g., Send Q4 proposal deck to Acme Corp..."
              className="w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-xs text-[#37352F] placeholder-[#9B9A97] focus:border-[#37352F] focus:outline-none"
            />
            <button
              onClick={handleScheduleFollowUp}
              disabled={isSchedulingAction || !postCallNotes.trim()}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-xs font-medium text-[#37352F] hover:bg-[#EFEFEF] disabled:opacity-40 transition"
            >
              {isSchedulingAction ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Calendar className="h-3.5 w-3.5 text-[#787774]" />
              )}
              Schedule 45m Execution Block
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E9E9E7] bg-[#FBFBFA] px-6 py-3">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#9F2F2D] hover:bg-[#FDEBEC] transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete event
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-[#E9E9E7] bg-white px-3.5 py-1.5 text-xs font-medium text-[#37352F] hover:bg-[#EFEFEF]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
