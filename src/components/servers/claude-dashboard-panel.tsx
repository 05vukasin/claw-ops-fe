"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiFolder, FiKey, FiRefreshCw, FiTerminal, FiX, FiZap, FiDownload } from "react-icons/fi";
import { executeCommandApi, ApiError } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";
import { ClaudeCodeOverlay } from "./claude-code-overlay";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 440;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1000;

function panelKey(serverId: string, suffix: string) {
  return `openclaw-claude-panel-${serverId}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? parseInt(v, 10) || fallback : fallback; } catch { return fallback; }
}
function saveNum(key: string, val: number) {
  try { localStorage.setItem(key, String(Math.round(val))); } catch {}
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ClaudeDashboardPanelProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ClaudeDashboardPanel({ serverId, serverName, onClose, zIndex, onFocus }: ClaudeDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- position ---- */
  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, "x"), 160),
    y: loadNum(panelKey(serverId, "y"), 100),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  const [panelW, setPanelW] = useState(() => loadNum(panelKey(serverId, "w"), PANEL_W));
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  /* ---- data ---- */
  const [version, setVersion] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"authenticated" | "unauthenticated" | "unknown">("unknown");
  const [diskUsage, setDiskUsage] = useState<string | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [configJson, setConfigJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---- sections ---- */
  const [authExpanded, setAuthExpanded] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  /* ---- auth action results ---- */
  const [authResult, setAuthResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ ok: boolean; text: string } | null>(null);

  /* ---- overlay ---- */
  const [showOverlay, setShowOverlay] = useState(false);

  /* ---- Escape ---- */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ---- drag ---- */
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

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
    saveNum(panelKey(serverId, "x"), posRef.current.x);
    saveNum(panelKey(serverId, "y"), posRef.current.y);
  }, [serverId]);

  /* ---- resize ---- */
  const handleResizeStart = useCallback((e: React.PointerEvent, dir: "left" | "right") => {
    e.stopPropagation();
    const startX = e.clientX;
    const startW = panelWRef.current;
    const startPosX = posRef.current.x;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      let newW: number;
      if (dir === "right") { newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW + dx)); }
      else { newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW - dx)); setPos((p) => ({ ...p, x: startPosX + (startW - newW) })); }
      setPanelW(newW);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      saveNum(panelKey(serverId, "w"), panelWRef.current);
      saveNum(panelKey(serverId, "x"), posRef.current.x);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }, [serverId]);

  /* ---- fetch data ---- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cmd = [
        'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
        'claude --version 2>/dev/null || echo "NOT_FOUND"',
        'echo "---CC_SEP---"',
        'claude auth status 2>/dev/null || echo "NOT_AUTHENTICATED"',
        'echo "---CC_SEP---"',
        'du -sh ~/.claude 2>/dev/null | cut -f1 || echo "—"',
        'echo "---CC_SEP---"',
        'ls -1 ~/.claude/projects 2>/dev/null | head -30 || echo ""',
        'echo "---CC_SEP---"',
        'cat ~/.claude/settings.json 2>/dev/null || echo "{}"',
      ].join("; ");

      const result = await executeCommandApi(serverId, cmd, 15);
      const parts = result.stdout.split("---CC_SEP---");

      const vRaw = (parts[0] ?? "").trim();
      setVersion(vRaw !== "NOT_FOUND" ? vRaw.split("\n")[0].trim() || null : null);

      const authRaw = (parts[1] ?? "").trim();
      const isAuth = authRaw.toLowerCase().includes("authenticated") && !authRaw.includes("NOT_AUTHENTICATED");
      setAuthStatus(isAuth ? "authenticated" : "unauthenticated");

      setDiskUsage((parts[2] ?? "").trim() || null);

      const projRaw = (parts[3] ?? "").trim();
      setProjects(projRaw ? projRaw.split("\n").filter((l) => l.trim()) : []);

      const cfgRaw = (parts[4] ?? "").trim();
      setConfigJson(cfgRaw !== "{}" ? cfgRaw : null);
    } catch {
      setAuthStatus("unknown");
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---- auth actions ---- */
  const handleCheckAuth = useCallback(async () => {
    setAuthResult(null);
    try {
      const result = await executeCommandApi(serverId, 'export PATH="$HOME/.local/bin:$PATH" && claude auth status 2>&1', 10);
      const ok = result.stdout.toLowerCase().includes("authenticated") && !result.stdout.includes("NOT_AUTHENTICATED");
      setAuthResult({ ok, text: result.stdout.trim() });
      fetchData();
    } catch (err) {
      setAuthResult({ ok: false, text: err instanceof ApiError ? err.message : "Check failed" });
    }
  }, [serverId, fetchData]);

  const handleLogout = useCallback(async () => {
    if (!window.confirm("Logout Claude Code on this server?")) return;
    try {
      await executeCommandApi(serverId, 'export PATH="$HOME/.local/bin:$PATH" && claude auth logout 2>&1', 10);
      fetchData();
    } catch {}
  }, [serverId, fetchData]);

  /* ---- update ---- */
  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    setUpdateResult(null);
    try {
      const result = await executeCommandApi(serverId, "npm update -g @anthropic-ai/claude-code 2>&1", 120);
      setUpdateResult({ ok: result.exitCode === 0, text: result.stdout.trim().split("\n").slice(-3).join("\n") });
      fetchData();
    } catch (err) {
      setUpdateResult({ ok: false, text: err instanceof ApiError ? err.message : "Update failed" });
    }
    setUpdating(false);
  }, [serverId, fetchData]);

  /* ---- styling ---- */
  const statusBadge = authStatus === "authenticated"
    ? "bg-green-500/10 text-green-600 dark:text-green-400"
    : authStatus === "unauthenticated"
      ? "bg-orange-500/10 text-orange-500 dark:text-orange-400"
      : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const statusLabel = authStatus === "authenticated" ? "Authenticated" : authStatus === "unauthenticated" ? "Not Authenticated" : "Unknown";

  return (
    <>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Claude Code settings"
        className="fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
        style={{
          zIndex: zIndex ?? Z_INDEX.DROPDOWN,
          left: pos.x,
          top: pos.y,
          width: panelW,
          maxWidth: "calc(100vw - 16px)",
          maxHeight: "85vh",
        }}
        onPointerDown={(e) => { onFocus?.(); handlePointerDown(e); }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Resize handles */}
        <div className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "left")} />
        <div className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "right")} />

        {/* ===== HEADER ===== */}
        <div
          data-drag-handle
          className="flex shrink-0 cursor-grab items-center gap-3 border-b border-canvas-border px-5 py-3.5 select-none active:cursor-grabbing"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E87B35]" data-drag-handle>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" fill="white" stroke="white" strokeWidth="0.5" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="min-w-0 flex-1" data-drag-handle>
            <p className="truncate text-sm font-semibold leading-tight text-canvas-fg" data-drag-handle>Claude Code</p>
            <p className="text-[11px] text-canvas-muted" data-drag-handle>{serverName}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
            {statusLabel}
          </span>
          <button type="button" onClick={fetchData} className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg" title="Refresh">
            <FiRefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg">
            <FiX size={16} />
          </button>
        </div>

        {/* ===== BODY ===== */}
        <div className="flex-1 overflow-y-auto">

          {/* Status info — always visible */}
          <div className="border-b border-canvas-border px-5 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <InfoCell label="Version" value={version ?? "—"} />
              <InfoCell label="Status" value={statusLabel} />
              <InfoCell label="Disk Usage" value={diskUsage ?? "—"} />
              <InfoCell label="Projects" value={String(projects.length)} />
            </div>
          </div>

          {/* AUTHENTICATION */}
          <div className="border-b border-canvas-border">
            <button type="button" onClick={() => setAuthExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
              <FiKey size={13} className="text-canvas-muted" />
              <span className="flex-1 text-xs font-medium text-canvas-muted">Authentication</span>
              <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${authExpanded ? "open" : ""}`} />
            </button>
            <div className={`animate-collapse ${authExpanded ? "open" : ""}`}>
              <div className="collapse-inner">
                <div className="border-t border-canvas-border px-5 py-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ActionBtn onClick={() => setShowOverlay(true)} icon={<FiTerminal size={11} />}>
                      Login (Interactive)
                    </ActionBtn>
                    <ActionBtn onClick={handleCheckAuth} icon={<FiZap size={11} />}>
                      Check Status
                    </ActionBtn>
                    {authStatus === "authenticated" && (
                      <ActionBtn onClick={handleLogout} icon={<FiX size={11} />} danger>Logout</ActionBtn>
                    )}
                  </div>
                  <p className="text-[10px] text-canvas-muted">
                    Login opens an interactive terminal to complete the OAuth flow.
                  </p>
                  {authResult && (
                    <pre className={`rounded-md border px-3 py-2 font-mono text-[11px] whitespace-pre-wrap ${
                      authResult.ok
                        ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
                        : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
                    }`}>
                      {authResult.text}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* PROJECTS */}
          <div className="border-b border-canvas-border">
            <button type="button" onClick={() => setProjectsExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
              <FiFolder size={13} className="text-canvas-muted" />
              <span className="flex-1 text-xs font-medium text-canvas-muted">Projects</span>
              {projects.length > 0 && <span className="text-[10px] text-canvas-muted">{projects.length}</span>}
              <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${projectsExpanded ? "open" : ""}`} />
            </button>
            <div className={`animate-collapse ${projectsExpanded ? "open" : ""}`}>
              <div className="collapse-inner">
                <div className="border-t border-canvas-border">
                  {projects.length === 0 ? (
                    <p className="px-5 py-3 text-[11px] text-canvas-muted">No projects found</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto divide-y divide-canvas-border">
                      {projects.map((p) => (
                        <div key={p} className="flex items-center gap-2 px-5 py-1.5">
                          <FiFolder size={11} className="shrink-0 text-canvas-muted" />
                          <span className="min-w-0 truncate text-[11px] text-canvas-fg">{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {diskUsage && (
                    <div className="border-t border-canvas-border px-5 py-2">
                      <span className="text-[10px] text-canvas-muted">Total: {diskUsage}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <div className="border-b border-canvas-border">
            <button type="button" onClick={() => setActionsExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
              <FiZap size={13} className="text-canvas-muted" />
              <span className="flex-1 text-xs font-medium text-canvas-muted">Quick Actions</span>
              <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${actionsExpanded ? "open" : ""}`} />
            </button>
            <div className={`animate-collapse ${actionsExpanded ? "open" : ""}`}>
              <div className="collapse-inner">
                <div className="border-t border-canvas-border px-5 py-4 space-y-2">
                  <ActionBtn onClick={() => setShowOverlay(true)} icon={<FiTerminal size={11} />}>
                    Open Claude Code
                  </ActionBtn>
                  <ActionBtn onClick={handleUpdate} icon={<FiDownload size={11} />} disabled={updating}>
                    {updating ? "Updating..." : "Update Claude Code"}
                  </ActionBtn>
                  {updateResult && (
                    <pre className={`rounded-md border px-3 py-2 font-mono text-[10px] whitespace-pre-wrap ${
                      updateResult.ok
                        ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
                        : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
                    }`}>
                      {updateResult.text}
                    </pre>
                  )}
                  {configJson && (
                    <div className="mt-2">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted mb-1">Config</p>
                      <pre className="max-h-32 overflow-y-auto rounded-md bg-canvas-surface-hover px-3 py-2 font-mono text-[10px] text-canvas-fg whitespace-pre-wrap">
                        {configJson}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showOverlay && (
        <ClaudeCodeOverlay
          serverId={serverId}
          serverName={serverName}
          onClose={() => { setShowOverlay(false); fetchData(); }}
        />
      )}
    </>
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

function ActionBtn({ children, onClick, icon, danger, disabled }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-canvas-surface-hover disabled:opacity-50 ${
        danger ? "text-red-500 dark:text-red-400" : "text-canvas-muted hover:text-canvas-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
