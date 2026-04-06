"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiSave,
  FiSettings,
  FiX,
  FiAlertTriangle,
  FiCheck,
} from "react-icons/fi";
import { ConfigModelTab } from "./config-tabs/config-model-tab";
import { ConfigHeartbeatTab } from "./config-tabs/config-heartbeat-tab";
import { ConfigChannelsTab } from "./config-tabs/config-channels-tab";
import { ConfigCronTab } from "./config-tabs/config-cron-tab";
import { ConfigContextTab } from "./config-tabs/config-context-tab";
import { ConfigToolsTab } from "./config-tabs/config-tools-tab";
import { ConfigWorkspaceTab } from "./config-tabs/config-workspace-tab";
import { ConfigAdvancedTab } from "./config-tabs/config-advanced-tab";
import { Z_INDEX } from "@/lib/z-index";
import {
  readFileApi,
  writeFileApi,
  executeCommandApi,
  ApiError,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 560;
const PANEL_H = 620;
const PANEL_MIN_W = 400;
const PANEL_MAX_W = 1400;
const PANEL_MIN_H = 350;

export const INPUT_BASE =
  "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

const TABS = [
  "Model",
  "Heartbeat",
  "Channels",
  "Cron",
  "Context",
  "Tools",
  "Workspace",
  "Advanced",
] as const;
type Tab = (typeof TABS)[number];

const WORKSPACE_FILES = [
  "SOUL.md",
  "USER.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
];

const RESTART_PATHS = ["plugins", "gateway.port", "gateway.bind", "gateway.mode"];

function panelKey(serverId: string, name: string, suffix: string) {
  return `openclaw-config-panel-${serverId}::${name}-${suffix}`;
}
function loadNum(key: string, fb: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) || fb : fb;
  } catch {
    return fb;
  }
}
function saveNum(key: string, val: number) {
  try {
    localStorage.setItem(key, String(Math.round(val)));
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Shared form sub-components (exported for tabs)                     */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  optional,
}: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-canvas-muted">
        {label}
        {optional && (
          <span className="ml-1 font-normal text-canvas-muted/50">
            optional
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-canvas-muted">
        {children}
      </p>
      <div className="h-px flex-1 bg-canvas-border" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-canvas-muted">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-canvas-fg" : "bg-canvas-surface-hover"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-canvas-bg transition-transform ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </button>
      {label}
    </label>
  );
}

export function SegmentBtn({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-canvas-border">
      {options.map((opt, i) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
            i === 0 ? "rounded-l-[5px]" : ""
          } ${i === options.length - 1 ? "rounded-r-[5px]" : ""} ${
            opt === value
              ? "bg-canvas-fg text-canvas-bg"
              : "text-canvas-muted hover:text-canvas-fg"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Deep config path helper                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ConfigObj = Record<string, any>;

export function getPath(obj: ConfigObj | null, path: string[]): unknown {
  if (!obj) return undefined;
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as ConfigObj)[key];
  }
  return cur;
}

export function setPath(obj: ConfigObj, path: string[], value: unknown): ConfigObj {
  const next = structuredClone(obj);
  let cur = next;
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]] || typeof cur[path[i]] !== "object") cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
  return next;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AgentConfigPanelProps {
  serverId: string;
  agentName: string;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentConfigPanel({
  serverId,
  agentName,
  onClose,
  zIndex,
  onFocus,
}: AgentConfigPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---- position ---- */
  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(serverId, agentName, "x"), 120),
    y: loadNum(panelKey(serverId, agentName, "y"), 60),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  const [panelW, setPanelW] = useState(() =>
    loadNum(panelKey(serverId, agentName, "w"), PANEL_W),
  );
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  const [panelH, setPanelH] = useState(() =>
    loadNum(panelKey(serverId, agentName, "h"), PANEL_H),
  );
  const panelHRef = useRef(panelH);
  panelHRef.current = panelH;

  /* ---- tabs ---- */
  const [activeTab, setActiveTab] = useState<Tab>("Model");

  /* ---- data ---- */
  const [config, setConfig] = useState<ConfigObj | null>(null);
  const [originalConfig, setOriginalConfig] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cronData, setCronData] = useState<any>(null);
  const [originalCron, setOriginalCron] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<Record<string, string>>(
    {},
  );
  const [originalWorkspace, setOriginalWorkspace] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);

  /* ---- save state ---- */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [restarting, setRestarting] = useState(false);

  /* ---- dirty tracking ---- */
  const configDirty = config ? JSON.stringify(config) !== originalConfig : false;
  const cronDirty = cronData
    ? JSON.stringify(cronData) !== originalCron
    : false;
  const workspaceDirty = Object.keys(workspaceFiles).some(
    (k) => workspaceFiles[k] !== originalWorkspace[k],
  );
  const dirty = configDirty || cronDirty || workspaceDirty;

  /* ---- drag ---- */
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  /* ---- load data on mount ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const basePath = `/root/openclaw-agents/${agentName}`;

      const [cfgRes, cronRes, ...wsRes] = await Promise.allSettled([
        readFileApi(serverId, `${basePath}/config/openclaw.json`),
        readFileApi(serverId, `${basePath}/config/cron/jobs.json`),
        ...WORKSPACE_FILES.map((f) =>
          readFileApi(serverId, `${basePath}/workspace/${f}`),
        ),
      ]);

      if (cancelled) return;

      // Config
      if (cfgRes.status === "fulfilled") {
        try {
          const parsed = JSON.parse(cfgRes.value);
          setConfig(parsed);
          setOriginalConfig(JSON.stringify(parsed));
        } catch {
          setConfig({});
          setOriginalConfig("{}");
        }
      } else {
        setConfig({});
        setOriginalConfig("{}");
      }

      // Cron
      if (cronRes.status === "fulfilled") {
        try {
          const parsed = JSON.parse(cronRes.value);
          setCronData(parsed);
          setOriginalCron(JSON.stringify(parsed));
        } catch {
          setCronData({ version: 1, jobs: [] });
          setOriginalCron(JSON.stringify({ version: 1, jobs: [] }));
        }
      } else {
        setCronData({ version: 1, jobs: [] });
        setOriginalCron(JSON.stringify({ version: 1, jobs: [] }));
      }

      // Workspace files
      const ws: Record<string, string> = {};
      for (let i = 0; i < WORKSPACE_FILES.length; i++) {
        const r = wsRes[i];
        ws[WORKSPACE_FILES[i]] =
          r.status === "fulfilled" ? r.value : "";
      }
      setWorkspaceFiles(ws);
      setOriginalWorkspace({ ...ws });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverId, agentName]);

  /* ---- config updater ---- */
  const updateConfig = useCallback(
    (path: string[], value: unknown) => {
      setConfig((prev) => (prev ? setPath(prev, path, value) : prev));
    },
    [],
  );

  /* ---- save ---- */
  const handleSave = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    setNeedsRestart(false);

    const basePath = `/root/openclaw-agents/${agentName}`;
    const writes: Promise<void>[] = [];

    if (configDirty && config) {
      writes.push(
        writeFileApi(
          serverId,
          `${basePath}/config/openclaw.json`,
          JSON.stringify(config, null, 2),
        ),
      );
    }
    if (cronDirty && cronData) {
      writes.push(
        writeFileApi(
          serverId,
          `${basePath}/config/cron/jobs.json`,
          JSON.stringify(cronData, null, 2),
        ),
      );
    }
    for (const [filename, content] of Object.entries(workspaceFiles)) {
      if (content !== originalWorkspace[filename]) {
        writes.push(
          writeFileApi(serverId, `${basePath}/workspace/${filename}`, content),
        );
      }
    }

    try {
      await Promise.all(writes);

      // Detect restart needed
      if (configDirty && config) {
        const orig = JSON.parse(originalConfig);
        const restartNeeded = RESTART_PATHS.some((p) => {
          const parts = p.split(".");
          return JSON.stringify(getPath(config, parts)) !== JSON.stringify(getPath(orig, parts));
        });
        setNeedsRestart(restartNeeded);
      }

      // Update snapshots
      if (config) setOriginalConfig(JSON.stringify(config));
      if (cronData) setOriginalCron(JSON.stringify(cronData));
      setOriginalWorkspace({ ...workspaceFiles });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to save",
      );
    }
    setSaving(false);
  }, [
    dirty,
    saving,
    agentName,
    serverId,
    config,
    configDirty,
    cronData,
    cronDirty,
    workspaceFiles,
    originalConfig,
    originalWorkspace,
  ]);

  /* ---- restart ---- */
  const handleRestart = useCallback(async () => {
    setRestarting(true);
    try {
      await executeCommandApi(
        serverId,
        `cd /root/openclaw-agents/${agentName} && docker compose restart`,
        60,
      );
      setNeedsRestart(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Restart failed:", err);
    }
    setRestarting(false);
  }, [serverId, agentName]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dirty && !window.confirm("Discard unsaved changes?")) return;
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, dirty, handleSave]);

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
    const nx = Math.max(
      0,
      Math.min(
        e.clientX - dragOffset.current.x,
        window.innerWidth - panelWRef.current,
      ),
    );
    const ny = Math.max(
      0,
      Math.min(
        e.clientY - dragOffset.current.y,
        window.innerHeight - 100,
      ),
    );
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
    (e: React.PointerEvent, dir: "left" | "right" | "bottom") => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = panelWRef.current;
      const startH = panelHRef.current;
      const startPanelX = posRef.current.x;

      function onMove(ev: PointerEvent) {
        if (dir === "bottom") {
          const newH = Math.max(PANEL_MIN_H, startH + (ev.clientY - startY));
          setPanelH(newH);
        } else {
          const dx = ev.clientX - startX;
          const newW = Math.max(
            PANEL_MIN_W,
            Math.min(PANEL_MAX_W, startW + (dir === "right" ? dx : -dx)),
          );
          setPanelW(newW);
          if (dir === "left") {
            const newX = Math.max(0, startPanelX + startW - newW);
            setPos((p) => ({ ...p, x: newX }));
          }
        }
      }
      function onUp() {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        saveNum(panelKey(serverId, agentName, "w"), panelWRef.current);
        saveNum(panelKey(serverId, agentName, "h"), panelHRef.current);
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [serverId, agentName],
  );

  /* ---- render active tab ---- */
  function renderTab() {
    if (loading || !config)
      return (
        <p className="px-5 py-8 text-center text-[11px] text-canvas-muted">
          Loading configuration...
        </p>
      );

    const tabProps = { config, updateConfig };

    switch (activeTab) {
      case "Model":
        return <ConfigModelTab {...tabProps} />;
      case "Heartbeat":
        return <ConfigHeartbeatTab {...tabProps} />;
      case "Channels":
        return <ConfigChannelsTab {...tabProps} />;
      case "Cron":
        return (
          <ConfigCronTab cronData={cronData} setCronData={setCronData} />
        );
      case "Context":
        return <ConfigContextTab {...tabProps} />;
      case "Tools":
        return <ConfigToolsTab {...tabProps} />;
      case "Workspace":
        return (
          <ConfigWorkspaceTab
            files={workspaceFiles}
            setFiles={setWorkspaceFiles}
          />
        );
      case "Advanced":
        return <ConfigAdvancedTab {...tabProps} />;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Configure agent ${agentName}`}
      className="fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
      style={{
        zIndex: zIndex ?? Z_INDEX.DROPDOWN,
        left: pos.x,
        top: pos.y,
        width: panelW,
        height: panelH,
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "92vh",
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
      <div
        className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-ns-resize"
        onPointerDown={(e) => handleResizeStart(e, "bottom")}
      />

      {/* ===== HEADER ===== */}
      <div
        data-drag-handle
        className="flex shrink-0 cursor-grab items-center gap-3 border-b border-canvas-border px-5 py-3 select-none active:cursor-grabbing"
      >
        <FiSettings size={14} className="text-canvas-muted" />
        <div className="min-w-0 flex-1" data-drag-handle>
          <p
            className="truncate text-sm font-semibold text-canvas-fg"
            data-drag-handle
          >
            {agentName}
          </p>
          <p className="text-[11px] text-canvas-muted" data-drag-handle>
            Configuration
          </p>
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium transition-colors ${
            dirty
              ? "bg-canvas-fg text-canvas-bg hover:opacity-90"
              : "text-canvas-muted"
          } disabled:opacity-40`}
        >
          {saving ? (
            "Saving..."
          ) : saveSuccess ? (
            <>
              <FiCheck size={13} />
              Saved
            </>
          ) : (
            <>
              <FiSave size={13} />
              Save
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (dirty && !window.confirm("Discard unsaved changes?")) return;
            onClose();
          }}
          aria-label="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* ===== TAB BAR ===== */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-canvas-border px-5 py-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
              tab === activeTab
                ? "bg-canvas-fg text-canvas-bg"
                : "text-canvas-muted hover:text-canvas-fg"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ===== Banners ===== */}
      {saveError && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-[11px] text-red-600 dark:text-red-400">
          <FiAlertTriangle size={13} />
          {saveError}
        </div>
      )}
      {needsRestart && (
        <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/10 px-5 py-2 text-[11px] text-yellow-700 dark:text-yellow-400">
          <FiAlertTriangle size={13} />
          <span className="flex-1">
            Some changes require a restart to take effect.
          </span>
          <button
            type="button"
            onClick={handleRestart}
            disabled={restarting}
            className="rounded-md bg-yellow-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-yellow-700 disabled:opacity-50"
          >
            {restarting ? "Restarting..." : "Restart Now"}
          </button>
        </div>
      )}

      {/* ===== TAB CONTENT ===== */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {renderTab()}
      </div>
    </div>
  );
}
