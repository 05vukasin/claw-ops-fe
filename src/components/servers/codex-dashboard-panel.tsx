"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronRight, FiCode, FiFolder, FiRefreshCw, FiSettings, FiTerminal, FiX } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";
import { CodexCodeOverlay } from "./codex-code-overlay";

const PANEL_W = 440;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1000;

function panelKey(serverId: string, suffix: string) {
  return `openclaw-codex-panel-${serverId}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? parseInt(v, 10) || fallback : fallback; } catch { return fallback; }
}
function saveNum(key: string, val: number) {
  try { localStorage.setItem(key, String(Math.round(val))); } catch {}
}

interface CodexDashboardPanelProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

const FETCH_CMD = [
  'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
  'CODEX_BIN="$(command -v codex 2>/dev/null || true)"',
  'if [ -z "$CODEX_BIN" ]; then NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"; if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/codex" ]; then CODEX_BIN="$NPM_PREFIX/bin/codex"; fi; fi',
  'if [ -z "$CODEX_BIN" ]; then for p in "$HOME/.nvm/versions/node"/*/bin/codex "$HOME/.local/bin/codex" "$HOME/.npm-global/bin/codex" "/usr/local/bin/codex"; do if [ -x "$p" ]; then CODEX_BIN="$p"; break; fi; done; fi',
  'if [ -z "$CODEX_BIN" ]; then echo "NOT_FOUND"; exit 0; fi',
  '"$CODEX_BIN" --version 2>/dev/null || echo "UNKNOWN_VERSION"',
  'echo "---CODEX_SEP---"',
  'printf "%s\\n" "$CODEX_BIN"',
  'echo "---CODEX_SEP---"',
  '("$CODEX_BIN" auth status 2>/dev/null || echo "AUTH_UNKNOWN")',
  'echo "---CODEX_SEP---"',
  'du -sh "$HOME/.codex" 2>/dev/null | cut -f1 || echo "0"',
  'echo "---CODEX_SEP---"',
  'ls -1 "$HOME/.codex/projects" 2>/dev/null | head -30 || echo ""',
  'echo "---CODEX_SEP---"',
  'if [ -f "$HOME/.codex/config.json" ]; then cat "$HOME/.codex/config.json"; elif [ -f "$HOME/.codex/settings.json" ]; then cat "$HOME/.codex/settings.json"; else echo "{}"; fi',
].join("; ");

function parseAuthStatus(authRaw: string): "authenticated" | "unauthenticated" | "unknown" {
  const lower = authRaw.toLowerCase();
  if (!authRaw || authRaw === "AUTH_UNKNOWN") return "unknown";
  if (
    (lower.includes("authenticated") || lower.includes("logged in") || lower.includes("authorized")) &&
    !lower.includes("not authenticated") &&
    !lower.includes("unauthenticated") &&
    !lower.includes("not logged")
  ) {
    return "authenticated";
  }
  if (
    lower.includes("unauthenticated") ||
    lower.includes("not authenticated") ||
    lower.includes("not logged in") ||
    lower.includes("login required")
  ) {
    return "unauthenticated";
  }
  return "unknown";
}

export function CodexDashboardPanel({ serverId, serverName, onClose, zIndex, onFocus }: CodexDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, "x"), 200),
    y: loadNum(panelKey(serverId, "y"), 120),
  }));
  const posRef = useRef(pos);

  const [panelW, setPanelW] = useState(() => loadNum(panelKey(serverId, "w"), PANEL_W));
  const panelWRef = useRef(panelW);

  const [version, setVersion] = useState<string | null>(null);
  const [executablePath, setExecutablePath] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"authenticated" | "unauthenticated" | "unknown">("unknown");
  const [authText, setAuthText] = useState<string | null>(null);
  const [diskUsage, setDiskUsage] = useState<string | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
  const [configJson, setConfigJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [environmentExpanded, setEnvironmentExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);

  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    panelWRef.current = panelW;
  }, [panelW]);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await executeCommandApi(serverId, FETCH_CMD, 15);
      const parts = result.stdout.split("---CODEX_SEP---");
      const versionRaw = (parts[0] ?? "").trim();
      const executablePathRaw = (parts[1] ?? "").trim();
      const authRaw = (parts[2] ?? "").trim();
      const diskRaw = (parts[3] ?? "").trim();
      const projectsRaw = (parts[4] ?? "").trim();
      const configRaw = (parts[5] ?? "").trim();

      setVersion(versionRaw && versionRaw !== "NOT_FOUND" ? versionRaw.split("\n")[0].trim() || null : null);
      setExecutablePath(executablePathRaw || null);
      setAuthStatus(parseAuthStatus(authRaw));
      setAuthText(authRaw && authRaw !== "AUTH_UNKNOWN" ? authRaw : null);
      setDiskUsage(diskRaw && diskRaw !== "0" ? diskRaw : null);
      setProjects(projectsRaw ? projectsRaw.split("\n").filter((line) => line.trim()) : []);
      setConfigJson(configRaw && configRaw !== "{}" ? configRaw : null);
    } catch {
      setVersion(null);
      setExecutablePath(null);
      setAuthStatus("unknown");
      setAuthText(null);
      setDiskUsage(null);
      setProjects([]);
      setConfigJson(null);
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  const statusBadge = authStatus === "authenticated"
    ? "bg-green-500/10 text-green-600 dark:text-green-400"
    : authStatus === "unauthenticated"
      ? "bg-orange-500/10 text-orange-500 dark:text-orange-400"
      : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const statusLabel = authStatus === "authenticated"
    ? "Authenticated"
    : authStatus === "unauthenticated"
      ? "Not Authenticated"
      : "Unknown";

  return (
    <>
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Codex settings"
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
        <div className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "left")} />
        <div className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize" onPointerDown={(e) => handleResizeStart(e, "right")} />

        <div
          data-drag-handle
          className="flex shrink-0 cursor-grab items-center gap-3 border-b border-canvas-border px-5 py-3.5 select-none active:cursor-grabbing"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f766e]" data-drag-handle>
            <FiCode size={14} className="pointer-events-none text-white" />
          </div>
          <div className="min-w-0 flex-1" data-drag-handle>
            <p className="truncate text-sm font-semibold leading-tight text-canvas-fg" data-drag-handle>Codex</p>
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

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-canvas-border px-5 py-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <InfoCell label="Version" value={version ?? "—"} />
              <InfoCell label="Status" value={statusLabel} />
              <InfoCell label="Binary" value={executablePath ?? "—"} />
              <InfoCell label="Projects" value={String(projects.length)} />
            </div>
          </div>

          <div className="border-b border-canvas-border">
            <button type="button" onClick={() => setEnvironmentExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
              <FiSettings size={13} className="text-canvas-muted" />
              <span className="flex-1 text-xs font-medium text-canvas-muted">Environment</span>
              <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${environmentExpanded ? "open" : ""}`} />
            </button>
            <div className={`animate-collapse ${environmentExpanded ? "open" : ""}`}>
              <div className="collapse-inner">
                <div className="space-y-3 border-t border-canvas-border px-5 py-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <InfoCell label="Auth" value={statusLabel} />
                    <InfoCell label="Disk Usage" value={diskUsage ?? "—"} />
                  </div>
                  {authText && (
                    <pre className="rounded-md bg-canvas-surface-hover px-3 py-2 font-mono text-[10px] text-canvas-fg whitespace-pre-wrap">
                      {authText}
                    </pre>
                  )}
                  {configJson && (
                    <div>
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Config</p>
                      <pre className="max-h-32 overflow-y-auto rounded-md bg-canvas-surface-hover px-3 py-2 font-mono text-[10px] text-canvas-fg whitespace-pre-wrap">
                        {configJson}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

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
                    <p className="px-5 py-3 text-[11px] text-canvas-muted">No Codex projects found</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto divide-y divide-canvas-border">
                      {projects.map((project) => (
                        <div key={project} className="flex items-center gap-2 px-5 py-1.5">
                          <FiFolder size={11} className="shrink-0 text-canvas-muted" />
                          <span className="min-w-0 truncate text-[11px] text-canvas-fg">{project}</span>
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

          <div className="border-b border-canvas-border">
            <button type="button" onClick={() => setActionsExpanded((p) => !p)} className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover">
              <FiTerminal size={13} className="text-canvas-muted" />
              <span className="flex-1 text-xs font-medium text-canvas-muted">Quick Actions</span>
              <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${actionsExpanded ? "open" : ""}`} />
            </button>
            <div className={`animate-collapse ${actionsExpanded ? "open" : ""}`}>
              <div className="collapse-inner">
                <div className="space-y-2 border-t border-canvas-border px-5 py-4">
                  <ActionBtn onClick={() => setShowOverlay(true)} icon={<FiTerminal size={11} />}>
                    Open Codex
                  </ActionBtn>
                  <ActionBtn onClick={fetchData} icon={<FiRefreshCw size={11} />}>
                    Refresh Status
                  </ActionBtn>
                  <p className="text-[10px] text-canvas-muted">
                    Codex launches directly on the selected server in a persistent terminal session.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showOverlay && (
        <CodexCodeOverlay
          serverId={serverId}
          serverName={serverName}
          initialCommand={executablePath ?? "codex"}
          onClose={() => { setShowOverlay(false); fetchData(); }}
        />
      )}
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">{label}</p>
      <p className="mt-0.5 truncate text-xs text-canvas-fg">{value}</p>
    </div>
  );
}

function ActionBtn({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
    >
      {icon}
      {children}
    </button>
  );
}
