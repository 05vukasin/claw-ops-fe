"use client";

import { useEffect, useRef, useState } from "react";
import { FiPlay, FiX } from "react-icons/fi";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { TERMINAL_OPTIONS, loadTerminalAddons } from "@/lib/terminal-config";

type Status = "connecting" | "connected" | "completed" | "failed" | "closed";

interface DeployPopupProps {
  serverId: string;
  onClose: () => void;
}

export function DeployPopup({ serverId, onClose }: DeployPopupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xtermRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>("connecting");

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

        const term = new Terminal(TERMINAL_OPTIONS);
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(containerRef.current!);
        fit.fit();
        xtermRef.current = term;
        fitRef.current = fit;

        loadTerminalAddons(term);

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

            // Wait for shell to settle, then run deploy script
            const check = setInterval(() => {
              if (scriptSent || ws.readyState !== WebSocket.OPEN) {
                clearInterval(check);
                return;
              }
              if (Date.now() - lastOutputTime > 1000) {
                clearInterval(check);
                scriptSent = true;
                // Run deploy.sh and exit when done (exit code preserved)
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
  }, [serverId]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-backdrop-in">
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
          style={{ height: 400, padding: "0 6px 4px", background: "#0d1117" }}
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
    </div>
  );
}
