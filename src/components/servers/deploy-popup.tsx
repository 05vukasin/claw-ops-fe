"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiPlay, FiX } from "react-icons/fi";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS, loadTerminalAddons } from "@/lib/terminal-config";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";

type Status = "connecting" | "connected" | "completed" | "failed" | "closed";

interface DeployPopupProps {
  serverId: string;
  onClose: () => void;
}

export function DeployPopup({ serverId, onClose }: DeployPopupProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const { viewportHeight, isKeyboardOpen } = useVisualViewport();

  /* ── Lock body scroll ── */
  useEffect(() => {
    if (isMobile) {
      const prev = document.body.style.cssText;
      document.body.style.cssText = "overflow:hidden;position:fixed;width:100%;height:100%;";
      return () => { document.body.style.cssText = prev; };
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  /* ── Escape to close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── Send raw data ── */
  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "INPUT", data }));
    }
  }, []);

  const sendAndRefocus = useCallback((data: string) => {
    send(data);
    setTimeout(() => xtermRef.current?.focus(), 10);
  }, [send]);

  /* ── Fit helper ── */
  const fitAndResize = useCallback(() => {
    if (!fitRef.current || !xtermRef.current) return;
    fitRef.current.fit();
  }, []);

  /* ── Refit on viewport change (mobile keyboard) ── */
  useEffect(() => {
    if (isMobile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitAndResize());
      });
    }
  }, [viewportHeight, isKeyboardOpen, fitAndResize, isMobile]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let obs: ResizeObserver | null = null;

    const initTimer = setTimeout(() => {
      if (cancelled || !containerRef.current) return;

      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(async ([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !containerRef.current || xtermRef.current) return;

        const termOpts = isMobile
          ? { ...TERMINAL_OPTIONS, fontSize: 9, lineHeight: 1.2, letterSpacing: 0, scrollback: 10000 }
          : TERMINAL_OPTIONS;

        const term = new Terminal(termOpts);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);
        xtermRef.current = term;
        fitRef.current = fit;

        requestAnimationFrame(() => {
          fit.fit();
          requestAnimationFrame(() => fit.fit());
        });

        if (!isMobile) loadTerminalAddons(term);
        else {
          import("@xterm/addon-web-links")
            .then(({ WebLinksAddon }) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if (!(term as any)._core?._isDisposed) term.loadAddon(new WebLinksAddon());
            })
            .catch(() => {});
        }

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
            requestAnimationFrame(() => fit.fit());
          }, 100);
        });
        obs.observe(containerRef.current!);

        // Connect and run deploy script
        try {
          const token = await getSessionTokenApi(serverId);
          if (cancelled) return;
          const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
          const cols = term.cols || 120;
          const rows = term.rows || 40;
          const ws = new WebSocket(
            `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`,
          );
          wsRef.current = ws;

          let lastOutputTime = Date.now();
          let scriptSent = false;

          ws.onopen = () => {
            if (!cancelled) {
              setStatus("connected");
              term.focus();
            }

            const check = setInterval(() => {
              if (scriptSent || ws.readyState !== WebSocket.OPEN) {
                clearInterval(check);
                return;
              }
              if (Date.now() - lastOutputTime > 1000) {
                clearInterval(check);
                scriptSent = true;
                ws.send(JSON.stringify({
                  type: "INPUT",
                  data: "clear && echo '\\033[1;36m=== Running /root/deploy/deploy.sh ===\\033[0m' && bash /root/deploy/deploy.sh; EXIT_CODE=$?; echo ''; if [ $EXIT_CODE -eq 0 ]; then echo '\\033[1;32m=== Deploy completed successfully ===\\033[0m'; else echo '\\033[1;31m=== Deploy failed (exit code: '$EXIT_CODE') ===\\033[0m'; fi\r",
                }));
              }
            }, 200);
          };

          ws.onmessage = (event) => {
            lastOutputTime = Date.now();
            const msg = JSON.parse(event.data);
            if (msg.type === "OUTPUT") {
              term.write(msg.data);
            } else if (msg.type === "ERROR") {
              term.writeln(`\r\n\x1b[31m[ERROR] ${msg.data}\x1b[0m`);
            } else if (msg.type === "CLOSED") {
              term.writeln("\r\n\x1b[90m--- Session ended ---\x1b[0m");
              if (!cancelled) setStatus("closed");
            }
          };

          ws.onclose = () => {
            if (!cancelled) setStatus("closed");
          };

          ws.onerror = () => {
            term.writeln("\r\n\x1b[31m--- Connection error ---\x1b[0m");
            if (!cancelled) setStatus("failed");
          };
        } catch (err) {
          term.writeln(
            `\r\n\x1b[31m[ERROR] ${err instanceof ApiError ? err.message : "Failed to connect"}\x1b[0m`,
          );
          if (!cancelled) setStatus("failed");
        }

        setTimeout(() => { if (!cancelled) fit.fit(); }, 100);
      }).catch(() => {});
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      obs?.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      xtermRef.current?.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [serverId, isMobile]);

  const statusDot =
    status === "connected" ? "bg-green-400"
    : status === "connecting" ? "bg-yellow-400 animate-pulse"
    : status === "completed" ? "bg-green-400"
    : status === "failed" ? "bg-red-400"
    : "bg-gray-500";

  const statusText =
    status === "connecting" ? "Connecting..."
    : status === "connected" ? "Running"
    : status === "completed" ? "Completed"
    : status === "failed" ? "Failed"
    : "Closed";

  /* ── Mobile: fullscreen overlay ── */
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 bg-[#0d1117]" style={{ zIndex: Z_INDEX.MODAL }}>
        <div
          className="flex flex-col"
          style={{ height: viewportHeight, overflow: "hidden", touchAction: "none" }}
        >
          {/* Header */}
          <div
            className="flex shrink-0 items-center gap-2.5 border-b border-[#21262d] px-3 py-2"
            style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 8px)", touchAction: "none" }}
          >
            <FiPlay size={14} className="shrink-0 text-blue-400" />
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#e6edf3]">Deploy</p>
              <p className="truncate text-[10px] text-gray-600">{statusText}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 active:bg-white/5"
            >
              <FiX size={18} />
            </button>
          </div>

          {/* Terminal */}
          <div
            ref={containerRef}
            className="flex-1 min-h-0"
            style={{ background: "#0d1117" }}
            onClick={() => xtermRef.current?.focus()}
          />

          {/* Quick-action toolbar */}
          <div
            className="mobile-toolbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[#21262d] bg-[#161b22] px-2 py-1.5 no-scrollbar"
            style={{
              paddingBottom: isKeyboardOpen ? "2px" : "max(env(safe-area-inset-bottom, 0px), 6px)",
              touchAction: "pan-x",
            }}
          >
            <QBtn label="Tab" onTap={() => sendAndRefocus("\t")} />
            <QBtn label="↑" onTap={() => sendAndRefocus("\x1b[A")} />
            <QBtn label="↓" onTap={() => sendAndRefocus("\x1b[B")} />
            <Sep />
            <QBtn label="^C" onTap={() => sendAndRefocus("\x03")} accent />
            <QBtn label="^D" onTap={() => sendAndRefocus("\x04")} />
            <QBtn label="^L" onTap={() => sendAndRefocus("\x0c")} />
            <QBtn label="Esc" onTap={() => sendAndRefocus("\x1b")} />
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  /* ── Desktop: centered modal via portal ── */
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-backdrop-in"
      style={{ zIndex: Z_INDEX.MODAL }}
    >
      <div className="mx-4 flex w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#21262d] bg-[#161b22] px-4 py-2.5">
          <FiPlay size={14} className="shrink-0 text-blue-400" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#c9d1d9]">
            Deploy
          </span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
          <span className="text-[10px] text-gray-400">{statusText}</span>
        </div>

        {/* xterm */}
        <div
          ref={containerRef}
          style={{ height: "min(400px, 50vh)", padding: "0 6px 4px", background: "#0d1117" }}
        />

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[#21262d] bg-[#161b22] px-4 py-2">
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            <FiX size={11} />
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Mobile quick-action buttons ── */

function QBtn({ label, onTap, accent }: { label: string; onTap: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onTap(); navigator.vibrate?.(8); }}
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
