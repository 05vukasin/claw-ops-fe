"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiClock, FiRefreshCw } from "react-icons/fi";
import { readFileApi, listFilesApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type EventType = "user_message" | "assistant_reply" | "tool_use" | "cron" | "system";

interface ActivityEvent {
  timestamp: string;
  type: EventType;
  summary: string;
  channel?: string;
  sessionKey?: string;
}

interface AgentActivitySectionProps {
  serverId: string;
  agentName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(ts: string): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatAbsoluteTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return ts;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      // Extract the actual user message from Slack/Telegram wrapper
      const text: string = block.text;
      // Pattern: "System: [...] Slack DM from ...: <actual message>\n..."
      // The real message is usually the last line or after the metadata block
      const lastLine = text.split("\n").filter((l: string) => l.trim()).pop() ?? text;
      // If it starts with the Slack wrapper, extract just the user's words
      const slackMatch = text.match(/(?:Slack|Telegram)\s+(?:DM|message|channel)\s+from\s+\S+:\s*(.+?)(?:\n|$)/i);
      if (slackMatch) return slackMatch[1].trim();
      // Otherwise return last meaningful line (skip metadata blocks)
      if (lastLine.startsWith("```")) return text.split("\n")[0];
      return lastLine.length > 200 ? lastLine.slice(0, 197) + "..." : lastLine;
    }
  }
  return "";
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") {
      let text: string = block.text;
      // Remove reply markers like [[reply_to_current]]
      text = text.replace(/\[\[.*?\]\]\s*/g, "").trim();
      return text.length > 200 ? text.slice(0, 197) + "..." : text;
    }
    if (block?.type === "toolCall") {
      return `Tool: ${block.name ?? "unknown"}`;
    }
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonlMessages(raw: string, channel: string, sessionKey: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const lines = raw.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.type !== "message") continue;

      const msg = record.message;
      if (!msg?.role) continue;
      const ts = record.timestamp ?? "";

      if (msg.role === "user") {
        const text = extractUserText(msg.content);
        if (!text) continue;
        events.push({
          timestamp: ts,
          type: "user_message",
          summary: text,
          channel,
          sessionKey,
        });
      } else if (msg.role === "assistant") {
        const text = extractAssistantText(msg.content);
        if (!text) continue;
        // Check if it's a tool call
        const hasToolCall = Array.isArray(msg.content) &&
          msg.content.some((b: { type: string }) => b?.type === "toolCall");
        events.push({
          timestamp: ts,
          type: hasToolCall ? "tool_use" : "assistant_reply",
          summary: text,
          channel,
          sessionKey,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

const DOT_COLOR: Record<EventType, string> = {
  user_message: "bg-green-400",
  assistant_reply: "bg-blue-400",
  tool_use: "bg-purple-400",
  cron: "bg-yellow-400",
  system: "bg-gray-400",
};

const TYPE_LABEL: Record<EventType, string> = {
  user_message: "User",
  assistant_reply: "Reply",
  tool_use: "Tool",
  cron: "Cron",
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

  const sessionsPath = `/root/openclaw-agents/${agentName}/config/agents/main/sessions/`;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Read sessions.json to find active sessions
      const sessionsRaw = await readFileApi(
        serverId,
        `${sessionsPath}sessions.json`,
      );
      const sessions = JSON.parse(sessionsRaw);

      // 2. Find JSONL files available
      const files = await listFilesApi(serverId, sessionsPath);
      const jsonlFiles = files
        .filter((f) => f.name.endsWith(".jsonl") && !f.name.includes(".reset.") && !f.name.includes(".deleted."))
        .map((f) => f.name);

      // 3. Build a map of sessionId -> metadata from sessions.json
      const sessionMeta: Record<string, { channel: string; key: string; updatedAt: number }> = {};
      for (const [key, val] of Object.entries(sessions)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = val as any;
        if (v.sessionId) {
          // Skip duplicate run keys (cron run references)
          if (key.includes(":run:")) continue;
          const channel = v.lastChannel || v.origin?.surface || "unknown";
          const isCron = key.includes(":cron:");
          sessionMeta[v.sessionId] = {
            channel: isCron ? `cron (${key.split(":cron:")[1]?.split(":")[0] ?? "job"})` : channel,
            key,
            updatedAt: v.updatedAt ?? 0,
          };
        }
      }

      // 4. Read the most recent JSONL files (limit to avoid loading too much)
      // Sort by matching updatedAt, take the 5 most recently active
      const sessionIds = Object.keys(sessionMeta);
      const sortedIds = sessionIds
        .filter((id) => jsonlFiles.includes(`${id}.jsonl`))
        .sort((a, b) => (sessionMeta[b]?.updatedAt ?? 0) - (sessionMeta[a]?.updatedAt ?? 0))
        .slice(0, 5);

      const allEvents: ActivityEvent[] = [];

      const reads = await Promise.allSettled(
        sortedIds.map((id) =>
          readFileApi(serverId, `${sessionsPath}${id}.jsonl`),
        ),
      );

      for (let i = 0; i < reads.length; i++) {
        const res = reads[i];
        const id = sortedIds[i];
        const meta = sessionMeta[id];
        if (res.status === "fulfilled") {
          const parsed = parseJsonlMessages(res.value, meta?.channel ?? "unknown", meta?.key ?? id);
          allEvents.push(...parsed);
        }
      }

      // Sort all events by timestamp descending, take most recent 100
      allEvents.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime() || 0;
        const tb = new Date(b.timestamp).getTime() || 0;
        return tb - ta;
      });

      setEvents(allEvents.slice(0, 100));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch activity",
      );
      setEvents([]);
    }
    setLoading(false);
  }, [serverId, agentName, sessionsPath]);

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
              <p className="text-[11px] text-canvas-muted">
                Loading conversations...
              </p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : events.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">
                No conversation history found.
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
                <div className="max-h-80 space-y-0.5 overflow-y-auto">
                  {events.map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-canvas-surface-hover"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[ev.type]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-canvas-muted">
                            {TYPE_LABEL[ev.type]}
                          </span>
                          {ev.channel && (
                            <span className="rounded bg-canvas-surface-hover px-1 py-0.5 text-[9px] text-canvas-muted">
                              {ev.channel}
                            </span>
                          )}
                          {ev.timestamp && (
                            <span
                              className="ml-auto shrink-0 text-[10px] text-canvas-muted"
                              title={formatAbsoluteTime(ev.timestamp)}
                            >
                              {formatRelativeTime(ev.timestamp)}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-canvas-fg">
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
