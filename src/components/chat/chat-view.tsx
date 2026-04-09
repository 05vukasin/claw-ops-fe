"use client";

import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiShield, FiChevronDown } from "react-icons/fi";
import { useClaudeChat } from "@/lib/use-claude-chat";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { fetchSessionMessagesApi } from "@/lib/api";
import { StatusIndicator } from "./status-indicator";
import { MessageBubble } from "./message-bubble";
import { ChatInput } from "./chat-input";

const MODE_LABELS: Record<string, string> = {
  default: "Default",
  acceptEdits: "Accept Edits",
  plan: "Plan Mode",
  bypassPermissions: "Allow All",
};

const MODE_OPTIONS = [
  { value: "default", label: "Default", description: "Ask before edits and commands" },
  { value: "acceptEdits", label: "Accept Edits", description: "Auto-approve file edits" },
  { value: "plan", label: "Plan Mode", description: "Plan only, no changes" },
];

const EFFORT_OPTIONS = [
  { value: "", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "max", label: "Max" },
];

interface ChatViewProps {
  serverId: string;
  serverName: string;
  resumeSessionId?: string | null;
  onBack?: () => void;
}

export function ChatView({ serverId, serverName, resumeSessionId, onBack }: ChatViewProps) {
  const { messages, status, activeTool, sendMessage, respondPermission, respondQuestion, setPermissionMode, setEffort, reconnect, setInitialMessages } = useClaudeChat(
    serverId,
    resumeSessionId,
  );
  const { viewportHeight } = useVisualViewport();
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const [loadingHistory, setLoadingHistory] = useState(!!resumeSessionId);
  const [permissionMode, setMode] = useState<string>("default");
  const [effortLevel, setEffortLevel] = useState<string | null>(null);
  const [showModeMenu, setShowModeMenu] = useState(false);

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

      {/* ── Mode & Effort bar ── */}
      <div className="relative flex shrink-0 items-center gap-3 border-b border-[#21262d] px-3 py-1.5">
        {/* Mode selector */}
        <button
          type="button"
          onClick={() => setShowModeMenu((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-gray-400 active:bg-white/5"
        >
          <FiShield size={11} />
          <span>{MODE_LABELS[permissionMode] ?? "Default"}</span>
          <FiChevronDown size={10} />
        </button>

        {/* Effort selector — segmented control */}
        <div className="flex items-center gap-0.5 rounded-md bg-[#161b22] p-0.5">
          {EFFORT_OPTIONS.map((opt) => {
            const isActive = (opt.value === "" && !effortLevel) || opt.value === effortLevel;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const val = opt.value || null;
                  setEffortLevel(val);
                  setEffort(val);
                }}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  isActive
                    ? "bg-[#21262d] text-[#e6edf3]"
                    : "text-gray-500 active:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Mode dropdown */}
        {showModeMenu && (
          <div className="absolute left-3 top-full z-50 mt-1 rounded-lg border border-[#21262d] bg-[#161b22] py-1 shadow-lg">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setMode(opt.value);
                  setPermissionMode(opt.value);
                  setShowModeMenu(false);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left active:bg-white/5 ${
                  permissionMode === opt.value ? "bg-white/5" : ""
                }`}
              >
                <div>
                  <p className="text-[12px] font-medium text-[#e6edf3]">{opt.label}</p>
                  <p className="text-[10px] text-gray-500">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
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
