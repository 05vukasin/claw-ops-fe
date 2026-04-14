"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchFleetHealthApi, type MonitoringState } from "./api";

const CACHE_TTL = 30_000; // 30 seconds

let healthMap: Record<string, MonitoringState> = {};
let lastFetchedAt = 0;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getSnapshot() { return healthMap; }

async function fetchHealthMap() {
  if (Date.now() - lastFetchedAt < CACHE_TTL) return;
  try {
    const data = await fetchFleetHealthApi();
    const map: Record<string, MonitoringState> = {};
    for (const s of data.servers) {
      map[s.serverId] = s.overallState;
    }
    healthMap = map;
    lastFetchedAt = Date.now();
    notify();
  } catch { /* keep stale data */ }
}

export function useServerHealth(): Record<string, MonitoringState> {
  const map = useSyncExternalStore(subscribe, getSnapshot, () => ({}));

  useEffect(() => {
    fetchHealthMap();
    const interval = setInterval(fetchHealthMap, CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  return map;
}
