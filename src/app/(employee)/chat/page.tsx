"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchServersApi, fetchChatSessionsApi } from "@/lib/api";
import type { Server } from "@/lib/api";
import type { ChatSession } from "@/lib/types";
import { ChatLayout } from "@/components/chat";

export default function ChatPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  /* ── Load sessions for a server ── */
  const loadSessions = useCallback(async (serverId: string) => {
    setSessionsLoading(true);
    try {
      const list = await fetchChatSessionsApi(serverId);
      setSessions(list);
      // Auto-open the most recent chat
      if (list.length > 0) {
        setSelectedSessionId(list[0].sessionId);
      }
    } catch {
      setSessions([]);
    }
    setSessionsLoading(false);
  }, []);

  /* ── Initial server fetch ── */
  useEffect(() => {
    fetchServersApi(0, 50)
      .then((page) => {
        const online = page.content.filter((s) => s.status === "ONLINE");
        const serverList = online.length > 0 ? online : page.content;
        setServers(serverList);

        // Auto-select first online server
        if (serverList.length > 0) {
          const first = serverList[0];
          setSelectedServerId(first.id);
          loadSessions(first.id);
        }

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [loadSessions]);

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

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-muted" />
      </div>
    );
  }

  /* ── No servers ── */
  if (servers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[13px] text-canvas-muted">
          No servers assigned to your account.
        </p>
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
