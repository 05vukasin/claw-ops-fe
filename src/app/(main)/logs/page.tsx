"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiFilter, FiChevronDown, FiX, FiTrash2 } from "react-icons/fi";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import { Modal } from "@/components/ui/modal";
import {
  ApiError,
  deleteOldAuditLogsApi,
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
  const isMobile = useIsMobile();
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

  // Delete old logs
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

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

  const handleDeleteOldLogs = useCallback(
    async (beforeIso: string) => {
      const result = await deleteOldAuditLogsApi(beforeIso);
      showToast(
        `Deleted ${result.deletedCount} audit log ${result.deletedCount === 1 ? "entry" : "entries"}.`,
        "success",
      );
      setShowDeleteModal(false);
      loadLogs(0);
    },
    [loadLogs, showToast],
  );

  if (!currentUser || currentUser.role !== "ADMIN") return null;

  const logs = data?.content ?? [];
  const hasActiveFilters = !!(filterAction || filterEntityType || filterUserId || filterFrom || filterTo);

  const selectBase =
    "rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";
  const inputBase = selectBase;

  /* ── Mobile view ── */
  if (isMobile) {
    return (
      <>
        <MobileLogsView
          logs={logs}
          loading={loading}
          error={error}
          data={data}
          page={page}
          autoRefresh={autoRefresh}
          hasActiveFilters={hasActiveFilters}
          filterAction={filterAction}
          filterEntityType={filterEntityType}
          filterUserId={filterUserId}
          filterFrom={filterFrom}
          filterTo={filterTo}
          onFilterAction={setFilterAction}
          onFilterEntityType={setFilterEntityType}
          onFilterUserId={setFilterUserId}
          onFilterFrom={setFilterFrom}
          onFilterTo={setFilterTo}
          onAutoRefresh={setAutoRefresh}
          onFilter={handleFilter}
          onClear={handleClear}
          onLoadPage={loadLogs}
          onOpenDelete={() => setShowDeleteModal(true)}
        />
        <DeleteOldLogsModal
          open={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDeleteOldLogs}
          onError={(m) => showToast(m, "error")}
        />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  /* ── Desktop view ── */
  return (
    <>
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">Audit Log</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-canvas-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-canvas-fg"
            />
            Auto-refresh (10s)
          </label>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <FiTrash2 size={12} />
            Delete old logs…
          </button>
        </div>
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
    <DeleteOldLogsModal
      open={showDeleteModal}
      onClose={() => setShowDeleteModal(false)}
      onConfirm={handleDeleteOldLogs}
      onError={(m) => showToast(m, "error")}
    />
    <Toast toast={toast} onClose={() => setToast(null)} />
    </>
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

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ================================================================== */
/*  Mobile Logs View                                                   */
/* ================================================================== */

function MobileLogsView({
  logs,
  loading,
  error,
  data,
  page,
  autoRefresh,
  hasActiveFilters,
  filterAction,
  filterEntityType,
  filterUserId,
  filterFrom,
  filterTo,
  onFilterAction,
  onFilterEntityType,
  onFilterUserId,
  onFilterFrom,
  onFilterTo,
  onAutoRefresh,
  onFilter,
  onClear,
  onLoadPage,
  onOpenDelete,
}: {
  logs: AuditLogEntry[];
  loading: boolean;
  error: string;
  data: PageResponse<AuditLogEntry> | null;
  page: number;
  autoRefresh: boolean;
  hasActiveFilters: boolean;
  filterAction: string;
  filterEntityType: string;
  filterUserId: string;
  filterFrom: string;
  filterTo: string;
  onFilterAction: (v: string) => void;
  onFilterEntityType: (v: string) => void;
  onFilterUserId: (v: string) => void;
  onFilterFrom: (v: string) => void;
  onFilterTo: (v: string) => void;
  onAutoRefresh: (v: boolean) => void;
  onFilter: () => void;
  onClear: () => void;
  onLoadPage: (page: number) => void;
  onOpenDelete: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectBase =
    "w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-2 text-xs text-canvas-fg transition-colors focus:outline-none focus:border-canvas-fg/25";

  return (
    <div className="min-h-[calc(100vh-3rem)] px-3 pb-8 pt-20">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-canvas-fg">
          Audit Log
          {data && (
            <span className="ml-2 text-sm font-normal text-canvas-muted">
              ({data.totalElements})
            </span>
          )}
        </h1>
        <button
          type="button"
          onClick={() => setFiltersOpen((p) => !p)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            hasActiveFilters
              ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
              : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
          }`}
        >
          <FiFilter size={11} />
          Filters
          {hasActiveFilters && <span className="ml-0.5">*</span>}
          <FiChevronDown size={11} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Collapsible filters */}
      {filtersOpen && (
        <div className="mb-4 space-y-3 rounded-xl border border-canvas-border bg-canvas-bg p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-canvas-muted">FILTERS</span>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="rounded-md p-1 text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <FiX size={13} />
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-canvas-muted">Action</label>
            <select value={filterAction} onChange={(e) => onFilterAction(e.target.value)} className={selectBase}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-canvas-muted">Entity Type</label>
            <select value={filterEntityType} onChange={(e) => onFilterEntityType(e.target.value)} className={selectBase}>
              <option value="">All types</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium text-canvas-muted">User ID</label>
            <input
              type="text"
              placeholder="UUID"
              value={filterUserId}
              onChange={(e) => onFilterUserId(e.target.value)}
              className={selectBase}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-canvas-muted">From</label>
              <input
                type="datetime-local"
                value={filterFrom}
                onChange={(e) => onFilterFrom(e.target.value)}
                className={selectBase}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-canvas-muted">To</label>
              <input
                type="datetime-local"
                value={filterTo}
                onChange={(e) => onFilterTo(e.target.value)}
                className={selectBase}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-canvas-muted cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefresh(e.target.checked)}
              className="accent-canvas-fg"
            />
            Auto-refresh (10s)
          </label>

          <button
            type="button"
            onClick={() => { setFiltersOpen(false); onOpenDelete(); }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 py-2 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            <FiTrash2 size={11} />
            Delete old logs…
          </button>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => { onFilter(); setFiltersOpen(false); }}
              className="flex-1 rounded-md bg-canvas-fg py-2 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => { onClear(); setFiltersOpen(false); }}
              className="rounded-md border border-canvas-border px-4 py-2 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && logs.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-canvas-border bg-canvas-surface-hover" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && logs.length === 0 && (
        <div className="py-12 text-center text-sm text-canvas-muted">No audit logs found</div>
      )}

      {/* Log cards */}
      {logs.length > 0 && (
        <div className="space-y-2">
          {logs.map((l) => (
            <LogCard key={l.id} log={l} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-canvas-muted">
          <button
            type="button"
            onClick={() => onLoadPage(page - 1)}
            disabled={data.first}
            className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
          >
            Prev
          </button>
          <span>
            {data.number + 1} / {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() => onLoadPage(page + 1)}
            disabled={data.last}
            className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Mobile log card ── */

function LogCard({ log }: { log: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className={`truncate text-xs font-medium ${actionColor(log.action)}`}>
            {log.action}
          </p>
          <p className="mt-0.5 text-[10px] text-canvas-muted">
            {log.entityType}
            {log.entityId && <span className="ml-1 opacity-60">{log.entityId.substring(0, 8)}</span>}
            <span className="mx-1.5">·</span>
            {formatTimeShort(log.createdAt)}
          </p>
        </div>
        <FiChevronDown
          size={12}
          className={`shrink-0 text-canvas-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-canvas-border px-3.5 py-2.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-canvas-muted">Time</span>
            <span className="text-canvas-fg">{formatTimestamp(log.createdAt)}</span>
          </div>
          {log.userId && (
            <div className="flex justify-between">
              <span className="text-canvas-muted">User</span>
              <span className="font-mono text-canvas-fg">{log.userId.substring(0, 12)}...</span>
            </div>
          )}
          {log.ipAddress && (
            <div className="flex justify-between">
              <span className="text-canvas-muted">IP</span>
              <span className="font-mono text-canvas-fg">{log.ipAddress}</span>
            </div>
          )}
          {log.details && (
            <div className="pt-1">
              <span className="text-canvas-muted">Details</span>
              <p className="mt-0.5 break-all rounded-md bg-canvas-surface-hover px-2 py-1.5 font-mono text-[10px] text-canvas-fg">
                {log.details}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Delete Old Logs Modal                                              */
/* ================================================================== */

const PRESETS: { label: string; days: number }[] = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

function DeleteOldLogsModal({
  open,
  onClose,
  onConfirm,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (beforeIso: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  // Modal unmounts on close and remounts on next open, so useState initializers
  // give us a fresh state per open without a reset effect.
  const [presetDays, setPresetDays] = useState<number | null>(30);
  const [customDate, setCustomDate] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openedAt] = useState<number>(() => Date.now());

  const cutoffIso = useMemo<string | null>(() => {
    if (customDate) {
      const d = new Date(customDate);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    }
    if (presetDays != null) {
      return new Date(openedAt - presetDays * 24 * 60 * 60 * 1000).toISOString();
    }
    return null;
  }, [customDate, presetDays, openedAt]);

  const cutoffPreview = useMemo(() => {
    if (!cutoffIso) return null;
    return new Date(cutoffIso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [cutoffIso]);

  const canSubmit = !!cutoffIso && confirmText === "DELETE" && !submitting;

  const handleSubmit = async () => {
    if (!cutoffIso || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(cutoffIso);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Failed to delete old logs";
      onError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h3 className="text-base font-semibold text-canvas-fg">Delete old audit logs</h3>
          <p className="mt-1 text-xs text-canvas-muted">
            This permanently removes all audit entries older than the selected cutoff. Deletes across
            all logs, regardless of current filters. This action cannot be undone.
          </p>
        </div>

        {/* Presets */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
            Older than
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const active = presetDays === p.days && !customDate;
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => {
                    setPresetDays(p.days);
                    setCustomDate("");
                  }}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
                      : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom date */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
            Or choose a cutoff date
          </label>
          <input
            type="datetime-local"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value);
              if (e.target.value) setPresetDays(null);
            }}
            className="w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10"
          />
        </div>

        {/* Cutoff preview */}
        {cutoffPreview && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-500 dark:text-red-400">
            Will delete entries created before <strong>{cutoffPreview}</strong>.
          </div>
        )}

        {/* Type DELETE */}
        <div>
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
            Type <span className="font-mono text-red-500 dark:text-red-400">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 font-mono text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <FiTrash2 size={12} />
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================================================================== */
/*  Toast                                                              */
/* ================================================================== */

function Toast({
  toast,
  onClose,
}: {
  toast: { msg: string; type: "success" | "error" } | null;
  onClose: () => void;
}) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-xs shadow-lg ${
          isError
            ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
            : "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
        }`}
      >
        <span>{toast.msg}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-1 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          <FiX size={12} />
        </button>
      </div>
    </div>
  );
}
