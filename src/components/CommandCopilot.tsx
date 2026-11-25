"use client";

import React, { useState, useRef } from "react";
import { GCalEvent, AgentToolExecutionLog } from "@/types/calendar";
import { CalendarMutationOp } from "@/app/api/ai/agent/route";
import {
  Mic,
  MicOff,
  ArrowUp,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";

interface CommandCopilotProps {
  accessToken: string;
  geminiApiKey: string;
  currentEvents: GCalEvent[];
  onApplyMutations: (mutations: CalendarMutationOp[], toastMsg: string) => void;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolLogs?: AgentToolExecutionLog[];
}

export default function CommandCopilot({
  accessToken,
  geminiApiKey,
  currentEvents,
  onApplyMutations,
}: CommandCopilotProps) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string>("");
  const [lastModifiedEventId, setLastModifiedEventId] = useState<string>("");
  const latestTranscriptRef = useRef<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Ask me to schedule meetings, resolve conflicts, or protect deep work blocks.",
    },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const quickPrompts = [
    "Fix my clashing meetings",
    "Block 2h tomorrow morning for Focus Work",
    "Book a 30m call with Rahul tomorrow at 3 PM",
    "How is my time split this week?",
  ];

  const handleSendCommand = async (promptText?: string) => {
    const query = (promptText ?? input).trim();
    if (!query || isRunning) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: query,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!promptText) setInput("");
    setIsRunning(true);

    try {
      const res = await fetch("/api/ai/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-gcal-token": accessToken,
          "x-gemini-key": geminiApiKey,
        },
        body: JSON.stringify({
          prompt: query,
          currentEvents,
          currentTimeIso: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
          lastModifiedEventId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to run AI command");
      }

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        text: data.reply,
        toolLogs: data.toolLogs || [],
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (data.mutations && data.mutations.length > 0) {
        const lastMut = data.mutations[data.mutations.length - 1];
        if (lastMut.event?.id) {
          setLastModifiedEventId(lastMut.event.id);
        }
        onApplyMutations(
          data.mutations,
          data.toolLogs?.[0]?.resultSummary || "Calendar updated"
        );
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Error running command";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          text: `⚠️ ${errMsg}`,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleVoiceAssistant = async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceStatus("");
      return;
    }

    if (typeof window === "undefined") return;

    // 1. Check HTTPS / Secure Context requirement in production
    if (!window.isSecureContext) {
      alert(
        "Voice recognition requires HTTPS in production (or http://localhost). Please open your https:// deployment URL."
      );
      return;
    }

    // 2. Check Web Speech API support
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert(
        "Voice recognition is supported in Google Chrome and Microsoft Edge. Please open this page in Chrome or Edge."
      );
      return;
    }

    // 3. Explicitly request Microphone permission first so production browsers prompt cleanly
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release the raw stream immediately so SpeechRecognition can take the mic
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch {
      alert(
        "Microphone permission was blocked. Please click the Lock/Tune icon in your browser address bar, allow Microphone access, and try again."
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = navigator.language || "en-US";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      latestTranscriptRef.current = "";
      setVoiceStatus("Listening... speak now");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = "";
        let finalTxt = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTxt += piece;
          } else {
            interim += piece;
          }
        }
        const combined = (finalTxt || interim).trim();
        if (combined) {
          latestTranscriptRef.current = combined;
          setInput(combined);
        }
        if (finalTxt.trim()) {
          setIsListening(false);
          setVoiceStatus("");
          recognition.stop();
          handleSendCommand(finalTxt.trim());
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        const errCode = event?.error || "unknown";
        setIsListening(false);
        if (errCode === "not-allowed" || errCode === "service-not-allowed") {
          setVoiceStatus("Mic blocked — allow mic in browser address bar");
        } else if (errCode === "no-speech") {
          setVoiceStatus("No speech detected — tap mic and speak");
        } else {
          setVoiceStatus(`Voice error (${errCode}) — try Chrome/Edge`);
        }
        setTimeout(() => setVoiceStatus(""), 4000);
      };

      recognition.onend = () => {
        setIsListening(false);
        setVoiceStatus("");
        // If user spoke interim words and stopped before isFinal fired, auto-submit what we captured!
        if (latestTranscriptRef.current.trim()) {
          const captured = latestTranscriptRef.current.trim();
          latestTranscriptRef.current = "";
          handleSendCommand(captured);
        }
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setVoiceStatus("Could not start microphone");
    }
  };

  return (
    <aside className="flex flex-col w-80 shrink-0 border-l border-[#E9E9E7] bg-[#FBFBFA] text-[#37352F]">
      {/* AI Header */}
      <div className="flex items-center justify-between border-b border-[#E9E9E7] px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#6940A5]" />
          <h2 className="text-xs font-semibold text-[#37352F]">Chronos AI Assistant</h2>
        </div>
        <span className="rounded bg-[#F3F0F8] px-1.5 py-0.5 text-[10px] font-medium text-[#6940A5]">
          Copilot
        </span>
      </div>

      {/* Quick Prompts */}
      <div className="border-b border-[#E9E9E7] px-3.5 py-2.5 space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#787774]">
          Suggested
        </div>
        <div className="flex flex-col gap-1">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSendCommand(qp)}
              disabled={isRunning}
              className="rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1.5 text-left text-[11px] text-[#37352F] hover:bg-[#F1F1EF] disabled:opacity-40 transition"
            >
              {qp}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-[#37352F] text-white"
                  : "border border-[#E9E9E7] bg-white text-[#37352F] shadow-2xs"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.text}</div>

              {m.toolLogs && m.toolLogs.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-[#F1F1EF] pt-1.5">
                  {m.toolLogs.map((log, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded bg-[#EDF3EC] px-2 py-1 text-[10px] font-medium text-[#2B5339]"
                    >
                      <Check className="h-3 w-3 text-[#448361] shrink-0" />
                      <span>{log.resultSummary}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-xs text-[#787774] bg-white border border-[#E9E9E7] rounded-lg px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#6940A5]" />
            <span>Thinking...</span>
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="border-t border-[#E9E9E7] bg-white p-3 space-y-1.5">
        {voiceStatus && (
          <div className="flex items-center justify-between rounded bg-[#F3F0F8] px-2.5 py-1 text-[11px] font-medium text-[#6940A5]">
            <span>🎙️ {voiceStatus}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 rounded-lg border border-[#E9E9E7] bg-[#FBFBFA] px-2 py-1.5 focus-within:border-[#37352F] focus-within:bg-white transition">
          <button
            type="button"
            onClick={toggleVoiceAssistant}
            disabled={isRunning}
            title="Voice input"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
              isListening
                ? "bg-[#EB5757] text-white animate-pulse"
                : "text-[#787774] hover:bg-[#EFEFEF] hover:text-[#37352F]"
            }`}
          >
            {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendCommand();
            }}
            disabled={isRunning}
            placeholder={isListening ? "Listening..." : "Ask AI anything..."}
            className="flex-1 bg-transparent px-1 text-xs text-[#37352F] placeholder-[#9B9A97] focus:outline-none"
          />

          <button
            type="button"
            onClick={() => handleSendCommand()}
            disabled={isRunning || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#37352F] text-white hover:bg-[#2F2D28] disabled:opacity-30 transition"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
