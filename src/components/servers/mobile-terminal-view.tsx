"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS } from "@/lib/terminal-config";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TermStatus = "idle" | "connecting" | "connected" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

interface MobileTerminalViewProps {
  serverId: string;
  serverName: string;
  initialCommand?: string;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function MobileTerminalView({
  serverId,
  serverName,
  initialCommand,
  onClose,
}: MobileTerminalViewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });

  const [status, setStatus] = useState<TermStatus>("idle");
  const { viewportHeight, isKeyboardOpen } = useVisualViewport();

  /* ── Lock body scroll (only prevent background page from scrolling) ── */
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

  /* ── Re-focus xterm after button tap (keeps keyboard open) ── */
  const sendAndRefocus = useCallback((data: string) => {
    send(data);
    // Re-focus xterm's hidden textarea so mobile keyboard stays open
    setTimeout(() => xtermRef.current?.focus(), 10);
  }, [send]);

  /* ── Fit terminal and send RESIZE to server if cols/rows changed ── */
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
          fontSize: 10,
          lineHeight: 1.25,
          letterSpacing: 0.2,
          scrollback: 10000,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);

        xtermRef.current = term;
        fitRef.current = fit;

        // Show immediate feedback
        term.writeln("\x1b[90mInitializing terminal...\x1b[0m");

        // Only WebLinks (skip WebGL on mobile)
        import("@xterm/addon-web-links")
          .then(({ WebLinksAddon }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!(term as any)._core?._isDisposed) term.loadAddon(new WebLinksAddon());
          })
          .catch(() => {});

        // Fit then connect with correct dimensions
        requestAnimationFrame(() => {
          fitAndResize();
          requestAnimationFrame(() => {
            fitAndResize();
            if (!cancelled) connect();
          });
        });

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

        // Paste on long-press
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

        // ResizeObserver (debounced to avoid animation interference)
        let resizeTimer: ReturnType<typeof setTimeout> | null = null;
        obs = new ResizeObserver(() => {
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (!containerRef.current || containerRef.current.offsetWidth === 0) return;
            requestAnimationFrame(() => fitAndResize());
          }, 100);
        });
        obs.observe(containerRef.current!);
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[MobileTerminal] Failed to load xterm.js:", err);
      });
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      obs?.disconnect();
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Cleanup WebSocket on unmount ── */
  useEffect(() => {
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, []);

  /* ── Refit when viewport changes (keyboard open/close) ── */
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitAndResize());
    });
  }, [viewportHeight, isKeyboardOpen, fitAndResize]);

  /* ── Connect ── */
  const connect = useCallback(async () => {
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.clear();
    setStatus("connecting");

    try {
      const token = await getSessionTokenApi(serverId);
      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const cols = xtermRef.current?.cols ?? 80;
      const rows = xtermRef.current?.rows ?? 24;
      lastSizeRef.current = { cols, rows };
      const ws = new WebSocket(
        `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`,
      );
      wsRef.current = ws;

      let lastOutputTime = Date.now();
      let injected = false;

      ws.onopen = () => {
        setStatus("connected");
        xtermRef.current?.focus();

        const settleCheck = setInterval(() => {
          if (injected || ws.readyState !== WebSocket.OPEN) { clearInterval(settleCheck); return; }
          if (Date.now() - lastOutputTime > 1000) {
            clearInterval(settleCheck);
            injected = true;
            if (initialCommand) {
              // Atomic: PROMPT_COMMAND + clear + initial command in one send — no race
              ws.send(JSON.stringify({
                type: "INPUT",
                data: ` export PROMPT_COMMAND="\${PROMPT_COMMAND:+$PROMPT_COMMAND;}printf '\\033]7;file://%s%s\\033\\\\' \\"\\$HOSTNAME\\" \\"\\$PWD\\""\rclear\rexport PATH="$HOME/.local/bin:$PATH" && ${initialCommand}\r`,
              }));
            } else {
              ws.send(JSON.stringify({
                type: "INPUT",
                data: " export PROMPT_COMMAND=\"${PROMPT_COMMAND:+$PROMPT_COMMAND;}printf '\\033]7;file://%s%s\\033\\\\' \\\"\\$HOSTNAME\\\" \\\"\\$PWD\\\"\"\rclear\r",
              }));
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
      xtermRef.current?.writeln(
        `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to connect"}\x1b[0m`,
      );
      setStatus("error");
    }
  }, [serverId, initialCommand]);

  /* ── Status ── */
  const statusDot =
    status === "connected" ? "bg-green-500"
    : status === "connecting" ? "bg-yellow-400 animate-pulse"
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
            <p className="truncate text-[13px] font-semibold text-[#e6edf3]">Terminal</p>
            <p className="truncate text-[10px] text-gray-600">{serverName}</p>
          </div>
          {(status === "error" || status === "closed") && (
            <button
              type="button"
              onClick={connect}
              className="rounded-md bg-[#21262d] px-2.5 py-1 text-[11px] font-medium text-gray-300 active:bg-[#30363d]"
            >
              Reconnect
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
        // Prevent the button from stealing focus from xterm's hidden textarea
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
