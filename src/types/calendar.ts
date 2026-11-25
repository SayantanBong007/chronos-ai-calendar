export type EventPriorityCategory =
  | "HIGH_ROI"
  | "DEEP_WORK"
  | "COLLABORATION"
  | "LOW_ROI_SYNC";

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export interface GCalEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: CalendarAttendee[];
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  // Enriched AI metadata computed by our engine
  aiCategory?: EventPriorityCategory;
  aiPriorityScore?: number; // 1 to 100
  aiEstimatedCost?: number; // Estimated team dollar cost
  aiReason?: string;
  hasConflict?: boolean;
  conflictingWithIds?: string[];
}

export interface ConflictResolutionSuggestion {
  id: string;
  eventA: GCalEvent;
  eventB: GCalEvent;
  keepEvent: GCalEvent;
  moveEvent: GCalEvent;
  suggestedStart: string;
  suggestedEnd: string;
  reason: string;
}

export interface FocusBlockSuggestion {
  id: string;
  dayLabel: string;
  dateStr: string;
  start: string;
  end: string;
  durationMinutes: number;
  reason: string;
}

export interface ScheduleAuditReport {
  deepWorkScore: number; // 0 to 100
  totalMeetingHours: number;
  deepWorkHours: number;
  highRoiHours: number;
  lowRoiHours: number;
  estimatedWeeklyMeetingCost: number;
  fragmentedDaysCount: number;
  conflicts: ConflictResolutionSuggestion[];
  suggestedFocusBlocks: FocusBlockSuggestion[];
  executiveSummary: string;
}

export interface AgentToolExecutionLog {
  toolName: string;
  args: Record<string, unknown>;
  resultSummary: string;
  status: "success" | "error";
}
