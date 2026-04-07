"use client";

import { useCallback, useEffect, useState } from "react";
import { FiPlus, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import { fetchChatSessionsApi } from "@/lib/api";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import type { ChatSession } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SessionListProps {
  serverId: string;
  serverName: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

type LoadState = "loading" | "ready" | "error";

export function SessionList({
  serverId,
  serverName,
  onSelectSession,
  onNewChat,
}: SessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const { viewportHeight } = useVisualViewport();

  const load = useCallback(() => {
    setLoadState("loading");
    fetchChatSessionsApi(serverId)
      .then((list) => {
        setSessions(list);
        setLoadState("ready");
      })
      .catch(() => {
        setLoadState("error");
      });
  }, [serverId]);

  useEffect(() => {
    const id = requestAnimationFrame(() => load());
    return () => cancelAnimationFrame(id);
  }, [load]);

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
            Chats
          </p>
          <p className="truncate text-[11px] text-gray-500">{serverName}</p>
        </div>
        {loadState === "ready" && (
          <button
            type="button"
            onClick={load}
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 active:bg-white/5"
          >
            <FiRefreshCw size={14} />
          </button>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* New Chat button */}
        <button
          type="button"
          onClick={onNewChat}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f6feb] px-4 py-2.5 text-[13px] font-medium text-white active:opacity-80"
        >
          <FiPlus size={16} />
          New Chat
        </button>

        {/* Loading */}
        {loadState === "loading" && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
          </div>
        )}

        {/* Error */}
        {loadState === "error" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <p className="text-[13px] text-red-400">Failed to load sessions</p>
            <button
              type="button"
              onClick={load}
              className="rounded-md bg-[#21262d] px-3 py-1.5 text-[12px] font-medium text-gray-300 active:bg-[#30363d]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {loadState === "ready" && sessions.length === 0 && (
          <p className="py-12 text-center text-[13px] text-gray-600">
            No previous conversations
          </p>
        )}

        {/* Session cards */}
        {loadState === "ready" && sessions.length > 0 && (
          <div className="space-y-2">
            {sessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => onSelectSession(session.sessionId)}
                className="flex w-full items-center gap-3 rounded-lg border border-[#21262d] bg-[#161b22] px-4 py-3 text-left transition-colors active:bg-[#1c2128]"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug text-[#e6edf3]">
                    {session.display}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-600">
                    {formatRelativeTime(session.timestamp)}
                  </p>
                </div>
                <FiChevronRight size={14} className="shrink-0 text-gray-600" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
