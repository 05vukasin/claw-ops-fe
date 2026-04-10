"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServerDashboardPanel, ServerModal } from "@/components/servers";
import { AgentDashboardPanel } from "@/components/agents/agent-dashboard-panel";
import { AgentConfigPanel } from "@/components/agents/agent-config-panel";
import { FileEditorPanel } from "@/components/servers/file-editor-panel";
import { GitHubDashboardPanel } from "@/components/servers/github-dashboard-panel";
import { ClaudeDashboardPanel } from "@/components/servers/claude-dashboard-panel";
import { CodexDashboardPanel } from "@/components/servers/codex-dashboard-panel";
import { useServers } from "@/lib/use-servers";
import { Z_INDEX } from "@/lib/z-index";
import type { Server, SftpFile } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Open-file entry                                                    */
/* ------------------------------------------------------------------ */

interface OpenFileEntry {
  key: string;       // "file:serverId:filePath"
  serverId: string;
  file: SftpFile;
}

/* ------------------------------------------------------------------ */
/*  localStorage persistence for open files                            */
/* ------------------------------------------------------------------ */

const OPEN_FILES_KEY = "openclaw-open-files:v1";

function loadOpenFiles(): OpenFileEntry[] {
  try {
    const raw = localStorage.getItem(OPEN_FILES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as { serverId: string; file: SftpFile }[];
    return arr.map((e) => ({
      key: `file:${e.serverId}:${e.file.path}`,
      serverId: e.serverId,
      file: e.file,
    }));
  } catch {
    return [];
  }
}

function saveOpenFiles(entries: OpenFileEntry[]) {
  try {
    const data = entries.map((e) => ({ serverId: e.serverId, file: e.file }));
    localStorage.setItem(OPEN_FILES_KEY, JSON.stringify(data));
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

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

  // GitHub panels from URL
  const openGitHubKeys = useMemo(() => {
    const param = searchParams.get("github") ?? "";
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  const openGitHubEntries = useMemo(
    () => openGitHubKeys.map((k) => ({
      serverId: k.replace("github::", ""),
      key: k,
    })),
    [openGitHubKeys],
  );

  // Claude panels from URL
  const openClaudeKeys = useMemo(() => {
    const param = searchParams.get("claude") ?? "";
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  const openClaudeEntries = useMemo(
    () => openClaudeKeys.map((k) => ({
      serverId: k.replace("claude::", ""),
      key: k,
    })),
    [openClaudeKeys],
  );

  const openCodexKeys = useMemo(() => {
    const param = searchParams.get("codex") ?? "";
    return param.split(",").filter(Boolean);
  }, [searchParams]);

  const openCodexEntries = useMemo(
    () => openCodexKeys.map((k) => ({
      serverId: k.replace("codex::", ""),
      key: k,
    })),
    [openCodexKeys],
  );

  // Focus order — shared between server, agent, and file panels
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

  const updateUrl = useCallback((serverIds: string[], agentKeys?: string[], githubKeys?: string[], claudeKeys?: string[], codexKeys?: string[]) => {
    const sp = new URLSearchParams();
    if (serverIds.length > 0) sp.set("servers", serverIds.join(","));
    const agents = agentKeys ?? openAgentKeys;
    if (agents.length > 0) sp.set("agents", agents.join(","));
    const gh = githubKeys ?? openGitHubKeys;
    if (gh.length > 0) sp.set("github", gh.join(","));
    const cc = claudeKeys ?? openClaudeKeys;
    if (cc.length > 0) sp.set("claude", cc.join(","));
    const codex = codexKeys ?? openCodexKeys;
    if (codex.length > 0) sp.set("codex", codex.join(","));
    const qs = sp.toString();
    router.push(qs ? `/?${qs}` : "/");
  }, [router, openAgentKeys, openGitHubKeys, openClaudeKeys, openCodexKeys]);

  const handleClose = useCallback((id: string) => {
    setFocusOrder((prev) => prev.filter((sid) => sid !== id));
    updateUrl(openIds.filter((sid) => sid !== id));
  }, [openIds, updateUrl]);

  const handleAgentClose = useCallback((key: string) => {
    setFocusOrder((prev) => prev.filter((k) => k !== key));
    const remaining = openAgentKeys.filter((k) => k !== key);
    updateUrl(openIds, remaining);
  }, [openIds, openAgentKeys, updateUrl]);

  const handleGitHubClose = useCallback((key: string) => {
    setFocusOrder((prev) => prev.filter((k) => k !== key));
    const remaining = openGitHubKeys.filter((k) => k !== key);
    updateUrl(openIds, undefined, remaining);
  }, [openIds, openGitHubKeys, updateUrl]);

  const handleClaudeClose = useCallback((key: string) => {
    setFocusOrder((prev) => prev.filter((k) => k !== key));
    const remaining = openClaudeKeys.filter((k) => k !== key);
    updateUrl(openIds, undefined, undefined, remaining);
  }, [openIds, openClaudeKeys, updateUrl]);

  const handleCodexClose = useCallback((key: string) => {
    setFocusOrder((prev) => prev.filter((k) => k !== key));
    const remaining = openCodexKeys.filter((k) => k !== key);
    updateUrl(openIds, undefined, undefined, undefined, remaining);
  }, [openIds, openCodexKeys, updateUrl]);

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

  /* ---- Open file editor panels (state lives here, outside server panels) ---- */
  const [openFiles, setOpenFiles] = useState<OpenFileEntry[]>(loadOpenFiles);

  // Persist open files to localStorage whenever the list changes
  useEffect(() => {
    saveOpenFiles(openFiles);
  }, [openFiles]);

  const handleFileOpen = useCallback((serverId: string, file: SftpFile) => {
    const key = `file:${serverId}:${file.path}`;
    setOpenFiles((prev) =>
      prev.some((e) => e.key === key) ? prev : [...prev, { key, serverId, file }],
    );
    handleFocus(key);
  }, [handleFocus]);

  const handleFileClose = useCallback((key: string) => {
    setOpenFiles((prev) => prev.filter((e) => e.key !== key));
    setFocusOrder((prev) => prev.filter((k) => k !== key));
  }, []);

  /* ---- Open config panels ---- */
  const [openConfigs, setOpenConfigs] = useState<
    { key: string; serverId: string; agentName: string }[]
  >([]);

  const handleConfigOpen = useCallback(
    (serverId: string, agentName: string) => {
      const key = `config:${serverId}::${agentName}`;
      setOpenConfigs((prev) =>
        prev.some((e) => e.key === key)
          ? prev
          : [...prev, { key, serverId, agentName }],
      );
      handleFocus(key);
    },
    [handleFocus],
  );

  const handleConfigClose = useCallback((key: string) => {
    setOpenConfigs((prev) => prev.filter((e) => e.key !== key));
    setFocusOrder((prev) => prev.filter((k) => k !== key));
  }, []);

  if (
    openServers.length === 0 &&
    openAgentEntries.length === 0 &&
    openGitHubEntries.length === 0 &&
    openClaudeEntries.length === 0 &&
    openCodexEntries.length === 0 &&
    openFiles.length === 0 &&
    openConfigs.length === 0
  )
    return null;

  return (
    <>
      {openServers.map((server) => (
        <ServerDashboardPanel
          key={server.id}
          server={server}
          onClose={() => handleClose(server.id)}
          onDelete={(id: string) => handleDelete(id)}
          onEdit={(s: Server) => handleEdit(s)}
          onFileOpen={handleFileOpen}
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
          onOpenConfig={() => handleConfigOpen(entry.serverId, entry.name)}
        />
      ))}

      {openGitHubEntries.map((entry) => (
        <GitHubDashboardPanel
          key={entry.key}
          serverId={entry.serverId}
          serverName={serverMap.get(entry.serverId)?.name ?? "Server"}
          onClose={() => handleGitHubClose(entry.key)}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
        />
      ))}

      {openClaudeEntries.map((entry) => (
        <ClaudeDashboardPanel
          key={entry.key}
          serverId={entry.serverId}
          serverName={serverMap.get(entry.serverId)?.name ?? "Server"}
          onClose={() => handleClaudeClose(entry.key)}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
        />
      ))}

      {openCodexEntries.map((entry) => (
        <CodexDashboardPanel
          key={entry.key}
          serverId={entry.serverId}
          serverName={serverMap.get(entry.serverId)?.name ?? "Server"}
          onClose={() => handleCodexClose(entry.key)}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
        />
      ))}

      {openConfigs.map((entry) => (
        <AgentConfigPanel
          key={entry.key}
          serverId={entry.serverId}
          agentName={entry.agentName}
          onClose={() => handleConfigClose(entry.key)}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
        />
      ))}

      {openFiles.map((entry) => (
        <FileEditorPanel
          key={entry.key}
          serverId={entry.serverId}
          file={entry.file}
          zIndex={getZIndex(entry.key)}
          onFocus={() => handleFocus(entry.key)}
          onClose={() => handleFileClose(entry.key)}
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
