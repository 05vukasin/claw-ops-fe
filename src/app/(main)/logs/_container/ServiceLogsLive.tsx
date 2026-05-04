"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiPause, FiPlay, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import {
  ApiError,
  getContainerLogsTicketApi,
  type ContainerLogEntry,
  type ContainerLogLevel,
  type ContainerService,
} from "@/lib/api";
import { buildContainerLogsWsUrl } from "@/lib/apiClient";
import { showToast } from "@/components/ui/toast";
import { LogLine } from "./LogLine";

const RING_BUFFER_SIZE = 5000;
const LEVEL_OPTIONS: ContainerLogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "UNKNOWN"];
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

type ConnState = "connecting" | "open" | "closed" | "error";

interface LiveLogMessage {
  type: "LOG";
  id: number;
  service: ContainerService;
  containerId: string;
  containerName: string;
  stream: "STDOUT" | "STDERR";
  level: ContainerLogLevel;
  message: string;
  ts: string;
}

function toEntry(m: LiveLogMessage): ContainerLogEntry {
  return {
    id: m.id,
    service: m.service,
    containerId: m.containerId,
    containerName: m.containerName,
    stream: m.stream,
    level: m.level,
    message: m.message,
    logTs: m.ts,
    ingestedAt: m.ts,
  };
}

export function ServiceLogsLive({ service }: { service: ContainerService }) {
  const [entries, setEntries] = useState<ContainerLogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [filterLevel, setFilterLevel] = useState<ContainerLogLevel | "">("");
  const [filterSearch, setFilterSearch] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [bufferedCount, setBufferedCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_MIN_MS);
  const pausedQueueRef = useRef<ContainerLogEntry[]>([]);
  const pausedRef = useRef(paused);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(autoScroll);
  const closingRef = useRef(false);
  const connectRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  const appendEntry = useCallback((entry: ContainerLogEntry) => {
    if (pausedRef.current) {
      pausedQueueRef.current.push(entry);
      if (pausedQueueRef.current.length > RING_BUFFER_SIZE) {
        pausedQueueRef.current.splice(0, pausedQueueRef.current.length - RING_BUFFER_SIZE);
      }
      setBufferedCount(pausedQueueRef.current.length);
      return;
    }
    setEntries((prev) => {
      const next = prev.length >= RING_BUFFER_SIZE ? prev.slice(prev.length - RING_BUFFER_SIZE + 1) : prev.slice();
      next.push(entry);
      return next;
    });
  }, []);

  const connect = useCallback(async () => {
    closingRef.current = false;
    setConnState("connecting");
    try {
      const { ticket } = await getContainerLogsTicketApi(service);
      const url = buildContainerLogsWsUrl(ticket, service);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        reconnectDelayRef.current = RECONNECT_MIN_MS;
        setConnState("open");
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          if (data?.type === "LOG") {
            appendEntry(toEntry(data as LiveLogMessage));
          } else if (data?.type === "WARNING") {
            setWarnings((w) => [...w.slice(-4), String(data.message ?? "")]);
          }
        } catch {
          /* ignore non-JSON */
        }
      };
      ws.onerror = () => setConnState("error");
      ws.onclose = () => {
        wsRef.current = null;
        setConnState("closed");
        if (closingRef.current) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_MS);
        reconnectTimerRef.current = window.setTimeout(() => {
          void connectRef.current();
        }, delay);
      };
    } catch (err) {
      setConnState("error");
      showToast(err instanceof ApiError ? err.message : "Failed to start live tail", "error");
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, RECONNECT_MAX_MS);
      reconnectTimerRef.current = window.setTimeout(() => {
        void connectRef.current();
      }, delay);
    }
  }, [service, appendEntry]);

  const disconnect = useCallback(() => {
    closingRef.current = true;
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void connect();
    }, 0);
    return () => {
      window.clearTimeout(id);
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 50) {
      if (autoScrollRef.current) setAutoScroll(false);
    } else if (!autoScrollRef.current) {
      setAutoScroll(true);
    }
  }

  function togglePause() {
    setPaused((p) => {
      const next = !p;
      if (!next && pausedQueueRef.current.length > 0) {
        const buffered = pausedQueueRef.current;
        pausedQueueRef.current = [];
        setBufferedCount(0);
        setEntries((prev) => {
          const merged = prev.concat(buffered);
          if (merged.length > RING_BUFFER_SIZE) {
            return merged.slice(merged.length - RING_BUFFER_SIZE);
          }
          return merged;
        });
      }
      return next;
    });
  }

  function clear() {
    setEntries([]);
    pausedQueueRef.current = [];
    setBufferedCount(0);
  }

  function reconnect() {
    disconnect();
    reconnectDelayRef.current = RECONNECT_MIN_MS;
    void connect();
  }

  const visible = entries.filter((e) => {
    if (filterLevel && e.level !== filterLevel) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!e.message.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stateLabel: Record<ConnState, { text: string; cls: string }> = {
    connecting: { text: "Connecting", cls: "bg-orange-500" },
    open: { text: "Live", cls: "bg-green-500" },
    closed: { text: "Disconnected", cls: "bg-canvas-muted" },
    error: { text: "Error", cls: "bg-red-500" },
  };

  const s = stateLabel[connState];

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-canvas-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-canvas-muted">
            <span className={`h-2 w-2 rounded-full ${s.cls} ${connState === "open" ? "animate-pulse" : ""}`} />
            {s.text}
          </span>
          <span className="text-xs text-canvas-muted">
            {visible.length} / {entries.length} lines
          </span>
          {bufferedCount > 0 && paused && (
            <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-500">
              +{bufferedCount} buffered
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as ContainerLogLevel | "")}
              className="rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            >
              <option value="">All levels</option>
              {LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Filter…"
              className="w-32 rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg placeholder:text-canvas-muted focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            />
            <button
              type="button"
              onClick={togglePause}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg"
            >
              {paused ? <FiPlay size={12} /> : <FiPause size={12} />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg"
            >
              <FiTrash2 size={12} />
              Clear
            </button>
            <button
              type="button"
              onClick={reconnect}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg"
            >
              <FiRefreshCw size={12} />
              Reconnect
            </button>
          </div>
        </div>
        {warnings.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {warnings.slice(-3).map((w, i) => (
              <div key={i} className="text-[11px] text-orange-500">⚠ {w}</div>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[60vh] overflow-y-auto rounded-md border border-canvas-border bg-canvas-bg"
        >
          {visible.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-canvas-muted">
              {connState === "open" ? "Waiting for log lines…" : "Not connected."}
            </div>
          ) : (
            visible.map((e) => <LogLine key={e.id} entry={e} dense />)
          )}
        </div>
        {!autoScroll && (
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              const el = containerRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="absolute bottom-3 right-3 rounded-full border border-canvas-border bg-canvas-bg px-3 py-1 text-xs font-medium text-canvas-fg shadow-lg transition-opacity hover:opacity-90"
          >
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  );
}
