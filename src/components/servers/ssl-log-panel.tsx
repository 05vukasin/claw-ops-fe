"use client";

import { useEffect, useRef } from "react";
import { FiRefreshCw, FiX, FiMaximize2 } from "react-icons/fi";
import type { SslJob } from "@/lib/api";
import { SSL_STEP_LABELS } from "@/lib/ssl-labels";

export function SslLogPanel({
  job,
  onRetry,
  onCancel,
  onClose,
  onExpand,
}: {
  job: SslJob;
  onRetry: () => void;
  onCancel?: () => void;
  onClose: () => void;
  /** If provided, shows an "Expand" button that opens the full-screen SSL log viewer. */
  onExpand?: () => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.logs]);

  const stepLabel = SSL_STEP_LABELS[job.currentStep] ?? job.currentStep;
  const stepClass =
    job.status === "COMPLETED"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : job.status === "FAILED"
        ? "bg-red-500/10 text-red-500 dark:text-red-400"
        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const meta: string[] = [];
  meta.push(`Job: ${job.id.substring(0, 8)}`);
  if (job.retryCount > 0) meta.push(`Retry #${job.retryCount}`);
  if (job.startedAt) meta.push(`Started: ${new Date(job.startedAt).toLocaleTimeString()}`);
  if (job.finishedAt && job.startedAt) {
    const dur = Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000);
    meta.push(`Duration: ${dur}s`);
  }

  return (
    <div className="mt-2 rounded-md border border-canvas-border overflow-hidden">
      <div className="flex items-center justify-between bg-canvas-surface-hover/50 px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepClass}`}>
          {stepLabel}
        </span>
        <div className="flex items-center gap-2">
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Open full-screen log viewer"
              className="flex items-center gap-1 text-[10px] text-canvas-muted hover:text-canvas-fg"
            >
              <FiMaximize2 size={10} />
              Expand
            </button>
          )}
          <button type="button" onClick={onClose} className="text-[10px] text-canvas-muted hover:text-canvas-fg">
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 px-3 py-1.5 text-[10px] text-canvas-muted border-b border-canvas-border">
        {meta.map((m, i) => <span key={i}>{m}</span>)}
      </div>

      {job.errorMessage && (
        <div className="mx-3 mt-2 rounded border border-red-900/30 bg-[#1c0a0a] px-3 py-2 font-mono text-[11px] text-red-300 whitespace-pre-wrap break-all">
          {job.errorMessage}
        </div>
      )}

      <pre
        ref={logRef}
        className="max-h-50 overflow-y-auto bg-[#0d1117] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all"
      >
        {job.logs || "Waiting for logs..."}
      </pre>

      {job.status === "FAILED" && job.currentStep === "FAILED_RETRYABLE" && (
        <div className="flex justify-end border-t border-canvas-border px-3 py-2">
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiRefreshCw size={11} />
            Retry
          </button>
        </div>
      )}
      {(job.status === "PENDING" || job.status === "RUNNING") && onCancel && (
        <div className="flex justify-end border-t border-canvas-border px-3 py-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={11} />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
