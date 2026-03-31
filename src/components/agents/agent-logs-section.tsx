"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiRefreshCw, FiTerminal } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").replace(/\[?[0-9;]*m/g, "");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface AgentLogsSectionProps {
  serverId: string;
  agentName: string;
}

export function AgentLogsSection({ serverId, agentName }: AgentLogsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await executeCommandApi(
        serverId,
        `docker logs --tail 100 ${agentName}-openclaw-gateway-1 2>&1`,
      );
      setLogs(stripAnsi(result.stdout || result.stderr || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
      setLogs("");
    }
    setLoading(false);
  }, [serverId, agentName]);

  // Scroll to bottom when logs update
  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [logs]);

  // Load on expand
  useEffect(() => {
    if (expanded) loadLogs();
  }, [expanded, loadLogs]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && expanded) {
      intervalRef.current = setInterval(loadLogs, 5000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, expanded, loadLogs]);

  // Clear interval on collapse
  useEffect(() => {
    if (!expanded) {
      setAutoRefresh(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [expanded]);

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiTerminal size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Logs</span>
        <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading && !logs ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error && !logs ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : (
              <div className="space-y-3">
                {/* Controls */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[11px] text-canvas-muted">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="h-3 w-3 rounded border-canvas-border"
                    />
                    Auto-refresh
                  </label>
                  <button
                    type="button"
                    onClick={loadLogs}
                    disabled={loading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                  >
                    <FiRefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {/* Log output */}
                <pre
                  ref={preRef}
                  className="max-h-[400px] overflow-auto rounded-md border border-canvas-border bg-gray-950 p-3 font-mono text-[11px] leading-relaxed text-gray-300"
                >
                  {logs || "No logs available."}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
