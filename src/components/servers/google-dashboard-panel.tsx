"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiExternalLink, FiRefreshCw, FiX } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";

const PANEL_W = 400;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 900;

function panelKey(serverId: string, suffix: string) {
  return `openclaw-google-panel-${serverId}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? parseInt(v, 10) || fallback : fallback; } catch { return fallback; }
}
function saveNum(key: string, val: number) {
  try { localStorage.setItem(key, String(Math.round(val))); } catch {}
}

interface GoogleDashboardPanelProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

interface GStatus {
  accountEmail: string | null;
  connected: boolean;
}

const STATUS_CMD = `python3 -c 'import json,os,glob; tokens=sorted(glob.glob(os.path.join(os.environ.get("HOME","/root"),".claude","custom-google-workspace","tokens","*.json"))); d=json.load(open(tokens[0])) if tokens else {}; print("CONNECTED:" + d.get("email","unknown")) if d.get("access_token") else print("NO_TOKEN")' 2>/dev/null || echo "NOT_FOUND"`;

function parseStatus(stdout: string): GStatus {
  const raw = stdout.trim();
  if (raw.startsWith("CONNECTED:")) {
    const email = raw.slice("CONNECTED:".length).trim();
    return { connected: true, accountEmail: email === "unknown" ? null : email };
  }
  return { connected: false, accountEmail: null };
}

export function GoogleDashboardPanel({ serverId, serverName, onClose, zIndex, onFocus }: GoogleDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, "x"), 200),
    y: loadNum(panelKey(serverId, "y"), 200),
  }));
  const posRef = useRef(pos);

  const [width, setWidth] = useState(() => loadNum(panelKey(serverId, "w"), PANEL_W));
  const widthRef = useRef(width);

  const [status, setStatus] = useState<GStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await executeCommandApi(serverId, STATUS_CMD, 10);
      setStatus(parseStatus(result.stdout));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // ── Drag header ──
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, px: 0, py: 0 });

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, px: posRef.current.x, py: posRef.current.y };
    onFocus?.();
  }, [onFocus]);

  const handleHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const nx = dragRef.current.px + (e.clientX - dragRef.current.startX);
    const ny = dragRef.current.py + (e.clientY - dragRef.current.startY);
    posRef.current = { x: nx, y: ny };
    setPos({ x: nx, y: ny });
  }, []);

  const handleHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    saveNum(panelKey(serverId, "x"), posRef.current.x);
    saveNum(panelKey(serverId, "y"), posRef.current.y);
  }, [serverId]);

  // ── Resize ──
  const resizeRef = useRef({ resizing: false, edge: "right" as "left" | "right", startX: 0, startW: 0, startPx: 0 });

  const handleResizePointerDown = useCallback((e: React.PointerEvent, edge: "left" | "right") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { resizing: true, edge, startX: e.clientX, startW: widthRef.current, startPx: posRef.current.x };
  }, []);

  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.resizing) return;
    const { edge, startX, startW, startPx } = resizeRef.current;
    const dx = e.clientX - startX;
    if (edge === "right") {
      const nw = Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, startW + dx));
      widthRef.current = nw;
      setWidth(nw);
    } else {
      const nw = Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, startW - dx));
      const nx = startPx + (startW - nw);
      widthRef.current = nw;
      posRef.current = { ...posRef.current, x: nx };
      setWidth(nw);
      setPos((p) => ({ ...p, x: nx }));
    }
  }, []);

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (!resizeRef.current.resizing) return;
    resizeRef.current.resizing = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    saveNum(panelKey(serverId, "w"), widthRef.current);
    saveNum(panelKey(serverId, "x"), posRef.current.x);
  }, [serverId]);

  return (
    <div
      ref={panelRef}
      className="surface-overlay fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border shadow-xl"
      style={{ left: pos.x, top: pos.y, width, zIndex: zIndex ?? Z_INDEX.DROPDOWN, minWidth: PANEL_MIN_W, maxWidth: PANEL_MAX_W }}
      onPointerDown={onFocus}
      onPointerMove={resizeRef.current.resizing ? handleResizePointerMove : undefined}
      onPointerUp={resizeRef.current.resizing ? handleResizePointerUp : undefined}
    >
      {/* Resize handle left */}
      <div
        className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-accent/30"
        onPointerDown={(e) => handleResizePointerDown(e, "left")}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
      {/* Resize handle right */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-accent/30"
        onPointerDown={(e) => handleResizePointerDown(e, "right")}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />

      {/* Header */}
      <div
        className="flex cursor-grab items-center gap-2.5 border-b border-canvas-border px-4 py-3 active:cursor-grabbing"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
        onPointerCancel={handleHeaderPointerUp}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-canvas-fg">Google Workspace</p>
          <p className="truncate text-xs text-canvas-muted">{serverName}</p>
        </div>
        <button
          className="shrink-0 rounded p-1 text-canvas-muted transition-colors hover:bg-canvas-border hover:text-canvas-fg"
          onClick={(e) => { e.stopPropagation(); void fetchStatus(); }}
          title="Refresh"
        >
          <FiRefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          className="shrink-0 rounded p-1 text-canvas-muted transition-colors hover:bg-canvas-border hover:text-canvas-fg"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          title="Close"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 p-4">
        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading && !status && (
          <p className="text-center text-xs text-canvas-muted py-4">Checking connection…</p>
        )}

        {status && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.connected ? "bg-green-400" : "bg-gray-400"}`} />
              <span className="text-sm font-medium text-canvas-fg">
                {status.connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {status.connected && status.accountEmail && (
              <div className="rounded-md border border-canvas-border bg-canvas-border/20 px-3 py-2.5">
                <p className="text-xs text-canvas-muted">{status.accountEmail}</p>
              </div>
            )}

            {!status.connected && (
              <p className="text-xs text-canvas-muted">
                Connect Google Workspace in the chat settings to enable Gmail, Calendar, Drive, and Meet tools.
              </p>
            )}
          </div>
        )}

        <a
          href="/chat"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-muted transition-colors hover:border-[#4285F4]/50 hover:text-canvas-fg"
        >
          <FiExternalLink size={13} />
          <span>Open chat settings to manage connection</span>
        </a>
      </div>
    </div>
  );
}
