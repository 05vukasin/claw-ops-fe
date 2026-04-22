"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchFleetHealthApi, type FleetHealthSummary, type MonitoringState } from "./api";

const CACHE_TTL = 30_000; // 30 seconds

let healthMap: Record<string, MonitoringState> = {};
let fleetSummary: FleetHealthSummary | null = null;
let lastFetchedAt = 0;
const listeners = new Set<() => void>();

// Refcounted polling state, survives HMR via globalThis so intervals don't duplicate.
const HEALTH_POLL_KEY = "__clawops_health_poll__" as const;
interface HealthPollState {
  refs: number;
  timer: ReturnType<typeof setInterval> | null;
}
function healthPollState(): HealthPollState {
  const g = globalThis as unknown as Record<string, HealthPollState>;
  if (!g[HEALTH_POLL_KEY]) g[HEALTH_POLL_KEY] = { refs: 0, timer: null };
  return g[HEALTH_POLL_KEY];
}

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

/** Subscribe to the shared poll — starts on first subscriber, stops when last leaves. */
function useSharedHealthPoll() {
  useEffect(() => {
    const state = healthPollState();
    state.refs += 1;
    if (state.refs === 1) {
      fetchHealthMap();
      if (state.timer !== null) clearInterval(state.timer);
      state.timer = setInterval(fetchHealthMap, CACHE_TTL);
    }
    return () => {
      state.refs = Math.max(0, state.refs - 1);
      if (state.refs === 0 && state.timer !== null) {
        clearInterval(state.timer);
        state.timer = null;
      }
    };
  }, []);
}

/** Returns a map of serverId → MonitoringState for node coloring. */
export function useServerHealth(): Record<string, MonitoringState> {
  const map = useSyncExternalStore(subscribeHealth, getHealthSnapshot, () => ({}));
  useSharedHealthPoll();
  return map;
}

/** Returns the full FleetHealthSummary for the fleet summary bar. Shares the same fetch. */
export function useFleetHealth(): FleetHealthSummary | null {
  const summary = useSyncExternalStore(subscribeHealth, getFleetSnapshot, () => null);
  useSharedHealthPoll();
  return summary;
}
