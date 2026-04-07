"use client";

import { useEffect, useState } from "react";
import { fetchServersApi } from "@/lib/api";
import type { Server } from "@/lib/api";
import { ChatView, SessionList } from "@/components/chat";

type LoadState = "loading" | "ready" | "error";
type View = "sessions" | "chat";

export default function ChatPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [view, setView] = useState<View>("sessions");
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetchServersApi(0, 50)
      .then((page) => {
        const online = page.content.filter((s) => s.status === "ONLINE");
        setServers(online.length > 0 ? online : page.content);
        if (online.length === 1) {
          setSelectedId(online[0].id);
        } else if (page.content.length === 1) {
          setSelectedId(page.content[0].id);
        }
        setLoadState("ready");
      })
      .catch(() => {
        setLoadState("error");
      });
  }, []);

  const selectedServer = servers.find((s) => s.id === selectedId);

  /* ── Loading ── */
  if (loadState === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-300" />
      </div>
    );
  }

  /* ── Error ── */
  if (loadState === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[13px] text-red-400">
          Failed to load servers. Please try again.
        </p>
      </div>
    );
  }

  /* ── No servers ── */
  if (servers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[13px] text-gray-500">
          No servers assigned to your account.
        </p>
      </div>
    );
  }

  /* ── Server picker (multiple servers, none selected) ── */
  if (!selectedId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <p className="mb-4 text-[14px] font-medium text-[#e6edf3]">
          Select a server
        </p>
        <div className="w-full max-w-sm space-y-2">
          {servers.map((server) => (
            <button
              key={server.id}
              type="button"
              onClick={() => setSelectedId(server.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-[#21262d] bg-[#161b22] px-4 py-3 text-left transition-colors active:bg-[#1c2128]"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  server.status === "ONLINE"
                    ? "bg-green-500"
                    : server.status === "OFFLINE"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#e6edf3]">
                  {server.name}
                </p>
                <p className="truncate text-[11px] text-gray-500">
                  {server.hostname}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── Session list ── */
  if (view === "sessions") {
    return (
      <SessionList
        serverId={selectedId}
        serverName={selectedServer?.name ?? "Server"}
        onSelectSession={(sid) => {
          setResumeSessionId(sid);
          setView("chat");
        }}
        onNewChat={() => {
          setResumeSessionId(null);
          setView("chat");
        }}
      />
    );
  }

  /* ── Chat view ── */
  return (
    <ChatView
      key={resumeSessionId ?? "new"}
      serverId={selectedId}
      serverName={selectedServer?.name ?? "Server"}
      resumeSessionId={resumeSessionId}
      onBack={() => {
        setResumeSessionId(null);
        setView("sessions");
      }}
    />
  );
}
