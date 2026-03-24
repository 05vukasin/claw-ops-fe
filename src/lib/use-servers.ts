"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchServersApi, type Server } from "./api";

/* ------------------------------------------------------------------ */
/*  ServerWithUI — extends Server with canvas position                 */
/* ------------------------------------------------------------------ */

export interface ServerWithUI extends Server {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "openclaw-servers-ui:v1";

let servers: ServerWithUI[] = [];
let listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ServerWithUI[] {
  return servers;
}

/** Read saved UI positions from localStorage. */
function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Save UI positions to localStorage. */
function savePositions() {
  const map: Record<string, { x: number; y: number }> = {};
  for (const s of servers) {
    map[s.id] = { x: s.x, y: s.y };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/** Assign canvas positions — restore from localStorage or scatter randomly. */
function assignPositions(apiServers: Server[]): ServerWithUI[] {
  const saved = loadPositions();
  const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 600;
  const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 400;

  return apiServers.map((s, i) => {
    const pos = saved[s.id];
    if (pos) return { ...s, x: pos.x, y: pos.y };
    // Scatter new servers in a grid-like pattern around center
    const col = i % 5;
    const row = Math.floor(i / 5);
    return {
      ...s,
      x: Math.round(cx - 200 + col * 100 + (Math.random() - 0.5) * 40),
      y: Math.round(cy - 100 + row * 100 + (Math.random() - 0.5) * 40),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

async function fetchAndMerge() {
  try {
    const page = await fetchServersApi(0, 100);
    servers = assignPositions(page.content);
    savePositions();
    emit();
  } catch {
    // keep current state
  }
}

function moveServer(id: string, x: number, y: number) {
  servers = servers.map((s) => (s.id === id ? { ...s, x, y } : s));
  savePositions();
  emit();
}

function removeServer(id: string) {
  servers = servers.filter((s) => s.id !== id);
  savePositions();
  emit();
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useServers() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);

  useEffect(() => {
    fetchAndMerge();
  }, []);

  const refresh = useCallback(() => {
    fetchAndMerge();
  }, []);

  const move = useCallback((id: string, x: number, y: number) => {
    moveServer(id, x, y);
  }, []);

  const remove = useCallback((id: string) => {
    removeServer(id);
  }, []);

  return {
    servers: list,
    refresh,
    moveServer: move,
    removeServer: remove,
  };
}
