"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServerDashboardPanel, ServerModal } from "@/components/servers";
import { AgentDashboardPanel } from "@/components/agents/agent-dashboard-panel";
import { useServers } from "@/lib/use-servers";
import { Z_INDEX } from "@/lib/z-index";
import type { Server } from "@/lib/api";

interface WorkspacePanelProps {
  onRefresh: () => void;
}

export function WorkspacePanel({ onRefresh }: WorkspacePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { servers, removeServer } = useServers();

  // URL is the source of truth for open panels
  const openIds = useMemo(() => {
    const param = searchParams.get("servers") ?? searchParams.get("server") ?? "";
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  const openServers = useMemo(
    () => openIds.map((id) => servers.find((s) => s.id === id)).filter(Boolean) as Server[],
    [openIds, servers],
  );

  // Agent panels from URL
  const openAgentKeys = useMemo(() => {
    const param = searchParams.get("agents") ?? "";
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  const openAgentEntries = useMemo(
    () =>
      openAgentKeys.map((k) => {
        const [serverId, ...rest] = k.split("::");
        return { serverId, name: rest.join("::"), key: k };
      }),
    [openAgentKeys],
  );

  // Focus order — shared between server and agent panels
  const [focusOrder, setFocusOrder] = useState<string[]>([]);

  const handleFocus = useCallback((id: string) => {
    setFocusOrder((prev) => {
      const without = prev.filter((sid) => sid !== id);
      return [...without, id];
    });
  }, []);

  // Auto-focus the last panel in the URL (most recently clicked node)
  useEffect(() => {
    const lastServerId = openIds[openIds.length - 1];
    const lastAgentKey = openAgentKeys[openAgentKeys.length - 1];
    // Focus whichever was most recently added
    if (lastAgentKey && (!lastServerId || openAgentKeys.length > openIds.length)) {
      handleFocus(lastAgentKey);
    } else if (lastServerId) {
      handleFocus(lastServerId);
    }
  }, [openIds, openAgentKeys, handleFocus]);

  const getZIndex = useCallback((id: string) => {
    const idx = focusOrder.indexOf(id);
    // Base z-index + position in focus stack
    return Z_INDEX.DROPDOWN + (idx >= 0 ? idx + 1 : 0);
  }, [focusOrder]);

  // Edit modal
  const [editServer, setEditServer] = useState<Server | null>(null);

  const updateUrl = useCallback((serverIds: string[], agentKeys?: string[]) => {
    const sp = new URLSearchParams();
    if (serverIds.length > 0) sp.set("servers", serverIds.join(","));
    const agents = agentKeys ?? openAgentKeys;
    if (agents.length > 0) sp.set("agents", agents.join(","));
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }, [router, openAgentKeys]);

  const handleClose = useCallback((id: string) => {
    setFocusOrder((prev) => prev.filter((sid) => sid !== id));
    updateUrl(openIds.filter((sid) => sid !== id));
  }, [openIds, updateUrl]);

  const handleAgentClose = useCallback((key: string) => {
    setFocusOrder((prev) => prev.filter((k) => k !== key));
    const remaining = openAgentKeys.filter((k) => k !== key);
    updateUrl(openIds, remaining);
  }, [openIds, openAgentKeys, updateUrl]);

  const handleDelete = useCallback((id: string) => {
    setFocusOrder((prev) => prev.filter((sid) => sid !== id));
    removeServer(id);
    updateUrl(openIds.filter((sid) => sid !== id));
  }, [openIds, removeServer, updateUrl]);

  const handleEdit = useCallback((s: Server) => {
    setEditServer(s);
  }, []);

  const handleEditClose = useCallback(() => {
    setEditServer(null);
  }, []);

  const handleEditSaved = useCallback(() => {
    setEditServer(null);
    onRefresh();
  }, [onRefresh]);

  // Lookup server domain for agent panels
  const serverMap = useMemo(() => new Map(servers.map((s) => [s.id, s])), [servers]);

  if (openServers.length === 0 && openAgentEntries.length === 0) return null;

  return (
    <>
      {openServers.map((server) => (
        <ServerDashboardPanel
          key={server.id}
          server={server}
          onClose={() => handleClose(server.id)}
          onDelete={(id: string) => handleDelete(id)}
          onEdit={(s: Server) => handleEdit(s)}
          zIndex={getZIndex(server.id)}
          onFocus={() => handleFocus(server.id)}
        />
      ))}

      {openAgentEntries.map((entry) => (
        <AgentDashboardPanel
          key={entry.key}
          serverId={entry.serverId}
          agentName={entry.name}
          serverDomain={serverMap.get(entry.serverId)?.assignedDomain}
          onClose={() => handleAgentClose(entry.key)}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
        />
      ))}

      {editServer && (
        <ServerModal
          key={`edit-${editServer.id}`}
          open
          server={editServer}
          onClose={handleEditClose}
          onSaved={handleEditSaved}
        />
      )}
    </>
  );
}
