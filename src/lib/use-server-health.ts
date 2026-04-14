"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchFleetHealthApi, type FleetHealthSummary, type MonitoringState } from "./api";

const CACHE_TTL = 30_000; // 30 seconds

let healthMap: Record<string, MonitoringState> = {};
let fleetSummary: FleetHealthSummary | null = null;
let lastFetchedAt = 0;
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }
function subscribeHealth(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function getHealthSnapshot() { return healthMap; }
function getFleetSnapshot() { return fleetSummary; }

async function fetchHealthMap() {
  if (Date.now() - lastFetchedAt < CACHE_TTL) return;
  try {
    const data = await fetchFleetHealthApi();
    const map: Record<string, MonitoringState> = {};
    for (const s of data.servers) {
      map[s.serverId] = s.overallState;
    }
    healthMap = map;
    fleetSummary = data;
    lastFetchedAt = Date.now();
    notify();
  } catch { /* keep stale data */ }
}

/** Returns a map of serverId → MonitoringState for node coloring. */
export function useServerHealth(): Record<string, MonitoringState> {
  const map = useSyncExternalStore(subscribeHealth, getHealthSnapshot, () => ({}));

  useEffect(() => {
    fetchHealthMap();
    const interval = setInterval(fetchHealthMap, CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  return map;
}

/** Returns the full FleetHealthSummary for the fleet summary bar. Shares the same fetch. */
export function useFleetHealth(): FleetHealthSummary | null {
  const summary = useSyncExternalStore(subscribeHealth, getFleetSnapshot, () => null);

  useEffect(() => {
    fetchHealthMap();
    const interval = setInterval(fetchHealthMap, CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  return summary;
}
