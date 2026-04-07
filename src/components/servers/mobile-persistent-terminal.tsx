"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import {
  createPersistentSessionApi,
  getPersistentSessionTokenApi,
  listPersistentSessionsApi,
  killPersistentSessionApi,
  ApiError,
} from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS } from "@/lib/terminal-config";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TermStatus = "loading" | "connecting" | "connected" | "reconnecting" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

interface MobilePersistentTerminalProps {
  serverId: string;
  serverName: string;
  initialCommand?: string;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MobilePersistentTerminal({
  serverId,
  serverName,
  initialCommand,
  onClose,
}: MobilePersistentTerminalProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });

  const [status, setStatus] = useState<TermStatus>("loading");
  const { viewportHeight, isKeyboardOpen } = useVisualViewport();

  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const initialCommandSentRef = useRef(false);

  /* ── Lock body scroll ── */
  useEffect(() => {
    const prev = document.body.style.cssText;
    document.body.style.cssText = "overflow:hidden;position:fixed;width:100%;height:100%;";
    return () => { document.body.style.cssText = prev; };
  }, []);

  /* ── Send raw data to WebSocket ── */
  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "INPUT", data }));
    }
  }, []);

  const sendAndRefocus = useCallback((data: string) => {
    send(data);
    setTimeout(() => xtermRef.current?.focus(), 10);
  }, [send]);

  /* ── Fit terminal and send RESIZE ── */
  const fitAndResize = useCallback(() => {
    if (!fitRef.current || !xtermRef.current) return;
    fitRef.current.fit();
    const term = xtermRef.current;
    const { cols, rows } = term;
    if (cols !== lastSizeRef.current.cols || rows !== lastSizeRef.current.rows) {
      lastSizeRef.current = { cols, rows };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "RESIZE", cols, rows }));
      }
    }
  }, []);

  /* ── Open WebSocket with persistent mode ── */
  const openWebSocket = useCallback(
    (token: string, sessionId: string, isNew: boolean) => {
      wsRef.current?.close();
      wsRef.current = null;

      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const cols = xtermRef.current?.cols ?? 80;
      const rows = xtermRef.current?.rows ?? 24;
      lastSizeRef.current = { cols, rows };
      const ws = new WebSocket(
        `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&mode=persistent&sessionId=${encodeURIComponent(sessionId)}&cols=${cols}&rows=${rows}`,
      );
      wsRef.current = ws;

      let lastOutputTime = Date.now();
      let injected = !isNew;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        xtermRef.current?.focus();

        if (!isNew) return;

        const check = setInterval(() => {
          if (injected || ws.readyState !== WebSocket.OPEN) { clearInterval(check); return; }
          if (Date.now() - lastOutputTime > 1000) {
            clearInterval(check);
            injected = true;
            ws.send(JSON.stringify({
              type: "INPUT",
              data: " export PROMPT_COMMAND=\"${PROMPT_COMMAND:+$PROMPT_COMMAND;}printf '\\033]7;file://%s%s\\033\\\\' \\\"\\$HOSTNAME\\\" \\\"\\$PWD\\\"\"\rclear\r",
            }));
            if (initialCommand && !initialCommandSentRef.current) {
              initialCommandSentRef.current = true;
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: "INPUT",
                    data: `export PATH="$HOME/.local/bin:$PATH" && ${initialCommand}\r`,
                  }));
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
          wsRef.current = null;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws && mountedRef.current) {
          xtermRef.current?.writeln("\r\n\x1b[90m--- Disconnected (session still running) ---\x1b[0m");
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
    [initialCommand],
  );

  /* ── Discover existing session or create new ── */
  const discoverAndConnect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("loading");

    try {
      const sessions = await listPersistentSessionsApi(serverId);
      const alive = sessions.find((s) => s.connected);

      if (alive) {
        sessionIdRef.current = alive.sessionId;
        setStatus("reconnecting");
        const token = await getPersistentSessionTokenApi(serverId, alive.sessionId);
        openWebSocket(token, alive.sessionId, false);
      } else {
        setStatus("connecting");
        xtermRef.current?.clear();
        const cols = xtermRef.current?.cols ?? 80;
        const rows = xtermRef.current?.rows ?? 24;
        const { sessionId, token } = await createPersistentSessionApi(serverId, cols, rows);
        sessionIdRef.current = sessionId;
        openWebSocket(token, sessionId, true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      xtermRef.current?.writeln(
        `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to connect"}\x1b[0m`,
      );
      setStatus("error");
    }
  }, [serverId, openWebSocket]);

  /* ── Reconnect ── */
  const handleReconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    setStatus("reconnecting");
    try {
      if (sessionIdRef.current) {
        const token = await getPersistentSessionTokenApi(serverId, sessionIdRef.current);
        openWebSocket(token, sessionIdRef.current, false);
      } else {
        await discoverAndConnect();
      }
    } catch {
      try {
        initialCommandSentRef.current = false;
        await discoverAndConnect();
      } catch (err) {
        xtermRef.current?.writeln(
          `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to reconnect"}\x1b[0m`,
        );
        setStatus("error");
      }
    }
  }, [serverId, openWebSocket, discoverAndConnect]);

  /* ── Kill session ── */
  const handleKill = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      wsRef.current?.close();
      wsRef.current = null;
      await killPersistentSessionApi(serverId, sessionIdRef.current);
      sessionIdRef.current = null;
      xtermRef.current?.writeln("\r\n\x1b[90m--- Session terminated ---\x1b[0m");
      setStatus("closed");
    } catch { /* ignore */ }
  }, [serverId]);

  /* ── Initialize xterm.js ── */
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let obs: ResizeObserver | null = null;

    const timer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;
      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !containerRef.current || xtermRef.current) return;

        const term = new Terminal({
          ...TERMINAL_OPTIONS,
          fontSize: 9,
          lineHeight: 1.2,
          letterSpacing: 0,
          scrollback: 10000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);

        xtermRef.current = term;
        fitRef.current = fit;

        import("@xterm/addon-web-links")
          .then(({ WebLinksAddon }) => { term.loadAddon(new WebLinksAddon()); })
          .catch(() => {});

        requestAnimationFrame(() => fitAndResize());

        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
          if (e.type === "keydown" && e.ctrlKey && e.key === "c" && term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection()).catch(() => {});
            term.clearSelection();
            return false;
          }
          return true;
        });

        term.onData((data: string) => {
          wsRef.current?.send(JSON.stringify({ type: "INPUT", data }));
        });

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

        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        obs = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!containerRef.current || containerRef.current.offsetWidth === 0) return;
            requestAnimationFrame(() => fitAndResize());
          }, 100);
        });
        obs.observe(containerRef.current!);

        discoverAndConnect();
      }).catch(() => {});
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      obs?.disconnect();
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cleanup WebSocket on unmount (session stays alive) ── */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  /* ── Refit on viewport change ── */
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitAndResize());
    });
  }, [viewportHeight, isKeyboardOpen, fitAndResize]);

  /* ── Status ── */
  const statusDot =
    status === "connected" ? "bg-green-500"
    : status === "connecting" || status === "reconnecting" || status === "loading" ? "bg-yellow-400 animate-pulse"
    : status === "error" ? "bg-red-500"
    : "bg-gray-500";

  return (
    <div
      ref={outerRef}
      className="fixed inset-0 bg-[#0d1117]"
      style={{ zIndex: Z_INDEX.MODAL }}
    >
      <div
        className="flex flex-col"
        style={{ height: viewportHeight, overflow: "hidden", touchAction: "none" }}
      >
        {/* ── Header ── */}
        <div
          className="flex shrink-0 items-center gap-2.5 border-b border-[#21262d] px-3 py-2"
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)", touchAction: "none" }}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#e6edf3]">Claude Code</p>
            <p className="truncate text-[10px] text-gray-600">{serverName}</p>
          </div>
          {(status === "error" || status === "closed") && (
            <button
              type="button"
              onClick={handleReconnect}
              className="rounded-md bg-[#21262d] px-2.5 py-1 text-[11px] font-medium text-gray-300 active:bg-[#30363d]"
            >
              Reconnect
            </button>
          )}
          {status === "connected" && (
            <button
              type="button"
              onClick={handleKill}
              className="rounded-md bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400 active:bg-red-500/20"
            >
              Kill
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 active:bg-white/5"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* ── Terminal ── */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0"
          style={{ background: "#0d1117" }}
          onClick={() => xtermRef.current?.focus()}
        />

        {/* ── Quick-action toolbar ── */}
        <div
          className="mobile-toolbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[#21262d] bg-[#161b22] px-2 py-1.5 no-scrollbar"
          style={{
            paddingBottom: isKeyboardOpen ? "2px" : "max(env(safe-area-inset-bottom, 0px), 6px)",
            touchAction: "pan-x",
          }}
        >
          <QBtn label="Tab" onTap={() => sendAndRefocus("\t")} />
          <QBtn label="⇧Tab" onTap={() => sendAndRefocus("\x1b[Z")} />
          <Sep />
          <QBtn label="↑" onTap={() => sendAndRefocus("\x1b[A")} />
          <QBtn label="↓" onTap={() => sendAndRefocus("\x1b[B")} />
          <QBtn label="←" onTap={() => sendAndRefocus("\x1b[D")} />
          <QBtn label="→" onTap={() => sendAndRefocus("\x1b[C")} />
          <Sep />
          <QBtn label="/" onTap={() => sendAndRefocus("/")} />
          <QBtn label="@" onTap={() => sendAndRefocus("@")} />
          <QBtn label="~" onTap={() => sendAndRefocus("~")} />
          <QBtn label="|" onTap={() => sendAndRefocus("|")} />
          <QBtn label="-" onTap={() => sendAndRefocus("-")} />
          <Sep />
          <QBtn label="^C" onTap={() => sendAndRefocus("\x03")} accent />
          <QBtn label="^D" onTap={() => sendAndRefocus("\x04")} />
          <QBtn label="^L" onTap={() => sendAndRefocus("\x0c")} />
          <QBtn label="Esc" onTap={() => sendAndRefocus("\x1b")} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick action button                                                */
/* ------------------------------------------------------------------ */

function QBtn({
  label,
  onTap,
  accent,
}: {
  label: string;
  onTap: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        onTap();
        navigator.vibrate?.(8);
      }}
      className={`shrink-0 rounded px-2 py-1 font-mono text-[12px] font-medium select-none active:scale-95 transition-transform ${
        accent
          ? "bg-red-500/15 text-red-400 active:bg-red-500/25"
          : "bg-[#21262d] text-gray-400 active:bg-[#30363d]"
      }`}
    >
      {label}
    </button>
  );
}

function Sep() {
  return <div className="mx-0.5 h-4 w-px shrink-0 bg-[#30363d]" />;
}
