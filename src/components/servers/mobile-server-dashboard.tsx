"use client";

import { useCallback, useEffect, useState } from "react";
import { FiRefreshCw } from "react-icons/fi";
import {
  fetchFleetHealthApi,
  type Server,
  type ServerHealth,
  type MonitoringState,
} from "@/lib/api";
import { MobileServerCard } from "./mobile-server-card";

/* ------------------------------------------------------------------ */
/*  Severity sort order                                                */
/* ------------------------------------------------------------------ */

const SEVERITY: Record<MonitoringState, number> = {
  CRITICAL: 0,
  WARNING: 1,
  UNREACHABLE: 2,
  UNKNOWN: 3,
  MAINTENANCE: 4,
  HEALTHY: 5,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface MobileServerDashboardProps {
  servers: Server[];
  onRefresh: () => void;
}

export function MobileServerDashboard({
  servers,
  onRefresh,
}: MobileServerDashboardProps) {
  const [healthMap, setHealthMap] = useState<Map<string, ServerHealth>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = useCallback(async () => {
    try {
      const fleet = await fetchFleetHealthApi();
      const map = new Map<string, ServerHealth>();
      for (const sh of fleet.servers) {
        map.set(sh.serverId, sh);
      }
      setHealthMap(map);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadHealth();
    const id = setInterval(loadHealth, 30_000);
    return () => clearInterval(id);
  }, [loadHealth]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    onRefresh();
    await loadHealth();
    setRefreshing(false);
  }, [onRefresh, loadHealth]);

  /* Sort servers by health severity */
  const sorted = [...servers].sort((a, b) => {
    const ha = healthMap.get(a.id);
    const hb = healthMap.get(b.id);
    const sa = ha ? SEVERITY[ha.overallState] : 3;
    const sb = hb ? SEVERITY[hb.overallState] : 3;
    return sa - sb;
  });

  /* Empty state */
  if (servers.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center px-4">
        <div className="surface-overlay max-w-md rounded-md px-8 py-10 text-center">
          <h1 className="text-lg font-medium tracking-tight text-canvas-fg">
            Servers
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-canvas-muted">
            No servers yet. Add your first server from a desktop device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] px-3 pb-8 pt-28">
      {/* Title row */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold text-canvas-fg">
          Servers
          <span className="ml-2 text-sm font-normal text-canvas-muted">
            ({servers.length})
          </span>
        </h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
        >
          <FiRefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && healthMap.size === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-canvas-border bg-canvas-surface-hover"
            />
          ))}
        </div>
      )}

      {/* Server cards */}
      {(!loading || healthMap.size > 0) && (
        <div className="space-y-3">
          {sorted.map((server) => (
            <MobileServerCard
              key={server.id}
              server={server}
              health={healthMap.get(server.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
