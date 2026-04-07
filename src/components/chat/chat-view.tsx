"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useClaudeChat } from "@/lib/use-claude-chat";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { fetchSessionMessagesApi } from "@/lib/api";
import { StatusIndicator } from "./status-indicator";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

interface ChatViewProps {
  serverId: string;
  serverName: string;
  resumeSessionId?: string | null;
  onBack?: () => void;
}

export function ChatView({ serverId, serverName, resumeSessionId, onBack }: ChatViewProps) {
  const { messages, status, activeTool, sendMessage, respondPermission, respondQuestion, reconnect, setInitialMessages } = useClaudeChat(
    serverId,
    resumeSessionId,
  );
  const { viewportHeight } = useVisualViewport();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [loadingHistory, setLoadingHistory] = useState(!!resumeSessionId);

  /* ── Load message history when resuming a session ── */
  useEffect(() => {
    if (!resumeSessionId || !serverId) return;
    let cancelled = false;
    fetchSessionMessagesApi(serverId, resumeSessionId)
      .then((msgs) => {
        if (!cancelled) {
          setInitialMessages(msgs);
          setLoadingHistory(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => { cancelled = true; };
  }, [resumeSessionId, serverId, setInitialMessages]);

  /* ── Auto-scroll to bottom on new messages ── */
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  /* ── Detect if user scrolled up ── */
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    userScrolledUpRef.current = !atBottom;
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: viewportHeight, overflow: "hidden" }}
    >
      {/* ── Header ── */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-[#21262d] px-3 py-2.5"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 10px)" }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 active:bg-white/5"
          >
            <FiArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#e6edf3]">
            Claude
          </p>
          <p className="truncate text-[11px] text-gray-500">{serverName}</p>
        </div>
        <StatusIndicator status={status} activeTool={activeTool} onReconnect={reconnect} />
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden py-3"
      >
        {loadingHistory && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
            <span className="ml-2 text-[12px] text-gray-600">Loading conversation...</span>
          </div>
        )}
        {!loadingHistory && messages.length === 0 && status === "idle" && (
          <div className="flex h-full items-center justify-center px-8">
            <p className="text-center text-[13px] text-gray-600">
              Send a message to start a conversation with Claude.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onPermissionRespond={respondPermission}
            onQuestionRespond={respondQuestion}
          />
        ))}
      </div>

      {/* ── Input ── */}
      <ChatInput status={status} onSend={sendMessage} />
    </div>
  );
}
