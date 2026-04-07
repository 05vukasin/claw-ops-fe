"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPersistentSessionApi,
  getPersistentSessionTokenApi,
  listPersistentSessionsApi,
  killPersistentSessionApi,
  ApiError,
} from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS, loadTerminalAddons } from "@/lib/terminal-config";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TermStatus = "loading" | "connecting" | "connected" | "reconnecting" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

interface PersistentTerminalProps {
  serverId: string;
  initialCommand?: string;
  /** Called when a persistent session is created or found, so the parent can track it */
  onSessionChange?: (sessionId: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PersistentTerminal({
  serverId,
  initialCommand,
  onSessionChange,
}: PersistentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<TermStatus>("loading");
  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const initialCommandSentRef = useRef(false);

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

        xtermRef.current = term;
        fitRef.current = fit;

        // Fit after the browser has painted so container has dimensions
        requestAnimationFrame(() => {
          fit.fit();
          // Second fit as safety — some browsers need two frames
          requestAnimationFrame(() => fit.fit());
        });

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
          navigator.clipboard
            .readText()
            .then((text) => {
              if (text && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "INPUT", data: text }));
              }
            })
            .catch(() => {});
        });

        // Keep terminal sized to container
        const observer = new ResizeObserver(() => {
          requestAnimationFrame(() => fit.fit());
        });
        observer.observe(containerRef.current!);

        // Terminal is ready — discover or create session
        discoverAndConnect();
      }).catch(() => {});
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cleanup WebSocket on unmount (but keep session alive) ── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  /* ── Discover existing session or create new one ── */
  const discoverAndConnect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("loading");
    xtermRef.current?.writeln("\x1b[90mChecking for existing session...\x1b[0m");

    try {
      // Check for existing persistent sessions on this server
      const sessions = await listPersistentSessionsApi(serverId);
      const alive = sessions.find((s) => s.connected);

      if (alive) {
        // Reconnect to existing session
        sessionIdRef.current = alive.sessionId;
        onSessionChange?.(alive.sessionId);
        xtermRef.current?.writeln("\x1b[90mReconnecting to running session...\x1b[0m");
        setStatus("reconnecting");
        await connectToSession(alive.sessionId, false);
      } else {
        // Create new persistent session
        await createAndConnect();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      xtermRef.current?.writeln(
        `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to initialize session"}\x1b[0m`,
      );
      setStatus("error");
    }
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Create new persistent session ── */
  const createAndConnect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("connecting");
    xtermRef.current?.clear();

    const cols = xtermRef.current?.cols ?? 120;
    const rows = xtermRef.current?.rows ?? 40;

    const { sessionId, token } = await createPersistentSessionApi(serverId, cols, rows);
    sessionIdRef.current = sessionId;
    onSessionChange?.(sessionId);

    openWebSocket(token, sessionId, true);
  }, [serverId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Connect to an existing session ── */
  const connectToSession = useCallback(
    async (sessionId: string, clearTerminal: boolean) => {
      if (!mountedRef.current) return;
      if (clearTerminal) xtermRef.current?.clear();

      const token = await getPersistentSessionTokenApi(serverId, sessionId);
      openWebSocket(token, sessionId, false);
    },
    [serverId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ── Open WebSocket with persistent mode ── */
  const openWebSocket = useCallback(
    (token: string, sessionId: string, isNew: boolean) => {
      wsRef.current?.close();
      wsRef.current = null;

      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const cols = xtermRef.current?.cols ?? 120;
      const rows = xtermRef.current?.rows ?? 40;
      const ws = new WebSocket(
        `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&mode=persistent&sessionId=${encodeURIComponent(sessionId)}&cols=${cols}&rows=${rows}`,
      );
      wsRef.current = ws;

      let lastOutputTime = Date.now();
      let promptInjected = !isNew; // Only inject PROMPT_COMMAND on new sessions

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        xtermRef.current?.focus();

        if (!isNew) {
          // Reconnected — no need to inject prompt or send initial command
          return;
        }

        // New session: wait for shell to settle, then inject PROMPT_COMMAND + initial command
        const settleCheck = setInterval(() => {
          if (promptInjected || ws.readyState !== WebSocket.OPEN) {
            clearInterval(settleCheck);
            return;
          }
          if (Date.now() - lastOutputTime > 1000) {
            clearInterval(settleCheck);
            promptInjected = true;
            ws.send(
              JSON.stringify({
                type: "INPUT",
                data: " export PROMPT_COMMAND=\"${PROMPT_COMMAND:+$PROMPT_COMMAND;}printf '\\033]7;file://%s%s\\033\\\\' \\\"\\$HOSTNAME\\\" \\\"\\$PWD\\\"\"\rclear\r",
              }),
            );
            // Send initial command after clear renders
            if (initialCommand && !initialCommandSentRef.current) {
              initialCommandSentRef.current = true;
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "INPUT",
                      data: `export PATH="$HOME/.local/bin:$PATH" && ${initialCommand}\r`,
                    }),
                  );
                }
              }, 500);
            }
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
          if (mountedRef.current) setStatus("closed");
          sessionIdRef.current = null;
          onSessionChange?.(null);
          wsRef.current = null;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws && mountedRef.current) {
          // WebSocket closed but persistent session still lives on the backend
          xtermRef.current?.writeln(
            "\r\n\x1b[90m--- Disconnected (session still running on server) ---\x1b[0m",
          );
          setStatus("closed");
          wsRef.current = null;
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        xtermRef.current?.writeln("\r\n\x1b[31m--- Connection error ---\x1b[0m");
        setStatus("error");
        wsRef.current = null;
      };
    },
    [initialCommand, onSessionChange],
  );

  /* ── Reconnect action ── */
  const handleReconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("reconnecting");
    try {
      if (sessionIdRef.current) {
        xtermRef.current?.writeln("\r\n\x1b[90mReconnecting...\x1b[0m");
        await connectToSession(sessionIdRef.current, false);
      } else {
        await discoverAndConnect();
      }
    } catch {
      if (!mountedRef.current) return;
      // Session may have expired — try creating a fresh one
      try {
        xtermRef.current?.writeln("\r\n\x1b[90mSession expired. Starting new session...\x1b[0m");
        initialCommandSentRef.current = false;
        await createAndConnect();
      } catch (err) {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to reconnect"}\x1b[0m`,
        );
        setStatus("error");
      }
    }
  }, [connectToSession, discoverAndConnect, createAndConnect]);

  /* ── Kill session ── */
  const handleKill = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      wsRef.current?.close();
      wsRef.current = null;
      await killPersistentSessionApi(serverId, sessionIdRef.current);
      sessionIdRef.current = null;
      onSessionChange?.(null);
      xtermRef.current?.writeln("\r\n\x1b[90m--- Session terminated ---\x1b[0m");
      setStatus("closed");
    } catch {
      // Ignore — session may already be gone
    }
  }, [serverId, onSessionChange]);

  /* ── Status bar ── */
  const statusDot =
    status === "connected"
      ? "bg-green-400"
      : status === "connecting" || status === "reconnecting" || status === "loading"
        ? "bg-yellow-400 animate-pulse"
        : status === "error"
          ? "bg-red-400"
          : "bg-gray-500";

  const statusLabel =
    status === "loading"
      ? "Initializing..."
      : status === "connecting"
        ? "Creating session..."
        : status === "reconnecting"
          ? "Reconnecting..."
          : status === "connected"
            ? "Connected (persistent)"
            : status === "error"
              ? "Error"
              : "Disconnected";

  return (
    <div
      className="flex flex-1 flex-col min-h-0 bg-[#0d1117]"
      onKeyDown={(e) => {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(e.key)
        ) {
          e.stopPropagation();
        }
      }}
    >
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-2 bg-[#161b22] px-4 py-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">{statusLabel}</span>

        {(status === "error" || status === "closed") && (
          <button
            type="button"
            onClick={handleReconnect}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            Reconnect
          </button>
        )}
        {status === "connected" && (
          <button
            type="button"
            onClick={handleKill}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            Kill Session
          </button>
        )}
      </div>

      {/* xterm.js container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ padding: "0 6px 4px", background: "#0d1117" }}
      />
    </div>
  );
}
