"use client";

import { useEffect, useRef } from "react";
import { FiRefreshCw, FiX } from "react-icons/fi";
import type { DomainJob } from "@/lib/api";
import { DOMAIN_STEP_LABELS } from "@/lib/ssl-labels";

export function DomainLogPanel({
  job,
  onRetry,
  onCancel,
  onClose,
}: {
  job: DomainJob;
  onRetry?: () => void;
  onCancel?: () => void;
  onClose: () => void;
}) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.logs]);

  const stepLabel = DOMAIN_STEP_LABELS[job.currentStep] ?? job.currentStep;
  const stepClass =
    job.status === "COMPLETED"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : job.status === "FAILED"
        ? "bg-red-500/10 text-red-500 dark:text-red-400"
        : job.status === "CANCELLED"
          ? "bg-canvas-surface-hover text-canvas-muted"
          : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  const meta: string[] = [];
  meta.push(`Job: ${job.id.substring(0, 8)}`);
  if (job.retryCount > 0) meta.push(`Retry #${job.retryCount}`);
  if (job.startedAt) meta.push(`Started: ${new Date(job.startedAt).toLocaleTimeString()}`);
  if (job.finishedAt && job.startedAt) {
    const dur = Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 1000);
    meta.push(`Duration: ${dur}s`);
  }

  const canRetry =
    onRetry && job.status === "FAILED" && job.currentStep === "FAILED_RETRYABLE"
    && job.retryCount < job.maxRetries;
  const canCancel = onCancel && job.status === "RUNNING";

  return (
    <div className="mt-2 rounded-md border border-canvas-border overflow-hidden">
      <div className="flex items-center justify-between bg-canvas-surface-hover/50 px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepClass}`}>
          {stepLabel}
        </span>
        <button type="button" onClick={onClose} className="text-[10px] text-canvas-muted hover:text-canvas-fg">
          Close
        </button>
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

      {(canRetry || canCancel) && (
        <div className="flex justify-end gap-1 border-t border-canvas-border px-3 py-2">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <FiRefreshCw size={11} />
              Retry
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <FiX size={11} />
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
