"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS, loadTerminalAddons } from "@/lib/terminal-config";

type TermStatus = "idle" | "connecting" | "connected" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

export interface TerminalSectionHandle {
  sendCommand: (cmd: string) => void;
  /** Queue a command to run once the terminal is connected */
  queueCommand: (cmd: string) => void;
}

interface TerminalSectionProps {
  serverId: string;
  onDirectoryChange?: (path: string) => void;
}

export const TerminalSection = forwardRef<TerminalSectionHandle, TerminalSectionProps>(function TerminalSection({ serverId, onDirectoryChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<TermStatus>("idle");
  const pendingCmdRef = useRef<string | null>(null);

  // Ref for directory change callback so OSC handler always sees latest
  const dirChangeRef = useRef(onDirectoryChange);
  dirChangeRef.current = onDirectoryChange;

  /* ── Expose sendCommand to parent via ref ── */
  useImperativeHandle(ref, () => ({
    sendCommand(cmd: string) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "INPUT", data: cmd }));
      }
    },
    queueCommand(cmd: string) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "INPUT", data: cmd }));
      } else {
        pendingCmdRef.current = cmd;
      }
    },
  }), []);

  /* ── Initialize xterm.js ── */
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const initTimer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;

      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !containerRef.current || xtermRef.current) return;

        const term = new Terminal(TERMINAL_OPTIONS);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);
        fit.fit();

        xtermRef.current = term;
        fitRef.current = fit;

        // Track current directory via OSC 7 escape sequences
        term.parser.registerOscHandler(7, (data: string) => {
          // OSC 7 format: file://hostname/path/to/dir
          const match = data.match(/^file:\/\/[^/]*(\/.*)/);
          if (match) dirChangeRef.current?.(match[1]);
          return true;
        });

        // Load performance + UX addons
        loadTerminalAddons(term);

        // Ctrl+C: copy selected text, else send SIGINT
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection()).catch(() => {});
            term.clearSelection();
            return false;
          }
          return true;
        });

        // Send typed data to WebSocket
        term.onData((data: string) => {
          wsRef.current?.send(JSON.stringify({ type: "INPUT", data }));
        });

        // Right-click paste
        containerRef.current!.addEventListener("contextmenu", (e) => {
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
        observer.observe(containerRef.current!);

        term.writeln("\x1b[90mTerminal ready. Click Connect to start.\x1b[0m");
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

      // Track last output time for settle detection
      let lastOutputTime = Date.now();
      let promptInjected = false;

      ws.onopen = () => {
        setStatus("connected");
        xtermRef.current?.focus();
        // Wait for shell output to settle (no output for 1s = MOTD done),
        // then inject PROMPT_COMMAND silently and clear the screen.
        const settleCheck = setInterval(() => {
          if (promptInjected || ws.readyState !== WebSocket.OPEN) {
            clearInterval(settleCheck);
            return;
          }
          if (Date.now() - lastOutputTime > 1000) {
            clearInterval(settleCheck);
            promptInjected = true;
            ws.send(JSON.stringify({
              type: "INPUT",
              data: " export PROMPT_COMMAND=\"${PROMPT_COMMAND:+$PROMPT_COMMAND;}printf '\\033]7;file://%s%s\\033\\\\' \\\"\\$HOSTNAME\\\" \\\"\\$PWD\\\"\"\rclear\r",
            }));
            // Flush any queued command after clear renders
            setTimeout(() => {
              if (pendingCmdRef.current && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "INPUT", data: pendingCmdRef.current }));
                pendingCmdRef.current = null;
              }
            }, 500);
          }
        }, 200);
      };

      ws.onmessage = (event) => {
        lastOutputTime = Date.now();
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
    <div
      className="flex flex-1 flex-col min-h-0 bg-[#0d1117]"
      onKeyDown={(e) => {
        // Prevent parent scrollable containers from stealing arrow/page keys
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(e.key)) {
          e.stopPropagation();
        }
      }}
    >
      {/* Status bar — seamless with terminal bg */}
      <div className="flex shrink-0 items-center gap-2 bg-[#161b22] px-4 py-1.5">
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

      {/* xterm.js container — fills remaining space, no top padding to prevent gap */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: "0 6px 4px", background: "#0d1117" }}
      />
    </div>
  );
});
