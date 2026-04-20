"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiRefreshCw,
  FiDownload,
  FiCopy,
  FiSearch,
  FiArrowDown,
  FiArrowUp,
} from "react-icons/fi";
import type { SslJob } from "@/lib/api";
import { SSL_STEP_LABELS } from "@/lib/ssl-labels";
import { Z_INDEX } from "@/lib/z-index";

/**
 * Full-screen SSL job log viewer. Renders as a portal with its own overlay.
 *
 * Features:
 *  - follow-tail toggle (on by default while RUNNING)
 *  - client-side full-text search with match count + next/prev
 *  - wrap / unwrap toggle
 *  - copy all, download as .log
 *  - retry / cancel footer actions
 *  - meta strip including acmeTxtRecordId when DNS-01 is active
 */
export function SslLogViewer({
  open,
  job,
  onRetry,
  onCancel,
  onClose,
}: {
  open: boolean;
  job: SslJob | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onClose: () => void;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [search, setSearch] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  // Lock body scroll + handle Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  // Follow-tail: keep scrolled to bottom while logs grow AND follow is on.
  useEffect(() => {
    if (!open || !follow || !preRef.current) return;
    preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [open, follow, job?.logs]);

  const logs = job?.logs ?? "";
  const matches = useMemo(() => {
    if (!search.trim()) return [] as number[];
    const needle = search.toLowerCase();
    const hay = logs.toLowerCase();
    const result: number[] = [];
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      result.push(idx);
      idx = hay.indexOf(needle, idx + needle.length);
    }
    return result;
  }, [search, logs]);

  useEffect(() => {
    if (activeMatch >= matches.length) setActiveMatch(0);
  }, [matches.length, activeMatch]);

  const handleCopy = useCallback(async () => {
    if (!logs) return;
    try {
      await navigator.clipboard.writeText(logs);
    } catch { /* ignore */ }
  }, [logs]);

  const handleDownload = useCallback(() => {
    if (!logs || !job) return;
    const blob = new Blob([logs], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ssl-job-${job.id.substring(0, 8)}-${job.hostname}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs, job]);

  const jumpToMatch = useCallback((dir: 1 | -1) => {
    if (!matches.length || !preRef.current) return;
    setFollow(false);
    const nextIdx = (activeMatch + dir + matches.length) % matches.length;
    setActiveMatch(nextIdx);
    // Rough jump: compute line of char offset, then scroll pre proportionally.
    const offset = matches[nextIdx];
    const linesBefore = logs.slice(0, offset).split("\n").length - 1;
    const totalLines = logs.split("\n").length;
    const ratio = totalLines === 0 ? 0 : linesBefore / totalLines;
    const pre = preRef.current;
    pre.scrollTop = Math.max(0, ratio * pre.scrollHeight - pre.clientHeight / 3);
  }, [matches, activeMatch, logs]);

  // Highlight matches inline. Chop logs into [before, match, after] segments.
  const highlightedLogs = useMemo(() => {
    if (!matches.length) return logs;
    const parts: Array<{ text: string; highlight: boolean; active: boolean }> = [];
    const needleLen = search.length;
    let cursor = 0;
    matches.forEach((start, i) => {
      if (start > cursor) parts.push({ text: logs.slice(cursor, start), highlight: false, active: false });
      parts.push({ text: logs.slice(start, start + needleLen), highlight: true, active: i === activeMatch });
      cursor = start + needleLen;
    });
    if (cursor < logs.length) parts.push({ text: logs.slice(cursor), highlight: false, active: false });
    return parts;
  }, [logs, matches, search, activeMatch]);

  if (!open || !job) return null;
  if (typeof document === "undefined") return null;

  const stepLabel = SSL_STEP_LABELS[job.currentStep] ?? job.currentStep;
  const stepClass =
    job.status === "COMPLETED"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : job.status === "FAILED"
        ? "bg-red-500/10 text-red-500 dark:text-red-400"
        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const durationMs = job.finishedAt && job.startedAt
    ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
    : null;

  const canRetry =
    onRetry && job.status === "FAILED" && job.currentStep === "FAILED_RETRYABLE"
    && (job.maxRetries == null || job.retryCount < job.maxRetries);
  const canCancel = onCancel && (job.status === "RUNNING" || job.status === "PENDING");

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={onClose}
      role="presentation"
    >
      <div className="pointer-events-none fixed inset-0 bg-black/60" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="SSL job log"
        className="relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-canvas-border px-5 py-3">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepClass}`}>
            {stepLabel}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-medium text-canvas-fg">{job.hostname}</p>
            <p className="text-[10px] text-canvas-muted">
              Job {job.id.substring(0, 8)}
              {job.maxRetries != null && ` · retry ${job.retryCount}/${job.maxRetries}`}
              {job.startedAt && ` · started ${new Date(job.startedAt).toLocaleTimeString()}`}
              {durationMs != null && ` · ${Math.round(durationMs / 1000)}s`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close log viewer"
            className="rounded-md p-1.5 text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* Meta strip (ACME TXT + trigger user) */}
        {(job.acmeTxtRecordId || job.triggeredBy) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-canvas-border px-5 py-2 text-[10px] text-canvas-muted">
            {job.acmeTxtRecordId && (
              <span>
                <span className="text-canvas-muted/70">TXT record:</span>{" "}
                <span className="font-mono text-canvas-fg">{job.acmeTxtRecordId}</span>
              </span>
            )}
            {job.triggeredBy && (
              <span>
                <span className="text-canvas-muted/70">triggered by:</span>{" "}
                <span className="font-mono">{job.triggeredBy.substring(0, 8)}</span>
              </span>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-canvas-border px-5 py-2">
          <div className="relative flex-1 max-w-md">
            <FiSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-canvas-muted" />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setActiveMatch(0); }}
              className="w-full rounded-md border border-canvas-border bg-transparent py-1 pl-7 pr-20 text-xs text-canvas-fg placeholder:text-canvas-muted/60 focus:outline-none"
            />
            {search && (
              <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 text-[10px] text-canvas-muted">
                <span className="px-1">
                  {matches.length === 0 ? "0" : `${activeMatch + 1}/${matches.length}`}
                </span>
                <button type="button" onClick={() => jumpToMatch(-1)} disabled={!matches.length}
                  className="rounded p-0.5 hover:bg-canvas-surface-hover disabled:opacity-30">
                  <FiArrowUp size={10} />
                </button>
                <button type="button" onClick={() => jumpToMatch(1)} disabled={!matches.length}
                  className="rounded p-0.5 hover:bg-canvas-surface-hover disabled:opacity-30">
                  <FiArrowDown size={10} />
                </button>
              </div>
            )}
          </div>

          <ToolbarToggle label="Wrap" active={wrap} onClick={() => setWrap((v) => !v)} />
          <ToolbarToggle label="Follow" active={follow} onClick={() => setFollow((v) => !v)} />

          <div className="ml-auto flex items-center gap-1">
            <ToolbarBtn onClick={handleCopy} icon={<FiCopy size={11} />}>Copy</ToolbarBtn>
            <ToolbarBtn onClick={handleDownload} icon={<FiDownload size={11} />}>Download</ToolbarBtn>
          </div>
        </div>

        {/* Error banner */}
        {job.errorMessage && (
          <div className="shrink-0 border-b border-canvas-border bg-red-500/5 px-5 py-2 font-mono text-[11px] text-red-500 dark:text-red-400 whitespace-pre-wrap break-all">
            {job.errorMessage}
          </div>
        )}

        {/* Log pane */}
        <pre
          ref={preRef}
          className={`flex-1 overflow-auto bg-[#0d1117] px-5 py-3 font-mono text-[11px] leading-relaxed text-[#c9d1d9] ${wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
        >
          {typeof highlightedLogs === "string" ? (
            highlightedLogs || "Waiting for logs..."
          ) : (
            highlightedLogs.map((part, i) => (
              part.highlight ? (
                <mark
                  key={i}
                  className={`rounded px-0.5 ${part.active ? "bg-yellow-400 text-black" : "bg-yellow-400/40 text-inherit"}`}
                >
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              )
            ))
          )}
        </pre>

        {/* Footer */}
        {(canRetry || canCancel) && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-canvas-border px-5 py-3">
            {canRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
              >
                <FiRefreshCw size={12} />
                Retry
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-md border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/5 dark:text-red-400"
              >
                <FiX size={12} />
                Cancel job
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ToolbarToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
        active
          ? "border-canvas-fg/30 bg-canvas-surface-hover text-canvas-fg"
          : "border-canvas-border text-canvas-muted hover:text-canvas-fg"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarBtn({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
    >
      {icon}
      {children}
    </button>
  );
}
