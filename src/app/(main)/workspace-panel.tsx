"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServerDashboardPanel, ServerModal } from "@/components/servers";
import { useServers } from "@/lib/use-servers";
import type { Server } from "@/lib/api";

interface WorkspacePanelProps {
  onRefresh: () => void;
}

export function WorkspacePanel({ onRefresh }: WorkspacePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { servers, removeServer } = useServers();

  // Multiple open panels tracked by server ID
  const [openIds, setOpenIds] = useState<string[]>([]);

  // Edit modal state
  const [editServer, setEditServer] = useState<Server | null>(null);

  // When URL param changes, add that server to open panels
  const urlServerId = searchParams.get("server");
  useEffect(() => {
    if (urlServerId && !openIds.includes(urlServerId)) {
      setOpenIds((prev) => [...prev, urlServerId]);
    }
  }, [urlServerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve open servers
  const openServers = useMemo(
    () => openIds.map((id) => servers.find((s) => s.id === id)).filter(Boolean) as Server[],
    [openIds, servers],
  );

  const handleClose = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((sid) => sid !== id));
    // Clear URL param if closing the URL-opened one
    if (id === urlServerId) {
      router.push("/");
    }
  }, [urlServerId, router]);

  const handleDelete = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((sid) => sid !== id));
    removeServer(id);
    if (id === urlServerId) {
      router.push("/");
    }
  }, [removeServer, urlServerId, router]);

  const handleEdit = useCallback((server: Server) => {
    setEditServer(server);
  }, []);

  const handleEditClose = useCallback(() => {
    setEditServer(null);
  }, []);

  const handleEditSaved = useCallback(() => {
    setEditServer(null);
    onRefresh();
  }, [onRefresh]);

  if (openServers.length === 0) return null;

  return (
    <>
      {openServers.map((server) => (
        <ServerDashboardPanel
          key={server.id}
          server={server}
          onClose={() => handleClose(server.id)}
          onDelete={(id: string) => handleDelete(id)}
          onEdit={(s: Server) => handleEdit(s)}
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
