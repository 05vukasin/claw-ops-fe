"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { executeCommandApi } from "@/lib/api";
import type { ServerWithUI } from "@/lib/use-servers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GitHubAccountWithUI {
  serverId: string;
  username: string | null;
  email: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-github-ui:v1";
const DEFAULT_OFFSET = { offsetX: -110, offsetY: -70 };

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 3;

let accounts: GitHubAccountWithUI[] = [];
const listeners = new Set<() => void>();
let fetchGeneration = 0;
let initialized = false;
let lastFetchedAt = 0;

function notify() { listeners.forEach((l) => l()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot() { return accounts; }

/* ------------------------------------------------------------------ */
/*  localStorage persistence                                           */
/* ------------------------------------------------------------------ */

interface SavedEntry {
  serverId: string;
  username: string | null;
  email: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  offsetX: number;
  offsetY: number;
}

function loadCached(): GitHubAccountWithUI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Support new format { data, fetchedAt } and legacy array format
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
      lastFetchedAt = parsed.fetchedAt ?? 0;
      return parsed.data.filter((e: SavedEntry) => e.serverId && typeof e.offsetX === "number");
    }
    const arr = parsed as SavedEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e.serverId && typeof e.offsetX === "number");
  } catch { return []; }
}

function saveToStorage(list: GitHubAccountWithUI[]) {
  try {
    const data: SavedEntry[] = list.map((a) => ({
      serverId: a.serverId,
      username: a.username,
      email: a.email,
      authStatus: a.authStatus,
      offsetX: a.offsetX,
      offsetY: a.offsetY,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, fetchedAt: lastFetchedAt }));
  } catch {}
}

function initFromCache() {
  if (initialized) return;
  initialized = true;
  accounts = loadCached();
}

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

const DETECT_CMD = `gh auth status 2>&1; echo "---GH_SEP---"; git config --global user.name 2>/dev/null; echo "---GH_SEP---"; git config --global user.email 2>/dev/null`;

function parseDetection(stdout: string): { username: string | null; email: string | null; authStatus: "authenticated" | "unauthenticated" } {
  const parts = stdout.split("---GH_SEP---");
  const ghStatus = (parts[0] ?? "").trim();
  const gitName = (parts[1] ?? "").trim() || null;
  const gitEmail = (parts[2] ?? "").trim() || null;

  // Parse "Logged in to github.com as USERNAME" from gh auth status
  const match = ghStatus.match(/Logged in to github\.com as (\S+)/i);
  if (match) {
    return { username: match[1], email: gitEmail, authStatus: "authenticated" };
  }

  // Fallback to git config
  if (gitName || gitEmail) {
    return { username: gitName, email: gitEmail, authStatus: "unauthenticated" };
  }

  return { username: null, email: null, authStatus: "unauthenticated" };
}

async function fetchGitHubForServers(servers: ServerWithUI[], force = false) {
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL) return;

  const gen = ++fetchGeneration;
  const onlineServers = servers.filter((s) => s.status === "ONLINE");
  if (onlineServers.length === 0) return;

  const savedMap = new Map(accounts.map((a) => [a.serverId, a]));

  // Batch SSH calls to avoid hammering the backend
  const results: PromiseSettledResult<{ serverId: string; username: string | null; email: string | null; authStatus: "authenticated" | "unauthenticated" } | null>[] = [];
  for (let i = 0; i < onlineServers.length; i += BATCH_SIZE) {
    if (gen !== fetchGeneration) return; // Abort if superseded
    const batch = onlineServers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (s) => {
        try {
          const result = await executeCommandApi(s.id, DETECT_CMD, 10);
          const parsed = parseDetection(result.stdout);
          if (!parsed.username && !parsed.email) return null;
          return { serverId: s.id, ...parsed };
        } catch {
          return null;
        }
      }),
    );
    results.push(...batchResults);
  }

  if (gen !== fetchGeneration) return; // Stale

  const newAccounts: GitHubAccountWithUI[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { serverId, username, email, authStatus } = r.value;
    const saved = savedMap.get(serverId);
    newAccounts.push({
      serverId,
      username,
      email,
      authStatus,
      offsetX: saved?.offsetX ?? DEFAULT_OFFSET.offsetX,
      offsetY: saved?.offsetY ?? DEFAULT_OFFSET.offsetY,
    });
  }

  // Preserve cached entries for offline servers
  for (const cached of accounts) {
    if (!onlineServers.some((s) => s.id === cached.serverId) && !newAccounts.some((a) => a.serverId === cached.serverId)) {
      newAccounts.push(cached);
    }
  }

  accounts = newAccounts;
  lastFetchedAt = Date.now();
  saveToStorage(accounts);
  notify();
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

function moveGitHubNodeStore(serverId: string, offsetX: number, offsetY: number) {
  accounts = accounts.map((a) =>
    a.serverId === serverId ? { ...a, offsetX, offsetY } : a,
  );
  saveToStorage(accounts);
  notify();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useGitHubAccounts(servers: ServerWithUI[]) {
  // Load cache synchronously on first use
  useMemo(() => { initFromCache(); }, []);

  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  // Stable dependency: only refetch when the set of online server IDs changes
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const onlineIds = useMemo(
    () => servers.filter((s) => s.status === "ONLINE").map((s) => s.id).sort().join(","),
    [servers],
  );

  useEffect(() => {
    fetchGitHubForServers(serversRef.current);
  }, [onlineIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    lastFetchedAt = 0; // Bypass TTL
    fetchGitHubForServers(serversRef.current, true);
  }, []);

  const moveGitHubNode = useCallback((serverId: string, offsetX: number, offsetY: number) => {
    moveGitHubNodeStore(serverId, offsetX, offsetY);
  }, []);

  return { accounts: list, refresh, moveGitHubNode };
}
