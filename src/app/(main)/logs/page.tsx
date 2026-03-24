"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  fetchAuditLogsApi,
  type AuditLogEntry,
  type AuditLogFilters,
  type PageResponse,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 25;

const ACTIONS = [
  "USER_LOGIN", "USER_LOGIN_FAILED", "USER_LOGOUT", "USER_CREATED", "USER_UPDATED",
  "USER_DISABLED", "USER_DELETED", "USER_PASSWORD_CHANGED",
  "SERVER_CREATED", "SERVER_UPDATED", "SERVER_DELETED", "SERVER_CONNECTION_TESTED",
  "SECRET_CREATED", "SECRET_UPDATED", "SECRET_DELETED",
  "SSH_COMMAND_EXECUTED",
  "TERMINAL_SESSION_OPENED", "TERMINAL_SESSION_CLOSED",
  "DEPLOYMENT_STARTED", "DEPLOYMENT_COMPLETED", "DEPLOYMENT_FAILED",
  "TEMPLATE_CREATED", "TEMPLATE_DEPLOYED",
  "DOMAIN_PROVISIONED", "DOMAIN_SSL_ISSUED", "DOMAIN_DELETED",
];

const ENTITY_TYPES = ["USER", "SERVER", "SECRET", "DEPLOYMENT", "TEMPLATE", "DOMAIN"];

function actionColor(action: string): string {
  if (action.includes("FAILED")) return "text-red-500 dark:text-red-400";
  if (action.includes("DELETED") || action.includes("DISABLED")) return "text-orange-500 dark:text-orange-400";
  if (action.includes("LOGIN") || action.includes("CREATED")) return "text-green-600 dark:text-green-400";
  return "text-canvas-fg";
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LogsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getUser>>(null);

  useEffect(() => {
    const u = getUser();
    setCurrentUser(u);
    if (u && u.role !== "ADMIN") router.replace("/");
  }, [router]);

  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<AuditLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const buildFilters = useCallback((): AuditLogFilters => {
    const f: AuditLogFilters = {};
    if (filterAction) f.action = filterAction;
    if (filterEntityType) f.entityType = filterEntityType;
    if (filterUserId.trim()) f.userId = filterUserId.trim();
    if (filterFrom) f.from = new Date(filterFrom).toISOString();
    if (filterTo) f.to = new Date(filterTo).toISOString();
    return f;
  }, [filterAction, filterEntityType, filterUserId, filterFrom, filterTo]);

  const loadLogs = useCallback(
    async (p = 0) => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchAuditLogsApi(p, PAGE_SIZE, buildFilters());
        setData(result);
        setPage(p);
      } catch {
        setError("Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    },
    [buildFilters],
  );

  // Initial load
  useEffect(() => {
    if (currentUser?.role === "ADMIN") loadLogs(0);
  }, [currentUser?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => loadLogs(page), 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [autoRefresh, page, loadLogs]);

  const handleFilter = useCallback(() => loadLogs(0), [loadLogs]);

  const handleClear = useCallback(() => {
    setFilterAction("");
    setFilterEntityType("");
    setFilterUserId("");
    setFilterFrom("");
    setFilterTo("");
    // Will reload on next filter call; trigger immediately
    setTimeout(() => loadLogs(0), 0);
  }, [loadLogs]);

  if (!currentUser || currentUser.role !== "ADMIN") return null;

  const logs = data?.content ?? [];

  const selectBase =
    "rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";
  const inputBase = selectBase;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">Audit Log</h2>
        <label className="flex items-center gap-2 text-xs text-canvas-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="accent-canvas-fg"
          />
          Auto-refresh (10s)
        </label>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-lg border border-canvas-border bg-canvas-bg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Action">
            <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className={selectBase}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </FilterField>

          <FilterField label="Entity Type">
            <select value={filterEntityType} onChange={(e) => setFilterEntityType(e.target.value)} className={selectBase}>
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FilterField>

          <FilterField label="User ID">
            <input
              type="text"
              placeholder="UUID"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className={`${inputBase} w-36`}
            />
          </FilterField>

          <FilterField label="From">
            <input
              type="datetime-local"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className={inputBase}
            />
          </FilterField>

          <FilterField label="To">
            <input
              type="datetime-local"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className={inputBase}
            />
          </FilterField>

          <button
            type="button"
            onClick={handleFilter}
            className="rounded-md border border-canvas-border bg-canvas-fg px-3 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
          >
            Filter
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-canvas-border bg-canvas-bg">
        {loading && logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">No audit logs found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-canvas-border">
                  <Th>Timestamp</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>User ID</Th>
                  <Th>Details</Th>
                  <Th>IP</Th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50"
                  >
                    <td className="px-4 py-2.5 text-xs text-canvas-muted whitespace-nowrap">
                      {formatTimestamp(l.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-xs font-medium ${actionColor(l.action)}`}>{l.action}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-xs text-canvas-fg">{l.entityType}</span>
                      {l.entityId && (
                        <span className="ml-1.5 text-[10px] text-canvas-muted">{l.entityId.substring(0, 8)}...</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-canvas-muted whitespace-nowrap">
                      {l.userId ? `${l.userId.substring(0, 8)}...` : "—"}
                    </td>
                    <td className="px-4 py-2.5 max-w-[300px] truncate font-mono text-[11px] text-canvas-muted" title={l.details ?? ""}>
                      {l.details || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-canvas-muted whitespace-nowrap">
                      {l.ipAddress || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && (
        <div className="mt-3 flex items-center justify-between text-xs text-canvas-muted">
          <span>{data.totalElements} entr{data.totalElements !== 1 ? "ies" : "y"}</span>
          {data.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <PaginationBtn onClick={() => loadLogs(page - 1)} disabled={data.first}>Prev</PaginationBtn>
              <span>Page {data.number + 1} of {data.totalPages}</span>
              <PaginationBtn onClick={() => loadLogs(page + 1)} disabled={data.last}>Next</PaginationBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">{children}</th>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-canvas-muted">{label}</label>
      {children}
    </div>
  );
}

function PaginationBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-canvas-border px-3 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
