"use client";

import { useCallback, useState } from "react";
import { FiMenu, FiX, FiFolder, FiCheck, FiChevronsLeft, FiMessageSquare } from "react-icons/fi";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";
import type { Server } from "@/lib/api";
import type { ChatSession } from "@/lib/types";
import { ChatView } from "./chat-view";
import { SessionList } from "./session-list";
import { ServerSelector } from "./server-selector";
import { MobileFileSheet } from "./mobile-file-sheet";
import { FileBrowser } from "@/components/servers";

interface ChatLayoutProps {
  servers: Server[];
  selectedServerId: string | null;
  onServerChange: (serverId: string) => void;
  sessions: ChatSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onRefreshSessions: () => void;
  sessionsLoading: boolean;
}

export function ChatLayout({
  servers,
  selectedServerId,
  onServerChange,
  sessions,
  selectedSessionId,
  onSelectSession,
  onNewChat,
  onRefreshSessions,
  sessionsLoading,
}: ChatLayoutProps) {
  const isMobile = useIsMobile();
  const { viewportHeight } = useVisualViewport();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    }).catch(() => {});
  }, []);

  const selectedServer = servers.find((s) => s.id === selectedServerId);

  /* ══════════════════════════════════════════════════════════════════ */
  /*  MOBILE LAYOUT                                                    */
  /* ══════════════════════════════════════════════════════════════════ */

  if (isMobile) {
    return (
      <div className="flex flex-col" style={{ height: viewportHeight, overflow: "hidden" }}>
        {/* Mobile header */}
        <div
          className="surface-overlay flex shrink-0 items-center gap-2 px-3 py-2.5"
          style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 10px)" }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-muted hover:bg-canvas-surface-hover"
          >
            <FiMenu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-canvas-fg">Claude</p>
          </div>
          <ServerSelector servers={servers} selectedId={selectedServerId} onChange={onServerChange} />
        </div>

        {/* Chat view (headerless — header is above) */}
        <div className="flex min-h-0 flex-1 flex-col">
          {selectedServerId ? (
            <ChatView
              key={`${selectedServerId}-${selectedSessionId ?? "new"}`}
              serverId={selectedServerId}
              serverName={selectedServer?.name ?? "Server"}
              resumeSessionId={selectedSessionId}
              headerless
              fileButton={
                <button
                  type="button"
                  onClick={() => setFilesPanelOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
                >
                  <FiFolder size={18} />
                </button>
              }
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6">
              <p className="text-center text-[13px] text-canvas-muted">Select a server to start chatting</p>
            </div>
          )}
        </div>

        {/* Mobile session sidebar overlay */}
        {sidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
              style={{ zIndex: Z_INDEX.MODAL }}
              onClick={() => setSidebarOpen(false)}
            />
            <div
              className="animate-sidebar-in fixed inset-y-0 left-0 w-[280px] border-r border-canvas-border bg-canvas-bg shadow-xl"
              style={{ zIndex: Z_INDEX.MODAL + 1 }}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-canvas-border px-3 py-2.5">
                  <span className="text-[13px] font-semibold text-canvas-fg">Chats</span>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted hover:bg-canvas-surface-hover"
                  >
                    <FiX size={15} />
                  </button>
                </div>
                {selectedServerId && (
                  <SessionList
                    selectedSessionId={selectedSessionId}
                    sessions={sessions}
                    loading={sessionsLoading}
                    onSelectSession={(sid) => { onSelectSession(sid); setSidebarOpen(false); }}
                    onNewChat={() => { onNewChat(); setSidebarOpen(false); }}
                    onRefresh={onRefreshSessions}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* Mobile file sheet */}
        {selectedServerId && (
          <MobileFileSheet
            serverId={selectedServerId}
            open={filesPanelOpen}
            onClose={() => setFilesPanelOpen(false)}
            onCopyPath={handleCopyPath}
          />
        )}

        {/* Copy toast */}
        {copiedPath && (
          <div
            className="fixed left-1/2 top-20 -translate-x-1/2 flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 shadow-lg"
            style={{ zIndex: Z_INDEX.TOAST }}
          >
            <FiCheck size={12} className="text-white" />
            <span className="text-[11px] font-medium text-white">Path copied</span>
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════ */
  /*  DESKTOP LAYOUT                                                   */
  /* ══════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex h-full">
      {/* ── Left sidebar: Sessions (collapsible) ── */}
      {sidebarCollapsed ? (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          className="flex h-full w-10 shrink-0 flex-col items-center justify-center border-r border-canvas-border text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          title="Show chats"
        >
          <FiMessageSquare size={16} />
        </button>
      ) : (
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-canvas-border bg-canvas-bg">
          {/* Sidebar header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-canvas-border px-3">
            <ServerSelector servers={servers} selectedId={selectedServerId} onChange={onServerChange} />
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
              title="Collapse sidebar"
            >
              <FiChevronsLeft size={14} />
            </button>
          </div>

          {/* Session list */}
          {selectedServerId && (
            <SessionList
              selectedSessionId={selectedSessionId}
              sessions={sessions}
              loading={sessionsLoading}
              onSelectSession={onSelectSession}
              onNewChat={onNewChat}
              onRefresh={onRefreshSessions}
            />
          )}
        </aside>
      )}

      {/* ── Center: Chat ── */}
      <main className="flex min-w-0 flex-1 flex-col">
        {selectedServerId ? (
          <ChatView
            key={`${selectedServerId}-${selectedSessionId ?? "new"}`}
            serverId={selectedServerId}
            serverName={selectedServer?.name ?? "Server"}
            resumeSessionId={selectedSessionId}
            headerless
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-8">
            <p className="text-center text-[13px] text-canvas-muted">Select a server to start chatting</p>
          </div>
        )}
      </main>

      {/* ── Right: File panel toggle or panel ── */}
      {selectedServerId && !filesPanelOpen && (
        <button
          type="button"
          onClick={() => setFilesPanelOpen(true)}
          className="flex h-full w-10 shrink-0 items-center justify-center border-l border-canvas-border text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          title="Show files"
        >
          <FiFolder size={16} />
        </button>
      )}

      {selectedServerId && filesPanelOpen && (
        <aside className="flex w-[300px] shrink-0 flex-col border-l border-canvas-border bg-canvas-bg">
          {/* Panel header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-canvas-border px-3">
            <span className="text-[12px] font-medium text-canvas-muted">Files</span>
            <button
              type="button"
              onClick={() => setFilesPanelOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <FiX size={14} />
            </button>
          </div>

          {/* Copied toast */}
          {copiedPath && (
            <div className="flex items-center gap-1.5 border-b border-canvas-border bg-green-500/10 px-3 py-1.5">
              <FiCheck size={11} className="text-green-400" />
              <span className="truncate text-[10px] text-green-400">Copied: {copiedPath}</span>
            </div>
          )}

          {/* File browser — full height */}
          <div className="flex-1 overflow-hidden">
            <FileBrowser
              serverId={selectedServerId}
              onFileClick={handleCopyPath}
              height={9999}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
