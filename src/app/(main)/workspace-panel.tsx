"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServerDashboardPanel, ServerModal } from "@/components/servers";
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

  // Focus order — last ID in array = highest z-index (topmost panel)
  const [focusOrder, setFocusOrder] = useState<string[]>([]);

  const handleFocus = useCallback((id: string) => {
    setFocusOrder((prev) => {
      const without = prev.filter((sid) => sid !== id);
      return [...without, id];
    });
  }, []);

  // Auto-focus the last panel in the URL (most recently clicked node)
  useEffect(() => {
    const lastId = openIds[openIds.length - 1];
    if (lastId) handleFocus(lastId);
  }, [openIds, handleFocus]);

  const getZIndex = useCallback((id: string) => {
    const idx = focusOrder.indexOf(id);
    // Base z-index + position in focus stack
    return Z_INDEX.DROPDOWN + (idx >= 0 ? idx + 1 : 0);
  }, [focusOrder]);

  // Edit modal
  const [editServer, setEditServer] = useState<Server | null>(null);

  const updateUrl = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      router.push("/");
    } else {
      router.push(`/?servers=${ids.join(",")}`);
    }
  }, [router]);

  const handleClose = useCallback((id: string) => {
    setFocusOrder((prev) => prev.filter((sid) => sid !== id));
    updateUrl(openIds.filter((sid) => sid !== id));
  }, [openIds, updateUrl]);

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
          zIndex={getZIndex(server.id)}
          onFocus={() => handleFocus(server.id)}
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
