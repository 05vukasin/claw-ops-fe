"use client";

import { useCallback, useEffect, useState } from "react";
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
  [key: string]: unknown;
}

interface TokenStats {
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheWrite: number;
  sessionCount: number;
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

  const keys = Object.keys(sessions);
  for (const key of keys) {
    const s = sessions[key];
    totalInput += s.inputTokens ?? 0;
    totalOutput += s.outputTokens ?? 0;
    totalCacheRead += s.cacheRead ?? 0;
    totalCacheWrite += s.cacheWrite ?? 0;
  }

  return { totalInput, totalOutput, totalCacheRead, totalCacheWrite, sessionCount: keys.length };
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
  const total = inputCost + outputCost + cacheReadCost + cacheWriteCost;
  return `$${total.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentTokensSection({ serverId, agentName }: AgentTokensSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TokenStats | null>(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load token data");
      setStats(null);
    }
    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (expanded) loadData();
  }, [expanded, loadData]);

  const cacheHitRate =
    stats && stats.totalCacheRead + stats.totalInput > 0
      ? ((stats.totalCacheRead / (stats.totalCacheRead + stats.totalInput)) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiHash size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Tokens</span>
        <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading && !stats ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : stats ? (
              <div className="space-y-3">
                {/* Refresh button */}
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={loadData}
                    disabled={loading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                  >
                    <FiRefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{formatTokens(stats.totalInput)}</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Total Input</p>
                  </div>
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{formatTokens(stats.totalOutput)}</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Total Output</p>
                  </div>
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{formatTokens(stats.totalCacheRead)}</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Cache Read</p>
                  </div>
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{formatTokens(stats.totalCacheWrite)}</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Cache Write</p>
                  </div>
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{cacheHitRate}%</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Cache Hit Rate</p>
                  </div>
                  <div className="rounded-md border border-canvas-border px-3 py-2">
                    <p className="text-sm font-bold leading-tight text-canvas-fg">{estimateCost(stats)}</p>
                    <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">Est. Cost</p>
                  </div>
                </div>

                {/* Session count */}
                <div className="flex items-center gap-4 text-[11px] text-canvas-muted">
                  <span>Sessions: <span className="font-mono text-canvas-fg">{stats.sessionCount}</span></span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-canvas-muted">No token data available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
