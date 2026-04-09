"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchServersApi, fetchChatSessionsApi } from "@/lib/api";
import type { Server } from "@/lib/api";
import type { ChatSession } from "@/lib/types";
import { ChatLayout } from "@/components/chat";

const STORAGE_KEY = "openclaw-chat-last:v1";

function loadLastChat(): { serverId?: string; sessionId?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLastChat(serverId: string, sessionId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverId, sessionId }));
  } catch {}
}

export default function ChatPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  /* ── Load sessions for a server ── */
  const loadSessions = useCallback(async (serverId: string, preferredSessionId?: string) => {
    setSessionsLoading(true);
    try {
      const list = await fetchChatSessionsApi(serverId);
      setSessions(list);
      // Use preferred session if it exists in the list, otherwise most recent
      if (preferredSessionId && list.some((s) => s.sessionId === preferredSessionId)) {
        setSelectedSessionId(preferredSessionId);
      } else if (list.length > 0) {
        setSelectedSessionId(list[0].sessionId);
      }
    } catch {
      setSessions([]);
    }
    setSessionsLoading(false);
  }, []);

  /* ── Initial server fetch + restore last chat ── */
  useEffect(() => {
    fetchServersApi(0, 50)
      .then((page) => {
        const online = page.content.filter((s) => s.status === "ONLINE");
        const serverList = online.length > 0 ? online : page.content;
        setServers(serverList);

        if (serverList.length > 0) {
          const last = loadLastChat();
          // Restore last server if it's in the list
          const restoredServer = last.serverId && serverList.some((s) => s.id === last.serverId)
            ? last.serverId
            : serverList[0].id;
          setSelectedServerId(restoredServer);
          loadSessions(restoredServer, last.sessionId);
        }

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [loadSessions]);

  /* ── Persist selection to localStorage ── */
  useEffect(() => {
    if (selectedServerId) {
      saveLastChat(selectedServerId, selectedSessionId);
    }
  }, [selectedServerId, selectedSessionId]);

  /* ── Handle server change ── */
  const handleServerChange = useCallback(
    (serverId: string) => {
      setSelectedServerId(serverId);
      setSelectedSessionId(null);
      setSessions([]);
      loadSessions(serverId);
    },
    [loadSessions],
  );

  /* ── Handle new chat ── */
  const handleNewChat = useCallback(() => {
    setSelectedSessionId(null);
  }, []);

  /* ── Handle session refresh ── */
  const handleRefreshSessions = useCallback(() => {
    if (selectedServerId) loadSessions(selectedServerId);
  }, [selectedServerId, loadSessions]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-muted" />
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[13px] text-canvas-muted">No servers assigned to your account.</p>
      </div>
    );
  }

  return (
    <ChatLayout
      servers={servers}
      selectedServerId={selectedServerId}
      onServerChange={handleServerChange}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      onSelectSession={setSelectedSessionId}
      onNewChat={handleNewChat}
      onRefreshSessions={handleRefreshSessions}
      sessionsLoading={sessionsLoading}
    />
  );
}
