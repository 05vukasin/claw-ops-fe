"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContainerState {
  Status: string;
  Running: boolean;
  StartedAt: string;
  RestartCount: number;
}

interface ResourceStats {
  cpuPercent: string;
  memPercent: string;
  memUsage: string;
  netIO: string;
  pids: string;
}

interface GatewayHealth {
  healthy: boolean;
  error?: string;
}

interface MessagingStatus {
  slack: "connected" | "disconnected" | "unknown";
  telegram: "connected" | "disconnected" | "unknown";
}

interface AgentStatusSectionProps {
  serverId: string;
  agentName: string;
  containerState: ContainerState | null;
  startedAt: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

function parseFloat0(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

function parseMessagingStatus(logText: string): MessagingStatus {
  const lines = logText.split("\n").reverse();
  let slack: MessagingStatus["slack"] = "unknown";
  let telegram: MessagingStatus["telegram"] = "unknown";

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (slack === "unknown") {
      if (/slack.*(connected|ready|running|authenticated)/i.test(lower)) slack = "connected";
      else if (/slack.*(disconnect|error|failed|closed)/i.test(lower)) slack = "disconnected";
    }
    if (telegram === "unknown") {
      if (/telegram.*(connected|ready|running|started|polling)/i.test(lower)) telegram = "connected";
      else if (/telegram.*(disconnect|error|failed|closed|stopped)/i.test(lower)) telegram = "disconnected";
    }
    if (slack !== "unknown" && telegram !== "unknown") break;
  }

  return { slack, telegram };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentStatusSection({
  serverId,
  agentName,
  containerState,
  startedAt,
  config,
}: AgentStatusSectionProps) {
  const [stats, setStats] = useState<ResourceStats | null>(null);
  const [health, setHealth] = useState<GatewayHealth | null>(null);
  const [messaging, setMessaging] = useState<MessagingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);

  const loadExtras = useCallback(async () => {
    setLoading(true);

    const [statsRes, portRes, logsRes] = await Promise.allSettled([
      executeCommandApi(
        serverId,
        `docker stats --no-stream --format '{{json .}}' ${agentName}-openclaw-gateway-1`,
      ),
      executeCommandApi(
        serverId,
        `docker port ${agentName}-openclaw-gateway-1 18789`,
      ),
      executeCommandApi(
        serverId,
        `docker logs --tail 50 ${agentName}-openclaw-gateway-1 2>&1`,
      ),
    ]);

    // Parse resource stats
    if (statsRes.status === "fulfilled" && statsRes.value.exitCode === 0) {
      try {
        const raw = JSON.parse(statsRes.value.stdout.trim());
        setStats({
          cpuPercent: raw.CPUPerc ?? "0%",
          memPercent: raw.MemPerc ?? "0%",
          memUsage: raw.MemUsage ?? "--",
          netIO: raw.NetIO ?? "--",
          pids: raw.PIDs ?? "--",
        });
      } catch {
        setStats(null);
      }
    }

    // Parse gateway health
    if (portRes.status === "fulfilled" && portRes.value.exitCode === 0) {
      const portLine = portRes.value.stdout.trim();
      const match = portLine.match(/:(\d+)$/);
      if (match) {
        try {
          const healthRes = await executeCommandApi(
            serverId,
            `curl -s -m 5 http://localhost:${match[1]}/healthz`,
          );
          if (healthRes.exitCode === 0) {
            setHealth({ healthy: true });
          } else {
            setHealth({ healthy: false, error: "Unhealthy response" });
          }
        } catch {
          setHealth({ healthy: false, error: "Health check failed" });
        }
      }
    } else {
      setHealth(null);
    }

    // Parse messaging status from logs
    if (logsRes.status === "fulfilled") {
      const logText = logsRes.value.stdout || logsRes.value.stderr || "";
      setMessaging(parseMessagingStatus(logText));
    }

    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadExtras();
  }, [loadExtras]);

  const hasSlack = !!(config?.channels?.slack);
  const hasTelegram = !!(
    config?.plugins?.entries &&
    Object.values(config.plugins.entries).some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entry: any) =>
        entry?.type === "telegram" ||
        entry?.name?.toLowerCase().includes("telegram"),
    )
  );

  const cpuVal = stats ? parseFloat0(stats.cpuPercent) : 0;
  const memVal = stats ? parseFloat0(stats.memPercent) : 0;

  return (
    <div className="border-b border-canvas-border px-5 py-4">
      {/* Row 1: Key metrics grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        <InfoCell
          label="Uptime"
          value={
            containerState?.Running && startedAt
              ? formatUptime(startedAt)
              : "--"
          }
        />
        <InfoCell
          label="Restarts"
          value={
            containerState?.RestartCount != null
              ? String(containerState.RestartCount)
              : "--"
          }
        />
        <InfoCell
          label="Gateway"
          value={
            health === null
              ? "--"
              : health.healthy
                ? "Healthy"
                : health.error ?? "Unhealthy"
          }
          valueClass={
            health?.healthy
              ? "text-green-600 dark:text-green-400"
              : health
                ? "text-red-500 dark:text-red-400"
                : undefined
          }
        />
        <InfoCell label="PIDs" value={stats?.pids ?? "--"} />
      </div>

      {/* Row 2: Resource bars */}
      {stats && (
        <div className="mt-4 space-y-2">
          <MetricBar label="CPU" value={cpuVal} display={stats.cpuPercent} />
          <MetricBar
            label="Memory"
            value={memVal}
            display={`${stats.memPercent} (${stats.memUsage})`}
          />
          <div className="flex items-center justify-between text-[10px] text-canvas-muted">
            <span>Net I/O</span>
            <span className="font-mono text-canvas-fg">{stats.netIO}</span>
          </div>
        </div>
      )}

      {/* Row 3: Messaging status */}
      {(hasSlack || hasTelegram) && (
        <div className="mt-3 flex items-center gap-3">
          {hasSlack && (
            <StatusPill
              label="Slack"
              status={messaging?.slack ?? "unknown"}
            />
          )}
          {hasTelegram && (
            <StatusPill
              label="Telegram"
              status={messaging?.telegram ?? "unknown"}
            />
          )}
        </div>
      )}

      {/* Refresh */}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => {
            loadedRef.current = false;
            loadExtras();
          }}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
        >
          <FiRefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoCell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
      <p className={`mt-0.5 truncate text-xs ${valueClass ?? "text-canvas-fg"}`}>
        {value}
      </p>
    </div>
  );
}

function MetricBar({
  label,
  value,
  display,
}: {
  label: string;
  value: number;
  display: string;
}) {
  const color =
    value >= 95
      ? "bg-red-500"
      : value >= 80
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="text-canvas-muted">{label}</span>
        <span className="font-mono text-canvas-fg">{display}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-surface-hover">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  status,
}: {
  label: string;
  status: "connected" | "disconnected" | "unknown";
}) {
  const dot =
    status === "connected"
      ? "bg-green-400"
      : status === "disconnected"
        ? "bg-red-400"
        : "bg-gray-400";

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-canvas-border px-2 py-0.5 text-[10px] font-medium text-canvas-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
