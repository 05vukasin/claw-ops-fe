"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiGithub, FiKey, FiSettings, FiX, FiRefreshCw, FiExternalLink, FiCheck, FiAlertCircle } from "react-icons/fi";
import { executeCommandApi, ApiError } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 420;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1000;

function panelKey(serverId: string, suffix: string) {
  return `openclaw-github-panel-${serverId}-${suffix}`;
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

interface GitHubDashboardPanelProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GitHubDashboardPanel({ serverId, serverName, onClose, zIndex, onFocus }: GitHubDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- position ---- */
  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, "x"), 120),
    y: loadNum(panelKey(serverId, "y"), 120),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  /* ---- width ---- */
  const [panelW, setPanelW] = useState(() => loadNum(panelKey(serverId, "w"), PANEL_W));
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  /* ---- data state ---- */
  const [username, setUsername] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"authenticated" | "unauthenticated" | "unknown">("unknown");
  const [maskedToken, setMaskedToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---- sections ---- */
  const [tokenExpanded, setTokenExpanded] = useState(false);
  const [gitConfigExpanded, setGitConfigExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  /* ---- token update ---- */
  const [tokenInput, setTokenInput] = useState("");
  const [tokenUpdating, setTokenUpdating] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* ---- git config edit ---- */
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* ---- test result ---- */
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  /* ---- Escape to close ---- */
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
      if (dir === "right") {
        newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW + dx));
      } else {
        newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW - dx));
        setPos((p) => ({ ...p, x: startPosX + (startW - newW) }));
      }
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
      const result = await executeCommandApi(serverId, `gh auth status 2>&1; echo "---GH_SEP---"; git config --global user.name 2>/dev/null; echo "---GH_SEP---"; git config --global user.email 2>/dev/null; echo "---GH_SEP---"; gh auth token 2>/dev/null`, 10);
      const parts = result.stdout.split("---GH_SEP---");
      const ghStatus = (parts[0] ?? "").trim();
      const gitName = (parts[1] ?? "").trim() || null;
      const gitEmail = (parts[2] ?? "").trim() || null;
      const ghToken = (parts[3] ?? "").trim() || null;

      const match = ghStatus.match(/Logged in to github\.com as (\S+)/i);
      if (match) {
        setUsername(match[1]);
        setAuthStatus("authenticated");
      } else {
        setUsername(gitName);
        setAuthStatus(gitName || gitEmail ? "unauthenticated" : "unknown");
      }
      setEmail(gitEmail);
      setEditName(gitName ?? "");
      setEditEmail(gitEmail ?? "");

      if (ghToken && ghToken.length > 4) {
        setMaskedToken(`${"•".repeat(ghToken.length - 4)}${ghToken.slice(-4)}`);
      } else {
        setMaskedToken(null);
      }
    } catch {
      setAuthStatus("unknown");
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---- update token ---- */
  const handleUpdateToken = useCallback(async () => {
    if (!tokenInput.trim()) return;
    setTokenUpdating(true);
    setTokenMsg(null);
    try {
      await executeCommandApi(serverId, `echo "${tokenInput.replace(/"/g, '\\"')}" | gh auth login --with-token 2>&1`, 15);
      setTokenInput("");
      setTokenMsg({ ok: true, text: "Token updated successfully" });
      fetchData();
    } catch (err) {
      setTokenMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed to update token" });
    }
    setTokenUpdating(false);
  }, [serverId, tokenInput, fetchData]);

  /* ---- test connection ---- */
  const handleTest = useCallback(async () => {
    setTestResult(null);
    try {
      const result = await executeCommandApi(serverId, "gh auth status 2>&1", 10);
      const ok = result.stdout.includes("Logged in");
      setTestResult({ ok, text: result.stdout.trim().split("\n").slice(0, 3).join("\n") });
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof ApiError ? err.message : "Test failed" });
    }
  }, [serverId]);

  /* ---- logout ---- */
  const handleLogout = useCallback(async () => {
    if (!window.confirm("Logout from GitHub on this server?")) return;
    try {
      await executeCommandApi(serverId, "gh auth logout --hostname github.com -y 2>&1", 10);
      fetchData();
    } catch {}
  }, [serverId, fetchData]);

  /* ---- save git config ---- */
  const handleSaveConfig = useCallback(async () => {
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      const cmds: string[] = [];
      if (editName) cmds.push(`git config --global user.name "${editName.replace(/"/g, '\\"')}"`);
      if (editEmail) cmds.push(`git config --global user.email "${editEmail.replace(/"/g, '\\"')}"`);
      if (cmds.length > 0) {
        await executeCommandApi(serverId, cmds.join(" && "), 10);
        setConfigMsg({ ok: true, text: "Git config updated" });
        fetchData();
      }
    } catch (err) {
      setConfigMsg({ ok: false, text: err instanceof ApiError ? err.message : "Failed to save" });
    }
    setConfigSaving(false);
  }, [serverId, editName, editEmail, fetchData]);

  /* ---- status styling ---- */
  const statusBadge = authStatus === "authenticated"
    ? "bg-green-500/10 text-green-600 dark:text-green-400"
    : authStatus === "unauthenticated"
      ? "bg-red-500/10 text-red-500 dark:text-red-400"
      : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const statusLabel = authStatus === "authenticated" ? "Authenticated" : authStatus === "unauthenticated" ? "Not Authenticated" : "Unknown";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="GitHub settings"
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0d1117] dark:bg-[#e8e8e8]" data-drag-handle>
          <FiGithub size={14} className="text-white dark:text-[#0d1117]" />
        </div>
        <div className="min-w-0 flex-1" data-drag-handle>
          <p className="truncate text-sm font-semibold leading-tight text-canvas-fg" data-drag-handle>GitHub</p>
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
        {/* Account info — always visible */}
        <div className="border-b border-canvas-border px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoCell label="Username" value={username ?? "—"} />
            <InfoCell label="Email" value={email ?? "—"} />
            <InfoCell label="Host" value="github.com" />
            <InfoCell label="Status" value={statusLabel} />
          </div>
        </div>

        {/* TOKEN MANAGEMENT */}
        <div className="border-b border-canvas-border">
          <button type="button" onClick={() => setTokenExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
            <FiKey size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">Token Management</span>
            <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${tokenExpanded ? "open" : ""}`} />
          </button>
          <div className={`animate-collapse ${tokenExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4 space-y-3">
                {maskedToken && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Current Token</p>
                    <p className="mt-0.5 font-mono text-xs text-canvas-fg">{maskedToken}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted mb-1.5">Update Token</p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="min-w-0 flex-1 rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 font-mono text-xs text-canvas-fg placeholder:text-canvas-muted outline-none focus:border-canvas-fg/30"
                    />
                    <button
                      type="button"
                      onClick={handleUpdateToken}
                      disabled={tokenUpdating || !tokenInput.trim()}
                      className="shrink-0 rounded-md bg-canvas-surface-hover px-3 py-1.5 text-[11px] font-medium text-canvas-fg transition-colors hover:bg-canvas-border disabled:opacity-50"
                    >
                      {tokenUpdating ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {tokenMsg && (
                    <p className={`mt-1.5 text-[11px] ${tokenMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                      {tokenMsg.text}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <ActionBtn onClick={handleTest} icon={<FiCheck size={11} />}>Test Connection</ActionBtn>
                  {authStatus === "authenticated" && (
                    <ActionBtn onClick={handleLogout} icon={<FiAlertCircle size={11} />} danger>Logout</ActionBtn>
                  )}
                </div>
                {testResult && (
                  <pre className={`mt-1.5 rounded-md border px-3 py-2 font-mono text-[11px] whitespace-pre-wrap ${
                    testResult.ok
                      ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
                      : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
                  }`}>
                    {testResult.text}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* GIT CONFIG */}
        <div className="border-b border-canvas-border">
          <button type="button" onClick={() => setGitConfigExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
            <FiSettings size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">Git Config</span>
            <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${gitConfigExpanded ? "open" : ""}`} />
          </button>
          <div className={`animate-collapse ${gitConfigExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4 space-y-3">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">user.name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg outline-none focus:border-canvas-fg/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">user.email</label>
                  <input
                    type="text"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="mt-1 w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg outline-none focus:border-canvas-fg/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={configSaving}
                  className="rounded-md bg-canvas-surface-hover px-3 py-1.5 text-[11px] font-medium text-canvas-fg transition-colors hover:bg-canvas-border disabled:opacity-50"
                >
                  {configSaving ? "Saving..." : "Save Config"}
                </button>
                {configMsg && (
                  <p className={`text-[11px] ${configMsg.ok ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                    {configMsg.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="border-b border-canvas-border">
          <button type="button" onClick={() => setActionsExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
            <FiExternalLink size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">Quick Actions</span>
            <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${actionsExpanded ? "open" : ""}`} />
          </button>
          <div className={`animate-collapse ${actionsExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4 space-y-2">
                {username && authStatus === "authenticated" && (
                  <a
                    href={`https://github.com/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
                  >
                    <FiExternalLink size={11} />
                    View Profile
                  </a>
                )}
                <ActionBtn
                  onClick={async () => {
                    try {
                      const result = await executeCommandApi(serverId, "ssh -T git@github.com 2>&1 || true", 10);
                      setTestResult({ ok: result.stdout.includes("successfully authenticated"), text: result.stdout.trim() });
                    } catch (err) {
                      setTestResult({ ok: false, text: err instanceof ApiError ? err.message : "SSH test failed" });
                    }
                  }}
                  icon={<FiKey size={11} />}
                >
                  Test SSH Key
                </ActionBtn>
              </div>
            </div>
          </div>
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

function ActionBtn({ children, onClick, icon, danger }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-canvas-surface-hover ${
        danger ? "text-red-500 dark:text-red-400" : "text-canvas-muted hover:text-canvas-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
