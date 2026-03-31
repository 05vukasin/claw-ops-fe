"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronRight,
  FiCpu,
  FiExternalLink,
  FiRefreshCw,
  FiX,
} from "react-icons/fi";
import { FaDatabase, FaScroll } from "react-icons/fa";
import { TbCoins } from "react-icons/tb";
import { AgentTokensSection } from "./agent-tokens-section";
import { AgentLogsSection } from "./agent-logs-section";
import { AgentMemorySection } from "./agent-memory-section";
import { Z_INDEX } from "@/lib/z-index";
import { executeCommandApi, readFileApi, ApiError } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 480;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1400;

/** Per-agent localStorage helpers */
function panelKey(serverId: string, name: string, suffix: string) {
  return `openclaw-agent-panel-${serverId}::${name}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) || fallback : fallback;
  } catch {
    return fallback;
  }
}
function saveNum(key: string, val: number) {
  try {
    localStorage.setItem(key, String(Math.round(val)));
  } catch {}
}

interface PanelPos {
  x: number;
  y: number;
}

const DEFAULT_POS: PanelPos = { x: 80, y: 80 };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatUptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${mins}m`;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AgentDashboardPanelProps {
  serverId: string;
  agentName: string;
  serverDomain?: string | null;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentDashboardPanel({
  serverId,
  agentName,
  serverDomain,
  onClose,
  zIndex,
  onFocus,
}: AgentDashboardPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- position (per-agent) ---- */
  const [pos, setPos] = useState<PanelPos>(() => ({
    x: loadNum(panelKey(serverId, agentName, "x"), DEFAULT_POS.x),
    y: loadNum(panelKey(serverId, agentName, "y"), DEFAULT_POS.y),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  /* ---- panel width (per-agent) ---- */
  const [panelW, setPanelW] = useState<number>(() =>
    loadNum(panelKey(serverId, agentName, "w"), PANEL_W),
  );
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  /* ---- sections ---- */
  const [tokensExpanded, setTokensExpanded] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [memoryExpanded, setMemoryExpanded] = useState(false);

  /* ---- data state ---- */
  const [containerStatus, setContainerStatus] = useState<"running" | "stopped" | "unknown">("unknown");
  const [startedAt, setStartedAt] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

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

  /* ---- fetch data on mount ---- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const containerCmd = `docker inspect --format '{{json .State}}' ${agentName}-openclaw-gateway-1`;
    const configPath = `/root/openclaw-agents/${agentName}/config/openclaw.json`;

    const [containerResult, configResult] = await Promise.allSettled([
      executeCommandApi(serverId, containerCmd),
      readFileApi(serverId, configPath),
    ]);

    // Parse container state
    if (containerResult.status === "fulfilled" && containerResult.value.exitCode === 0) {
      try {
        const state = JSON.parse(containerResult.value.stdout.trim());
        if (state.Running) {
          setContainerStatus("running");
          setStartedAt(state.StartedAt ?? null);
        } else {
          setContainerStatus("stopped");
          setStartedAt(null);
        }
      } catch {
        setContainerStatus("unknown");
      }
    } else {
      setContainerStatus("unknown");
    }

    // Parse config
    if (configResult.status === "fulfilled") {
      try {
        setConfig(JSON.parse(configResult.value));
      } catch {
        setConfig(null);
      }
    } else {
      setConfig(null);
    }

    setLoading(false);
  }, [serverId, agentName]);

  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    fetchData();
  }, [fetchData]);

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
    const ph = panelRef.current?.offsetHeight ?? 200;
    const ny = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - ph));
    setPos({ x: nx, y: ny });
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      saveNum(panelKey(serverId, agentName, "x"), posRef.current.x);
      saveNum(panelKey(serverId, agentName, "y"), posRef.current.y);
    },
    [serverId, agentName],
  );

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
        saveNum(panelKey(serverId, agentName, "w"), panelWRef.current);
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [serverId, agentName],
  );

  /* ---- restart action ---- */
  const handleRestart = useCallback(async () => {
    if (!window.confirm(`Restart agent "${agentName}"? This will briefly interrupt the service.`)) return;
    setRestarting(true);
    try {
      await executeCommandApi(
        serverId,
        `cd /root/openclaw-agents/${agentName} && docker compose restart`,
        60,
      );
      // Refresh data after restart
      dataLoadedRef.current = false;
      await fetchData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Restart failed:", err instanceof ApiError ? err.message : err);
    }
    setRestarting(false);
  }, [serverId, agentName, fetchData]);

  /* ---- derived values from config ---- */
  const modelRaw: string = config?.agents?.defaults?.model?.primary ?? "";
  const modelName = modelRaw.includes("/") ? modelRaw.split("/").pop() : modelRaw || "--";

  const hasSlack = !!(config?.channels?.slack);
  const hasTelegram = !!(config?.plugins?.entries && Object.values(config.plugins.entries).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (entry: any) => entry?.type === "telegram" || entry?.name?.toLowerCase().includes("telegram"),
  ));

  const channelsDisplay = [
    hasSlack ? "Slack \u2713" : null,
    hasTelegram ? "Telegram \u2713" : null,
  ].filter(Boolean).join(" / ") || "--";

  const thinkingMode: string = config?.agents?.defaults?.thinkingDefault ?? "off";
  const streaming: string = config?.channels?.slack?.streaming != null
    ? String(config.channels.slack.streaming)
    : "--";

  const dotColor =
    containerStatus === "running"
      ? "bg-green-400"
      : containerStatus === "stopped"
        ? "bg-red-400"
        : "bg-yellow-400";

  const statusLabel =
    containerStatus === "running"
      ? "Running"
      : containerStatus === "stopped"
        ? "Stopped"
        : "Unknown";

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Dashboard for agent ${agentName}`}
      className="fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
      style={{
        zIndex: zIndex ?? Z_INDEX.DROPDOWN,
        left: pos.x,
        top: pos.y,
        width: panelW,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "85vh",
      }}
      onPointerDown={(e) => {
        onFocus?.();
        handlePointerDown(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize"
        onPointerDown={(e) => handleResizeStart(e, "left")}
      />
      <div
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize"
        onPointerDown={(e) => handleResizeStart(e, "right")}
      />

      {/* ===== HEADER (drag handle) ===== */}
      <div
        data-drag-handle
        className="flex shrink-0 cursor-grab items-center gap-3 border-b border-canvas-border px-5 py-3.5 select-none active:cursor-grabbing"
      >
        {/* Agent icon */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-canvas-border"
          data-drag-handle
        >
          <FiCpu size={14} className="text-canvas-muted" />
        </div>

        <div className="min-w-0 flex-1" data-drag-handle>
          <p
            className="truncate text-sm font-semibold leading-tight text-canvas-fg"
            data-drag-handle
          >
            {agentName}
          </p>
          <p className="text-[11px] text-canvas-muted" data-drag-handle>
            Agent
          </p>
        </div>

        <span className="flex items-center gap-1.5 rounded-full border border-canvas-border px-2.5 py-1 text-[10px] font-medium text-canvas-muted">
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {statusLabel}
        </span>

        <button
          type="button"
          onClick={() => {
            dataLoadedRef.current = false;
            fetchData();
          }}
          aria-label="Refresh"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiRefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>

        {serverDomain && (
          <a
            href={`https://${serverDomain}/${agentName}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiExternalLink size={13} />
            Web UI
          </a>
        )}

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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* ── OVERVIEW (always visible, not collapsible) ── */}
        <div className="border-b border-canvas-border px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoCell label="Model" value={modelName ?? "--"} />
            <InfoCell label="Channels" value={channelsDisplay} />
            <InfoCell label="Thinking" value={thinkingMode} />
            <InfoCell label="Streaming" value={streaming} />
            <InfoCell
              label="Uptime"
              value={
                containerStatus === "running" && startedAt
                  ? formatUptime(startedAt)
                  : "--"
              }
            />
          </div>
        </div>

        {/* ── TOKEN USAGE (collapsible) ── */}
        <div className="border-b border-canvas-border">
          <button
            type="button"
            onClick={() => setTokensExpanded((p) => !p)}
            className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
          >
            <TbCoins size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">
              Token Usage
            </span>
            <FiChevronRight
              size={14}
              className={`text-canvas-muted chevron-rotate ${tokensExpanded ? "open" : ""}`}
            />
          </button>
          <div className={`animate-collapse ${tokensExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4">
                <AgentTokensSection serverId={serverId} agentName={agentName} />
              </div>
            </div>
          </div>
        </div>

        {/* ── LOGS (collapsible) ── */}
        <div className="border-b border-canvas-border">
          <button
            type="button"
            onClick={() => setLogsExpanded((p) => !p)}
            className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
          >
            <FaScroll size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">
              Logs
            </span>
            <FiChevronRight
              size={14}
              className={`text-canvas-muted chevron-rotate ${logsExpanded ? "open" : ""}`}
            />
          </button>
          <div className={`animate-collapse ${logsExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4">
                <AgentLogsSection serverId={serverId} agentName={agentName} />
              </div>
            </div>
          </div>
        </div>

        {/* ── MEMORY (collapsible) ── */}
        <div className="border-b border-canvas-border">
          <button
            type="button"
            onClick={() => setMemoryExpanded((p) => !p)}
            className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
          >
            <FaDatabase size={13} className="text-canvas-muted" />
            <span className="flex-1 text-xs font-medium text-canvas-muted">
              Memory
            </span>
            <FiChevronRight
              size={14}
              className={`text-canvas-muted chevron-rotate ${memoryExpanded ? "open" : ""}`}
            />
          </button>
          <div className={`animate-collapse ${memoryExpanded ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="border-t border-canvas-border px-5 py-4">
                <AgentMemorySection serverId={serverId} agentName={agentName} />
              </div>
            </div>
          </div>
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="px-5 py-3">
          <ActionBtn
            onClick={handleRestart}
            disabled={restarting}
            icon={
              <FiRefreshCw
                size={13}
                className={restarting ? "animate-spin" : ""}
              />
            }
          >
            {restarting ? "Restarting..." : "Restart Agent"}
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
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
