"use client";

import { FiPlus, FiRefreshCw } from "react-icons/fi";
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

/** Map background session status to display props */
function getSessionStatusDisplay(status: string): { dot: string; label: string; accent?: string } {
  switch (status) {
    case "running":
    case "thinking":
      return { dot: "bg-purple-400 animate-pulse", label: "Thinking..." };
    case "tool_running":
      return { dot: "bg-purple-400 animate-pulse", label: "Working..." };
    case "awaiting_permission":
      return { dot: "bg-orange-400 animate-pulse", label: "Needs approval", accent: "border-l-2 border-l-orange-400/60" };
    case "awaiting_input":
      return { dot: "bg-blue-400 animate-pulse", label: "Needs input", accent: "border-l-2 border-l-blue-400/60" };
    case "idle":
      return { dot: "bg-green-500", label: "Ready" };
    case "error":
      return { dot: "bg-red-500", label: "Error" };
    default:
      return { dot: "bg-green-500 animate-pulse", label: "Running" };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SessionListProps {
  selectedSessionId?: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  sessions: ChatSession[];
  loading: boolean;
  onRefresh: () => void;
  sessionStatusMap?: Map<string, string>;
}

export function SessionList({
  selectedSessionId,
  onSelectSession,
  onNewChat,
  sessions,
  loading,
  onRefresh,
  sessionStatusMap,
}: SessionListProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-canvas-border px-3 py-2.5">
        <span className="text-[13px] font-semibold text-canvas-fg">Chats</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiRefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#1f6feb] hover:bg-canvas-surface-hover"
          >
            <FiPlus size={15} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-muted" />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[12px] text-canvas-muted">No conversations yet</p>
            <button
              type="button"
              onClick={onNewChat}
              className="mt-3 rounded-md bg-[#1f6feb] px-3 py-1.5 text-[12px] font-medium text-white active:opacity-80"
            >
              Start a chat
            </button>
          </div>
        )}

        {!loading && sessions.length > 0 && (
          <div className="space-y-0.5">
            {sessions.map((session) => {
              const isActive = session.sessionId === selectedSessionId;
              const bgStatus = sessionStatusMap?.get(session.sessionId);
              const isRunning = !!bgStatus;
              const statusDisplay = isRunning ? getSessionStatusDisplay(bgStatus) : null;
              return (
                <button
                  key={session.sessionId}
                  type="button"
                  onClick={() => onSelectSession(session.sessionId)}
                  className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                    statusDisplay?.accent ?? ""
                  } ${
                    isActive
                      ? "bg-canvas-surface-hover text-canvas-fg"
                      : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
                  }`}
                >
                  {isRunning && statusDisplay && (
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDisplay.dot}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`line-clamp-1 text-[13px] ${isActive ? "font-medium" : ""}`}>
                      {session.display}
                    </p>
                    <p className="mt-0.5 text-[10px] text-canvas-muted">
                      {isRunning && statusDisplay ? statusDisplay.label : formatRelativeTime(session.timestamp)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
