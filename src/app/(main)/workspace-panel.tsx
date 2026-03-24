"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServerDashboardPanel, ServerModal } from "@/components/servers";
import { useServers } from "@/lib/use-servers";

interface WorkspacePanelProps {
  onRefresh: () => void;
}

export function WorkspacePanel({ onRefresh }: WorkspacePanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { servers, removeServer } = useServers();

  const serverId = searchParams.get("server");

  const selectedServer = useMemo(
    () => (serverId ? servers.find((s) => s.id === serverId) ?? null : null),
    [servers, serverId],
  );

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);

  const handleClose = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleDelete = useCallback(
    (id: string) => {
      removeServer(id);
      router.push("/");
    },
    [removeServer, router],
  );

  const handleEdit = useCallback(() => {
    setEditModalOpen(true);
  }, []);

  const handleEditClose = useCallback(() => {
    setEditModalOpen(false);
  }, []);

  const handleEditSaved = useCallback(
    () => {
      setEditModalOpen(false);
      onRefresh();
    },
    [onRefresh],
  );

  if (!selectedServer) return null;

  return (
    <>
      <ServerDashboardPanel
        key={selectedServer.id}
        server={selectedServer}
        onClose={handleClose}
        onDelete={handleDelete}
        onEdit={handleEdit}
      />

      <ServerModal
        key={`edit-${selectedServer.id}`}
        open={editModalOpen}
        server={selectedServer}
        onClose={handleEditClose}
        onSaved={handleEditSaved}
      />
    </>
  );
}
