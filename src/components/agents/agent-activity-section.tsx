"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiClock, FiRefreshCw } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type EventType = "message_in" | "reply_out" | "tool_use" | "error" | "system";

interface ActivityEvent {
  timestamp: string;
  type: EventType;
  summary: string;
}

interface AgentActivitySectionProps {
  serverId: string;
  agentName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ANSI_RE = /\x1B\[[0-9;]*[a-zA-Z]/g;
const EXTRA_CODES_RE = /\[?[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "").replace(EXTRA_CODES_RE, "");
}

const TS_RE = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/;

const TYPE_PATTERNS: { type: EventType; re: RegExp }[] = [
  { type: "error", re: /\b(error|failed|exception|crash|fatal|panic)\b/i },
  { type: "tool_use", re: /\b(tool_use|calling tool|executing tool|tool call|tool_result)\b/i },
  { type: "message_in", re: /\b(received|incoming|from user|new message|user message)\b/i },
  { type: "reply_out", re: /\b(sending|reply|response sent|outgoing|assistant message|delivered)\b/i },
  { type: "system", re: /\b(started|stopped|restart|connected|disconnect|shutdown|boot|init|ready)\b/i },
];

function classifyLine(line: string): EventType | null {
  for (const { type, re } of TYPE_PATTERNS) {
    if (re.test(line)) return type;
  }
  return null;
}

function parseLogs(raw: string): ActivityEvent[] {
  const cleaned = stripAnsi(raw);
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
  const events: ActivityEvent[] = [];

  for (const line of lines) {
    const type = classifyLine(line);
    if (!type) continue;

    const tsMatch = line.match(TS_RE);
    const timestamp = tsMatch ? tsMatch[1] : "";

    // Build summary: take the relevant portion after timestamp
    let summary = line;
    if (tsMatch && tsMatch.index != null) {
      summary = line.slice(tsMatch.index + tsMatch[1].length).trim();
    }
    // Trim leading separators
    summary = summary.replace(/^[:\-|\s]+/, "").trim();
    // Truncate long summaries
    if (summary.length > 120) summary = summary.slice(0, 117) + "...";

    events.push({ timestamp, type, summary });
  }

  return events.reverse().slice(0, 50);
}

function formatRelativeTime(ts: string): string {
  if (!ts) return "";
  const date = new Date(ts.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return ts;
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const DOT_COLOR: Record<EventType, string> = {
  message_in: "bg-green-400",
  reply_out: "bg-blue-400",
  tool_use: "bg-purple-400",
  error: "bg-red-400",
  system: "bg-gray-400",
};

const TYPE_LABEL: Record<EventType, string> = {
  message_in: "Message",
  reply_out: "Reply",
  tool_use: "Tool",
  error: "Error",
  system: "System",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentActivitySection({
  serverId,
  agentName,
}: AgentActivitySectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await executeCommandApi(
        serverId,
        `docker logs --tail 200 ${agentName}-openclaw-gateway-1 2>&1`,
      );
      const raw = result.stdout || result.stderr || "";
      setEvents(parseLogs(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch activity");
      setEvents([]);
    }
    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData();
  }, [expanded, loadData]);

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiClock size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Activity
        </span>
        <FiChevronRight
          size={14}
          className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`}
        />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading && events.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : events.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">
                No recognizable activity in recent logs.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Refresh */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      loadedRef.current = false;
                      loadData();
                    }}
                    disabled={loading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                  >
                    <FiRefreshCw
                      size={11}
                      className={loading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>

                {/* Timeline */}
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {events.map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-canvas-surface-hover"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[ev.type]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-canvas-muted">
                            {TYPE_LABEL[ev.type]}
                          </span>
                          {ev.timestamp && (
                            <span className="text-[10px] text-canvas-muted">
                              {formatRelativeTime(ev.timestamp)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-canvas-fg">
                          {ev.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
