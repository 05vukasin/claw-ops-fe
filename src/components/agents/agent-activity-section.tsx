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
  channel?: string;
  sessionKey?: string;
  toolName?: string;
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

function extractToolName(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type === "toolCall") return block.name ?? null;
  }
  return null;
}

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
        events.push({ timestamp: ts, type: "user_message", channel, sessionKey });
      } else if (msg.role === "assistant") {
        const toolName = extractToolName(msg.content);
        events.push({
          timestamp: ts,
          type: toolName ? "tool_use" : "assistant_reply",
          toolName: toolName ?? undefined,
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
/*  Chart constants                                                    */
/* ------------------------------------------------------------------ */

const CHART_RANGES = ["7d", "14d", "30d"] as const;
type ChartRange = (typeof CHART_RANGES)[number];
const RANGE_DAYS: Record<ChartRange, number> = { "7d": 7, "14d": 14, "30d": 30 };

const CHART_COLORS = {
  user_message: "#4ade80",   // green-400
  assistant_reply: "#60a5fa", // blue-400
  tool_use: "#c084fc",       // purple-400
};
const CHART_LABELS: { key: keyof typeof CHART_COLORS; label: string }[] = [
  { key: "user_message", label: "User" },
  { key: "assistant_reply", label: "Reply" },
  { key: "tool_use", label: "Tool" },
];

interface DayBucket {
  date: string; // "Apr 3"
  user_message: number;
  assistant_reply: number;
  tool_use: number;
}

function bucketByDay(events: ActivityEvent[], days: number): DayBucket[] {
  const now = new Date();
  const buckets: DayBucket[] = [];

  // Create empty buckets for each day
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      user_message: 0,
      assistant_reply: 0,
      tool_use: 0,
    });
  }

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  for (const ev of events) {
    if (!ev.timestamp) continue;
    const evDate = new Date(ev.timestamp);
    if (Number.isNaN(evDate.getTime()) || evDate < cutoff) continue;

    const diffDays = Math.floor((now.getTime() - evDate.getTime()) / 86_400_000);
    const idx = days - 1 - diffDays;
    if (idx >= 0 && idx < buckets.length) {
      const key = ev.type as keyof typeof CHART_COLORS;
      if (key in CHART_COLORS) {
        buckets[idx][key]++;
      }
    }
  }

  return buckets;
}

/* ------------------------------------------------------------------ */
/*  ActivityChart (canvas-based stacked bar chart)                     */
/* ------------------------------------------------------------------ */

function ActivityChart({ events }: { events: ActivityEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [range, setRange] = useState<ChartRange>("7d");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const days = RANGE_DAYS[range];
    const buckets = bucketByDay(events, days);

    // HiDPI scaling
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = 140 * 2);
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = 140;

    const pad = { t: 12, r: 12, b: 28, l: 28 };
    const chartW = w - pad.l - pad.r;
    const chartH = h - pad.t - pad.b;

    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.classList.contains("dark");

    // Find max total per day for y-axis scaling
    const maxTotal = Math.max(
      1,
      ...buckets.map((b) => b.user_message + b.assistant_reply + b.tool_use),
    );

    // Round up to nice number for grid
    const gridMax = Math.ceil(maxTotal / 5) * 5 || 5;
    const gridLines = 4;

    // Draw horizontal grid lines + y-axis labels
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "right";

    for (let i = 0; i <= gridLines; i++) {
      const y = pad.t + (chartH * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      const val = Math.round(gridMax - (gridMax * i) / gridLines);
      ctx.fillText(String(val), pad.l - 4, y + 3);
    }

    // Bar dimensions
    const barGap = days <= 7 ? 6 : days <= 14 ? 3 : 2;
    const barW = Math.max(2, (chartW - barGap * (days - 1)) / days);

    // Draw stacked bars
    const stackOrder: (keyof typeof CHART_COLORS)[] = ["tool_use", "assistant_reply", "user_message"];

    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i];
      const x = pad.l + i * (barW + barGap);
      let yBottom = pad.t + chartH;

      for (const key of stackOrder) {
        const count = bucket[key];
        if (count <= 0) continue;
        const barH = (count / gridMax) * chartH;
        const yTop = yBottom - barH;

        ctx.fillStyle = CHART_COLORS[key];
        // Rounded top corners for the topmost segment
        const radius = Math.min(2, barW / 2);
        roundedRect(ctx, x, yTop, barW, barH, radius);
        ctx.fill();

        yBottom = yTop;
      }
    }

    // X-axis labels (show subset to avoid overlap)
    ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
    ctx.font = "9px system-ui, sans-serif";
    ctx.textAlign = "center";

    const labelEvery = days <= 7 ? 1 : days <= 14 ? 2 : 5;
    for (let i = 0; i < buckets.length; i++) {
      if (i % labelEvery !== 0 && i !== buckets.length - 1) continue;
      const x = pad.l + i * (barW + barGap) + barW / 2;
      ctx.fillText(buckets[i].date, x, h - pad.b + 14);
    }

    // Legend
    let legendX = pad.l;
    for (const { key, label } of CHART_LABELS) {
      ctx.fillStyle = CHART_COLORS[key];
      ctx.fillRect(legendX, h - 8, 8, 3);
      ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, legendX + 11, h - 4);
      legendX += ctx.measureText(label).width + 22;
    }
  }, [events, range]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on theme change
  useEffect(() => {
    const observer = new MutationObserver(() => draw());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div className="rounded-md border border-canvas-border">
      <div className="flex items-center gap-1 border-b border-canvas-border px-3 py-1.5">
        {CHART_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
              r === range
                ? "bg-canvas-fg text-canvas-bg"
                : "text-canvas-muted hover:text-canvas-fg"
            }`}
          >
            {r}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-canvas-muted">
          Messages / day
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 140 }}
      />
    </div>
  );
}

/** Draw a rect with rounded top corners only */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

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

      // Sort all events by timestamp descending
      allEvents.sort((a, b) => {
        const ta = new Date(a.timestamp).getTime() || 0;
        const tb = new Date(b.timestamp).getTime() || 0;
        return tb - ta;
      });

      setEvents(allEvents);
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
              <div className="space-y-4">
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

                {/* Chart */}
                <ActivityChart events={events} />

                {/* Timeline */}
                <div className="max-h-72 space-y-0.5 overflow-y-auto">
                  {events.slice(0, 100).map((ev, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-canvas-surface-hover"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${DOT_COLOR[ev.type]}`}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-canvas-muted">
                        {TYPE_LABEL[ev.type]}
                      </span>
                      {ev.toolName && (
                        <code className="rounded bg-canvas-surface-hover px-1 py-0.5 text-[9px] text-canvas-muted">
                          {ev.toolName}
                        </code>
                      )}
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
