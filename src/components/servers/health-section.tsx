"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiChevronDown,
  FiChevronRight,
  FiRefreshCw,
} from "react-icons/fi";
import {
  fetchServerHealthApi,
  fetchLatestMetricsApi,
  fetchMetricTimeSeriesApi,
  triggerHealthCheckApi,
  type ServerHealth,
  type MonitoringMetric,
  type MonitoringState,
  type MetricDataPoint,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Badge colours per state                                            */
/* ------------------------------------------------------------------ */

const STATE_BADGE: Record<MonitoringState, string> = {
  HEALTHY: "bg-green-500/10 text-green-600 dark:text-green-400",
  WARNING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  CRITICAL: "bg-red-500/10 text-red-500 dark:text-red-400",
  UNREACHABLE: "bg-canvas-surface-hover text-canvas-muted",
  UNKNOWN: "bg-canvas-surface-hover text-canvas-muted",
  MAINTENANCE: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
};

/* ------------------------------------------------------------------ */
/*  Metric bar helper                                                  */
/* ------------------------------------------------------------------ */

function MetricBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">{label}</span>
        <span className="text-xs text-canvas-muted">&mdash;</span>
      </div>
    );
  }
  const color = value >= 95 ? "bg-red-500" : value >= 80 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">{label}</span>
        <span className="font-mono text-xs text-canvas-fg">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-surface-hover">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "\u2014";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const METRIC_LABELS: Record<string, string> = {
  CPU_USAGE_PERCENT: "CPU",
  MEMORY_USAGE_PERCENT: "Memory",
  DISK_USAGE_PERCENT: "Disk",
  LOAD_1M: "Load 1m",
  LOAD_5M: "Load 5m",
  LOAD_15M: "Load 15m",
  UPTIME_SECONDS: "Uptime",
  PROCESS_COUNT: "Processes",
  SWAP_USAGE_PERCENT: "Swap",
};

/* ------------------------------------------------------------------ */
/*  Chart component (canvas-based)                                     */
/* ------------------------------------------------------------------ */

const RANGES = ["1h", "6h", "24h", "7d"] as const;
type Range = (typeof RANGES)[number];

const RANGE_HOURS: Record<Range, number> = { "1h": 1, "6h": 6, "24h": 24, "7d": 168 };

const CHART_TYPES = ["CPU_USAGE_PERCENT", "MEMORY_USAGE_PERCENT", "DISK_USAGE_PERCENT"] as const;
const CHART_COLORS = ["#6c8aff", "#4ecdc4", "#ffd93d"];
const CHART_LABELS = ["CPU", "Memory", "Disk"];

function MiniChart({ serverId }: { serverId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [range, setRange] = useState<Range>("1h");

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hours = RANGE_HOURS[range];
    const from = new Date(Date.now() - hours * 3600_000).toISOString();
    const to = new Date().toISOString();

    const datasets = await Promise.all(
      CHART_TYPES.map(async (type) => {
        try {
          const ts = await fetchMetricTimeSeriesApi(serverId, type, from, to);
          return ts.dataPoints || [];
        } catch {
          return [] as MetricDataPoint[];
        }
      }),
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = 160 * 2);
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = 160;

    const pad = { t: 16, r: 12, b: 20, l: 32 };

    ctx.clearRect(0, 0, w, h);

    // Grid
    const isDark = document.documentElement.classList.contains("dark");
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${100 - 25 * i}%`, pad.l - 4, y + 3);
    }

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();

    datasets.forEach((points, idx) => {
      if (points.length === 0) return;
      ctx.strokeStyle = CHART_COLORS[idx];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      points.forEach((p, i) => {
        const t = new Date(p.timestamp).getTime();
        const x = pad.l + ((t - fromMs) / (toMs - fromMs)) * (w - pad.l - pad.r);
        const y = pad.t + (1 - p.value / 100) * (h - pad.t - pad.b);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Legend
    CHART_LABELS.forEach((l, i) => {
      const x = pad.l + i * 70;
      ctx.fillStyle = CHART_COLORS[i];
      ctx.fillRect(x, h - 10, 8, 2.5);
      ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(l, x + 12, h - 6);
    });
  }, [serverId, range]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="mt-3 rounded-md border border-canvas-border">
      <div className="flex items-center gap-1 border-b border-canvas-border px-3 py-1.5">
        {RANGES.map((r) => (
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
        <span className="ml-auto text-[10px] text-canvas-muted">CPU / Mem / Disk</span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: 160 }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Health Section                                                */
/* ------------------------------------------------------------------ */

interface HealthSectionProps {
  serverId: string;
}

export function HealthSection({ serverId }: HealthSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);

  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([]);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [h, m] = await Promise.all([
        fetchServerHealthApi(serverId),
        fetchLatestMetricsApi(serverId),
      ]);
      setHealth(h);
      setMetrics(m);
    } catch {
      /* ignore — section just shows nothing */
    }
    setLoading(false);
  }, [serverId]);

  // Load when section is expanded
  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      await triggerHealthCheckApi(serverId);
      // Reload after a short delay to let the check complete
      setTimeout(loadData, 3000);
    } catch { /* ignore */ }
    setChecking(false);
  }, [serverId, loadData]);

  return (
    <div className="border-b border-canvas-border">
      {/* Section toggle */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiActivity size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Health</span>
        {health && (
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATE_BADGE[health.overallState]}`}>
            {health.overallState}
          </span>
        )}
        {expanded ? (
          <FiChevronDown size={14} className="text-canvas-muted" />
        ) : (
          <FiChevronRight size={14} className="text-canvas-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-canvas-border px-5 py-4">
          {loading && !health ? (
            <p className="text-[11px] text-canvas-muted">Loading...</p>
          ) : health ? (
            <div className="space-y-4">
              {/* Quick stats row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_BADGE[health.overallState]}`}>
                    {health.overallState}
                  </span>
                  <span className="text-[11px] text-canvas-muted">
                    Last check: {formatAgo(health.lastCheckAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={checking}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                >
                  <FiRefreshCw size={11} className={checking ? "animate-spin" : ""} />
                  Check
                </button>
              </div>

              {/* Metric bars */}
              <div className="space-y-3">
                <MetricBar value={health.cpuUsage} label="CPU" />
                <MetricBar value={health.memoryUsage} label="Memory" />
                <MetricBar value={health.diskUsage} label="Disk" />
              </div>

              {/* Compact info row */}
              <div className="flex items-center gap-4 text-[11px] text-canvas-muted">
                {health.load1m != null && (
                  <span>Load: <span className="font-mono text-canvas-fg">{health.load1m.toFixed(2)}</span></span>
                )}
                <span>Uptime: <span className="font-mono text-canvas-fg">{formatUptime(health.uptimeSeconds)}</span></span>
              </div>

              {/* Expandable detailed metrics */}
              {metrics.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setDetailExpanded((p) => !p)}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
                  >
                    {detailExpanded ? <FiChevronDown size={11} /> : <FiChevronRight size={11} />}
                    All metrics ({metrics.length})
                  </button>

                  {detailExpanded && (
                    <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-canvas-border p-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {metrics.map((m, i) => {
                        const suffix = m.label ? ` (${m.label})` : "";
                        const name = (METRIC_LABELS[m.metricType] || m.metricType) + suffix;
                        const val = m.metricType.includes("PERCENT")
                          ? `${m.value.toFixed(1)}%`
                          : m.metricType === "UPTIME_SECONDS"
                            ? formatUptime(m.value)
                            : typeof m.value === "number"
                              ? m.value.toFixed(2)
                              : String(m.value);
                        return (
                          <div
                            key={`${m.metricType}-${m.label}-${i}`}
                            className="rounded-md border border-canvas-border px-3 py-2"
                          >
                            <p className="text-sm font-bold leading-tight text-canvas-fg">{val}</p>
                            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">
                              {name}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Chart */}
              <MiniChart serverId={serverId} />
            </div>
          ) : (
            <p className="text-[11px] text-canvas-muted">
              No health data available. Health checks may not be configured for this server.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
