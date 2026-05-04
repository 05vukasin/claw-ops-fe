"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import {
  ApiError,
  fetchContainerLogsApi,
  type ContainerLogEntry,
  type ContainerLogFilters,
  type ContainerLogLevel,
  type ContainerLogStream,
  type ContainerService,
  type PageResponse,
} from "@/lib/api";
import { showToast } from "@/components/ui/toast";
import { LogLine } from "./LogLine";

const PAGE_SIZE = 50;
const LEVEL_OPTIONS: ContainerLogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "UNKNOWN"];
const STREAM_OPTIONS: ContainerLogStream[] = ["STDOUT", "STDERR"];

export function ServiceLogsHistory({ service }: { service: ContainerService }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<ContainerLogEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [level, setLevel] = useState<ContainerLogLevel | "">("");
  const [stream, setStream] = useState<ContainerLogStream | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const myId = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const filters: ContainerLogFilters = {};
      if (level) filters.level = level;
      if (stream) filters.stream = stream;
      if (from) filters.from = new Date(from).toISOString();
      if (to) filters.to = new Date(to).toISOString();
      if (search.trim()) filters.search = search.trim();
      const res = await fetchContainerLogsApi(service, page, PAGE_SIZE, filters);
      if (myId !== reqId.current) return;
      setData(res);
    } catch (err) {
      if (myId !== reqId.current) return;
      const msg = err instanceof ApiError ? err.message : "Failed to load logs";
      setError(msg);
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }, [service, page, level, stream, from, to, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, [autoRefresh, load]);

  function resetFilters() {
    setLevel("");
    setStream("");
    setFrom("");
    setTo("");
    setSearch("");
    setSearchInput("");
    setPage(0);
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-canvas-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label className="mb-1 text-[10px] uppercase tracking-wider text-canvas-muted">Level</label>
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value as ContainerLogLevel | "");
                setPage(0);
              }}
              className="rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            >
              <option value="">All</option>
              {LEVEL_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-[10px] uppercase tracking-wider text-canvas-muted">Stream</label>
            <select
              value={stream}
              onChange={(e) => {
                setStream(e.target.value as ContainerLogStream | "");
                setPage(0);
              }}
              className="rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            >
              <option value="">All</option>
              {STREAM_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-[10px] uppercase tracking-wider text-canvas-muted">From</label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            />
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-[10px] uppercase tracking-wider text-canvas-muted">To</label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(0);
              }}
              className="rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
            />
          </div>
          <form onSubmit={applySearch} className="flex flex-1 min-w-[200px] flex-col">
            <label className="mb-1 text-[10px] uppercase tracking-wider text-canvas-muted">Search</label>
            <div className="flex items-center gap-1">
              <div className="flex flex-1 items-center gap-1 rounded-md border border-canvas-border px-2 py-1">
                <FiSearch size={12} className="text-canvas-muted" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search messages…"
                  className="w-full bg-transparent text-xs text-canvas-fg placeholder:text-canvas-muted focus:outline-none"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setSearch("");
                      setPage(0);
                    }}
                    className="text-canvas-muted hover:text-canvas-fg"
                  >
                    <FiX size={12} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="rounded-md border border-canvas-border bg-canvas-fg px-2.5 py-1 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
              >
                Apply
              </button>
            </div>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-canvas-muted">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-canvas-fg"
              />
              Auto-refresh
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg disabled:opacity-50"
            >
              <FiRefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-canvas-border">
        {error ? (
          <div className="px-3 py-8 text-center text-sm text-red-500">{error}</div>
        ) : loading && !data ? (
          <div className="px-3 py-8 text-center text-sm text-canvas-muted">Loading…</div>
        ) : !data || data.content.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-canvas-muted">No logs found.</div>
        ) : (
          <div>
            {data.content.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setExpanded((e) => (e === entry.id ? null : entry.id))}
                className="block w-full text-left transition-colors hover:bg-canvas-border/40"
              >
                <LogLine entry={entry} dense={expanded !== entry.id} />
                {expanded === entry.id && (
                  <div className="border-b border-canvas-border bg-canvas-border/20 px-3 py-2 text-[11px] text-canvas-muted">
                    <div>
                      <span className="font-semibold">Container:</span> {entry.containerName} ({entry.containerId.slice(0, 12)})
                    </div>
                    <div>
                      <span className="font-semibold">Ingested:</span> {new Date(entry.ingestedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-canvas-muted">
          <span>
            Page {data.number + 1} of {data.totalPages} · {data.totalElements} total
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={data.first || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs transition-colors hover:text-canvas-fg disabled:opacity-30"
            >
              <FiChevronLeft size={12} /> Prev
            </button>
            <button
              type="button"
              disabled={data.last || loading}
              onClick={() => setPage((p) => p + 1)}
              className="flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs transition-colors hover:text-canvas-fg disabled:opacity-30"
            >
              Next <FiChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function useShowToastIfApiError() {
  return (err: unknown, fallback: string) => {
    showToast(err instanceof ApiError ? err.message : fallback, "error");
  };
}
