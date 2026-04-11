"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { fetchServersApi, fetchChatSessionsApi, listBackgroundSessionsApi } from "@/lib/api";
import type { Server, BackgroundSession } from "@/lib/api";
import type { ChatSession, ChatProvider } from "@/lib/types";
import { ChatLayout } from "@/components/chat";
import { useClaudeAccounts } from "@/lib/use-claude-accounts";
import { useCodexAccounts } from "@/lib/use-codex-accounts";

const STORAGE_KEY = "openclaw-chat-last:v1";

function loadLastChat(): { serverId?: string; sessionId?: string; provider?: ChatProvider } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLastChat(serverId: string, provider: ChatProvider, sessionId: string | null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ serverId, provider, sessionId }));
  } catch {}
}

export default function ChatPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ChatProvider | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [backgroundSessionId, setBackgroundSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [bgSessions, setBgSessions] = useState<BackgroundSession[]>([]);
  const serversWithUI = useMemo(
    () => servers.map((server, index) => ({ ...server, x: index * 40, y: 0 })),
    [servers],
  );
  const { accounts: claudeAccounts } = useClaudeAccounts(serversWithUI);
  const { accounts: codexAccounts } = useCodexAccounts(serversWithUI);

  const providerMap = useMemo(() => {
    const map = new Map<string, ChatProvider[]>();
    for (const server of servers) map.set(server.id, []);
    for (const account of claudeAccounts) {
      const providers = map.get(account.serverId);
      if (providers && !providers.includes("claude")) providers.push("claude");
    }
    for (const account of codexAccounts) {
      const providers = map.get(account.serverId);
      if (providers && !providers.includes("codex")) providers.push("codex");
    }
    return map;
  }, [servers, claudeAccounts, codexAccounts]);

  const chatServers = useMemo(
    () => servers.filter((server) => (providerMap.get(server.id) || []).length > 0),
    [servers, providerMap],
  );

  const getPreferredProvider = useCallback((serverId: string, preferred?: ChatProvider | null) => {
    const providers = providerMap.get(serverId) || [];
    if (preferred && providers.includes(preferred)) return preferred;
    if (providers.includes("claude")) return "claude" as const;
    if (providers.includes("codex")) return "codex" as const;
    return null;
  }, [providerMap]);

  // Session status map for sidebar indicators (sessionId → status string)
  const sessionStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const bg of bgSessions) {
      if (bg.running) {
        const status = bg.status || "running";
        if (bg.providerSessionId) map.set(bg.providerSessionId, status);
        map.set(bg.id, status);
      }
    }
    return map;
  }, [bgSessions]);

  /* ── Load sessions for a server ── */
  const loadSessions = useCallback(async (serverId: string, provider: ChatProvider, preferredSessionId?: string) => {
    setSessionsLoading(true);
    try {
      const list = await fetchChatSessionsApi(serverId, provider);
      setSessions(list);
      if (preferredSessionId && list.some((s) => s.sessionId === preferredSessionId)) {
        setSelectedSessionId(preferredSessionId);
      } else if (list.length > 0) {
        setSelectedSessionId(list[0].sessionId);
      } else {
        setSelectedSessionId(null);
      }
    } catch {
      setSessions([]);
      setSelectedSessionId(null);
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

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  /* ── Restore last chat after provider detection completes ── */
  useEffect(() => {
    if (loading) return;
    if (chatServers.length === 0) return;
    if (selectedServerId) return;

    const last = loadLastChat();
    const restoredServer = last.serverId && chatServers.some((s) => s.id === last.serverId)
      ? last.serverId
      : chatServers[0].id;
    const provider = getPreferredProvider(restoredServer, last.provider ?? null);
    if (!provider) return;
    startTransition(() => {
      setSelectedServerId(restoredServer);
      setSelectedProvider(provider);
    });
    const frame = requestAnimationFrame(() => {
      loadSessions(restoredServer, provider, last.sessionId);
      loadBgSessions(restoredServer);
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, chatServers, selectedServerId, getPreferredProvider, loadSessions, loadBgSessions]);

  /* ── Poll background sessions (3s when actionable, 10s otherwise) ── */
  useEffect(() => {
    if (!selectedServerId) return;
    const hasActionable = bgSessions.some(
      (bg) => bg.running && (bg.status === "awaiting_permission" || bg.status === "awaiting_input"),
    );
    const intervalMs = hasActionable ? 3000 : 10000;
    const interval = setInterval(() => loadBgSessions(selectedServerId), intervalMs);
    return () => clearInterval(interval);
  }, [selectedServerId, loadBgSessions, bgSessions]);

  /* ── Persist selection to localStorage ── */
  useEffect(() => {
    if (selectedServerId && selectedProvider) {
      saveLastChat(selectedServerId, selectedProvider, selectedSessionId);
    }
  }, [selectedServerId, selectedProvider, selectedSessionId]);

  useEffect(() => {
    if (!selectedServerId) return;
    const provider = getPreferredProvider(selectedServerId, selectedProvider);
    if (provider !== selectedProvider) {
      startTransition(() => {
        setSelectedProvider(provider);
        setSelectedSessionId(null);
        setBackgroundSessionId(null);
        setSessions([]);
      });
      if (provider) {
        const frame = requestAnimationFrame(() => {
          loadSessions(selectedServerId, provider);
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [selectedServerId, selectedProvider, getPreferredProvider, loadSessions]);

  /* ── Handle server change ── */
  const handleServerChange = useCallback(
    (serverId: string) => {
      const provider = getPreferredProvider(serverId, null);
      setSelectedServerId(serverId);
      setSelectedProvider(provider);
      setSelectedSessionId(null);
      setBackgroundSessionId(null);
      setSessions([]);
      setBgSessions([]);
      if (provider) loadSessions(serverId, provider);
      loadBgSessions(serverId);
    },
    [getPreferredProvider, loadSessions, loadBgSessions],
  );

  const handleProviderChange = useCallback((provider: ChatProvider) => {
    if (!selectedServerId) return;
    if (provider === selectedProvider) return;
    setSelectedProvider(provider);
    setSelectedSessionId(null);
    setBackgroundSessionId(null);
    setSessions([]);
    loadSessions(selectedServerId, provider);
  }, [selectedServerId, selectedProvider, loadSessions]);

  /* ── Handle new chat (starts as background session) ── */
  const handleNewChat = useCallback(() => {
    const newBgId = crypto.randomUUID();
    setSelectedSessionId(null);
    setBackgroundSessionId(newBgId);
  }, []);

  /* ── Handle selecting an existing session ── */
  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    const bg = bgSessions.find((b) => b.providerSessionId === sessionId || b.id === sessionId);
    if (bg?.running) {
      setBackgroundSessionId(bg.id);
    } else {
      setBackgroundSessionId(null);
    }
  }, [bgSessions]);

  /* ── Handle session refresh ── */
  const handleRefreshSessions = useCallback(() => {
    if (selectedServerId && selectedProvider) {
      loadSessions(selectedServerId, selectedProvider);
      loadBgSessions(selectedServerId);
    }
  }, [selectedServerId, selectedProvider, loadSessions, loadBgSessions]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-muted" />
      </div>
    );
  }

  if (chatServers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-[13px] text-canvas-muted">No assigned servers support Claude or Codex chat.</p>
      </div>
    );
  }

  return (
    <ChatLayout
      servers={chatServers}
      selectedServerId={selectedServerId}
      onServerChange={handleServerChange}
      selectedProvider={selectedProvider}
      availableProviders={selectedServerId ? (providerMap.get(selectedServerId) || []) : []}
      onProviderChange={handleProviderChange}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      backgroundSessionId={backgroundSessionId}
      onSelectSession={handleSelectSession}
      onNewChat={handleNewChat}
      onRefreshSessions={handleRefreshSessions}
      sessionsLoading={sessionsLoading}
      sessionStatusMap={sessionStatusMap}
    />
  );
}
