"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiPlay, FiX } from "react-icons/fi";
import { executeCommandApi, ApiError } from "@/lib/api";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";

type Status = "running" | "success" | "failed";

interface DeployPopupProps {
  serverId: string;
  onClose: () => void;
}

export function DeployPopup({ serverId, onClose }: DeployPopupProps) {
  const isMobile = useIsMobile();
  const [status, setStatus] = useState<Status>("running");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const { viewportHeight } = useVisualViewport();

  /* ── Lock body scroll ── */
  useEffect(() => {
    if (isMobile) {
      const prev = document.body.style.cssText;
      document.body.style.cssText = "overflow:hidden;position:fixed;width:100%;height:100%;";
      return () => { document.body.style.cssText = prev; };
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isMobile]);

  /* ── Escape to close (only when not running) ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "running") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, status]);

  /* ── Fire deploy on mount ── */
  const runDeploy = useCallback(async () => {
    setStatus("running");
    setOutput("");
    setError(null);
    setDuration(null);

    try {
      const result = await executeCommandApi(
        serverId,
        "bash /root/deploy/deploy.sh 2>&1",
        300, // 5 minute timeout
      );
      setOutput(result.stdout || "(no output)");
      setDuration(result.durationMs);
      if (result.exitCode === 0) {
        setStatus("success");
      } else {
        setStatus("failed");
        setError(`Exit code: ${result.exitCode}`);
      }
    } catch (err) {
      setStatus("failed");
      setError(err instanceof ApiError ? err.message : "Deploy command failed");
    }
  }, [serverId]);

  useEffect(() => { runDeploy(); }, [runDeploy]);

  /* ── Auto-scroll log ── */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [output]);

  const statusDot =
    status === "running" ? "bg-yellow-400 animate-pulse"
    : status === "success" ? "bg-green-400"
    : "bg-red-400";

  const statusText =
    status === "running" ? "Deploying..."
    : status === "success" ? "Completed"
    : "Failed";

  const durationText = duration != null
    ? duration < 1000 ? `${duration}ms` : `${Math.round(duration / 1000)}s`
    : null;

  const content = (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#21262d] bg-[#161b22] px-4 py-2.5">
        <FiPlay size={14} className="shrink-0 text-blue-400" />
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#c9d1d9]">
          Deploy
        </span>
        {durationText && (
          <span className="shrink-0 text-[10px] text-gray-500">{durationText}</span>
        )}
        <span className="shrink-0 text-[10px] text-gray-400">{statusText}</span>
      </div>

      {/* Body — log output or spinner */}
      <div className="flex flex-1 flex-col min-h-0 bg-[#0d1117]">
        {status === "running" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" style={{ animationDelay: "0.2s" }} />
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" style={{ animationDelay: "0.4s" }} />
            </div>
            <p className="text-sm text-gray-400">Running deploy script...</p>
            <p className="text-[11px] text-gray-600">The script runs server-side and will complete even if you close this window.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0 p-2">
            {/* Status banner */}
            <div className={`mb-2 rounded-md px-3 py-2 text-xs font-medium ${
              status === "success"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {status === "success"
                ? "Deploy completed successfully"
                : `Deploy failed${error ? ` — ${error}` : ""}`}
            </div>

            {/* Log output */}
            <pre
              ref={logRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-md bg-[#161b22] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all"
            >
              {output}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#21262d] bg-[#161b22] px-4 py-2">
        {status === "failed" && (
          <button
            type="button"
            onClick={runDeploy}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium text-blue-400 transition-colors hover:bg-blue-400/10"
          >
            <FiPlay size={11} />
            Retry
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          <FiX size={11} />
          Close
        </button>
      </div>
    </>
  );

  /* ── Mobile: fullscreen ── */
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 bg-[#0d1117]" style={{ zIndex: Z_INDEX.MODAL }}>
        <div className="flex flex-col" style={{ height: viewportHeight, overflow: "hidden" }}>
          {content}
        </div>
      </div>,
      document.body,
    );
  }

  /* ── Desktop: centered modal ── */
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-backdrop-in"
      style={{ zIndex: Z_INDEX.MODAL }}
    >
      <div className="mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-canvas-border shadow-2xl animate-modal-in"
        style={{ maxHeight: "min(500px, 70vh)" }}
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}
