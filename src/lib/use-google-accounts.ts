"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { executeCommandApi } from "@/lib/api";
import type { ServerWithUI } from "@/lib/use-servers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GoogleAccountWithUI {
  serverId: string;
  accountEmail: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-google-ui:v1";
const DEFAULT_OFFSET = { offsetX: 110, offsetY: 70 };

const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 3;

let accounts: GoogleAccountWithUI[] = [];
const listeners = new Set<() => void>();
let fetchGeneration = 0;
let initialized = false;
let lastFetchedAt = 0;
const failedServers = new Map<string, number>();
const FAIL_COOLDOWN = 5 * 60 * 1000;

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
  accountEmail: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  offsetX: number;
  offsetY: number;
}

function loadCached(): GoogleAccountWithUI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.data)) {
      return parsed.data.filter((e: SavedEntry) => e.serverId && typeof e.offsetX === "number");
    }
    const arr = parsed as SavedEntry[];
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e.serverId && typeof e.offsetX === "number");
  } catch { return []; }
}

function saveToStorage(list: GoogleAccountWithUI[]) {
  try {
    const data: SavedEntry[] = list.map((a) => ({
      serverId: a.serverId,
      accountEmail: a.accountEmail,
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

const DETECT_CMD = `python3 -c 'import json,os,glob; tokens=sorted(glob.glob(os.path.join(os.environ.get("HOME","/root"),".claude","custom-google-workspace","tokens","*.json"))); d=json.load(open(tokens[0])) if tokens else {}; print("CONNECTED:" + d.get("email","unknown")) if d.get("access_token") else print("NO_TOKEN")' 2>/dev/null || echo "NOT_FOUND"`;

function parseDetection(stdout: string): {
  accountEmail: string | null;
  authStatus: "authenticated" | "unauthenticated";
} | null {
  const raw = stdout.trim();
  if (raw === "NOT_FOUND" || raw === "NO_TOKEN" || !raw) return null;

  if (raw.startsWith("CONNECTED:")) {
    const email = raw.slice("CONNECTED:".length).trim();
    return {
      accountEmail: email === "unknown" ? null : email,
      authStatus: "authenticated",
    };
  }
  return null;
}

async function fetchGoogleForServers(servers: ServerWithUI[], force = false) {
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL) return;

  const gen = ++fetchGeneration;
  const now = Date.now();
  const onlineServers = servers.filter((s) => {
    if (s.status !== "ONLINE") return false;
    if (force) return true;
    const failedAt = failedServers.get(s.id);
    return !failedAt || now - failedAt > FAIL_COOLDOWN;
  });
  if (onlineServers.length === 0) return;

  const savedMap = new Map(accounts.map((a) => [a.serverId, a]));

  const results: PromiseSettledResult<{ serverId: string; accountEmail: string | null; authStatus: "authenticated" | "unauthenticated" } | null>[] = [];
  for (let i = 0; i < onlineServers.length; i += BATCH_SIZE) {
    if (gen !== fetchGeneration) return;
    const batch = onlineServers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (s) => {
        try {
          const result = await executeCommandApi(s.id, DETECT_CMD, 10);
          failedServers.delete(s.id);
          const parsed = parseDetection(result.stdout);
          if (!parsed) return null;
          return { serverId: s.id, ...parsed };
        } catch {
          failedServers.set(s.id, Date.now());
          return null;
        }
      }),
    );
    results.push(...batchResults);
  }

  if (gen !== fetchGeneration) return;

  const newAccounts: GoogleAccountWithUI[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { serverId, accountEmail, authStatus } = r.value;
    const saved = savedMap.get(serverId);
    newAccounts.push({
      serverId,
      accountEmail,
      authStatus,
      offsetX: saved?.offsetX ?? DEFAULT_OFFSET.offsetX,
      offsetY: saved?.offsetY ?? DEFAULT_OFFSET.offsetY,
    });
  }

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

function moveGoogleNodeStore(serverId: string, offsetX: number, offsetY: number) {
  accounts = accounts.map((a) =>
    a.serverId === serverId ? { ...a, offsetX, offsetY } : a,
  );
  saveToStorage(accounts);
  notify();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useGoogleAccounts(servers: ServerWithUI[]) {
  useMemo(() => { initFromCache(); }, []);

  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const serversRef = useRef(servers);
  serversRef.current = servers;
  const onlineIds = useMemo(
    () => servers.filter((s) => s.status === "ONLINE").map((s) => s.id).sort().join(","),
    [servers],
  );

  useEffect(() => {
    fetchGoogleForServers(serversRef.current);
  }, [onlineIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    lastFetchedAt = 0;
    fetchGoogleForServers(serversRef.current, true);
  }, []);

  const moveGoogleNode = useCallback((serverId: string, offsetX: number, offsetY: number) => {
    moveGoogleNodeStore(serverId, offsetX, offsetY);
  }, []);

  return { accounts: list, refresh, moveGoogleNode };
}
