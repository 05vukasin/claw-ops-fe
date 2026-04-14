"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiBell, FiCheck, FiCheckCircle, FiVolumeX, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";
import {
  fetchActiveAlertCountApi,
  fetchAlertEventsApi,
  acknowledgeAlertApi,
  resolveAlertApi,
  silenceAlertApi,
  type AlertEvent,
} from "@/lib/api";
import { showToast } from "@/components/ui/toast";

const SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: "bg-red-500/10 text-red-500",
  HIGH: "bg-orange-500/10 text-orange-500",
  MEDIUM: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  LOW: "bg-blue-500/10 text-blue-500",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AlertBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Poll count every 30s
  const loadCount = useCallback(async () => {
    try { setCount(await fetchActiveAlertCountApi()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, [loadCount]);

  // Load alerts when panel opens
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchAlertEventsApi(undefined, 0, 50);
      setAlerts(page.content.filter((a) => a.status === "ACTIVE" || a.status === "ACKNOWLEDGED"));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) loadAlerts();
  }, [open, loadAlerts]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleAction = useCallback(async (id: string, action: "acknowledge" | "resolve" | "silence") => {
    try {
      if (action === "acknowledge") await acknowledgeAlertApi(id);
      else if (action === "resolve") await resolveAlertApi(id);
      else await silenceAlertApi(id);
      showToast(`Alert ${action}d`, "success");
      loadAlerts();
      loadCount();
    } catch {
      showToast(`Failed to ${action} alert`, "error");
    }
  }, [loadAlerts, loadCount]);

  // SSE real-time updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      const origin = (typeof window !== "undefined" && (window as unknown as Record<string, string>).__CLAWOPS_API_ORIGIN__) || process.env.NEXT_PUBLIC_API_ORIGIN || "";
      if (!origin) return;
      es = new EventSource(`${origin}/api/v1/monitoring/events/stream`);
      es.addEventListener("alert_fired", () => { loadCount(); if (open) loadAlerts(); });
      es.addEventListener("alert_resolved", () => { loadCount(); if (open) loadAlerts(); });
      es.onerror = () => { es?.close(); };
    } catch { /* SSE not available */ }
    return () => { es?.close(); };
  }, [loadCount, loadAlerts, open]);

  if (count === 0 && !open) return null;

  return (
    <>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="fixed left-4 top-16 flex h-10 w-10 items-center justify-center rounded-full border border-canvas-border bg-canvas-bg shadow-lg transition-colors hover:bg-canvas-surface-hover"
        style={{ zIndex: Z_INDEX.FLOATING + 1 }}
        aria-label={`${count} active alerts`}
      >
        <FiBell size={18} className={count > 0 ? "text-red-500" : "text-canvas-muted"} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Overlay panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed left-4 top-28 w-96 max-h-[70vh] flex flex-col rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-fade-slide-in overflow-hidden"
          style={{ zIndex: Z_INDEX.DROPDOWN }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-canvas-border px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-canvas-fg">Alerts</h3>
              {count > 0 && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">{count} active</span>
              )}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-canvas-muted hover:text-canvas-fg">
              <FiX size={16} />
            </button>
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto">
            {loading && alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-canvas-muted">Loading...</p>
            ) : alerts.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11px] text-canvas-muted">No active alerts</p>
            ) : (
              <div className="divide-y divide-canvas-border">
                {alerts.map((a) => (
                  <div key={a.id} className="px-4 py-3 hover:bg-canvas-surface-hover/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${SEVERITY_BADGE[a.severity] ?? "bg-canvas-surface-hover text-canvas-muted"}`}>
                            {a.severity}
                          </span>
                          <span className="truncate text-xs font-medium text-canvas-fg">{a.ruleName}</span>
                        </div>
                        {a.message && (
                          <p className="mt-1 truncate text-[11px] text-canvas-muted">{a.message}</p>
                        )}
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-canvas-muted">
                          {a.metricValue != null && <span className="font-mono">{a.metricType}: {a.metricValue.toFixed(1)}</span>}
                          <span>{timeAgo(a.firedAt)}</span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        {a.status === "ACTIVE" && (
                          <button type="button" onClick={() => handleAction(a.id, "acknowledge")} title="Acknowledge"
                            className="rounded p-1 text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">
                            <FiCheck size={13} />
                          </button>
                        )}
                        <button type="button" onClick={() => handleAction(a.id, "resolve")} title="Resolve"
                          className="rounded p-1 text-canvas-muted hover:bg-green-500/10 hover:text-green-500">
                          <FiCheckCircle size={13} />
                        </button>
                        <button type="button" onClick={() => handleAction(a.id, "silence")} title="Silence"
                          className="rounded p-1 text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">
                          <FiVolumeX size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
