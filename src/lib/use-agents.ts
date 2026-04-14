"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { listFilesApi } from "@/lib/api";
import type { ServerWithUI } from "./use-servers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentWithUI {
  serverId: string;
  name: string;
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-agents-ui:v2";
const AGENTS_PATH = "/root/openclaw-agents/";
const DEFAULT_RADIUS = 140;
const MIN_SPACING = 70; // minimum distance between agent nodes
const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 3;

let agents: AgentWithUI[] = [];
const listeners = new Set<() => void>();
let fetchGeneration = 0;
let initialized = false;
let lastFetchedAt = 0;

function notify() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot() { return agents; }

/* ── localStorage ── */

interface SavedAgent {
  serverId: string;
  name: string;
  offsetX: number;
  offsetY: number;
}

function loadCached(): AgentWithUI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
      lastFetchedAt = parsed.fetchedAt ?? 0;
      return parsed.data.filter((a: SavedAgent) => a.serverId && a.name && typeof a.offsetX === "number");
    }
    const arr = parsed as SavedAgent[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a.serverId && a.name && typeof a.offsetX === "number");
  } catch { return []; }
}

function saveToStorage() {
  try {
    const data: SavedAgent[] = agents.map((a) => ({
      serverId: a.serverId,
      name: a.name,
      offsetX: a.offsetX,
      offsetY: a.offsetY,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, fetchedAt: lastFetchedAt }));
  } catch {}
}

/* ── Random non-overlapping default positions ── */

function randomOffset(existingOffsets: { x: number; y: number }[]): { offsetX: number; offsetY: number } {
  // Try random positions in a ring around the server, avoiding overlap
  for (let attempt = 0; attempt < 30; attempt++) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = DEFAULT_RADIUS + (Math.random() - 0.5) * 40; // 120–160px
    const ox = Math.round(radius * Math.cos(angle));
    const oy = Math.round(radius * Math.sin(angle));

    // Check for overlap with existing agents
    const tooClose = existingOffsets.some(
      (e) => Math.hypot(e.x - ox, e.y - oy) < MIN_SPACING,
    );
    if (!tooClose) return { offsetX: ox, offsetY: oy };
  }
  // Fallback: use a wider ring
  const angle = Math.random() * 2 * Math.PI;
  const radius = DEFAULT_RADIUS + 60 + Math.random() * 40;
  return {
    offsetX: Math.round(radius * Math.cos(angle)),
    offsetY: Math.round(radius * Math.sin(angle)),
  };
}

/* ── Initialize from cache ── */

function initFromCache() {
  if (initialized) return;
  initialized = true;
  const cached = loadCached();
  if (cached.length > 0) {
    agents = cached;
    notify();
  }
}

/* ── Fetch agents from SFTP ── */

async function fetchAgentsForServers(servers: ServerWithUI[], force = false) {
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL) return;

  const gen = ++fetchGeneration;
  const onlineServers = servers.filter((s) => s.status === "ONLINE");

  // Build lookup of existing saved positions
  const savedMap = new Map<string, { offsetX: number; offsetY: number }>();
  for (const a of agents) {
    savedMap.set(`${a.serverId}::${a.name}`, { offsetX: a.offsetX, offsetY: a.offsetY });
  }

  // Batch SFTP calls to avoid hammering the backend
  const results: PromiseSettledResult<{ serverId: string; dirs: { name: string; directory: boolean }[] }>[] = [];
  for (let i = 0; i < onlineServers.length; i += BATCH_SIZE) {
    if (gen !== fetchGeneration) return;
    const batch = onlineServers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (server) => {
        try {
          const files = await listFilesApi(server.id, AGENTS_PATH);
          return { serverId: server.id, dirs: files.filter((f: { directory: boolean; name: string }) => f.directory && f.name !== "." && f.name !== "..") };
        } catch {
          return { serverId: server.id, dirs: [] as { name: string; directory: boolean }[] };
        }
      }),
    );
    results.push(...batchResults);
  }

  if (gen !== fetchGeneration) return;

  const newAgents: AgentWithUI[] = [];

  // Keep agents from servers we didn't fetch (offline servers) if they were cached
  const fetchedServerIds = new Set(onlineServers.map((s) => s.id));
  for (const a of agents) {
    if (!fetchedServerIds.has(a.serverId)) {
      newAgents.push(a);
    }
  }

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { serverId, dirs } = result.value;

    // Track positions for this server to avoid overlap
    const serverOffsets: { x: number; y: number }[] = [];

    for (const dir of dirs) {
      const key = `${serverId}::${dir.name}`;
      const saved = savedMap.get(key);

      if (saved) {
        newAgents.push({ serverId, name: dir.name, offsetX: saved.offsetX, offsetY: saved.offsetY });
        serverOffsets.push({ x: saved.offsetX, y: saved.offsetY });
      } else {
        const pos = randomOffset(serverOffsets);
        newAgents.push({ serverId, name: dir.name, ...pos });
        serverOffsets.push({ x: pos.offsetX, y: pos.offsetY });
      }
    }
  }

  agents = newAgents;
  lastFetchedAt = Date.now();
  saveToStorage();
  notify();
}

/* ── Move ── */

function moveAgent(serverId: string, name: string, offsetX: number, offsetY: number) {
  agents = agents.map((a) =>
    a.serverId === serverId && a.name === name ? { ...a, offsetX, offsetY } : a,
  );
  saveToStorage();
  notify();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAgents(servers: ServerWithUI[]) {
  // Load from cache immediately (synchronous, before first render)
  if (!initialized) initFromCache();

  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const serversRef = useRef(servers);
  serversRef.current = servers;

  const onlineIds = useMemo(
    () => servers.filter((s) => s.status === "ONLINE").map((s) => s.id).sort().join(","),
    [servers],
  );

  useEffect(() => {
    fetchAgentsForServers(serversRef.current);
  }, [onlineIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    lastFetchedAt = 0;
    fetchAgentsForServers(serversRef.current, true);
  }, []);

  return { agents: list, refresh, moveAgent };
}
