"use client";

import { useEffect, useState } from "react";
import { FiChevronDown, FiChevronRight, FiPlay, FiTerminal } from "react-icons/fi";
import { checkClaudeCodeInstalledApi, checkDeployScriptApi } from "@/lib/api";
import type { Server, ServerHealth, MonitoringState } from "@/lib/api";
import { ClaudeCodeOverlay } from "./claude-code-overlay";
import { DeployPopup } from "./deploy-popup";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_COLOR: Record<string, string> = {
  ONLINE: "bg-green-500/15 text-green-500",
  OFFLINE: "bg-red-500/15 text-red-500",
  ERROR: "bg-orange-500/15 text-orange-500",
  UNKNOWN: "bg-yellow-500/15 text-yellow-500",
};

const STATE_COLOR: Record<MonitoringState, string> = {
  HEALTHY: "text-green-500",
  WARNING: "text-yellow-500",
  CRITICAL: "text-red-500",
  UNREACHABLE: "text-canvas-muted",
  UNKNOWN: "text-canvas-muted",
  MAINTENANCE: "text-blue-400",
};

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

function barColor(value: number) {
  if (value >= 95) return "bg-red-500";
  if (value >= 80) return "bg-yellow-500";
  return "bg-green-500";
}

/* ------------------------------------------------------------------ */
/*  Metric bar                                                         */
/* ------------------------------------------------------------------ */

function MetricBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
          {label}
        </span>
        <span className="font-mono text-xs text-canvas-fg">
          {value != null ? `${value.toFixed(1)}%` : "\u2014"}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-canvas-surface-hover">
        {value != null && (
          <div
            className={`h-full rounded-full transition-all ${barColor(value)}`}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

interface MobileServerCardProps {
  server: Server;
  health: ServerHealth | null;
}

export function MobileServerCard({ server, health }: MobileServerCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [claudeInstalled, setClaudeInstalled] = useState<"unknown" | "checking" | "installed" | "not-installed">("unknown");
  const [showClaudeCode, setShowClaudeCode] = useState(false);
  const [deployAvailable, setDeployAvailable] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);

  useEffect(() => {
    if (server.status !== "ONLINE") return;
    let stale = false;
    checkClaudeCodeInstalledApi(server.id)
      .then((ok) => { if (!stale) setClaudeInstalled(ok ? "installed" : "not-installed"); })
      .catch(() => { if (!stale) setClaudeInstalled("unknown"); });
    checkDeployScriptApi(server.id)
      .then((ok) => { if (!stale) setDeployAvailable(ok); })
      .catch(() => { if (!stale) setDeployAvailable(false); });
    return () => { stale = true; };
  }, [server.id, server.status]);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm transition-shadow hover:shadow-md">
      {/* Header — always visible, tappable */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Status dot */}
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            server.status === "ONLINE"
              ? "bg-green-500"
              : server.status === "OFFLINE"
                ? "bg-red-500"
                : server.status === "ERROR"
                  ? "bg-orange-500"
                  : "bg-yellow-500"
          }`}
        />

        {/* Name + hostname */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-canvas-fg">
            {server.name}
          </p>
          <p className="truncate text-[11px] text-canvas-muted">
            {server.hostname}
          </p>
        </div>

        {/* Status pill */}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_COLOR[server.status] ?? STATUS_COLOR.UNKNOWN}`}
        >
          {server.status}
        </span>

        {/* Expand chevron */}
        {expanded ? (
          <FiChevronDown size={14} className="shrink-0 text-canvas-muted" />
        ) : (
          <FiChevronRight size={14} className="shrink-0 text-canvas-muted" />
        )}
      </button>

      {/* Quick metrics — always visible */}
      {health && (
        <div className="flex items-center gap-4 border-t border-canvas-border px-4 py-2.5">
          <QuickStat label="CPU" value={health.cpuUsage} state={health.overallState} />
          <QuickStat label="MEM" value={health.memoryUsage} state={health.overallState} />
          <QuickStat label="DISK" value={health.diskUsage} state={health.overallState} />
          <div className="ml-auto text-right">
            <p className="font-mono text-xs text-canvas-fg">
              {formatUptime(health.uptimeSeconds)}
            </p>
            <p className="text-[9px] text-canvas-muted">uptime</p>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && health && (
        <div className="space-y-3 border-t border-canvas-border px-4 py-4">
          <MetricBar value={health.cpuUsage} label="CPU" />
          <MetricBar value={health.memoryUsage} label="Memory" />
          <MetricBar value={health.diskUsage} label="Disk" />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-[11px] text-canvas-muted">
            {health.load1m != null && (
              <span>
                Load:{" "}
                <span className="font-mono text-canvas-fg">
                  {health.load1m.toFixed(2)}
                </span>
              </span>
            )}
            <span>
              Uptime:{" "}
              <span className="font-mono text-canvas-fg">
                {formatUptime(health.uptimeSeconds)}
              </span>
            </span>
            <span>
              Checked:{" "}
              <span className="font-mono text-canvas-fg">
                {formatAgo(health.lastCheckAt)}
              </span>
            </span>
          </div>

          {server.environment && (
            <span className="inline-block rounded-md bg-canvas-surface-hover px-2 py-0.5 text-[10px] font-medium text-canvas-muted">
              {server.environment}
            </span>
          )}

          {server.assignedDomain && (
            <a
              href={`https://${server.assignedDomain}/chat`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border bg-canvas-surface-hover px-4 py-2.5 text-xs font-medium text-canvas-fg transition-colors hover:bg-canvas-border active:bg-canvas-border"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              Chat
            </a>
          )}

          {claudeInstalled === "installed" && (
            <button
              type="button"
              onClick={() => setShowClaudeCode(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border bg-canvas-surface-hover px-4 py-2.5 text-xs font-medium text-canvas-fg transition-colors hover:bg-canvas-border active:bg-canvas-border"
            >
              <FiTerminal size={14} />
              Open Claude Code
            </button>
          )}

          {deployAvailable && (
            <button
              type="button"
              onClick={() => setShowDeploy(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20 active:bg-blue-500/20"
            >
              <FiPlay size={14} />
              Deploy
            </button>
          )}
        </div>
      )}

      {/* No health data fallback */}
      {!health && (
        <div className="border-t border-canvas-border px-4 py-2.5">
          <p className="text-[11px] text-canvas-muted">No health data available</p>
        </div>
      )}

      {showClaudeCode && (
        <ClaudeCodeOverlay
          serverId={server.id}
          serverName={server.name}
          onClose={() => setShowClaudeCode(false)}
        />
      )}

      {showDeploy && (
        <DeployPopup serverId={server.id} onClose={() => setShowDeploy(false)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick stat (compact number shown in collapsed view)                */
/* ------------------------------------------------------------------ */

function QuickStat({
  label,
  value,
  state,
}: {
  label: string;
  value: number | null;
  state: MonitoringState;
}) {
  return (
    <div className="text-center">
      <p
        className={`font-mono text-sm font-bold leading-tight ${
          value != null && value >= 95
            ? "text-red-500"
            : value != null && value >= 80
              ? "text-yellow-500"
              : STATE_COLOR[state] ?? "text-canvas-fg"
        }`}
      >
        {value != null ? `${Math.round(value)}%` : "\u2014"}
      </p>
      <p className="text-[9px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
    </div>
  );
}
