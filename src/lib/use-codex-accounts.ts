"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { executeCommandApi } from "@/lib/api";
import type { ServerWithUI } from "@/lib/use-servers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CodexAccountWithUI {
  serverId: string;
  version: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  email: string | null;
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-codex-ui:v1";
const DEFAULT_OFFSET = { offsetX: 0, offsetY: 110 };

let accounts: CodexAccountWithUI[] = [];
const listeners = new Set<() => void>();
let fetchGeneration = 0;
let initialized = false;

function notify() { listeners.forEach((l) => l()); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot() { return accounts; }

/* ------------------------------------------------------------------ */
/*  localStorage persistence                                           */
/* ------------------------------------------------------------------ */

function loadCached(): CodexAccountWithUI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e: CodexAccountWithUI) => e.serverId && typeof e.offsetX === "number");
  } catch { return []; }
}

function saveToStorage(list: CodexAccountWithUI[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
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

const DETECT_CMD = [
  'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
  'codex --version 2>/dev/null || echo "NOT_FOUND"',
  'echo "---CX_SEP---"',
  'codex auth status 2>/dev/null || echo "NOT_AUTHENTICATED"',
].join("; ");

function parseDetection(stdout: string): {
  version: string | null;
  authStatus: "authenticated" | "unauthenticated";
  email: string | null;
} | null {
  const parts = stdout.split("---CX_SEP---");
  const versionRaw = (parts[0] ?? "").trim();
  const authRaw = (parts[1] ?? "").trim();

  if (versionRaw === "NOT_FOUND" || !versionRaw) return null;

  const version = versionRaw.split("\n")[0].trim() || null;

  const isAuth = authRaw.toLowerCase().includes("authenticated") && !authRaw.includes("NOT_AUTHENTICATED");
  const authStatus = isAuth ? "authenticated" as const : "unauthenticated" as const;

  // Try to extract email from auth output
  const emailMatch = authRaw.match(/[\w.-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : null;

  return { version, authStatus, email };
}

async function fetchCodexForServers(servers: ServerWithUI[]) {
  const gen = ++fetchGeneration;
  const onlineServers = servers.filter((s) => s.status === "ONLINE");
  if (onlineServers.length === 0) return;

  const savedMap = new Map(accounts.map((a) => [a.serverId, a]));

  const results = await Promise.allSettled(
    onlineServers.map(async (s) => {
      try {
        const result = await executeCommandApi(s.id, DETECT_CMD, 15);
        const parsed = parseDetection(result.stdout);
        if (!parsed) return null;
        return { serverId: s.id, ...parsed };
      } catch {
        return null;
      }
    }),
  );

  if (gen !== fetchGeneration) return;

  const newAccounts: CodexAccountWithUI[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { serverId, version, authStatus, email } = r.value;
    const saved = savedMap.get(serverId);
    newAccounts.push({
      serverId,
      version,
      authStatus,
      email,
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
  saveToStorage(accounts);
  notify();
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

function moveCodexNodeStore(serverId: string, offsetX: number, offsetY: number) {
  accounts = accounts.map((a) =>
    a.serverId === serverId ? { ...a, offsetX, offsetY } : a,
  );
  saveToStorage(accounts);
  notify();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useCodexAccounts(servers: ServerWithUI[]) {
  useMemo(() => { initFromCache(); }, []);

  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  useEffect(() => {
    fetchCodexForServers(servers);
  }, [servers]);

  const refresh = useCallback(() => {
    fetchCodexForServers(servers);
  }, [servers]);

  const moveCodexNode = useCallback((serverId: string, offsetX: number, offsetY: number) => {
    moveCodexNodeStore(serverId, offsetX, offsetY);
  }, []);

  return { accounts: list, refresh, moveCodexNode };
}
