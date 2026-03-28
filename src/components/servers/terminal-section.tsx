"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";

type TermStatus = "idle" | "connecting" | "connected" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

export interface TerminalSectionHandle {
  sendCommand: (cmd: string) => void;
}

interface TerminalSectionProps {
  serverId: string;
}

export const TerminalSection = forwardRef<TerminalSectionHandle, TerminalSectionProps>(function TerminalSection({ serverId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<TermStatus>("idle");

  /* ── Expose sendCommand to parent via ref ── */
  useImperativeHandle(ref, () => ({
    sendCommand(cmd: string) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "INPUT", data: cmd }));
      }
    },
  }), []);

  /* ── Initialize xterm.js ── */
  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    // Small delay to ensure the container is laid out (collapsible section)
    const initTimer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;

      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(([{ Terminal }, { FitAddon }]) => {
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
          black: "#484f58",
          red: "#ff7b72",
          green: "#3fb950",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#39c5cf",
          white: "#b1bac4",
          brightBlack: "#6e7681",
          brightRed: "#ffa198",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#f0f6fc",
        },
      });

      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      fit.fit();

      xtermRef.current = term;
      fitRef.current = fit;

      // Ctrl+C: copy selected text, else send SIGINT
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          return false; // prevent xterm from handling it
        }
        return true;
      });

      // Send typed data to WebSocket
      term.onData((data: string) => {
        wsRef.current?.send(JSON.stringify({ type: "INPUT", data }));
      });

      // Right-click paste
      containerRef.current.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        navigator.clipboard.readText()
          .then((text) => {
            if (text && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "INPUT", data: text }));
            }
          })
          .catch(() => {});
      });

      // Keep terminal sized to container
      const observer = new ResizeObserver(() => { fit.fit(); });
      observer.observe(containerRef.current);

        term.writeln("\x1b[90mTerminal ready. Click Connect to start.\x1b[0m");

        // Fit again after a short delay to catch any layout shifts
        setTimeout(() => { if (!cancelled) fit.fit(); }, 100);
      }).catch(() => {});
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []);

  /* ── Cleanup WebSocket on unmount ── */
  useEffect(() => {
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  /* ── Connect ── */
  const connect = useCallback(async () => {
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.clear();
    setStatus("connecting");

    try {
      const token = await getSessionTokenApi(serverId);
      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const ws = new WebSocket(`${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=${xtermRef.current?.cols ?? 120}&rows=${xtermRef.current?.rows ?? 40}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        xtermRef.current?.focus();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as WsMessage;
        if (msg.type === "OUTPUT") {
          xtermRef.current?.write(msg.data);
        } else if (msg.type === "ERROR") {
          xtermRef.current?.writeln(`\r\n\x1b[31m[ERROR] ${msg.data}\x1b[0m`);
        } else if (msg.type === "CLOSED") {
          xtermRef.current?.writeln("\r\n\x1b[90m--- Session ended ---\x1b[0m");
          setStatus("closed");
          wsRef.current = null;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          xtermRef.current?.writeln("\r\n\x1b[90m--- Connection closed ---\x1b[0m");
          setStatus("closed");
          wsRef.current = null;
        }
      };

      ws.onerror = () => {
        xtermRef.current?.writeln("\r\n\x1b[31m--- Connection error ---\x1b[0m");
        setStatus("error");
        wsRef.current = null;
      };
    } catch (err) {
      xtermRef.current?.writeln(`\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to connect"}\x1b[0m`);
      setStatus("error");
    }
  }, [serverId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
  }, []);

  /* ── Auto-connect once xterm is ready ── */
  const autoConnectedRef = useRef(false);
  useEffect(() => {
    if (autoConnectedRef.current) return;
    const timer = setInterval(() => {
      if (xtermRef.current && !autoConnectedRef.current) {
        autoConnectedRef.current = true;
        clearInterval(timer);
        connect();
      }
    }, 100);
    return () => clearInterval(timer);
  }, [connect]);

  const statusDot =
    status === "connected" ? "bg-green-400"
    : status === "connecting" ? "bg-yellow-400 animate-pulse"
    : status === "error" ? "bg-red-400"
    : "bg-gray-500";

  const statusLabel =
    status === "idle" ? "Not connected"
    : status === "connecting" ? "Connecting..."
    : status === "connected" ? "Connected"
    : status === "error" ? "Error"
    : "Closed";

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#1b2331] bg-[#0d1117] px-4 py-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">{statusLabel}</span>

        {(status === "idle" || status === "error" || status === "closed") && (
          <button type="button" onClick={connect} className="shrink-0 rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200">
            {status === "idle" ? "Connect" : "Reconnect"}
          </button>
        )}
        {(status === "connected" || status === "connecting") && (
          <button type="button" onClick={disconnect} className="shrink-0 rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200">
            Disconnect
          </button>
        )}
      </div>

      {/* xterm.js container — flex-1 fills available space */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 bg-[#0d1117]"
        style={{ padding: "6px 2px" }}
      />
    </div>
  );
});
