"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionTokenApi } from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import type { ChatMessage, ClaudeStatus, ActiveToolInfo } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Extract JSON objects from raw terminal output                      */
/* ------------------------------------------------------------------ */

/** Strip all non-printable/control chars except newline */
function cleanRaw(s: string): string {
  // Remove all ANSI escape sequences (CSI, OSC, etc.)
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b[\x20-\x7e]*[\x40-\x7e]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\r/g, "");
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
  const [activeTool, setActiveTool] = useState<ActiveToolInfo | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef("");
  const bridgeReadyRef = useRef(false);
  const sessionIdRef = useRef<string | null>(resumeSessionId ?? null);
  const currentAssistantRef = useRef<string | null>(null);
  const currentThinkingRef = useRef<string | null>(null);
  const shellReadyRef = useRef(false);
  const lastOutputTimeRef = useRef(0);
  const toolInputAccum = useRef("");

  /* ── Pre-populate messages (for loading history) ── */
  const setInitialMessages = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  /* ── Append or update streaming assistant text ── */
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
      const id = crypto.randomUUID();
      currentAssistantRef.current = id;
      return [
        ...prev,
        { id, role: "assistant", type: "text", content: delta, timestamp: Date.now() },
      ];
    });
  }, []);

  /* ── Process a bridge protocol event ── */
  const handleBridgeEvent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (evt: any) => {
      // Bridge ready
      if (evt.type === "ready") {
        bridgeReadyRef.current = true;
        setStatus("idle");
        return;
      }

      // Session init
      if (evt.type === "session_init") {
        sessionIdRef.current = evt.sessionId;
        return;
      }

      // Status updates from bridge
      if (evt.type === "status") {
        if (evt.status === "awaiting_permission") setStatus("awaiting_permission");
        else if (evt.status === "awaiting_input") setStatus("awaiting_input");
        else if (evt.status === "thinking") setStatus("thinking");
        else if (evt.status === "tool_running") setStatus("tool_running");
        return;
      }

      // Text delta — streaming assistant text
      if (evt.type === "text_delta") {
        setStatus("thinking");
        upsertAssistantText(evt.text);
        return;
      }

      // Thinking delta
      if (evt.type === "thinking_delta") {
        setStatus("thinking");
        const thinkingId = currentThinkingRef.current;
        if (thinkingId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === thinkingId ? { ...m, content: m.content + evt.text } : m,
            ),
          );
        } else {
          const id = crypto.randomUUID();
          currentThinkingRef.current = id;
          setMessages((prev) => [
            ...prev,
            { id, role: "assistant", type: "thinking", content: evt.text, timestamp: Date.now() },
          ]);
        }
        return;
      }

      // Tool use start
      if (evt.type === "tool_use_start") {
        currentAssistantRef.current = null; // finalize any streaming text
        currentThinkingRef.current = null;
        toolInputAccum.current = "";
        const tool: ActiveToolInfo = { name: evt.name, callId: evt.id };
        setActiveTool(tool);
        setStatus("tool_running");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            type: "tool_use",
            toolName: evt.name,
            toolCallId: evt.id,
            toolInput: "",
            content: "",
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      // Tool input delta
      if (evt.type === "tool_input_delta") {
        toolInputAccum.current += evt.json;
        return;
      }

      // Tool use complete (full input available)
      if (evt.type === "tool_use_complete") {
        const input = JSON.stringify(evt.input);
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].type === "tool_use" && prev[i].toolCallId === evt.id) {
              const updated = [...prev];
              updated[i] = { ...updated[i], toolInput: input };
              return updated;
            }
          }
          return prev;
        });
        toolInputAccum.current = "";
        return;
      }

      // Content block stop
      if (evt.type === "content_block_stop") {
        setActiveTool(null);
        return;
      }

      // Tool result
      if (evt.type === "tool_result") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            type: "tool_result",
            content: evt.content || "",
            toolCallId: evt.id,
            isError: evt.isError ?? false,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      // Permission request
      if (evt.type === "permission_request") {
        currentAssistantRef.current = null;
        setStatus("awaiting_permission");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            type: "permission_request",
            content: evt.description || "",
            toolName: evt.toolName,
            permissionId: evt.id,
            permissionInput: evt.input,
            permissionResolved: false,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      // Ask question
      if (evt.type === "ask_question") {
        currentAssistantRef.current = null;
        setStatus("awaiting_input");
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            type: "ask_question",
            content: "",
            askId: evt.id,
            askQuestions: evt.questions,
            askResolved: false,
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      // Result — turn complete
      if (evt.type === "result") {
        currentAssistantRef.current = null;
        currentThinkingRef.current = null;
        setActiveTool(null);
        setStatus("idle");
        sessionIdRef.current = evt.sessionId || sessionIdRef.current;
        if (evt.isError) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "system",
              type: "error",
              content: evt.text || "An error occurred",
              timestamp: Date.now(),
            },
          ]);
        }
        return;
      }

      // Error
      if (evt.type === "error") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "system",
            type: "error",
            content: evt.message || "Bridge error",
            timestamp: Date.now(),
          },
        ]);
        return;
      }
    },
    [upsertAssistantText],
  );

  /* ── Process raw output from WebSocket ── */
  const processOutput = useCallback(
    (raw: string) => {
      lastOutputTimeRef.current = Date.now();
      const cleaned = cleanRaw(raw);
      bufferRef.current += cleaned;

      function tryParse(line: string) {
        const trimmed = line.trim();
        if (!trimmed) return;
        const start = trimmed.indexOf("{");
        const end = trimmed.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start) return;
        const candidate = trimmed.slice(start, end + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.type === "string") {
            handleBridgeEvent(parsed);
            if (line === bufferRef.current) bufferRef.current = "";
          }
        } catch {
          // Not valid JSON yet
        }
      }

      // Split on newlines and try to parse each line
      const lines = bufferRef.current.split("\n");
      bufferRef.current = lines.pop() ?? "";

      for (const line of lines) {
        tryParse(line);
      }

      // Also try the remaining buffer
      tryParse(bufferRef.current);
    },
    [handleBridgeEvent],
  );

  /* ── Send raw JSON to bridge via WebSocket ── */
  const sendToBridge = useCallback((obj: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const json = JSON.stringify(obj);
      wsRef.current.send(JSON.stringify({ type: "INPUT", data: json + "\n" }));
    }
  }, []);

  /* ── Launch the bridge script on the server ── */
  const launchBridge = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const cmd = `export PATH="$HOME/.local/bin:$PATH" && node ~/.local/share/claw-ops/chat-bridge.mjs`;
    wsRef.current.send(JSON.stringify({ type: "INPUT", data: cmd + "\r" }));
    // Fallback: if bridge doesn't emit "ready" within 4s, set idle anyway
    setTimeout(() => {
      if (!bridgeReadyRef.current) {
        bridgeReadyRef.current = true;
        setStatus("idle");
      }
    }, 4000);
  }, []);

  /* ── Connect to WebSocket and launch bridge ── */
  const connect = useCallback(async () => {
    if (!serverId) return;

    wsRef.current?.close();
    wsRef.current = null;
    bufferRef.current = "";
    bridgeReadyRef.current = false;
    shellReadyRef.current = false;
    lastOutputTimeRef.current = 0;
    setStatus("connecting");

    try {
      const token = await getSessionTokenApi(serverId);
      const wsBase = getApiOrigin().replace(/^https/, "wss").replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsBase}/ws/terminal?token=${encodeURIComponent(token)}&cols=500&rows=50`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        // Launch bridge after a short delay for shell to initialize
        setTimeout(() => {
          shellReadyRef.current = true;
          launchBridge();
        }, 500);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data: string };
          if (msg.type === "OUTPUT") {
            processOutput(msg.data);
          } else if (msg.type === "ERROR" || msg.type === "CLOSED") {
            setStatus("disconnected");
          }
        } catch {
          // ignore
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
  }, [serverId, processOutput, launchBridge]);

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
      currentThinkingRef.current = null;
      setActiveTool(null);
      bufferRef.current = "";
      setStatus("thinking");

      // Send to bridge
      sendToBridge({
        type: "message",
        text: trimmed,
        sessionId: resumeSessionId || undefined,
      });
    },
    [status, sendToBridge, resumeSessionId],
  );

  /* ── Respond to permission request ── */
  const respondPermission = useCallback(
    (permissionId: string, allow: boolean, message?: string) => {
      sendToBridge({
        type: "permission_response",
        id: permissionId,
        allow,
        message: message || undefined,
      });

      // Update the permission message in state to show resolved
      setMessages((prev) =>
        prev.map((m) =>
          m.permissionId === permissionId
            ? { ...m, permissionResolved: true, permissionAllowed: allow }
            : m,
        ),
      );

      setStatus("tool_running");
    },
    [sendToBridge],
  );

  /* ── Respond to ask question ── */
  const respondQuestion = useCallback(
    (askId: string, answers: Record<string, string>) => {
      sendToBridge({
        type: "ask_response",
        id: askId,
        answers,
      });

      // Mark as resolved
      setMessages((prev) =>
        prev.map((m) =>
          m.askId === askId ? { ...m, askResolved: true } : m,
        ),
      );

      setStatus("thinking");
    },
    [sendToBridge],
  );

  /* ── Reconnect ── */
  const reconnect = useCallback(() => {
    if (!resumeSessionId) {
      sessionIdRef.current = null;
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

  return {
    messages,
    status,
    activeTool,
    sendMessage,
    respondPermission,
    respondQuestion,
    reconnect,
    setInitialMessages,
  };
}
