"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FiShield,
  FiAlertTriangle,
  FiClock,
  FiCheckCircle,
  FiRefreshCw,
  FiPlay,
  FiCalendar,
} from "react-icons/fi";
import {
  fetchSslDashboardApi,
  fetchSslSchedulerStatusApi,
  type SslDashboardResponse,
  type SslSchedulerStatus,
} from "@/lib/api";

type FilterStatus = "ALL" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "FAILED" | "PROVISIONING";

/**
 * SSL monitoring dashboard. Renders cards for counts, a list of expiring-soon certs,
 * recent failures, and scheduler transparency (last / next auto-renewal run).
 *
 * Pure read-only; all actions link back to the server dashboard panel where the user can
 * act. Consumer passes `onFilterChange` so clicking a card filters the Subdomains table.
 */
export function SslDashboard({
  onFilterChange,
}: {
  onFilterChange?: (filter: FilterStatus) => void;
}) {
  const [data, setData] = useState<SslDashboardResponse | null>(null);
  const [scheduler, setScheduler] = useState<SslSchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [dash, sch] = await Promise.all([
        fetchSslDashboardApi().catch(() => null),
        fetchSslSchedulerStatusApi().catch(() => null),
      ]);
      setData(dash);
      setScheduler(sch);
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-canvas-border bg-canvas-bg p-6 text-center text-xs text-canvas-muted">
        Loading SSL dashboard…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-canvas-border bg-canvas-bg p-6 text-center text-xs text-canvas-muted">
        SSL dashboard unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-canvas-fg flex items-center gap-2">
            <FiShield size={14} className="text-canvas-muted" />
            SSL Dashboard
          </h3>
          <p className="mt-0.5 text-[11px] text-canvas-muted">
            Certificate health, upcoming expirations, and auto-renewal status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg disabled:opacity-50"
        >
          <FiRefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Count cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <SummaryCard label="Total" value={data.totalCertificates} onClick={() => onFilterChange?.("ALL")} icon={<FiShield size={13} />} />
        <SummaryCard label="Active" value={data.activeCertificates} color="text-green-600 dark:text-green-400" onClick={() => onFilterChange?.("ACTIVE")} icon={<FiCheckCircle size={13} />} />
        <SummaryCard label="Expiring ≤14d" value={data.expiringSoonCertificates} color="text-orange-600 dark:text-orange-400" onClick={() => onFilterChange?.("EXPIRING")} icon={<FiClock size={13} />} />
        <SummaryCard label="Expired" value={data.expiredCertificates} color="text-red-500 dark:text-red-400" onClick={() => onFilterChange?.("EXPIRED")} icon={<FiAlertTriangle size={13} />} />
        <SummaryCard label="Failed" value={data.failedCertificates} color="text-red-500 dark:text-red-400" onClick={() => onFilterChange?.("FAILED")} icon={<FiAlertTriangle size={13} />} />
        <SummaryCard label="Provisioning" value={data.provisioningCertificates} color="text-yellow-600 dark:text-yellow-400" onClick={() => onFilterChange?.("PROVISIONING")} icon={<FiPlay size={13} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Expiring soon list */}
        <div className="rounded-lg border border-canvas-border bg-canvas-bg">
          <div className="flex items-center justify-between border-b border-canvas-border px-4 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-canvas-muted">Expiring Soon</p>
            <span className="text-[10px] text-canvas-muted">{data.expiringSoon.length}</span>
          </div>
          {data.expiringSoon.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-canvas-muted">No certificates expiring within 14 days.</p>
          ) : (
            <ul className="divide-y divide-canvas-border">
              {data.expiringSoon.map((e) => {
                const urgent = e.daysUntilExpiry <= 3;
                const warn = e.daysUntilExpiry <= 7;
                const tone = urgent ? "text-red-500 dark:text-red-400" : warn ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400";
                return (
                  <li key={e.hostname} className="flex items-center gap-3 px-4 py-2.5 text-[11px]">
                    <span className="font-mono text-canvas-fg flex-1 truncate">{e.hostname}</span>
                    <span className={`font-medium ${tone}`}>{e.daysUntilExpiry}d</span>
                    <span className="text-canvas-muted">
                      {e.expiresAt
                        ? new Date(e.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Recent failures */}
        <div className="rounded-lg border border-canvas-border bg-canvas-bg">
          <div className="flex items-center justify-between border-b border-canvas-border px-4 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-canvas-muted">Recent Failures</p>
            <span className="text-[10px] text-canvas-muted">{data.recentFailures.length}</span>
          </div>
          {data.recentFailures.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-canvas-muted">No recent failures. 🎉</p>
          ) : (
            <ul className="divide-y divide-canvas-border">
              {data.recentFailures.map((f, i) => (
                <li key={`${f.hostname}-${i}`} className="px-4 py-2.5 text-[11px]">
                  <p className="font-mono text-canvas-fg truncate">{f.hostname}</p>
                  <p className="mt-0.5 text-red-500 dark:text-red-400 whitespace-pre-wrap break-all">
                    {f.lastError}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Auto-renewal scheduler panel */}
      {scheduler && (
        <div className="rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">
            <FiCalendar size={12} />
            Auto-renewal Scheduler
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[11px] sm:grid-cols-4">
            <MetaCell
              label="Renewal window"
              value={`${scheduler.renewalWindowDays} days`}
            />
            <MetaCell
              label="Last run"
              value={scheduler.renewLastRunAt ? formatAgo(scheduler.renewLastRunAt) : "—"}
            />
            <MetaCell
              label="Last outcome"
              value={
                scheduler.lastOutcome.considered > 0
                  ? `${scheduler.lastOutcome.renewed}✓ / ${scheduler.lastOutcome.failed}✕ of ${scheduler.lastOutcome.considered}`
                  : "No certs needed renewal"
              }
              tone={scheduler.lastOutcome.failed > 0 ? "warn" : undefined}
            />
            <MetaCell
              label="Next run"
              value={scheduler.renewNextRunAt ? formatIn(scheduler.renewNextRunAt) : "—"}
            />
          </div>
          <p className="mt-2 text-[10px] text-canvas-muted/70">
            Scheduler runs daily at 03:00 UTC (renewal) and 04:00 UTC (expiry marking).
          </p>
        </div>
      )}

      <p className="text-[10px] text-canvas-muted">
        <Link href="/processes" className="underline-offset-2 hover:underline">View live SSL jobs →</Link>
      </p>
    </div>
  );
}

function SummaryCard({
  label, value, color, icon, onClick,
}: {
  label: string;
  value: number;
  color?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3 text-center transition-colors hover:bg-canvas-surface-hover/40 disabled:cursor-default"
    >
      <div className="flex items-center justify-center gap-1.5">
        {icon && <span className={color ?? "text-canvas-muted"}>{icon}</span>}
        <span className={`text-xl font-bold tabular-nums ${color ?? "text-canvas-fg"}`}>{value}</span>
      </div>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">{label}</p>
    </button>
  );
}

function MetaCell({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted/80">{label}</p>
      <p className={`mt-0.5 font-medium ${tone === "warn" ? "text-orange-600 dark:text-orange-400" : "text-canvas-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

function formatIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `in ${s}s`;
  if (s < 3600) return `in ${Math.floor(s / 60)}m`;
  if (s < 86_400) return `in ${Math.floor(s / 3600)}h`;
  return `in ${Math.floor(s / 86_400)}d`;
}
