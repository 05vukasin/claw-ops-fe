"use client";

import { useEffect, useRef } from "react";
import { useClaudeChat } from "@/lib/use-claude-chat";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { StatusIndicator } from "./status-indicator";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

interface ChatViewProps {
  serverId: string;
  serverName: string;
}

export function ChatView({ serverId, serverName }: ChatViewProps) {
  const { messages, status, sendMessage, reconnect } = useClaudeChat(serverId);
  const { viewportHeight } = useVisualViewport();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

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
        className="flex shrink-0 items-center justify-between border-b border-[#21262d] px-4 py-2.5"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 10px)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[#e6edf3]">
            Claude
          </p>
          <p className="truncate text-[11px] text-gray-500">{serverName}</p>
        </div>
        <StatusIndicator status={status} onReconnect={reconnect} />
      </div>

      {/* ── Messages ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-3"
      >
        {messages.length === 0 && status === "idle" && (
          <div className="flex h-full items-center justify-center px-8">
            <p className="text-center text-[13px] text-gray-600">
              Send a message to start a conversation with Claude.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>

      {/* ── Input ── */}
      <ChatInput status={status} onSend={sendMessage} />
    </div>
  );
}
