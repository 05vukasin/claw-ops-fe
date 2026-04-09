"use client";

import { useCallback, useState } from "react";
import { FiFolder, FiX, FiCheck } from "react-icons/fi";
import { useIsMobile } from "@/lib/use-is-mobile";
import { ChatView } from "./chat-view";
import { FileBrowser } from "@/components/servers";

interface ChatWorkspaceProps {
  serverId: string;
  serverName: string;
  resumeSessionId?: string | null;
  onBack?: () => void;
}

export function ChatWorkspace({ serverId, serverName, resumeSessionId, onBack }: ChatWorkspaceProps) {
  const isMobile = useIsMobile();
  const [showFiles, setShowFiles] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    }).catch(() => {});
  }, []);

  // Mobile: just the chat, no file panel
  if (isMobile) {
    return (
      <ChatView
        serverId={serverId}
        serverName={serverName}
        resumeSessionId={resumeSessionId}
        onBack={onBack}
      />
    );
  }

  // Desktop: chat + optional file panel
  return (
    <div className="flex h-full">
      {/* Chat — takes remaining space */}
      <div className="flex-1 min-w-0">
        <ChatView
          serverId={serverId}
          serverName={serverName}
          resumeSessionId={resumeSessionId}
          onBack={onBack}
        />
      </div>

      {/* File panel toggle button (when panel is hidden) */}
      {!showFiles && (
        <button
          type="button"
          onClick={() => setShowFiles(true)}
          className="flex h-full w-10 shrink-0 items-center justify-center border-l border-[#21262d] bg-[#0d1117] text-gray-500 transition-colors hover:bg-[#161b22] hover:text-gray-300"
          title="Show files"
        >
          <FiFolder size={16} />
        </button>
      )}

      {/* File panel */}
      {showFiles && (
        <div className="flex w-[350px] shrink-0 flex-col border-l border-[#21262d] bg-[#0d1117]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[#21262d] px-3 py-2">
            <span className="text-[12px] font-medium text-gray-400">Files</span>
            <button
              type="button"
              onClick={() => setShowFiles(false)}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-white/5 hover:text-gray-300"
            >
              <FiX size={14} />
            </button>
          </div>

          {/* Copied toast */}
          {copiedPath && (
            <div className="flex items-center gap-1.5 border-b border-[#21262d] bg-green-500/10 px-3 py-1.5">
              <FiCheck size={11} className="text-green-400" />
              <span className="truncate text-[10px] text-green-400">Copied: {copiedPath}</span>
            </div>
          )}

          {/* File browser */}
          <div className="flex-1 overflow-hidden">
            <FileBrowser
              serverId={serverId}
              onFileClick={handleCopyPath}
            />
          </div>
        </div>
      )}
    </div>
  );
}
