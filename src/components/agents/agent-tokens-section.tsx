"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiRefreshCw, FiHash } from "react-icons/fi";
import { readFileApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SessionEntry {
  cacheRead: number;
  cacheWrite: number;
  inputTokens: number;
  outputTokens: number;
  channel: string;
  model?: string;
  startedAt?: string;
  [key: string]: unknown;
}

interface TokenStats {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  sessionCount: number;
}

interface SessionRow {
  id: string;
  channel: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  cost: number;
}

interface AgentTokensSectionProps {
  serverId: string;
  agentName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function computeStats(sessions: Record<string, SessionEntry>): TokenStats {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;

  for (const key of Object.keys(sessions)) {
    const s = sessions[key];
    totalInput += s.inputTokens ?? 0;
    totalOutput += s.outputTokens ?? 0;
    totalCacheRead += s.cacheRead ?? 0;
    totalCacheWrite += s.cacheWrite ?? 0;
  }

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheWrite,
    sessionCount: Object.keys(sessions).length,
  };
}

function sessionCost(s: SessionEntry): number {
  const input = ((s.inputTokens ?? 0) / 1_000_000) * 3;
  const output = ((s.outputTokens ?? 0) / 1_000_000) * 15;
  const cacheRead = ((s.cacheRead ?? 0) / 1_000_000) * 0.3;
  const cacheWrite = ((s.cacheWrite ?? 0) / 1_000_000) * 3.75;
  return input + output + cacheRead + cacheWrite;
}

function buildRows(sessions: Record<string, SessionEntry>): SessionRow[] {
  return Object.entries(sessions)
    .map(([id, s]) => ({
      id,
      channel: s.channel ?? "--",
      inputTokens: s.inputTokens ?? 0,
      outputTokens: s.outputTokens ?? 0,
      cacheRead: s.cacheRead ?? 0,
      cacheWrite: s.cacheWrite ?? 0,
      model: s.model ?? "--",
      cost: sessionCost(s),
    }))
    .reverse();
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(stats: TokenStats): string {
  const inputCost = (stats.totalInput / 1_000_000) * 3;
  const outputCost = (stats.totalOutput / 1_000_000) * 15;
  const cacheReadCost = (stats.totalCacheRead / 1_000_000) * 0.3;
  const cacheWriteCost = (stats.totalCacheWrite / 1_000_000) * 3.75;
  return `$${(inputCost + outputCost + cacheReadCost + cacheWriteCost).toFixed(2)}`;
}

function truncateId(id: string): string {
  return id.length > 12 ? id.slice(0, 10) + ".." : id;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentTokensSection({
  serverId,
  agentName,
}: AgentTokensSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await readFileApi(
        serverId,
        `/root/openclaw-agents/${agentName}/config/agents/main/sessions/sessions.json`,
      );
      const sessions: Record<string, SessionEntry> = JSON.parse(raw);
      setStats(computeStats(sessions));
      setRows(buildRows(sessions));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load token data",
      );
      setStats(null);
      setRows([]);
    }
    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData();
  }, [expanded, loadData]);

  const cacheHitRate =
    stats && stats.totalCacheRead + stats.totalInput > 0
      ? (
          (stats.totalCacheRead / (stats.totalCacheRead + stats.totalInput)) *
          100
        ).toFixed(1)
      : "0.0";

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiHash size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Token Usage
        </span>
        <FiChevronRight
          size={14}
          className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`}
        />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading && !stats ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : stats ? (
              <div className="space-y-4">
                {/* Refresh */}
                <div className="flex items-center justify-end">
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

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StatCard label="Total Input" value={formatTokens(stats.totalInput)} />
                  <StatCard label="Total Output" value={formatTokens(stats.totalOutput)} />
                  <StatCard label="Cache Read" value={formatTokens(stats.totalCacheRead)} />
                  <StatCard label="Cache Write" value={formatTokens(stats.totalCacheWrite)} />
                  <StatCard label="Cache Hit Rate" value={`${cacheHitRate}%`} />
                  <StatCard label="Est. Cost" value={estimateCost(stats)} />
                </div>

                {/* Session count */}
                <div className="text-[11px] text-canvas-muted">
                  Sessions:{" "}
                  <span className="font-mono text-canvas-fg">
                    {stats.sessionCount}
                  </span>
                </div>

                {/* Per-session table */}
                {rows.length > 0 && (
                  <div className="max-h-60 overflow-auto rounded-md border border-canvas-border">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-canvas-border bg-canvas-surface-hover text-left text-canvas-muted">
                          <th className="px-2 py-1.5 font-medium">Session</th>
                          <th className="px-2 py-1.5 font-medium">Channel</th>
                          <th className="px-2 py-1.5 font-medium text-right">In</th>
                          <th className="px-2 py-1.5 font-medium text-right">Out</th>
                          <th className="px-2 py-1.5 font-medium text-right">Cache R</th>
                          <th className="px-2 py-1.5 font-medium text-right">Cache W</th>
                          <th className="px-2 py-1.5 font-medium text-right">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-canvas-border last:border-b-0 hover:bg-canvas-surface-hover"
                          >
                            <td className="px-2 py-1.5 font-mono text-canvas-fg" title={row.id}>
                              {truncateId(row.id)}
                            </td>
                            <td className="px-2 py-1.5 text-canvas-muted">
                              {row.channel}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                              {formatTokens(row.inputTokens)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                              {formatTokens(row.outputTokens)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                              {formatTokens(row.cacheRead)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                              {formatTokens(row.cacheWrite)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                              ${row.cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="border-t border-canvas-border bg-canvas-surface-hover font-bold">
                          <td className="px-2 py-1.5 text-canvas-fg" colSpan={2}>
                            Total
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                            {formatTokens(stats.totalInput)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                            {formatTokens(stats.totalOutput)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                            {formatTokens(stats.totalCacheRead)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                            {formatTokens(stats.totalCacheWrite)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-canvas-fg">
                            {estimateCost(stats)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-canvas-muted">
                No token data available.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-canvas-border px-3 py-2">
      <p className="text-sm font-bold leading-tight text-canvas-fg">{value}</p>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
    </div>
  );
}
