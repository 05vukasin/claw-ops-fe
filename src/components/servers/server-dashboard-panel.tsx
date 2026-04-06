"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronRight,
  FiServer,
  FiShield,
  FiTerminal,
  FiTrash2,
  FiX,
  FiEdit2,
  FiRefreshCw,
  FiWifi,
} from "react-icons/fi";
import { TerminalSection, type TerminalSectionHandle } from "./terminal-section";
import { HealthSection } from "./health-section";
import { ScriptsSection } from "./scripts-section";
import { FileBrowser, type FileBrowserHandle } from "./file-browser";
import { Z_INDEX } from "@/lib/z-index";
import {
  testConnectionApi,
  fetchSslForServer,
  fetchAssignmentForServer,
  provisionSslApi,
  renewSslApi,
  fetchSslJobApi,
  retrySslJobApi,
  deleteServerApi,
  checkClaudeCodeInstalledApi,
  ApiError,
  type Server,
  type SslCertificate,
  type SslJob,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 480;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1400;

/** Per-server localStorage helpers */
function panelKey(serverId: string, suffix: string) {
  return `openclaw-panel-${serverId}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? parseInt(v, 10) || fallback : fallback; } catch { return fallback; }
}
function saveNum(key: string, val: number) {
  try { localStorage.setItem(key, String(Math.round(val))); } catch {}
}

interface PanelPos {
  x: number;
  y: number;
}

const DEFAULT_POS: PanelPos = { x: 80, y: 80 };

const STATUS_STYLE: Record<string, string> = {
  ONLINE: "bg-green-400",
  OFFLINE: "bg-red-400",
  ERROR: "bg-orange-400",
  UNKNOWN: "bg-yellow-400",
};

const SSL_BADGE: Record<string, string> = {
  ACTIVE: "text-green-600 dark:text-green-400",
  FAILED: "text-red-500 dark:text-red-400",
  PROVISIONING: "text-yellow-600 dark:text-yellow-400",
  EXPIRED: "text-orange-600 dark:text-orange-400",
  PENDING: "text-yellow-600 dark:text-yellow-400",
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ServerDashboardPanelProps {
  server: Server;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (server: Server) => void;
  onFileOpen?: (serverId: string, file: import("@/lib/api").SftpFile) => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ServerDashboardPanel({
  server,
  onClose,
  onDelete,
  onEdit,
  onFileOpen,
  zIndex,
  onFocus,
}: ServerDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- position (per-server) ---- */
  const [pos, setPos] = useState<PanelPos>(() => ({
    x: loadNum(panelKey(server.id, "x"), DEFAULT_POS.x),
    y: loadNum(panelKey(server.id, "y"), DEFAULT_POS.y),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  /* ---- panel width (per-server) ---- */
  const [panelW, setPanelW] = useState<number>(() => loadNum(panelKey(server.id, "w"), PANEL_W));
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  /* ---- sections ---- */
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [sslExpanded, setSslExpanded] = useState(false);
  const [termExpanded, setTermExpanded] = useState(() => loadNum(panelKey(server.id, "term"), 0) === 1);
  const termRef = useRef<TerminalSectionHandle>(null);
  const fileBrowserRef = useRef<FileBrowserHandle>(null);
  const [fileBrowserH, setFileBrowserH] = useState(200);
  const fileBrowserHRef = useRef(200);
  const [panelH, setPanelH] = useState<number | null>(null);

  /* ---- Claude Code detection ---- */
  const [claudeInstalled, setClaudeInstalled] = useState<"unknown" | "checking" | "installed" | "not-installed">("unknown");
  useEffect(() => {
    if (server.status !== "ONLINE") return;
    let stale = false;
    checkClaudeCodeInstalledApi(server.id)
      .then((ok) => { if (!stale) setClaudeInstalled(ok ? "installed" : "not-installed"); })
      .catch(() => { if (!stale) setClaudeInstalled("unknown"); });
    return () => { stale = true; };
  }, [server.id, server.status]);

  /* ---- test connection ---- */
  const [testState, setTestState] = useState<"idle" | "loading" | "ok" | "fail">("idle");
  const [testMsg, setTestMsg] = useState("");

  /* ---- SSL ---- */
  const [ssl, setSsl] = useState<SslCertificate | null>(null);
  const [sslLoading, setSslLoading] = useState(false);
  const [sslJob, setSslJob] = useState<SslJob | null>(null);
  const [showLog, setShowLog] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- drag ---- */
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  /* ---- Escape to close ---- */
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  /* ---- cleanup SSL polling on unmount ---- */
  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  /* ---- drag handlers ---- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-drag-handle]")) return;
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - panelWRef.current));
    const panelH = panelRef.current?.offsetHeight ?? 200;
    const ny = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - panelH));
    setPos({ x: nx, y: ny });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Persist position
    saveNum(panelKey(server.id, "x"), posRef.current.x);
    saveNum(panelKey(server.id, "y"), posRef.current.y);
  }, [server.id]);

  /* ---- resize ---- */
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, dir: "left" | "right") => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = panelWRef.current;
      const startPanelX = posRef.current.x;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW + (dir === "right" ? dx : -dx)));
        setPanelW(newW);
        if (dir === "left") {
          const newX = Math.max(0, startPanelX + startW - newW);
          setPos((p) => ({ ...p, x: newX }));
        }
      }
      function onUp() {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        saveNum(panelKey(server.id, "w"), panelWRef.current);
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [],
  );

  /* ---- split resize (files ↔ terminal) ---- */
  const handleSplitResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = fileBrowserHRef.current;
    function onMove(ev: PointerEvent) {
      const dy = ev.clientY - startY;
      const newH = Math.max(80, Math.min(400, startH + dy));
      setFileBrowserH(newH);
      fileBrowserHRef.current = newH;
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }, []);

  /* ---- bottom resize (panel height) ---- */
  const handleBottomResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = panelRef.current?.offsetHeight ?? 600;
    function onMove(ev: PointerEvent) {
      const dy = ev.clientY - startY;
      const newH = Math.max(300, Math.min(window.innerHeight - posRef.current.y - 8, startH + dy));
      setPanelH(newH);
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }, []);

  /* ---- actions ---- */
  const handleTest = useCallback(async () => {
    setTestState("loading");
    setTestMsg("");
    try {
      const data = await testConnectionApi(server.id);
      setTestState(data.success ? "ok" : "fail");
      setTestMsg(
        data.success
          ? `Connection OK${data.latencyMs ? ` (${data.latencyMs}ms)` : ""}`
          : data.message || "Connection failed",
      );
    } catch (err) {
      setTestState("fail");
      setTestMsg(err instanceof ApiError ? err.message : "Test failed");
    }
  }, [server.id]);

  /* ---- SSL job polling ---- */
  const pollSslJob = useCallback((jobId: string) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const poll = async () => {
      try {
        const job = await fetchSslJobApi(jobId);
        setSslJob(job);
        if (job.status === "COMPLETED") {
          // Refresh SSL cert status — may still 404 right after completion
          try {
            const updated = await fetchSslForServer(server.id);
            if (updated) setSsl(updated);
            else setSsl({ id: "", serverId: server.id, status: "ACTIVE", lastError: null, provisioningJobId: jobId });
          } catch {
            setSsl({ id: "", serverId: server.id, status: "ACTIVE", lastError: null, provisioningJobId: jobId });
          }
          return;
        }
        if (job.status === "FAILED") {
          setSsl((prev) => prev
            ? { ...prev, status: "FAILED", lastError: job.errorMessage, provisioningJobId: jobId }
            : { id: "", serverId: server.id, status: "FAILED", lastError: job.errorMessage, provisioningJobId: jobId },
          );
          return;
        }
        pollRef.current = setTimeout(poll, 2000);
      } catch {
        pollRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
  }, [server.id]);

  const handleProvisionSsl = useCallback(async () => {
    setSslLoading(true);
    try {
      const job = await provisionSslApi(server.id);
      if (job) {
        setSsl({
          id: "",
          serverId: server.id,
          status: "PROVISIONING",
          lastError: null,
          provisioningJobId: job.id,
        });
        setSslJob(job);
        setShowLog(true);
        setSslExpanded(true);
        pollSslJob(job.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // "already running" — show as PROVISIONING, not FAILED
        const isAlreadyRunning = err.status === 422 || err.status === 409;
        setSsl((prev) => prev
          ? { ...prev, status: isAlreadyRunning ? "PROVISIONING" : "FAILED", lastError: err.message }
          : { id: "", serverId: server.id, status: isAlreadyRunning ? "PROVISIONING" : "FAILED", lastError: err.message, provisioningJobId: null },
        );
      }
    }
    setSslLoading(false);
  }, [server.id, pollSslJob]);

  const handleRenewSsl = useCallback(async () => {
    if (!ssl) return;
    setSslLoading(true);
    try {
      await renewSslApi(ssl.id);
      const updated = await fetchSslForServer(server.id);
      setSsl(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setSsl((prev) => prev ? { ...prev, lastError: err.message } : prev);
      }
    }
    setSslLoading(false);
  }, [ssl, server.id]);

  const handleViewLog = useCallback(async (jobId: string) => {
    setSslExpanded(true);
    setShowLog(true);
    // Immediately fetch the job so the panel shows right away
    try {
      const job = await fetchSslJobApi(jobId);
      setSslJob(job);
      // If still running, start polling
      if (job.status !== "COMPLETED" && job.status !== "FAILED") {
        pollSslJob(jobId);
      }
    } catch {
      pollSslJob(jobId);
    }
  }, [pollSslJob]);

  const handleRetryJob = useCallback(async () => {
    if (!sslJob) return;
    try {
      const job = await retrySslJobApi(sslJob.id);
      setSslJob(job);
      pollSslJob(job.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setSslJob((prev) => prev ? { ...prev, status: "FAILED", errorMessage: err.message } : prev);
      }
    }
  }, [sslJob, pollSslJob]);

  /* ---- load SSL on mount (run once) ---- */
  const pollSslJobRef = useRef(pollSslJob);
  pollSslJobRef.current = pollSslJob;
  const sslLoadedRef = useRef(false);

  useEffect(() => {
    if (sslLoadedRef.current) return;
    sslLoadedRef.current = true;
    let cancelled = false;

    fetchSslForServer(server.id).then((cert) => {
      if (cancelled || !cert) return;
      setSsl(cert);
      if (cert.provisioningJobId && (cert.status === "PROVISIONING" || cert.status === "PENDING")) {
        setSslExpanded(true);
        setShowLog(true);
        pollSslJobRef.current(cert.provisioningJobId);
      }
    }).catch(() => { /* 404 = no cert, that's fine */ });

    return () => { cancelled = true; };
  }, [server.id]);

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete server "${server.name}"? This cannot be undone.`)) {
      deleteServerApi(server.id).catch(() => {});
      onDelete(server.id);
    }
  }, [server.id, server.name, onDelete]);

  /* ---- derived ---- */
  const dotColor = STATUS_STYLE[server.status] ?? STATUS_STYLE.UNKNOWN;
  const authLabel =
    server.authType === "PASSWORD"
      ? "Password"
      : server.passphraseCredentialId
        ? "Key + Passphrase"
        : "Private Key";
  const parsedDate = server.createdAt ? new Date(server.createdAt) : null;
  const formattedDate =
    parsedDate && !isNaN(parsedDate.getTime())
      ? parsedDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "—";

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Dashboard for ${server.name}`}
      className="fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
      style={{
        zIndex: zIndex ?? Z_INDEX.DROPDOWN,
        left: pos.x,
        top: pos.y,
        width: panelW,
        maxWidth: "calc(100vw - 16px)",
        transition: "height 500ms cubic-bezier(0.4, 0, 0.2, 1)",
        ...(termExpanded
          ? { height: panelH ?? "85vh" }
          : { maxHeight: "85vh" }),
      }}
      onPointerDown={(e) => { onFocus?.(); handlePointerDown(e); }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Resize handles */}
      <div className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "left")} />
      {termExpanded && (
        <div className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-ns-resize" onPointerDown={handleBottomResizeStart} />
      )}
      <div className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "right")} />

      {/* ===== HEADER (drag handle) ===== */}
      <div
        data-drag-handle
        className="flex shrink-0 cursor-grab items-center gap-3 border-b border-canvas-border px-5 py-3.5 select-none active:cursor-grabbing"
      >
        {/* Server icon */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-canvas-border" data-drag-handle>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-canvas-muted">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
            <line x1="6" y1="6" x2="6.01" y2="6" />
            <line x1="6" y1="18" x2="6.01" y2="18" />
          </svg>
        </div>

        <div className="min-w-0 flex-1" data-drag-handle>
          <p className="truncate text-sm font-semibold leading-tight text-canvas-fg" data-drag-handle>
            {server.name}
          </p>
          <p className="text-[11px] text-canvas-muted" data-drag-handle>
            {server.hostname || server.ipAddress}
          </p>
        </div>

        <span className="flex items-center gap-1.5 rounded-full border border-canvas-border px-2.5 py-1 text-[10px] font-medium text-canvas-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {server.status}
        </span>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* ===== Panel body ===== */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* ── Collapsing sections (animated with CSS Grid) ── */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-500"
          style={{
            gridTemplateRows: termExpanded ? "0fr" : "1fr",
            opacity: termExpanded ? 0 : 1,
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className={termExpanded ? "" : "overflow-y-auto"} style={termExpanded ? undefined : { maxHeight: "calc(85vh - 70px)" }}>

              {/* Domain row */}
              {server.assignedDomain && (
                <div className="border-b border-canvas-border px-5 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Domain</p>
                  <p className="mt-0.5 font-mono text-xs text-canvas-fg">{server.assignedDomain}</p>
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-2 border-b border-canvas-border px-5 py-3">
                <ActionBtn onClick={handleTest} disabled={testState === "loading"} icon={<FiWifi size={13} />}>
                  {testState === "loading" ? "Testing..." : "Test Connection"}
                </ActionBtn>
                <ActionBtn onClick={() => onEdit(server)} icon={<FiEdit2 size={13} />}>
                  Edit
                </ActionBtn>
                {claudeInstalled === "installed" && (
                  <ActionBtn
                    onClick={() => {
                      setTermExpanded(true);
                      saveNum(panelKey(server.id, "term"), 1);
                      setTimeout(() => {
                        termRef.current?.queueCommand("export PATH=\"$HOME/.local/bin:$PATH\" && claude\r");
                      }, 100);
                    }}
                    icon={<FiTerminal size={13} />}
                  >
                    Claude Code
                  </ActionBtn>
                )}
              </div>

              {/* Test result */}
              {testState !== "idle" && testState !== "loading" && (
                <div className={`border-b border-canvas-border px-5 py-2 text-[11px] ${testState === "ok" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                  {testMsg}
                </div>
              )}

              {/* SERVER DETAILS */}
              <div className="border-b border-canvas-border">
                <button type="button" onClick={() => setDetailsExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
                  <FiServer size={13} className="text-canvas-muted" />
                  <span className="flex-1 text-xs font-medium text-canvas-muted">Server Details</span>
                  <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${detailsExpanded ? "open" : ""}`} />
                </button>
                <div className={`animate-collapse ${detailsExpanded ? "open" : ""}`}>
                  <div className="collapse-inner">
                    <div className="border-t border-canvas-border px-5 py-4">
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <InfoCell label="Host" value={server.hostname || server.ipAddress || "—"} />
                        <InfoCell label="Port" value={String(server.sshPort)} />
                        <InfoCell label="Username" value={server.sshUsername} />
                        <InfoCell label="Auth" value={authLabel} />
                        <InfoCell label="Environment" value={server.environment || "default"} />
                        <InfoCell label="Created" value={formattedDate} />
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button type="button" onClick={handleDelete} className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/5 dark:text-red-400 dark:hover:bg-red-400/5">
                          <FiTrash2 size={13} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* HEALTH */}
              <HealthSection serverId={server.id} />

              {/* SSL */}
              <div className="border-b border-canvas-border">
                <button type="button" onClick={() => setSslExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
                  <FiShield size={13} className="text-canvas-muted" />
                  <span className="flex-1 text-xs font-medium text-canvas-muted">SSL Certificate</span>
                  <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${sslExpanded ? "open" : ""}`} />
                </button>
                <div className={`animate-collapse ${sslExpanded ? "open" : ""}`}>
                  <div className="collapse-inner">
                    <div className="border-t border-canvas-border px-5 py-4">
                    {ssl ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-medium ${SSL_BADGE[ssl.status] ?? "text-canvas-muted"}`}>{ssl.status}</p>
                            {ssl.status === "PROVISIONING" && <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-yellow-400" />}
                            {ssl.status === "PROVISIONING" && sslJob && <span className="text-[10px] text-canvas-muted">{STEP_LABELS[sslJob.currentStep] ?? sslJob.currentStep}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            {ssl.status === "ACTIVE" && <ActionBtn onClick={handleRenewSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Renew</ActionBtn>}
                            {ssl.provisioningJobId && <ActionBtn onClick={() => handleViewLog(ssl.provisioningJobId!)}>View Log</ActionBtn>}
                            {ssl.status === "FAILED" && <ActionBtn onClick={handleProvisionSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Retry</ActionBtn>}
                          </div>
                        </div>
                        {ssl.lastError && <p className="text-[11px] text-red-500 dark:text-red-400">{ssl.lastError}</p>}
                        {showLog && (
                          sslJob ? (
                            <SslLogPanel job={sslJob} onRetry={handleRetryJob} onClose={() => { setShowLog(false); if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; } }} />
                          ) : (
                            <div className="mt-2 rounded-md border border-canvas-border bg-[#0d1117] px-3 py-4 text-center text-[11px] text-gray-500">Loading job logs...</div>
                          )
                        )}
                      </div>
                    ) : server.assignedDomain ? (
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-canvas-muted">No certificate provisioned</p>
                        <ActionBtn onClick={handleProvisionSsl} disabled={sslLoading} icon={<FiShield size={11} />}>{sslLoading ? "Provisioning..." : "Provision"}</ActionBtn>
                      </div>
                    ) : (
                      <p className="text-[11px] text-canvas-muted">No domain assigned — SSL not available</p>
                    )}
                  </div>
                  </div>
                </div>
              </div>

              {/* SCRIPTS */}
              <ScriptsSection serverId={server.id} />
            </div>
          </div>
        </div>

        {/* ── Terminal section (grows to fill when expanded) ── */}
        <div className={`flex flex-col transition-[flex] duration-500 ${termExpanded ? "flex-1 min-h-0" : "shrink-0"}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)" }}
        >
          {/* Toggle button — always visible */}
          <button
            type="button"
            onClick={() => {
              setTermExpanded((prev) => {
                if (prev) {
                  setPanelH(null);
                } else {
                  // Expanding — smoothly nudge panel up if it would overflow
                  const expandedH = panelH ?? window.innerHeight * 0.85;
                  const maxY = window.innerHeight - expandedH - 8;
                  if (posRef.current.y > maxY && maxY > 0) {
                    const startY = posRef.current.y;
                    const targetY = Math.max(8, maxY);
                    const duration = 400;
                    const startTime = performance.now();
                    const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    function animate(now: number) {
                      const t = Math.min((now - startTime) / duration, 1);
                      const y = startY + (targetY - startY) * ease(t);
                      setPos((p) => ({ ...p, y }));
                      if (t < 1) requestAnimationFrame(animate);
                      else saveNum(panelKey(server.id, "y"), targetY);
                    }
                    requestAnimationFrame(animate);
                  }
                }
                const next = !prev;
                saveNum(panelKey(server.id, "term"), next ? 1 : 0);
                return next;
              });
            }}
            className="flex w-full shrink-0 items-center gap-2 border-y border-canvas-border px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
          >
            <FiTerminal size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">Terminal</span>
            <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${termExpanded ? "open" : ""}`} />
          </button>

          {/* Files + Terminal content */}
          {termExpanded && (
            <div className="flex flex-1 flex-col min-h-0 animate-fade-slide-in">
              {/* File browser — fixed height, resizable */}
              <div style={{ height: fileBrowserH, flexShrink: 0 }} className="overflow-hidden">
                <FileBrowser
                  ref={fileBrowserRef}
                  serverId={server.id}
                  onFileClick={(cmd) => termRef.current?.sendCommand(cmd)}
                  onFileOpen={onFileOpen ? (file) => onFileOpen(server.id, file) : undefined}
                  onRunCommand={(cmd) => termRef.current?.queueCommand(cmd)}
                  height={fileBrowserH}
                />
              </div>

              {/* Draggable split divider */}
              <div
                className="h-1 shrink-0 cursor-row-resize bg-[#21262d] transition-colors hover:bg-blue-500/30 active:bg-blue-500/50"
                onPointerDown={handleSplitResizeStart}
              />

              {/* Terminal — fills remaining space */}
              <div className="flex flex-1 flex-col min-h-0">
                <TerminalSection
                  ref={termRef}
                  serverId={server.id}
                  onDirectoryChange={(path) => fileBrowserRef.current?.navigateTo(path)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/* ── Sub-components ── */

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">{label}</p>
      <p className="mt-0.5 truncate text-xs text-canvas-fg">{value}</p>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

/* ── SSL Log Panel (inline in the SSL section) ── */

const STEP_LABELS: Record<string, string> = {
  PENDING_DNS: "Creating DNS record",
  DNS_CREATED: "Waiting for DNS propagation",
  DNS_PROPAGATED: "DNS propagated",
  ISSUING_CERT: "Running certbot",
  CERT_ISSUED: "Certificate issued",
  DEPLOYING_CONFIG: "Deploying nginx config",
  VERIFYING: "Verifying HTTPS",
  COMPLETED: "Completed",
  FAILED_RETRYABLE: "Failed (retryable)",
  FAILED_PERMANENT: "Failed (permanent)",
};

function SslLogPanel({
  job,
  onRetry,
  onClose,
}: {
  job: SslJob;
  onRetry: () => void;
  onClose: () => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.logs]);

  const stepLabel = STEP_LABELS[job.currentStep] ?? job.currentStep;
  const stepClass =
    job.status === "COMPLETED"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : job.status === "FAILED"
        ? "bg-red-500/10 text-red-500 dark:text-red-400"
        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const meta: string[] = [];
  meta.push(`Job: ${job.id.substring(0, 8)}`);
  if (job.retryCount > 0) meta.push(`Retry #${job.retryCount}`);
  if (job.startedAt) meta.push(`Started: ${new Date(job.startedAt).toLocaleTimeString()}`);
  if (job.finishedAt && job.startedAt) {
    const dur = Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000);
    meta.push(`Duration: ${dur}s`);
  }

  return (
    <div className="mt-2 rounded-md border border-canvas-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-canvas-surface-hover/50 px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepClass}`}>
          {stepLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-canvas-muted hover:text-canvas-fg"
        >
          Close
        </button>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-3 px-3 py-1.5 text-[10px] text-canvas-muted border-b border-canvas-border">
        {meta.map((m, i) => <span key={i}>{m}</span>)}
      </div>

      {/* Error */}
      {job.errorMessage && (
        <div className="mx-3 mt-2 rounded border border-red-900/30 bg-[#1c0a0a] px-3 py-2 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
          {job.errorMessage}
        </div>
      )}

      {/* Log output */}
      <pre
        ref={logRef}
        className="max-h-50 overflow-y-auto bg-[#0d1117] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all"
      >
        {job.logs || "Waiting for logs..."}
      </pre>

      {/* Retry button */}
      {job.status === "FAILED" && job.currentStep === "FAILED_RETRYABLE" && (
        <div className="flex justify-end border-t border-canvas-border px-3 py-2">
          <ActionBtn onClick={onRetry} icon={<FiRefreshCw size={11} />}>
            Retry
          </ActionBtn>
        </div>
      )}
    </div>
  );
}
