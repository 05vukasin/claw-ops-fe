"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { executeCommandApi } from "@/lib/api";
import type { ServerWithUI } from "@/lib/use-servers";
import { createExternalStore } from "@/lib/store-factory";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ClaudeAccountWithUI {
  serverId: string;
  version: string | null;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  diskUsage: string | null;
  projectCount: number;
  offsetX: number;
  offsetY: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-claude-ui:v1";
const DEFAULT_OFFSET = { offsetX: 110, offsetY: -70 };

const CACHE_TTL = 5 * 60 * 1000;
const BATCH_SIZE = 3;

const store = createExternalStore<ClaudeAccountWithUI[]>([]);

let fetchGeneration = 0;
let initialized = false;
let lastFetchedAt = 0;
const failedServers = new Map<string, number>();
const FAIL_COOLDOWN = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/*  localStorage persistence                                           */
/* ------------------------------------------------------------------ */

function loadCached(): ClaudeAccountWithUI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.data)
    ) {
      // Don't restore lastFetchedAt — always re-fetch on page load to pick up changes
      return parsed.data.filter(
        (e: ClaudeAccountWithUI) => e.serverId && typeof e.offsetX === "number",
      );
    }
    const arr = parsed;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e: ClaudeAccountWithUI) => e.serverId && typeof e.offsetX === "number",
    );
  } catch {
    return [];
  }
}

function saveToStorage(list: ClaudeAccountWithUI[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ data: list, fetchedAt: lastFetchedAt }),
    );
  } catch {}
}

function initFromCache() {
  if (initialized) return;
  initialized = true;
  store.setState(loadCached());
}

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

const DETECT_CMD = [
  'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
  'CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"',
  'if [ -z "$CLAUDE_BIN" ]; then NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"; if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/claude" ]; then CLAUDE_BIN="$NPM_PREFIX/bin/claude"; fi; fi',
  'if [ -z "$CLAUDE_BIN" ]; then for p in "$HOME/.nvm/versions/node"/*/bin/claude "$HOME/.local/bin/claude" "$HOME/.npm-global/bin/claude" "/usr/local/bin/claude"; do if [ -x "$p" ]; then CLAUDE_BIN="$p"; break; fi; done; fi',
  'if [ -z "$CLAUDE_BIN" ]; then echo "NOT_FOUND"; exit 0; fi',
  '"$CLAUDE_BIN" --version 2>/dev/null || echo "NOT_FOUND"',
  'echo "---CC_SEP---"',
  '"$CLAUDE_BIN" auth status 2>/dev/null || echo "NOT_AUTHENTICATED"',
  'echo "---CC_SEP---"',
  'du -sh ~/.claude 2>/dev/null | cut -f1 || echo "0"',
  'echo "---CC_SEP---"',
  'ls -1 ~/.claude/projects 2>/dev/null | head -20 || echo ""',
].join("; ");

/**
 * Parse the stdout of DETECT_CMD into structured account info.
 *
 * Returns null if Claude is not installed on the server or if the output
 * does not contain the expected four ---CC_SEP--- sections (logged as a
 * warning so detection failures are visible in the browser console).
 *
 * Exported for unit testing.
 */
export function parseDetection(stdout: string): {
  version: string | null;
  authStatus: "authenticated" | "unauthenticated";
  diskUsage: string | null;
  projectCount: number;
} | null {
  const parts = stdout.split("---CC_SEP---");

  // We expect exactly 4 parts: version, auth, disk, projects.
  if (parts.length < 4) {
    console.warn(
      `[useClaudeAccounts] parseDetection: expected 4 sections delimited by ---CC_SEP---, ` +
        `got ${parts.length}. stdout preview: ${stdout.slice(0, 200)}`,
    );
    return null;
  }

  const versionRaw = (parts[0] ?? "").trim();
  const authRaw = (parts[1] ?? "").trim();
  const diskRaw = (parts[2] ?? "").trim();
  const projectsRaw = (parts[3] ?? "").trim();

  // If claude not found, skip this server
  if (versionRaw === "NOT_FOUND" || !versionRaw) return null;

  const version = versionRaw.split("\n")[0].trim() || null;

  // claude auth status outputs JSON: {"loggedIn": true, ...}
  const isAuth =
    authRaw.includes('"loggedIn": true') ||
    authRaw.includes('"loggedIn":true') ||
    (authRaw.toLowerCase().includes("authenticated") &&
      !authRaw.includes("NOT_AUTHENTICATED"));
  const authStatus = isAuth
    ? ("authenticated" as const)
    : ("unauthenticated" as const);

  const diskUsage = diskRaw && diskRaw !== "0" ? diskRaw : null;

  const projects = projectsRaw.split("\n").filter((l) => l.trim().length > 0);

  return { version, authStatus, diskUsage, projectCount: projects.length };
}

async function fetchClaudeForServers(servers: ServerWithUI[], force = false) {
  if (!force && lastFetchedAt > 0 && Date.now() - lastFetchedAt < CACHE_TTL)
    return;

  const gen = ++fetchGeneration;
  const now = Date.now();
  const onlineServers = servers.filter((s) => {
    if (s.status !== "ONLINE") return false;
    if (force) return true;
    const failedAt = failedServers.get(s.id);
    return !failedAt || now - failedAt > FAIL_COOLDOWN;
  });
  if (onlineServers.length === 0) return;

  const current = store.getState();
  const savedMap = new Map(current.map((a) => [a.serverId, a]));

  const results: PromiseSettledResult<{
    serverId: string;
    version: string | null;
    authStatus: "authenticated" | "unauthenticated";
    diskUsage: string | null;
    projectCount: number;
  } | null>[] = [];
  for (let i = 0; i < onlineServers.length; i += BATCH_SIZE) {
    if (gen !== fetchGeneration) return;
    const batch = onlineServers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (s) => {
        try {
          const result = await executeCommandApi(s.id, DETECT_CMD, 15);
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

  const newAccounts: ClaudeAccountWithUI[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const { serverId, version, authStatus, diskUsage, projectCount } = r.value;
    const saved = savedMap.get(serverId);
    newAccounts.push({
      serverId,
      version,
      authStatus,
      diskUsage,
      projectCount,
      offsetX: saved?.offsetX ?? DEFAULT_OFFSET.offsetX,
      offsetY: saved?.offsetY ?? DEFAULT_OFFSET.offsetY,
    });
  }

  // Preserve cached entries for offline servers
  for (const cached of current) {
    if (
      !onlineServers.some((s) => s.id === cached.serverId) &&
      !newAccounts.some((a) => a.serverId === cached.serverId)
    ) {
      newAccounts.push(cached);
    }
  }

  lastFetchedAt = Date.now();
  store.setState(newAccounts);
  saveToStorage(newAccounts);
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

function moveClaudeNodeStore(
  serverId: string,
  offsetX: number,
  offsetY: number,
) {
  const next = store
    .getState()
    .map((a) => (a.serverId === serverId ? { ...a, offsetX, offsetY } : a));
  store.setState(next);
  saveToStorage(next);
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useClaudeAccounts(servers: ServerWithUI[]) {
  useMemo(() => {
    initFromCache();
  }, []);

  const list = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => [],
  );

  const serversRef = useRef(servers);
  // Keep the ref in sync after every render so event-handler callbacks always
  // close over the latest servers without being added to effect deps.
  useEffect(() => {
    serversRef.current = servers;
  });
  const onlineIds = useMemo(
    () =>
      servers
        .filter((s) => s.status === "ONLINE")
        .map((s) => s.id)
        .sort()
        .join(","),
    [servers],
  );

  useEffect(() => {
    fetchClaudeForServers(serversRef.current);
    // serversRef.current is intentionally excluded — it's a stable ref across renders
  }, [onlineIds]);

  const refresh = useCallback(() => {
    lastFetchedAt = 0;
    fetchClaudeForServers(serversRef.current, true);
  }, []);

  const moveClaudeNode = useCallback(
    (serverId: string, offsetX: number, offsetY: number) => {
      moveClaudeNodeStore(serverId, offsetX, offsetY);
    },
    [],
  );

  return { accounts: list, refresh, moveClaudeNode };
}
