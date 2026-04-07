"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionTokenApi } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import type { ChatMessage, ClaudeStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  ANSI escape code stripper                                          */
/* ------------------------------------------------------------------ */

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\].*?\x1b\\|\r/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useClaudeChat(
  serverId: string | null,
  resumeSessionId?: string | null,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ClaudeStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef("");
  const sessionIdRef = useRef<string | null>(resumeSessionId ?? null);
  const turnCountRef = useRef(resumeSessionId ? 1 : 0);
  const currentAssistantRef = useRef<string | null>(null); // message id being streamed
  const shellReadyRef = useRef(false);
  const lastOutputTimeRef = useRef(0);

  /* ── Pre-populate messages (for loading history) ── */
  const setInitialMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  /* ── Append or update a message ── */
  const upsertAssistantText = useCallback((delta: string) => {
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === currentAssistantRef.current);
      if (existing) {
        return prev.map((m) =>
          m.id === currentAssistantRef.current
            ? { ...m, content: m.content + delta }
            : m,
        );
      }
      // Create new assistant message
      const id = crypto.randomUUID();
      currentAssistantRef.current = id;
      return [
        ...prev,
        { id, role: "assistant", type: "text", content: delta, timestamp: Date.now() },
      ];
    });
  }, []);

  /* ── Process a single parsed JSON event ── */
  const handleEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (evt: any) => {
      if (evt.type === "system" && evt.subtype === "init") {
        setStatus("idle");
        return;
      }

      // Streaming delta (with --include-partial-messages)
      if (
        evt.type === "stream_event" &&
        evt.event?.type === "content_block_delta" &&
        evt.event?.delta?.type === "text_delta"
      ) {
        setStatus("thinking");
        upsertAssistantText(evt.event.delta.text);
        return;
      }

      // Full assistant message (arrives after streaming completes)
      if (evt.type === "assistant" && evt.message?.content) {
        // If we already have streaming content, this is the finalized version — skip
        // (the streamed deltas already built the full text)
        if (currentAssistantRef.current) return;

        // Fallback: no streaming deltas were received, use full message
        const text = evt.message.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((c: any) => c.type === "text")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((c: any) => c.text)
          .join("");
        if (text) {
          const id = crypto.randomUUID();
          setMessages((prev) => [
            ...prev,
            { id, role: "assistant", type: "text", content: text, timestamp: Date.now() },
          ]);
        }
        return;
      }

      // Result — turn complete
      if (evt.type === "result") {
        currentAssistantRef.current = null;
        setStatus("idle");
        if (evt.is_error || evt.subtype === "error") {
          const errText = evt.result || evt.error || "An error occurred";
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              type: "error",
              content: String(errText),
              timestamp: Date.now(),
            },
          ]);
        }
        return;
      }
    },
    [upsertAssistantText],
  );

  /* ── Process raw output from WebSocket ── */
  const processOutput = useCallback(
    (raw: string) => {
      lastOutputTimeRef.current = Date.now();
      const cleaned = stripAnsi(raw);
      bufferRef.current += cleaned;

      const lines = bufferRef.current.split("\n");
      // Keep the last (possibly incomplete) line in the buffer
      bufferRef.current = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed.type === "string") {
            handleEvent(parsed);
          }
        } catch {
          // Not valid JSON — shell noise, discard
        }
      }
    },
    [handleEvent],
  );

  /* ── Connect to WebSocket ── */
  const connect = useCallback(async () => {
    if (!serverId) return;

    wsRef.current?.close();
    wsRef.current = null;
    bufferRef.current = "";
    shellReadyRef.current = false;
    lastOutputTimeRef.current = 0;
    setStatus("connecting");

    try {
      const token = await getSessionTokenApi(serverId);
      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=200&rows=50`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Wait for shell to become ready (same idle-detection as MobileTerminalView)
        const check = setInterval(() => {
          if (!wsRef.current || ws.readyState !== WebSocket.OPEN) {
            clearInterval(check);
            return;
          }
          if (shellReadyRef.current) {
            clearInterval(check);
            return;
          }
          if (lastOutputTimeRef.current > 0 && Date.now() - lastOutputTimeRef.current > 1000) {
            clearInterval(check);
            shellReadyRef.current = true;
            setStatus("idle");
          }
        }, 200);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data: string };
          if (msg.type === "OUTPUT") {
            processOutput(msg.data);
          } else if (msg.type === "ERROR") {
            setStatus("disconnected");
          } else if (msg.type === "CLOSED") {
            setStatus("disconnected");
          }
        } catch {
          // ignore malformed ws messages
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setStatus("disconnected");
          wsRef.current = null;
        }
      };

      ws.onerror = () => {
        setStatus("disconnected");
        wsRef.current = null;
      };
    } catch {
      setStatus("disconnected");
    }
  }, [serverId, processOutput]);

  /* ── Send a user message ── */
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (status !== "idle") return;

      // Add user message to state
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          type: "text",
          content: trimmed,
          timestamp: Date.now(),
        },
      ]);

      // Reset streaming state
      currentAssistantRef.current = null;
      bufferRef.current = "";
      setStatus("thinking");

      // Build the claude command
      // Base64 encode the message to avoid shell escaping issues
      const b64 = btoa(unescape(encodeURIComponent(trimmed)));

      let cmd: string;
      if (turnCountRef.current === 0) {
        // First turn — create session
        if (!sessionIdRef.current) {
          sessionIdRef.current = crypto.randomUUID();
        }
        cmd = `echo '${b64}' | base64 -d | claude -p --output-format stream-json --verbose --include-partial-messages --session-id ${sessionIdRef.current} 2>/dev/null`;
      } else {
        // Subsequent turns — resume session
        cmd = `echo '${b64}' | base64 -d | claude -p --output-format stream-json --verbose --include-partial-messages --resume ${sessionIdRef.current} 2>/dev/null`;
      }

      turnCountRef.current++;

      wsRef.current.send(
        JSON.stringify({ type: "INPUT", data: cmd + "\r" }),
      );
    },
    [status],
  );

  /* ── Reconnect ── */
  const reconnect = useCallback(() => {
    if (!resumeSessionId) {
      sessionIdRef.current = null;
      turnCountRef.current = 0;
      setMessages([]);
    }
    connect();
  }, [connect, resumeSessionId]);

  /* ── Auto-connect on mount ── */
  useEffect(() => {
    if (!serverId) return;
    const id = requestAnimationFrame(() => connect());
    return () => {
      cancelAnimationFrame(id);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [serverId, connect]);

  return { messages, status, sendMessage, reconnect, setInitialMessages };
}
