"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionTokenApi, ApiError } from "@/lib/api";
import { API_ORIGIN } from "@/lib/apiClient";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TermStatus = "idle" | "connecting" | "connected" | "error" | "closed";

interface WsMessage {
  type: "OUTPUT" | "ERROR" | "CLOSED";
  data: string;
}

/* ------------------------------------------------------------------ */
/*  ANSI → HTML (lightweight)                                          */
/* ------------------------------------------------------------------ */

const ANSI_FG: Record<number, string> = {
  30: "#484f58", 31: "#ff7b72", 32: "#7ee787", 33: "#d29922",
  34: "#79c0ff", 35: "#d2a8ff", 36: "#a5d6ff", 37: "#c9d1d9",
  90: "#6e7681", 91: "#ffa198", 92: "#56d364", 93: "#e3b341",
  94: "#79c0ff", 95: "#d2a8ff", 96: "#a5d6ff", 97: "#f0f6fc",
};

function esc(c: string): string {
  if (c === "<") return "&lt;";
  if (c === ">") return "&gt;";
  if (c === "&") return "&amp;";
  return c;
}

function ansiToHtml(text: string): string {
  // Strip non-SGR escape sequences
  text = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  text = text.replace(/\x1b\[\?[0-9;]*[hl]/g, "");
  text = text.replace(/\x1b\[[0-9;]*[ABCDJKHG]/g, "");
  text = text.replace(/\x1b\[[0-9;]*K/g, "");

  let result = "";
  let bold = false, fg: string | null = null;
  let spanOpen = false;
  let i = 0;

  function open() {
    const s: string[] = [];
    if (bold) s.push("font-weight:bold");
    if (fg) s.push("color:" + fg);
    if (s.length) { result += `<span style="${s.join(";")}">`;  spanOpen = true; }
  }
  function close() { if (spanOpen) { result += "</span>"; spanOpen = false; } }

  while (i < text.length) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length && text[j] !== "m" && j - i < 20) j++;
      if (j < text.length && text[j] === "m") {
        close();
        const codes = text.substring(i + 2, j).split(";").map(Number);
        for (const c of codes) {
          if (c === 0) { bold = false; fg = null; }
          else if (c === 1) bold = true;
          else if (c === 22) bold = false;
          else if (c === 39) fg = null;
          else if (ANSI_FG[c]) fg = ANSI_FG[c];
        }
        open();
        i = j + 1;
        continue;
      }
    }
    if (text[i] === "\x1b") { i++; continue; }
    if (text[i] === "\r") { i++; continue; }
    result += esc(text[i]);
    i++;
  }
  close();
  return result;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TerminalSectionProps {
  serverId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TerminalSection({ serverId }: TerminalSectionProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TermStatus>("idle");

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  /* ---- write to terminal display ---- */
  const termWrite = useCallback((html: string) => {
    const el = displayRef.current;
    if (!el) return;
    el.innerHTML += html;
    el.scrollTop = el.scrollHeight;
  }, []);

  /* ---- connect ---- */
  const connect = useCallback(async () => {
    // Tear down existing
    wsRef.current?.close();
    wsRef.current = null;

    if (displayRef.current) displayRef.current.innerHTML = "";
    setStatus("connecting");

    try {
      const token = await getSessionTokenApi(serverId);

      const wsBase = API_ORIGIN.replace(/^https/, "wss").replace(/^http/, "ws");
      const wsUrl = `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=120&rows=40`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        displayRef.current?.focus();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as WsMessage;
        if (msg.type === "OUTPUT") {
          termWrite(ansiToHtml(msg.data));
        } else if (msg.type === "ERROR") {
          termWrite(`<span style="color:#ff7b72">[ERROR] ${msg.data.replace(/</g, "&lt;")}</span>\n`);
        } else if (msg.type === "CLOSED") {
          termWrite(`<span style="color:#6e7681">\n--- Session ended ---\n</span>`);
          setStatus("closed");
          wsRef.current = null;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          termWrite(`<span style="color:#6e7681">\n--- Connection closed ---\n</span>`);
          setStatus("closed");
          wsRef.current = null;
        }
      };

      ws.onerror = () => {
        termWrite(`<span style="color:#ff7b72">\n--- Connection error ---\n</span>`);
        setStatus("error");
        wsRef.current = null;
      };
    } catch (err) {
      termWrite(
        `<span style="color:#ff7b72">[ERROR] ${err instanceof ApiError ? err.message : "Failed to connect"}</span>\n`,
      );
      setStatus("error");
    }
  }, [serverId, termWrite]);

  /* ---- disconnect ---- */
  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
  }, []);

  /* ---- send input to ws ---- */
  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "INPUT", data }));
    }
  }, []);

  /* ---- keyboard handler ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (status !== "connected") return;

      // Ctrl+C: copy if selection, else SIGINT
      if (e.ctrlKey && e.key === "c") {
        const selection = window.getSelection()?.toString();
        if (selection) {
          navigator.clipboard.writeText(selection);
          window.getSelection()?.removeAllRanges();
          return;
        }
        e.preventDefault();
        sendInput("\x03");
        return;
      }

      // Ctrl+V: let browser paste event handle it
      if (e.ctrlKey && e.key === "v") return;

      e.preventDefault();

      let data = "";
      if (e.ctrlKey && e.key === "d") data = "\x04";
      else if (e.ctrlKey && e.key === "l") data = "\x0c";
      else if (e.ctrlKey && e.key === "z") data = "\x1a";
      else if (e.ctrlKey && e.key === "a") data = "\x01";
      else if (e.ctrlKey && e.key === "e") data = "\x05";
      else if (e.ctrlKey && e.key === "u") data = "\x15";
      else if (e.ctrlKey && e.key === "k") data = "\x0b";
      else if (e.ctrlKey && e.key === "w") data = "\x17";
      else if (e.key === "Enter") data = "\r";
      else if (e.key === "Backspace") data = "\x7f";
      else if (e.key === "Tab") data = "\t";
      else if (e.key === "Escape") data = "\x1b";
      else if (e.key === "ArrowUp") data = "\x1b[A";
      else if (e.key === "ArrowDown") data = "\x1b[B";
      else if (e.key === "ArrowRight") data = "\x1b[C";
      else if (e.key === "ArrowLeft") data = "\x1b[D";
      else if (e.key === "Home") data = "\x1b[H";
      else if (e.key === "End") data = "\x1b[F";
      else if (e.key === "Delete") data = "\x1b[3~";
      else if (e.key === "PageUp") data = "\x1b[5~";
      else if (e.key === "PageDown") data = "\x1b[6~";
      else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) data = e.key;

      if (data) sendInput(data);
    },
    [status, sendInput],
  );

  /* ---- paste ---- */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (status !== "connected") return;
      e.preventDefault();
      const text = e.clipboardData.getData("text");
      if (text) sendInput(text);
    },
    [status, sendInput],
  );

  /* ---- right-click paste ---- */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (status !== "connected") return;
      e.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => { if (text) sendInput(text); })
        .catch(() => {});
    },
    [status, sendInput],
  );

  /* ---- status display ---- */
  const statusDot =
    status === "connected"
      ? "bg-green-400"
      : status === "connecting"
        ? "bg-yellow-400 animate-pulse"
        : status === "error"
          ? "bg-red-400"
          : "bg-gray-500";

  const statusLabel =
    status === "idle"
      ? "Not connected"
      : status === "connecting"
        ? "Connecting..."
        : status === "connected"
          ? "Connected"
          : status === "error"
            ? "Error"
            : "Closed";

  return (
    <div className="flex flex-col border-t border-canvas-border">
      {/* Status bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#1b2331] bg-[#0d1117] px-4 py-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-400">
          {statusLabel}
        </span>

        {(status === "idle" || status === "error" || status === "closed") && (
          <button
            type="button"
            onClick={connect}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            {status === "idle" ? "Connect" : "Reconnect"}
          </button>
        )}
        {(status === "connected" || status === "connecting") && (
          <button
            type="button"
            onClick={disconnect}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Terminal display */}
      <div
        ref={displayRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onContextMenu={handleContextMenu}
        className="overflow-y-auto bg-[#0d1117] p-3 text-[13px] leading-relaxed text-[#c9d1d9] outline-none selection:bg-[#264f78] selection:text-white"
        style={{
          height: 260,
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, Monaco, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          cursor: "text",
        }}
      />

      {/* Bottom hints */}
      <div className="flex items-center gap-3 border-t border-[#21262d] bg-[#161b22] px-4 py-1">
        <span className="text-[10px] text-[#484f58]">
          Select + <kbd className="rounded border border-[#30363d] bg-[#21262d] px-1 text-[9px] text-[#8b949e]">Ctrl+C</kbd> copy
        </span>
        <span className="text-[10px] text-[#484f58]">|</span>
        <span className="text-[10px] text-[#484f58]">Right-click paste</span>
      </div>
    </div>
  );
}
