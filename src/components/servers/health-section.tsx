"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiActivity,
  FiAlertTriangle,
  FiCheck,
  FiCheckCircle,
  FiChevronRight,
  FiGlobe,
  FiPlus,
  FiRefreshCw,
  FiSettings,
  FiTrash2,
  FiVolumeX,
  FiX,
} from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import {
  fetchServerHealthApi,
  fetchLatestMetricsApi,
  fetchMetricTimeSeriesApi,
  fetchMetricAggregationApi,
  triggerHealthCheckApi,
  fetchMonitoringProfileApi,
  updateMonitoringProfileApi,
  resetMonitoringProfileApi,
  fetchAlertEventsApi,
  fetchAlertRulesApi,
  createAlertRuleApi,
  deleteAlertRuleApi,
  acknowledgeAlertApi,
  resolveAlertApi,
  fetchEndpointChecksApi,
  createEndpointCheckApi,
  deleteEndpointCheckApi,
  triggerEndpointCheckApi,
  fetchMaintenanceWindowsApi,
  createMaintenanceWindowApi,
  deleteMaintenanceWindowApi,
  ApiError,
  type ServerHealth,
  type MonitoringMetric,
  type MonitoringState,
  type MetricDataPoint,
  type AlertEvent,
  type AlertRule,
  type EndpointCheck,
  type MonitoringProfile,
  type MaintenanceWindow,
  type MetricAggregation,
} from "@/lib/api";

/* ── Constants ── */

const STATE_BADGE: Record<MonitoringState, string> = {
  HEALTHY: "bg-green-500/10 text-green-600 dark:text-green-400",
  WARNING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  CRITICAL: "bg-red-500/10 text-red-500 dark:text-red-400",
  UNREACHABLE: "bg-canvas-surface-hover text-canvas-muted",
  UNKNOWN: "bg-canvas-surface-hover text-canvas-muted",
  MAINTENANCE: "bg-blue-500/10 text-blue-500 dark:text-blue-400",
};

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-500/10 text-red-500",
  HIGH: "bg-orange-500/10 text-orange-500",
  MEDIUM: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  LOW: "bg-blue-500/10 text-blue-500",
};

type HealthTab = "overview" | "alerts" | "endpoints" | "config";

/* ── Helpers ── */

function MetricBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">{label}</span>
      <span className="text-xs text-canvas-muted">&mdash;</span>
    </div>
  );
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
  CPU_USAGE_PERCENT: "CPU", MEMORY_USAGE_PERCENT: "Memory", DISK_USAGE_PERCENT: "Disk",
  LOAD_1M: "Load 1m", LOAD_5M: "Load 5m", LOAD_15M: "Load 15m",
  UPTIME_SECONDS: "Uptime", PROCESS_COUNT: "Processes", SWAP_USAGE_PERCENT: "Swap",
};

/* ── Mini Chart ── */

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
        try { const ts = await fetchMetricTimeSeriesApi(serverId, type, from, to); return ts.dataPoints || []; }
        catch { return [] as MetricDataPoint[]; }
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
    const isDark = document.documentElement.classList.contains("dark");
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
      ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(`${100 - 25 * i}%`, pad.l - 4, y + 3);
    }
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    datasets.forEach((points, idx) => {
      if (points.length === 0) return;
      ctx.strokeStyle = CHART_COLORS[idx]; ctx.lineWidth = 1.5; ctx.beginPath();
      points.forEach((p, i) => {
        const t = new Date(p.timestamp).getTime();
        const x = pad.l + ((t - fromMs) / (toMs - fromMs)) * (w - pad.l - pad.r);
        const y = pad.t + (1 - p.value / 100) * (h - pad.t - pad.b);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    CHART_LABELS.forEach((l, i) => {
      const x = pad.l + i * 70;
      ctx.fillStyle = CHART_COLORS[i]; ctx.fillRect(x, h - 10, 8, 2.5);
      ctx.fillStyle = isDark ? "#8b8fa3" : "#9ca3af";
      ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillText(l, x + 12, h - 6);
    });
  }, [serverId, range]);

  useEffect(() => { draw(); }, [draw]);

  return (
    <div className="mt-3 rounded-md border border-canvas-border">
      <div className="flex items-center gap-1 border-b border-canvas-border px-3 py-1.5">
        {RANGES.map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${r === range ? "bg-canvas-fg text-canvas-bg" : "text-canvas-muted hover:text-canvas-fg"}`}>
            {r}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-canvas-muted">CPU / Mem / Disk</span>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: 160 }} />
    </div>
  );
}

/* ── Tab Button ── */

function TabBtn({ active, onClick, children, badge }: { active: boolean; onClick: () => void; children: React.ReactNode; badge?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${active ? "bg-canvas-fg text-canvas-bg" : "text-canvas-muted hover:text-canvas-fg"}`}>
      {children}
      {badge != null && badge > 0 && (
        <span className="rounded-full bg-red-500/15 px-1.5 text-[9px] font-bold text-red-500">{badge}</span>
      )}
    </button>
  );
}

/* ── Main Health Section ── */

interface HealthSectionProps { serverId: string; initialTab?: HealthTab }

export function HealthSection({ serverId, initialTab }: HealthSectionProps) {
  const [expanded, setExpanded] = useState(!!initialTab);
  // Tracks whether the section has ever been expanded in this mount, so we can lazy-mount
  // the body (MiniChart, tabs, etc.) on first open and keep it mounted thereafter to
  // preserve the collapse animation without paying the initial-render cost.
  const hasEverExpandedRef = useRef(expanded);
  if (expanded) hasEverExpandedRef.current = true;
  const [tab, setTab] = useState<HealthTab>(initialTab ?? "overview");
  const [detailExpanded, setDetailExpanded] = useState(false);

  // Overview data
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [metrics, setMetrics] = useState<MonitoringMetric[]>([]);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aggregation, setAggregation] = useState<MetricAggregation | null>(null);

  // Alerts data
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Endpoints data
  const [endpoints, setEndpoints] = useState<EndpointCheck[]>([]);
  const [showEndpointModal, setShowEndpointModal] = useState(false);

  // Config data
  const [profile, setProfile] = useState<MonitoringProfile | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceWindow[]>([]);
  const [saving, setSaving] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [h, m] = await Promise.all([fetchServerHealthApi(serverId), fetchLatestMetricsApi(serverId)]);
      setHealth(h); setMetrics(m);
      // Load CPU aggregation for context
      const from = new Date(Date.now() - 3600_000).toISOString();
      const to = new Date().toISOString();
      try { setAggregation(await fetchMetricAggregationApi(serverId, "CPU_USAGE_PERCENT", from, to)); } catch { /* skip */ }
    } catch { /* ignore */ }
    setLoading(false);
  }, [serverId]);

  const loadAlerts = useCallback(async () => {
    try {
      const [evts, rules] = await Promise.all([
        fetchAlertEventsApi(serverId, 0, 20),
        fetchAlertRulesApi(serverId),
      ]);
      setAlerts(evts.content);
      setAlertRules(rules);
    } catch { /* ignore */ }
  }, [serverId]);

  const loadEndpoints = useCallback(async () => {
    try { setEndpoints(await fetchEndpointChecksApi(serverId)); } catch { /* ignore */ }
  }, [serverId]);

  const loadConfig = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([fetchMonitoringProfileApi(serverId), fetchMaintenanceWindowsApi()]);
      setProfile(p);
      setMaintenance(m.filter((w) => w.serverId === serverId));
    } catch { /* ignore */ }
  }, [serverId]);

  // Load on expand and tab change
  useEffect(() => {
    if (!expanded) return;
    if (tab === "overview") loadOverview();
    else if (tab === "alerts") loadAlerts();
    else if (tab === "endpoints") loadEndpoints();
    else if (tab === "config") loadConfig();
  }, [expanded, tab, loadOverview, loadAlerts, loadEndpoints, loadConfig]);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try { await triggerHealthCheckApi(serverId); setTimeout(loadOverview, 3000); } catch { /* ignore */ }
    setChecking(false);
  }, [serverId, loadOverview]);

  const handleAlertAction = useCallback(async (id: string, action: "acknowledge" | "resolve") => {
    try {
      if (action === "acknowledge") await acknowledgeAlertApi(id); else await resolveAlertApi(id);
      showToast(`Alert ${action}d`, "success"); loadAlerts();
    } catch { showToast(`Failed to ${action} alert`, "error"); }
  }, [loadAlerts]);

  const handleDeleteRule = useCallback(async (id: string) => {
    if (!window.confirm("Delete this alert rule?")) return;
    try { await deleteAlertRuleApi(id); showToast("Rule deleted", "success"); loadAlerts(); }
    catch { showToast("Failed to delete rule", "error"); }
  }, [loadAlerts]);

  const handleTriggerEndpoint = useCallback(async (id: string) => {
    try { await triggerEndpointCheckApi(id); showToast("Check triggered", "success"); setTimeout(loadEndpoints, 2000); }
    catch { showToast("Check failed", "error"); }
  }, [loadEndpoints]);

  const handleDeleteEndpoint = useCallback(async (id: string) => {
    if (!window.confirm("Delete this endpoint check?")) return;
    try { await deleteEndpointCheckApi(id); showToast("Check deleted", "success"); loadEndpoints(); }
    catch { showToast("Failed to delete", "error"); }
  }, [loadEndpoints]);

  const handleSaveProfile = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    try { const updated = await updateMonitoringProfileApi(serverId, profile); setProfile(updated); showToast("Profile saved", "success"); }
    catch { showToast("Failed to save profile", "error"); }
    setSaving(false);
  }, [serverId, profile]);

  const handleResetProfile = useCallback(async () => {
    if (!window.confirm("Reset monitoring profile to defaults?")) return;
    try { await resetMonitoringProfileApi(serverId); loadConfig(); showToast("Profile reset", "success"); }
    catch { showToast("Failed to reset", "error"); }
  }, [serverId, loadConfig]);

  const handleDeleteMaintenance = useCallback(async (id: string) => {
    try { await deleteMaintenanceWindowApi(id); showToast("Window removed", "success"); loadConfig(); }
    catch { showToast("Failed to remove", "error"); }
  }, [loadConfig]);

  const activeAlertCount = alerts.filter((a) => a.status === "ACTIVE").length;

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <div className="border-b border-canvas-border">
      <button type="button" onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
        <FiActivity size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Health</span>
        {health && (
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATE_BADGE[health.overallState]}`}>
            {health.overallState}
          </span>
        )}
        <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          {hasEverExpandedRef.current && (
          <div className="border-t border-canvas-border px-5 py-4">
            {/* Tabs */}
            <div className="mb-4 flex items-center gap-1">
              <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>Overview</TabBtn>
              <TabBtn active={tab === "alerts"} onClick={() => setTab("alerts")} badge={activeAlertCount}>
                <FiAlertTriangle size={10} /> Alerts
              </TabBtn>
              <TabBtn active={tab === "endpoints"} onClick={() => setTab("endpoints")}>
                <FiGlobe size={10} /> Endpoints
              </TabBtn>
              <TabBtn active={tab === "config"} onClick={() => setTab("config")}>
                <FiSettings size={10} /> Config
              </TabBtn>
            </div>

            {/* ── Overview Tab ── */}
            {tab === "overview" && (
              loading && !health ? (
                <p className="text-[11px] text-canvas-muted">Loading...</p>
              ) : health ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_BADGE[health.overallState]}`}>{health.overallState}</span>
                      <span className="text-[11px] text-canvas-muted">Last check: {formatAgo(health.lastCheckAt)}</span>
                    </div>
                    <button type="button" onClick={handleCheck} disabled={checking}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50">
                      <FiRefreshCw size={11} className={checking ? "animate-spin" : ""} /> Check
                    </button>
                  </div>
                  <div className="space-y-3">
                    <MetricBar value={health.cpuUsage} label="CPU" />
                    <MetricBar value={health.memoryUsage} label="Memory" />
                    <MetricBar value={health.diskUsage} label="Disk" />
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-canvas-muted">
                    {health.load1m != null && <span>Load: <span className="font-mono text-canvas-fg">{health.load1m.toFixed(2)}</span></span>}
                    <span>Uptime: <span className="font-mono text-canvas-fg">{formatUptime(health.uptimeSeconds)}</span></span>
                  </div>
                  {/* Aggregation summary */}
                  {aggregation && aggregation.sampleCount > 0 && (
                    <div className="flex items-center gap-4 rounded-md border border-canvas-border px-3 py-2 text-[10px] text-canvas-muted">
                      <span>CPU 1h avg: <span className="font-mono text-canvas-fg">{aggregation.avg?.toFixed(1)}%</span></span>
                      <span>min: <span className="font-mono text-canvas-fg">{aggregation.min?.toFixed(1)}%</span></span>
                      <span>max: <span className="font-mono text-canvas-fg">{aggregation.max?.toFixed(1)}%</span></span>
                    </div>
                  )}
                  {/* All metrics expandable */}
                  {metrics.length > 0 && (
                    <div>
                      <button type="button" onClick={() => setDetailExpanded((p) => !p)}
                        className="flex items-center gap-1.5 text-[10px] font-medium text-canvas-muted transition-colors hover:text-canvas-fg">
                        <FiChevronRight size={11} className={`chevron-rotate ${detailExpanded ? "open" : ""}`} />
                        All metrics ({metrics.length})
                      </button>
                      {detailExpanded && (
                        <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-canvas-border p-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {metrics.map((m, i) => {
                            const suffix = m.label ? ` (${m.label})` : "";
                            const name = (METRIC_LABELS[m.metricType] || m.metricType) + suffix;
                            const val = m.metricType.includes("PERCENT") ? `${m.value.toFixed(1)}%` : m.metricType === "UPTIME_SECONDS" ? formatUptime(m.value) : m.value.toFixed(2);
                            return (
                              <div key={`${m.metricType}-${m.label}-${i}`} className="rounded-md border border-canvas-border px-3 py-2">
                                <p className="text-sm font-bold leading-tight text-canvas-fg">{val}</p>
                                <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">{name}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <MiniChart serverId={serverId} />
                </div>
              ) : (
                <p className="text-[11px] text-canvas-muted">No health data available.</p>
              )
            )}

            {/* ── Alerts Tab ── */}
            {tab === "alerts" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-canvas-muted">{alerts.length} alert{alerts.length !== 1 ? "s" : ""}</p>
                  <button type="button" onClick={() => setShowRuleModal(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">
                    <FiPlus size={10} /> Create Rule
                  </button>
                </div>
                {/* Rules list */}
                {alertRules.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-canvas-muted">Rules</p>
                    {alertRules.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-md border border-canvas-border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-canvas-fg">{r.name}</p>
                          <p className="text-[10px] text-canvas-muted">{r.metricType} {r.conditionOperator.replace(/_/g, " ").toLowerCase()} {r.thresholdValue}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${SEVERITY_BADGE[r.severity] ?? ""}`}>{r.severity}</span>
                          <button type="button" onClick={() => handleDeleteRule(r.id)} className="rounded p-1 text-canvas-muted hover:text-red-500"><FiTrash2 size={11} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Events list */}
                {alerts.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-canvas-muted">Events</p>
                    {alerts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border border-canvas-border px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase ${SEVERITY_BADGE[a.severity] ?? "text-canvas-muted"}`}>{a.severity}</span>
                            <span className="truncate text-xs text-canvas-fg">{a.ruleName}</span>
                            <span className="shrink-0 text-[9px] text-canvas-muted">{formatAgo(a.firedAt)}</span>
                          </div>
                        </div>
                        {a.status === "ACTIVE" && (
                          <div className="flex items-center gap-1 ml-2">
                            <button type="button" onClick={() => handleAlertAction(a.id, "acknowledge")} title="Acknowledge" className="rounded p-1 text-canvas-muted hover:text-canvas-fg"><FiCheck size={12} /></button>
                            <button type="button" onClick={() => handleAlertAction(a.id, "resolve")} title="Resolve" className="rounded p-1 text-canvas-muted hover:text-green-500"><FiCheckCircle size={12} /></button>
                          </div>
                        )}
                        {a.status !== "ACTIVE" && (
                          <span className="ml-2 text-[9px] text-canvas-muted">{a.status}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-[11px] text-canvas-muted">No alerts</p>
                )}
              </div>
            )}

            {/* ── Endpoints Tab ── */}
            {tab === "endpoints" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-canvas-muted">{endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""}</p>
                  <button type="button" onClick={() => setShowEndpointModal(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">
                    <FiPlus size={10} /> Add Check
                  </button>
                </div>
                {endpoints.length > 0 ? endpoints.map((ep) => (
                  <div key={ep.id} className="rounded-md border border-canvas-border px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${ep.latestResult?.isUp ? "bg-green-400" : ep.latestResult ? "bg-red-400" : "bg-gray-400"}`} />
                        <span className="truncate text-xs font-medium text-canvas-fg">{ep.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleTriggerEndpoint(ep.id)} title="Check now" className="rounded p-1 text-canvas-muted hover:text-canvas-fg"><FiRefreshCw size={11} /></button>
                        <button type="button" onClick={() => handleDeleteEndpoint(ep.id)} className="rounded p-1 text-canvas-muted hover:text-red-500"><FiTrash2 size={11} /></button>
                      </div>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-canvas-muted">{ep.url}</p>
                    {ep.latestResult && (
                      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-canvas-muted">
                        {ep.latestResult.responseTimeMs != null && <span>{ep.latestResult.responseTimeMs}ms</span>}
                        {ep.latestResult.statusCode != null && <span>HTTP {ep.latestResult.statusCode}</span>}
                        {ep.latestResult.sslDaysRemaining != null && (
                          <span className={ep.latestResult.sslDaysRemaining < 14 ? "text-orange-500" : ""}>SSL: {ep.latestResult.sslDaysRemaining}d</span>
                        )}
                        <span>{formatAgo(ep.latestResult.checkedAt)}</span>
                      </div>
                    )}
                    {ep.latestResult?.errorMessage && (
                      <p className="mt-1 text-[10px] text-red-500">{ep.latestResult.errorMessage}</p>
                    )}
                  </div>
                )) : (
                  <p className="py-4 text-center text-[11px] text-canvas-muted">No endpoint checks configured</p>
                )}
              </div>
            )}

            {/* ── Config Tab ── */}
            {tab === "config" && profile && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-canvas-muted">Thresholds</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["cpu", "memory", "disk"] as const).map((t) => (
                      <div key={t} className="col-span-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-canvas-muted">{t.charAt(0).toUpperCase() + t.slice(1)} Warning %</label>
                          <input type="number" min={0} max={100} step={1}
                            value={profile[`${t}WarningThreshold` as keyof MonitoringProfile] as number}
                            onChange={(e) => setProfile({ ...profile, [`${t}WarningThreshold`]: parseFloat(e.target.value) || 0 })}
                            className={inputBase} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-canvas-muted">{t.charAt(0).toUpperCase() + t.slice(1)} Critical %</label>
                          <input type="number" min={0} max={100} step={1}
                            value={profile[`${t}CriticalThreshold` as keyof MonitoringProfile] as number}
                            onChange={(e) => setProfile({ ...profile, [`${t}CriticalThreshold`]: parseFloat(e.target.value) || 0 })}
                            className={inputBase} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-canvas-muted">Check Interval (seconds)</label>
                    <input type="number" min={10} max={3600}
                      value={profile.checkIntervalSeconds}
                      onChange={(e) => setProfile({ ...profile, checkIntervalSeconds: parseInt(e.target.value) || 60 })}
                      className={`${inputBase} w-32`} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleSaveProfile} disabled={saving}
                      className="rounded-md border border-canvas-border bg-canvas-fg px-4 py-1.5 text-[11px] font-medium text-canvas-bg hover:opacity-90 disabled:opacity-40">
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button type="button" onClick={handleResetProfile}
                      className="rounded-md px-3 py-1.5 text-[11px] text-canvas-muted hover:text-canvas-fg">
                      Reset defaults
                    </button>
                  </div>
                </div>
                {/* Maintenance windows */}
                <div className="space-y-2">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-canvas-muted">Maintenance Windows</p>
                  {maintenance.length > 0 ? maintenance.map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-md border border-canvas-border px-3 py-2">
                      <div>
                        <p className="text-xs text-canvas-fg">{w.reason}</p>
                        <p className="text-[10px] text-canvas-muted">{new Date(w.startAt).toLocaleString()} — {new Date(w.endAt).toLocaleString()}</p>
                      </div>
                      <button type="button" onClick={() => handleDeleteMaintenance(w.id)} className="rounded p-1 text-canvas-muted hover:text-red-500"><FiTrash2 size={11} /></button>
                    </div>
                  )) : (
                    <p className="text-[11px] text-canvas-muted">No maintenance windows</p>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {/* ── Create Alert Rule Modal ── */}
      <CreateAlertRuleModal open={showRuleModal} serverId={serverId} onClose={() => setShowRuleModal(false)} onCreated={() => { setShowRuleModal(false); loadAlerts(); showToast("Rule created", "success"); }} />

      {/* ── Create Endpoint Check Modal ── */}
      <CreateEndpointCheckModal open={showEndpointModal} serverId={serverId} onClose={() => setShowEndpointModal(false)} onCreated={() => { setShowEndpointModal(false); loadEndpoints(); showToast("Check created", "success"); }} />
    </div>
  );
}

/* ── Create Alert Rule Modal ── */

function CreateAlertRuleModal({ open, serverId, onClose, onCreated }: { open: boolean; serverId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [metricType, setMetricType] = useState("CPU_USAGE_PERCENT");
  const [operator, setOperator] = useState<string>("GREATER_THAN");
  const [threshold, setThreshold] = useState("90");
  const [severity, setSeverity] = useState("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    setSubmitting(true);
    try {
      await createAlertRuleApi({
        name: name.trim(), serverId, ruleType: "THRESHOLD", metricType,
        conditionOperator: operator as import("@/lib/api").ConditionOperator,
        thresholdValue: parseFloat(threshold) || 0,
        severity: severity as import("@/lib/api").IncidentSeverity,
        consecutiveFailures: 3, cooldownMinutes: 15,
      });
      setName(""); onCreated();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to create rule"); }
    setSubmitting(false);
  }, [name, serverId, metricType, operator, threshold, severity, onCreated]);

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="px-6 pt-6 pb-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">Create Alert Rule</h3>
        </div>
        <div className="space-y-3 px-6 py-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="e.g. High CPU Alert" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Metric</label>
              <select value={metricType} onChange={(e) => setMetricType(e.target.value)} className={inputBase}>
                <option value="CPU_USAGE_PERCENT">CPU %</option>
                <option value="MEMORY_USAGE_PERCENT">Memory %</option>
                <option value="DISK_USAGE_PERCENT">Disk %</option>
                <option value="LOAD_1M">Load 1m</option>
                <option value="SWAP_USAGE_PERCENT">Swap %</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Operator</label>
              <select value={operator} onChange={(e) => setOperator(e.target.value)} className={inputBase}>
                <option value="GREATER_THAN">&gt;</option>
                <option value="GREATER_THAN_OR_EQUAL">&gt;=</option>
                <option value="LESS_THAN">&lt;</option>
                <option value="LESS_THAN_OR_EQUAL">&lt;=</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Threshold</label>
              <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={inputBase}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted hover:text-canvas-fg">Cancel</button>
          <button type="submit" disabled={submitting}
            className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg hover:opacity-90 disabled:opacity-40">
            {submitting ? "Creating..." : "Create Rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Create Endpoint Check Modal ── */

function CreateEndpointCheckModal({ open, serverId, onClose, onCreated }: { open: boolean; serverId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [checkType, setCheckType] = useState("HTTPS");
  const [interval, setInterval] = useState("300");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (!url.trim()) { setError("URL is required"); return; }
    setSubmitting(true);
    try {
      await createEndpointCheckApi({ name: name.trim(), url: url.trim(), checkType, serverId, intervalSeconds: parseInt(interval) || 300 });
      setName(""); setUrl(""); onCreated();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to create check"); }
    setSubmitting(false);
  }, [name, url, checkType, serverId, interval, onCreated]);

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="px-6 pt-6 pb-1">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">Add Endpoint Check</h3>
        </div>
        <div className="space-y-3 px-6 py-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="e.g. API Health" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-canvas-muted">URL *</label>
            <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} className={inputBase} placeholder="https://example.com/health" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Type</label>
              <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className={inputBase}>
                <option value="HTTPS">HTTPS</option>
                <option value="HTTP">HTTP</option>
                <option value="TCP">TCP</option>
                <option value="SSL_CERT">SSL Certificate</option>
                <option value="DNS">DNS</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-canvas-muted">Interval (seconds)</label>
              <input type="number" min={30} value={interval} onChange={(e) => setInterval(e.target.value)} className={inputBase} />
            </div>
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted hover:text-canvas-fg">Cancel</button>
          <button type="submit" disabled={submitting}
            className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg hover:opacity-90 disabled:opacity-40">
            {submitting ? "Creating..." : "Add Check"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
