"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchServersApi, fetchChatSessionsApi, listBackgroundSessionsApi } from "@/lib/api";
import type { Server, BackgroundSession } from "@/lib/api";
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
  const [backgroundSessionId, setBackgroundSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [bgSessions, setBgSessions] = useState<BackgroundSession[]>([]);

  // Running session IDs for the sidebar indicator
  const runningSessionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bg of bgSessions) {
      if (bg.running && bg.claudeSessionId) ids.add(bg.claudeSessionId);
      if (bg.running) ids.add(bg.id);
    }
    return ids;
  }, [bgSessions]);

  /* ── Load sessions for a server ── */
  const loadSessions = useCallback(async (serverId: string, preferredSessionId?: string) => {
    setSessionsLoading(true);
    try {
      const list = await fetchChatSessionsApi(serverId);
      setSessions(list);
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

  /* ── Load background session status ── */
  const loadBgSessions = useCallback(async (serverId: string) => {
    try {
      const list = await listBackgroundSessionsApi(serverId);
      setBgSessions(list);
    } catch {
      setBgSessions([]);
    }
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
          const restoredServer = last.serverId && serverList.some((s) => s.id === last.serverId)
            ? last.serverId
            : serverList[0].id;
          setSelectedServerId(restoredServer);
          loadSessions(restoredServer, last.sessionId);
          loadBgSessions(restoredServer);
        }

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [loadSessions, loadBgSessions]);

  /* ── Poll background sessions every 10s ── */
  useEffect(() => {
    if (!selectedServerId) return;
    const interval = setInterval(() => loadBgSessions(selectedServerId), 10000);
    return () => clearInterval(interval);
  }, [selectedServerId, loadBgSessions]);

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
      setBackgroundSessionId(null);
      setSessions([]);
      setBgSessions([]);
      loadSessions(serverId);
      loadBgSessions(serverId);
    },
    [loadSessions, loadBgSessions],
  );

  /* ── Handle new chat (starts as background session) ── */
  const handleNewChat = useCallback(() => {
    const newBgId = crypto.randomUUID();
    setSelectedSessionId(null);
    setBackgroundSessionId(newBgId);
  }, []);

  /* ── Handle selecting an existing session ── */
  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    // Check if this session has a running background bridge
    const bg = bgSessions.find((b) => b.claudeSessionId === sessionId || b.id === sessionId);
    if (bg?.running) {
      setBackgroundSessionId(bg.id);
    } else {
      setBackgroundSessionId(null);
    }
  }, [bgSessions]);

  /* ── Handle session refresh ── */
  const handleRefreshSessions = useCallback(() => {
    if (selectedServerId) {
      loadSessions(selectedServerId);
      loadBgSessions(selectedServerId);
    }
  }, [selectedServerId, loadSessions, loadBgSessions]);

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
      backgroundSessionId={backgroundSessionId}
      onSelectSession={handleSelectSession}
      onNewChat={handleNewChat}
      onRefreshSessions={handleRefreshSessions}
      sessionsLoading={sessionsLoading}
      runningSessionIds={runningSessionIds}
    />
  );
}
