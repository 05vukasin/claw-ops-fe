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
  executablePath: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  diskUsage: string | null;
  projectCount: number;
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-codex-ui:v1";
const DEFAULT_OFFSET = { offsetX: 0, offsetY: -120 };

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
  'CODEX_BIN="$(command -v codex 2>/dev/null || true)"',
  'if [ -z "$CODEX_BIN" ]; then for p in "$HOME/.local/bin/codex" "$HOME/.npm-global/bin/codex" "/usr/local/bin/codex"; do if [ -x "$p" ]; then CODEX_BIN="$p"; break; fi; done; fi',
  'if [ -z "$CODEX_BIN" ]; then echo "NOT_FOUND"; exit 0; fi',
  '"$CODEX_BIN" --version 2>/dev/null || echo "UNKNOWN_VERSION"',
  'echo "---CODEX_SEP---"',
  'printf "%s\\n" "$CODEX_BIN"',
  'echo "---CODEX_SEP---"',
  '("$CODEX_BIN" auth status 2>/dev/null || echo "AUTH_UNKNOWN")',
  'echo "---CODEX_SEP---"',
  'du -sh "$HOME/.codex" 2>/dev/null | cut -f1 || echo "0"',
  'echo "---CODEX_SEP---"',
  'ls -1 "$HOME/.codex/projects" 2>/dev/null | head -20 || echo ""',
].join("; ");

function parseAuthStatus(authRaw: string): "authenticated" | "unauthenticated" | "unknown" {
  const lower = authRaw.toLowerCase();
  if (!authRaw || authRaw === "AUTH_UNKNOWN") return "unknown";
  if (
    (lower.includes("authenticated") || lower.includes("logged in") || lower.includes("authorized")) &&
    !lower.includes("not authenticated") &&
    !lower.includes("unauthenticated") &&
    !lower.includes("not logged")
  ) {
    return "authenticated";
  }
  if (
    lower.includes("unauthenticated") ||
    lower.includes("not authenticated") ||
    lower.includes("not logged in") ||
    lower.includes("login required")
  ) {
    return "unauthenticated";
  }
  return "unknown";
}

function parseDetection(stdout: string): {
  version: string | null;
  executablePath: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  diskUsage: string | null;
  projectCount: number;
} | null {
  const parts = stdout.split("---CODEX_SEP---");
  const versionRaw = (parts[0] ?? "").trim();
  const executablePathRaw = (parts[1] ?? "").trim();
  const authRaw = (parts[2] ?? "").trim();
  const diskRaw = (parts[3] ?? "").trim();
  const projectsRaw = (parts[4] ?? "").trim();

  if (versionRaw === "NOT_FOUND" || !versionRaw) return null;

  const version = versionRaw.split("\n")[0].trim() || null;
  const executablePath = executablePathRaw || null;
  const diskUsage = diskRaw && diskRaw !== "0" ? diskRaw : null;
  const projectCount = projectsRaw
    ? projectsRaw.split("\n").filter((line) => line.trim().length > 0).length
    : 0;

  return {
    version,
    executablePath,
    authStatus: parseAuthStatus(authRaw),
    diskUsage,
    projectCount,
  };
}

async function fetchCodexForServers(servers: ServerWithUI[]) {
  const gen = ++fetchGeneration;
  const onlineServers = servers.filter((s) => s.status === "ONLINE");
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
    const { serverId, version, executablePath, authStatus, diskUsage, projectCount } = r.value;
    const saved = savedMap.get(serverId);
    newAccounts.push({
      serverId,
      version,
      executablePath,
      authStatus,
      diskUsage,
      projectCount,
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
