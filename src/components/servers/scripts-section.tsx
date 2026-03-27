"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronDown,
  FiChevronRight,
  FiCode,
  FiPlay,
  FiSquare,
  FiX,
  FiTerminal,
  FiFileText,
  FiRefreshCw,
  FiSearch,
} from "react-icons/fi";
import {
  fetchScriptsApi,
  fetchDeploymentJobsApi,
  fetchDeploymentJobApi,
  createDeploymentJobApi,
  stopDeploymentJobApi,
  cancelDeploymentJobApi,
  getDeploymentTerminalTokenApi,
  ApiError,
  type DeploymentScript,
  type DeploymentJob,
} from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";

/* ------------------------------------------------------------------ */
/*  Status badge styles                                                */
/* ------------------------------------------------------------------ */

const JOB_BADGE: Record<string, string> = {
  COMPLETED: "text-green-600 dark:text-green-400",
  FAILED: "text-red-500 dark:text-red-400",
  RUNNING: "text-yellow-600 dark:text-yellow-400",
  PENDING: "text-canvas-muted",
  CANCELLED: "text-canvas-muted",
};

const TYPE_BADGE: Record<string, string> = {
  GENERAL: "bg-canvas-surface-hover text-canvas-muted",
  INSTALL: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  REMOVE: "bg-red-500/10 text-red-500 dark:text-red-400",
  UPDATE: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  MAINTENANCE: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ScriptsSectionProps {
  serverId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScriptsSection({ serverId }: ScriptsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [scripts, setScripts] = useState<DeploymentScript[]>([]);
  const [jobs, setJobs] = useState<DeploymentJob[]>([]);
  const [search, setSearch] = useState("");
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);

  // Inline log viewer
  const [logJobId, setLogJobId] = useState<string | null>(null);
  const [logDetail, setLogDetail] = useState<DeploymentJob | null>(null);
  const logPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Terminal popup
  const [termJobId, setTermJobId] = useState<string | null>(null);
  const [termLabel, setTermLabel] = useState("");

  const loadedRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Load data on first expand ── */
  useEffect(() => {
    if (!expanded || loadedRef.current) return;
    loadedRef.current = true;
    fetchScriptsApi(0, 200).then((data) => setScripts(data.content)).catch(() => {});
    loadJobs();
  }, [expanded, serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Auto-refresh while active jobs ── */
  useEffect(() => {
    if (!expanded) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const hasActive = jobs.some((j) => j.status === "PENDING" || j.status === "RUNNING");
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadJobs, 3000);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [expanded, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadJobs = useCallback(() => {
    fetchDeploymentJobsApi(serverId, 30)
      .then((data) => setJobs(data.content))
      .catch(() => {});
  }, [serverId]);

  /* ── Run script ── */
  const handleRun = useCallback(async (scriptId: string, scriptName: string, isInteractive: boolean) => {
    if (runningScriptId) return;
    setRunningScriptId(scriptId);
    try {
      const job = await createDeploymentJobApi({ scriptId, serverId, interactive: isInteractive });
      loadJobs();
      if (isInteractive) {
        setTermJobId(job.id);
        setTermLabel(scriptName);
      } else {
        // Auto-open live logs for non-interactive jobs
        setLogJobId(job.id);
        setLogDetail(job);
        startLogPolling(job.id);
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to run script");
    }
    setRunningScriptId(null);
  }, [serverId, runningScriptId, loadJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Stop / Cancel ── */
  const handleStop = useCallback(async (id: string) => {
    if (!window.confirm("Stop the running script? This will kill the process.")) return;
    try {
      await stopDeploymentJobApi(id);
      if (termJobId === id) setTermJobId(null);
      loadJobs();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Stop failed");
    }
  }, [termJobId, loadJobs]);

  const handleCancel = useCallback(async (id: string) => {
    try {
      await cancelDeploymentJobApi(id);
      loadJobs();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Cancel failed");
    }
  }, [loadJobs]);

  /* ── Log polling for running jobs ── */
  const stopLogPolling = useCallback(() => {
    if (logPollRef.current) { clearTimeout(logPollRef.current); logPollRef.current = null; }
  }, []);

  const startLogPolling = useCallback((id: string) => {
    stopLogPolling();
    const poll = async () => {
      try {
        const detail = await fetchDeploymentJobApi(id);
        setLogDetail(detail);
        if (detail.status === "RUNNING" || detail.status === "PENDING") {
          logPollRef.current = setTimeout(poll, 2000);
        } else {
          loadJobs(); // refresh job list when done
        }
      } catch {
        logPollRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
  }, [stopLogPolling, loadJobs]);

  // Cleanup log polling on unmount
  useEffect(() => { return stopLogPolling; }, [stopLogPolling]);

  /* ── View logs ── */
  const handleViewLogs = useCallback(async (id: string) => {
    if (logJobId === id) { setLogJobId(null); setLogDetail(null); stopLogPolling(); return; }
    setLogJobId(id);
    setLogDetail(null);
    stopLogPolling();
    try {
      const detail = await fetchDeploymentJobApi(id);
      setLogDetail(detail);
      // If still active, start polling
      if (detail.status === "RUNNING" || detail.status === "PENDING") {
        startLogPolling(id);
      }
    } catch { setLogDetail(null); }
  }, [logJobId, stopLogPolling, startLogPolling]);

  /* ── Resume terminal ── */
  const handleResume = useCallback((job: DeploymentJob) => {
    setTermJobId(job.id);
    setTermLabel(job.scriptName || "Script");
  }, []);

  /* ── Time formatting ── */
  const formatAgo = (iso: string | null) => {
    if (!iso) return "—";
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const formatDuration = (job: DeploymentJob) => {
    if (!job.startedAt) return "—";
    const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
    const ms = end - new Date(job.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${Math.round(ms / 1000)}s`;
  };

  /* ── Filtered scripts ── */
  const filtered = search
    ? scripts.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.scriptType.toLowerCase().includes(search.toLowerCase()) ||
        (s.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : scripts;

  return (
    <div className="border-b border-canvas-border">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiCode size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Scripts</span>
        {expanded ? <FiChevronDown size={14} className="text-canvas-muted" /> : <FiChevronRight size={14} className="text-canvas-muted" />}
      </button>

      {expanded && (
        <div className="border-t border-canvas-border">

          {/* ===== SCRIPT LIBRARY ===== */}
          <div className="border-b border-canvas-border">
            {/* Search bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-canvas-border">
              <FiSearch size={11} className="shrink-0 text-canvas-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scripts..."
                className="min-w-0 flex-1 bg-transparent text-[11px] text-canvas-fg placeholder:text-canvas-muted outline-none"
              />
            </div>

            {/* Script list */}
            <div className="max-h-[180px] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-5 py-3 text-center text-[10px] text-canvas-muted">
                  {scripts.length === 0 ? "No scripts available" : "No matches"}
                </p>
              ) : (
                <div className="divide-y divide-canvas-border">
                  {filtered.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-canvas-surface-hover">
                      {/* Type badge */}
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${TYPE_BADGE[s.scriptType] ?? TYPE_BADGE.GENERAL}`}>
                        {s.scriptType}
                      </span>

                      {/* Name + description */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-canvas-fg">{s.name}</p>
                        {s.description && (
                          <p className="truncate text-[9px] text-canvas-muted">{s.description}</p>
                        )}
                      </div>

                      {/* Run button */}
                      <button
                        type="button"
                        onClick={() => handleRun(s.id, s.name, true)}
                        disabled={runningScriptId === s.id}
                        title="Run interactive"
                        className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-fg/5 hover:text-canvas-fg disabled:opacity-40"
                      >
                        <FiPlay size={10} />
                        Run
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ===== JOB HISTORY ===== */}
          <div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-canvas-border">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Job History</span>
              <button
                type="button"
                onClick={loadJobs}
                className="flex items-center gap-1 text-[10px] text-canvas-muted transition-colors hover:text-canvas-fg"
              >
                <FiRefreshCw size={9} />
                Refresh
              </button>
            </div>

            {/* Job list */}
            <div className="max-h-[220px] overflow-y-auto">
              {jobs.length === 0 ? (
                <p className="px-5 py-3 text-center text-[10px] text-canvas-muted">No jobs yet</p>
              ) : (
                <div className="divide-y divide-canvas-border">
                  {jobs.map((job) => (
                    <div key={job.id}>
                      {/* Job row */}
                      <div className="flex items-center gap-2 px-4 py-1.5">
                        {/* Status */}
                        <span className={`shrink-0 text-[9px] font-semibold uppercase ${JOB_BADGE[job.status] ?? "text-canvas-muted"}`}>
                          {job.status === "RUNNING" && (
                            <span className="mr-0.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400 align-middle" />
                          )}
                          {job.status}
                        </span>

                        {/* Script name */}
                        <span className="min-w-0 flex-1 truncate text-[11px] text-canvas-fg">
                          {job.scriptName || "—"}
                        </span>

                        {/* Time */}
                        <span className="shrink-0 text-[9px] text-canvas-muted">
                          {job.status === "RUNNING" || job.status === "PENDING" ? formatAgo(job.startedAt) : formatDuration(job)}
                        </span>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          {job.status === "RUNNING" && (
                            <>
                              <SmBtn onClick={() => handleStop(job.id)} icon={<FiSquare size={9} />} danger>Stop</SmBtn>
                              {job.interactive && (
                                <SmBtn onClick={() => handleResume(job)} icon={<FiTerminal size={9} />}>Resume</SmBtn>
                              )}
                              {!job.interactive && (
                                <SmBtn onClick={() => handleViewLogs(job.id)} icon={<FiFileText size={9} />}>
                                  {logJobId === job.id ? "Hide" : "Logs"}
                                </SmBtn>
                              )}
                            </>
                          )}
                          {job.status === "PENDING" && (
                            <SmBtn onClick={() => handleCancel(job.id)} icon={<FiX size={9} />}>Cancel</SmBtn>
                          )}
                          {(job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") && (
                            <SmBtn onClick={() => handleViewLogs(job.id)} icon={<FiFileText size={9} />}>
                              {logJobId === job.id ? "Hide" : "Logs"}
                            </SmBtn>
                          )}
                        </div>
                      </div>

                      {/* Inline log panel */}
                      {logJobId === job.id && (
                        <div className="border-t border-canvas-border">
                          {logDetail ? (
                            <div>
                              {logDetail.errorMessage && (
                                <div className="mx-3 mt-2 rounded border border-red-900/30 bg-[#1c0a0a] px-3 py-2 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
                                  {logDetail.errorMessage}
                                </div>
                              )}
                              <pre className="max-h-[200px] overflow-y-auto bg-[#0d1117] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all">
                                {logDetail.logs || "(no output)"}
                              </pre>
                            </div>
                          ) : (
                            <p className="bg-[#0d1117] px-3 py-4 text-center text-[11px] text-gray-500">Loading logs...</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Terminal popup (portal-like overlay within the panel) ===== */}
      {termJobId && (
        <TerminalPopup
          jobId={termJobId}
          label={termLabel}
          onStop={() => handleStop(termJobId)}
          onClose={() => { setTermJobId(null); loadJobs(); }}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Small action button                                                */
/* ================================================================== */

function SmBtn({
  children,
  onClick,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors hover:bg-canvas-surface-hover ${
        danger ? "text-red-500 dark:text-red-400" : "text-canvas-muted hover:text-canvas-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ================================================================== */
/*  Terminal popup (fixed overlay with xterm.js)                       */
/* ================================================================== */

interface TerminalPopupProps {
  jobId: string;
  label: string;
  onStop: () => void;
  onClose: () => void;
}

function TerminalPopup({ jobId, label, onStop, onClose }: TerminalPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "completed" | "failed" | "closed">("connecting");

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const initTimer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;

      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(async ([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !containerRef.current || xtermRef.current) return;

        const term = new Terminal({
          cursorBlink: true,
          cursorStyle: "bar",
          fontSize: 13,
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, Monaco, monospace",
          lineHeight: 1.4,
          scrollback: 5000,
          theme: {
            background: "#0d1117",
            foreground: "#c9d1d9",
            cursor: "#58a6ff",
            selectionBackground: "#264f78",
            black: "#484f58", red: "#ff7b72", green: "#3fb950", yellow: "#d29922",
            blue: "#58a6ff", magenta: "#bc8cff", cyan: "#39c5cf", white: "#b1bac4",
            brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#56d364",
            brightYellow: "#e3b341", brightBlue: "#79c0ff", brightMagenta: "#d2a8ff",
            brightCyan: "#56d4dd", brightWhite: "#f0f6fc",
          },
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);
        fit.fit();
        xtermRef.current = term;
        fitRef.current = fit;

        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection()).catch(() => {});
            term.clearSelection();
            return false;
          }
          return true;
        });

        term.onData((data: string) => {
          wsRef.current?.send(JSON.stringify({ type: "INPUT", data }));
        });

        containerRef.current!.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          navigator.clipboard.readText()
            .then((text) => {
              if (text && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "INPUT", data: text }));
              }
            })
            .catch(() => {});
        });

        const observer = new ResizeObserver(() => { fit.fit(); });
        observer.observe(containerRef.current!);

        try {
          const token = await getDeploymentTerminalTokenApi(jobId);
          const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
          const ws = new WebSocket(`${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&mode=deployment&jobId=${encodeURIComponent(jobId)}`);
          wsRef.current = ws;

          ws.onopen = () => { if (!cancelled) { setStatus("connected"); term.focus(); } };

          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "OUTPUT") term.write(msg.data);
            else if (msg.type === "ERROR") term.writeln(`\r\n\x1b[31m[ERROR] ${msg.data}\x1b[0m`);
            else if (msg.type === "DEPLOYMENT_COMPLETE") { term.writeln("\r\n\x1b[32m--- Script completed ---\x1b[0m"); if (!cancelled) setStatus("completed"); }
            else if (msg.type === "CLOSED") { term.writeln("\r\n\x1b[90m--- Session ended ---\x1b[0m"); if (!cancelled) setStatus("closed"); }
          };

          ws.onclose = () => { if (!cancelled) setStatus("closed"); };
          ws.onerror = () => { term.writeln("\r\n\x1b[31m--- Connection error ---\x1b[0m"); if (!cancelled) setStatus("failed"); };
        } catch (err) {
          term.writeln(`\r\n\x1b[31m[ERROR] ${err instanceof Error ? err.message : "Connection failed"}\x1b[0m`);
          if (!cancelled) setStatus("failed");
        }

        setTimeout(() => { if (!cancelled) fit.fit(); }, 100);
      }).catch(() => {});
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      wsRef.current?.close();
      wsRef.current = null;
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusDot =
    status === "connected" ? "bg-green-400"
    : status === "connecting" ? "bg-yellow-400 animate-pulse"
    : status === "completed" ? "bg-green-400"
    : status === "failed" ? "bg-red-400"
    : "bg-gray-500";

  const statusText =
    status === "connecting" ? "Connecting..."
    : status === "connected" ? "Connected"
    : status === "completed" ? "Completed"
    : status === "failed" ? "Failed"
    : "Closed";

  const isRunning = status === "connected" || status === "connecting";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
      <div className="mx-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-canvas-border bg-[#161b22] px-4 py-2.5">
          <FiTerminal size={14} className="shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#c9d1d9]">{label}</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
          <span className="text-[10px] text-gray-400">{statusText}</span>
        </div>

        {/* xterm */}
        <div
          ref={containerRef}
          style={{ height: 400, padding: "4px 0 4px 6px", background: "#0d1117" }}
        />

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[#21262d] bg-[#161b22] px-4 py-2">
          {isRunning && (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-400/10"
            >
              <FiSquare size={11} />
              Stop Script
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
