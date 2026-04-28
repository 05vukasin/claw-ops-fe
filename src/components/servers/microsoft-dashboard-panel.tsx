"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiExternalLink, FiRefreshCw, FiX } from "react-icons/fi";
import { executeCommandApi } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";

const PANEL_W = 400;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 900;

function panelKey(serverId: string, suffix: string) {
  return `openclaw-ms-panel-${serverId}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? parseInt(v, 10) || fallback : fallback; } catch { return fallback; }
}
function saveNum(key: string, val: number) {
  try { localStorage.setItem(key, String(Math.round(val))); } catch {}
}

interface MicrosoftDashboardPanelProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

interface MSStatus {
  accountEmail: string | null;
  displayName: string | null;
  connected: boolean;
}

const STATUS_CMD = `python3 -c 'import json,os; f=os.path.join(os.environ.get("HOME","/root"),".claude","custom-microsoft","credentials.json"); d=json.load(open(f)); print("CONNECTED:" + (d.get("accountEmail") or "") + "---MS_D---" + (d.get("displayName") or "")) if d.get("accessToken") else print("NO_TOKEN")' 2>/dev/null || echo "NOT_FOUND"`;

function parseStatus(stdout: string): MSStatus {
  const raw = stdout.trim();
  if (raw.startsWith("CONNECTED:")) {
    const rest = raw.slice("CONNECTED:".length);
    const parts = rest.split("---MS_D---");
    return {
      connected: true,
      accountEmail: parts[0]?.trim() || null,
      displayName: parts[1]?.trim() || null,
    };
  }
  return { connected: false, accountEmail: null, displayName: null };
}

export function MicrosoftDashboardPanel({ serverId, serverName, onClose, zIndex, onFocus }: MicrosoftDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, "x"), 160),
    y: loadNum(panelKey(serverId, "y"), 160),
  }));
  const posRef = useRef(pos);

  const [width, setWidth] = useState(() => loadNum(panelKey(serverId, "w"), PANEL_W));
  const widthRef = useRef(width);

  const [status, setStatus] = useState<MSStatus | null>(null);
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
        <svg width="18" height="18" viewBox="0 0 22 22" className="shrink-0">
          <rect x="0" y="0" width="10" height="10" fill="#F25022" rx="0.5" />
          <rect x="12" y="0" width="10" height="10" fill="#7FBA00" rx="0.5" />
          <rect x="0" y="12" width="10" height="10" fill="#00A4EF" rx="0.5" />
          <rect x="12" y="12" width="10" height="10" fill="#FFB900" rx="0.5" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-canvas-fg">Microsoft 365</p>
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
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.connected ? "bg-green-400" : "bg-gray-400"}`} />
              <span className="text-sm font-medium text-canvas-fg">
                {status.connected ? "Connected" : "Not connected"}
              </span>
            </div>

            {status.connected && (
              <div className="rounded-md border border-canvas-border bg-canvas-border/20 px-3 py-2.5">
                {status.displayName && (
                  <p className="text-sm font-medium text-canvas-fg">{status.displayName}</p>
                )}
                {status.accountEmail && (
                  <p className="text-xs text-canvas-muted">{status.accountEmail}</p>
                )}
              </div>
            )}

            {!status.connected && (
              <p className="text-xs text-canvas-muted">
                Connect Microsoft 365 in the chat settings to enable email, calendar, OneDrive, and Teams tools.
              </p>
            )}
          </div>
        )}

        {/* Settings link */}
        <a
          href="/chat"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-muted transition-colors hover:border-[#00A4EF]/50 hover:text-canvas-fg"
        >
          <FiExternalLink size={13} />
          <span>Open chat settings to manage connection</span>
        </a>
      </div>
    </div>
  );
}
