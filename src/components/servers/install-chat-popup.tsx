"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiDownload, FiPlay, FiExternalLink, FiX } from "react-icons/fi";
import { installChatAppApi, ApiError, type ChatInstallResult } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Z_INDEX } from "@/lib/z-index";

type Phase = "form" | "running" | "success" | "failed";

interface InstallChatPopupProps {
  serverId: string;
  hostname: string;
  onClose: () => void;
  onInstalled: () => void;
}

/**
 * Dedicated installer modal for the claw-chat app. Collects the authorized email
 * from the user, then runs the backend install endpoint and streams the stdout
 * into a log pane. Mirrors {@code DeployPopup} for visual consistency.
 */
export function InstallChatPopup({ serverId, hostname, onClose, onInstalled }: InstallChatPopupProps) {
  const isMobile = useIsMobile();
  const { viewportHeight } = useVisualViewport();

  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState<string>(() => getUser()?.email ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [apiOrigin, setApiOrigin] = useState("");
  const [result, setResult] = useState<ChatInstallResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

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
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, phase]);

  /* ── Auto-scroll log ── */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [result]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const runInstall = useCallback(async () => {
    if (!emailValid) return;
    setPhase("running");
    setResult(null);
    setErrorMsg(null);
    try {
      const r = await installChatAppApi(serverId, {
        allowedEmail: email.trim(),
        apiOrigin: apiOrigin.trim() || null,
      });
      setResult(r);
      if (r.exitCode === 0) {
        setPhase("success");
        onInstalled();
      } else {
        setPhase("failed");
        setErrorMsg(`Install script exit code: ${r.exitCode}`);
      }
    } catch (err) {
      setPhase("failed");
      setErrorMsg(err instanceof ApiError ? err.message : "Install request failed");
    }
  }, [emailValid, email, apiOrigin, serverId, onInstalled]);

  const statusDot =
    phase === "running" ? "bg-yellow-400 animate-pulse"
      : phase === "success" ? "bg-green-400"
        : phase === "failed" ? "bg-red-400"
          : "bg-gray-500";

  const statusText =
    phase === "form" ? "Ready"
      : phase === "running" ? "Installing..."
        : phase === "success" ? "Installed"
          : "Failed";

  const durationText = result != null
    ? result.durationMs < 1000 ? `${result.durationMs}ms` : `${Math.round(result.durationMs / 1000)}s`
    : null;

  const content = (
    <>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#21262d] bg-[#161b22] px-4 py-2.5">
        <FiDownload size={14} className="shrink-0 text-blue-400" />
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#c9d1d9]">
          Install Chat App · {hostname}
        </span>
        {durationText && (
          <span className="shrink-0 text-[10px] text-gray-500">{durationText}</span>
        )}
        <span className="shrink-0 text-[10px] text-gray-400">{statusText}</span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col min-h-0 bg-[#0d1117]">
        {phase === "form" && (
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 text-[12px] text-[#c9d1d9]">
            <p className="text-[11px] text-gray-400">
              Installs the claw-chat app at <span className="font-mono text-gray-200">https://{hostname}/chat</span>.
              The installer auto-detects SSL certs at
              <span className="font-mono text-gray-200"> /etc/letsencrypt/live/{hostname}/</span> and picks HTTP or HTTPS accordingly.
            </p>

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                Authorized email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-[12px] text-[#c9d1d9] placeholder:text-gray-600 focus:outline-none focus:border-blue-400/50"
                autoFocus
              />
              <p className="mt-1 text-[10px] text-gray-500">
                Only this email will be allowed to sign in to the chat UI.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="self-start text-[10px] text-gray-500 hover:text-gray-300"
            >
              {showAdvanced ? "▾ Advanced" : "▸ Advanced"}
            </button>
            {showAdvanced && (
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400">
                  API origin override
                </label>
                <input
                  type="url"
                  value={apiOrigin}
                  onChange={(e) => setApiOrigin(e.target.value)}
                  placeholder={`https://${hostname} (default)`}
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-[12px] text-[#c9d1d9] placeholder:text-gray-600 focus:outline-none focus:border-blue-400/50"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Overrides NEXT_PUBLIC_API_ORIGIN. Leave blank to use the server&apos;s own domain.
                </p>
              </div>
            )}

            <p className="text-[10px] text-gray-600">
              The installer runs as root over SSH. It will stop any host-level nginx service,
              install Docker if missing, pull the chat image, and bring up the stack.
            </p>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" style={{ animationDelay: "0.2s" }} />
              <span className="h-2 w-2 animate-pulse rounded-full bg-yellow-400" style={{ animationDelay: "0.4s" }} />
            </div>
            <p className="text-sm text-gray-400">Running install.sh on {hostname}...</p>
            <p className="text-[11px] text-gray-600">Typical run takes 30-90 seconds (first run installs Docker).</p>
          </div>
        )}

        {(phase === "success" || phase === "failed") && (
          <div className="flex flex-1 flex-col min-h-0 p-2">
            <div className={`mb-2 rounded-md px-3 py-2 text-xs font-medium ${
              phase === "success"
                ? "bg-green-500/10 text-green-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {phase === "success" ? (
                <span className="flex items-center gap-2">
                  Chat app installed
                  <a
                    href={`https://${hostname}/chat`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 underline hover:text-green-300"
                  >
                    Open <FiExternalLink size={10} />
                  </a>
                </span>
              ) : (
                <span>Install failed{errorMsg ? ` — ${errorMsg}` : ""}</span>
              )}
            </div>
            {phase === "success" && (
              <p className="mb-2 text-[10px] text-gray-500">
                First-time setup: sign in with <span className="font-mono text-gray-300">{email}</span>, open
                Settings → Terminal and run <span className="font-mono text-gray-300">claude auth login</span> to
                authenticate the Claude CLI inside the container.
              </p>
            )}
            <pre
              ref={logRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-md bg-[#161b22] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all"
            >
              {result?.output || "(no output)"}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#21262d] bg-[#161b22] px-4 py-2">
        {phase === "form" && (
          <button
            type="button"
            onClick={runInstall}
            disabled={!emailValid}
            className="flex items-center gap-1.5 rounded bg-blue-500/90 px-3 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiPlay size={11} />
            Install
          </button>
        )}
        {phase === "failed" && (
          <button
            type="button"
            onClick={runInstall}
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
          disabled={phase === "running"}
          className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] text-gray-400 transition-colors hover:bg-white/5 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiX size={11} />
          Close
        </button>
      </div>
    </>
  );

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

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-backdrop-in"
      style={{ zIndex: Z_INDEX.MODAL }}
    >
      <div
        className="mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-canvas-border shadow-2xl animate-modal-in"
        style={{ maxHeight: "min(600px, 80vh)" }}
      >
        {content}
      </div>
    </div>,
    document.body,
  );
}
