"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiDownload, FiPlay, FiExternalLink, FiX, FiLock, FiTerminal, FiCheckCircle } from "react-icons/fi";
import {
  installChatAppApi,
  provisionSslApi,
  fetchSslForServer,
  ApiError,
  type ChatInstallResult,
  type SslCertificate,
} from "@/lib/api";
import { getApiOrigin } from "@/lib/apiClient";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { useSslJobs } from "@/lib/use-ssl-jobs";
import { Z_INDEX } from "@/lib/z-index";
import { ClaudeCodeOverlay } from "./claude-code-overlay";

type Phase = "form" | "running" | "success" | "failed";

interface InstallChatPopupProps {
  serverId: string;
  serverName: string;
  hostname: string;
  onClose: () => void;
  onInstalled: () => void;
}

/**
 * One-click installer modal for claw-chat. Collects the authorized email,
 * runs bootstrap.sh on the target server (which installs Docker/Node/Claude
 * CLI and the chat stack), streams the output, and then offers the next
 * actions in the golden path: provision SSL (co-existence mode, since
 * claw-nginx now owns port 80), re-run the installer to switch to HTTPS,
 * and authenticate the Claude CLI in an in-browser terminal.
 */
export function InstallChatPopup({ serverId, serverName, hostname, onClose, onInstalled }: InstallChatPopupProps) {
  const isMobile = useIsMobile();
  const { viewportHeight } = useVisualViewport();

  const [phase, setPhase] = useState<Phase>("form");
  const [email, setEmail] = useState<string>(() => getUser()?.email ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Seed with the ClawOps backend origin the dashboard is currently talking to.
  // That's the URL the chat app needs to hit for /api/v1/auth/login etc. — if
  // we don't pre-fill this, the backend falls back to the chat's own hostname
  // and every login request loops back and 404s.
  const [apiOrigin, setApiOrigin] = useState<string>(() => getApiOrigin());
  const [result, setResult] = useState<ChatInstallResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  /* ── SSL state after install ── */
  const [ssl, setSsl] = useState<SslCertificate | null>(null);
  const { jobs: sslJobs, track: trackSsl } = useSslJobs();
  const [sslJobId, setSslJobId] = useState<string | null>(null);
  const sslJob = sslJobs.find((j) => j.id === sslJobId) ?? null;
  const [sslStarting, setSslStarting] = useState(false);
  const [sslError, setSslError] = useState<string | null>(null);

  /* ── Claude auth overlay ── */
  const [showClaudeOverlay, setShowClaudeOverlay] = useState(false);

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

  /* ── After install succeeds, pull the server's current cert so we know
     whether to offer "Provision SSL" vs "Re-run to enable HTTPS". ── */
  useEffect(() => {
    if (phase !== "success") return;
    let stale = false;
    fetchSslForServer(serverId)
      .then((c) => { if (!stale) setSsl(c); })
      .catch(() => {});
    return () => { stale = true; };
  }, [phase, serverId]);

  /* ── When an SSL job we started reaches COMPLETED, refetch the cert. ── */
  useEffect(() => {
    if (!sslJob || sslJob.status !== "COMPLETED") return;
    fetchSslForServer(serverId).then((c) => setSsl(c)).catch(() => {});
  }, [sslJob, serverId]);

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

  const runProvisionSsl = useCallback(async () => {
    setSslStarting(true);
    setSslError(null);
    try {
      const job = await provisionSslApi(serverId);
      if (job?.id) {
        trackSsl(job.id, serverId);
        setSslJobId(job.id);
      }
    } catch (err) {
      setSslError(err instanceof ApiError ? err.message : "SSL provisioning failed to start");
    } finally {
      setSslStarting(false);
    }
  }, [serverId, trackSsl]);

  /* ── Derived: which next-step card to show in the success phase ── */
  const hasActiveCert = ssl?.status === "ACTIVE";
  const certOnDiskButHttpOnly = hasActiveCert && result?.output?.includes("starting HTTP-only") === true;
  const sslRunning = sslJob?.status === "RUNNING" || sslStarting;
  const sslJustCompleted = sslJob?.status === "COMPLETED";

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
              Installs claw-chat at <span className="font-mono text-gray-200">https://{hostname}/chat</span>.
              Bootstrap runs <span className="font-mono text-gray-200">apt upgrade</span>, installs Docker,
              Node.js and the Claude CLI, then brings the stack up. Auto-detects SSL certs at
              <span className="font-mono text-gray-200"> /etc/letsencrypt/live/{hostname}/</span>.
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
                  ClawOps backend URL
                </label>
                <input
                  type="url"
                  value={apiOrigin}
                  onChange={(e) => setApiOrigin(e.target.value)}
                  placeholder={getApiOrigin() || "https://clawops.example.com"}
                  className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-[12px] text-[#c9d1d9] placeholder:text-gray-600 focus:outline-none focus:border-blue-400/50"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Sets <span className="font-mono text-gray-300">NEXT_PUBLIC_API_ORIGIN</span> in the chat&apos;s
                  <span className="font-mono text-gray-300"> .env</span>. Pre-filled with the dashboard&apos;s own backend
                  URL — change only if the chat should talk to a different ClawOps instance.
                </p>
              </div>
            )}

            <p className="text-[10px] text-gray-600">
              Runs as root over SSH. First-time runs take 2–4 minutes (apt upgrade dominates).
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
            <p className="text-sm text-gray-400">Running bootstrap on {hostname}...</p>
            <p className="text-[11px] text-gray-600">
              Updating packages → Docker → Node + Claude CLI → installer → container start.
            </p>
          </div>
        )}

        {phase === "success" && (
          <div className="flex flex-1 flex-col min-h-0 overflow-y-auto p-3 gap-3">
            {/* Step 1: installed */}
            <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-green-400">
                <FiCheckCircle size={13} />
                <span className="font-medium">Chat app installed</span>
                <a
                  href={`${hasActiveCert ? "https" : "http"}://${hostname}/chat`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 underline hover:text-green-300"
                >
                  Open <FiExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Step 2: SSL */}
            <div className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <FiLock size={13} className={hasActiveCert ? "text-green-400" : "text-gray-500"} />
                <span className="font-medium text-[#c9d1d9]">
                  {hasActiveCert ? "SSL certificate active" : "SSL not yet provisioned"}
                </span>
                {sslRunning && <span className="ml-auto text-[10px] text-yellow-400 animate-pulse">running…</span>}
              </div>
              {!hasActiveCert && !sslRunning && !sslJustCompleted && (
                <>
                  <p className="mt-1 text-[10px] text-gray-500">
                    With claw-nginx now holding port 80, SSL provisioning will run in co-existence
                    mode (DNS-01, no host-nginx config changes).
                  </p>
                  <button
                    type="button"
                    onClick={runProvisionSsl}
                    disabled={sslStarting}
                    className="mt-2 flex items-center gap-1.5 rounded bg-blue-500/90 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                  >
                    <FiPlay size={11} />
                    Provision SSL now
                  </button>
                </>
              )}
              {sslRunning && sslJob && (
                <p className="mt-1 text-[10px] text-gray-500">
                  Step: {sslJob.currentStep} — typical run 1–3 min.
                </p>
              )}
              {sslJustCompleted && !hasActiveCert && (
                <p className="mt-1 text-[10px] text-gray-500">
                  Cert issued. Re-run the installer to switch claw-nginx into HTTPS mode.
                </p>
              )}
              {sslJustCompleted && (
                <button
                  type="button"
                  onClick={runInstall}
                  className="mt-2 flex items-center gap-1.5 rounded bg-blue-500/90 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <FiPlay size={11} />
                  {hasActiveCert ? "Re-run installer" : "Re-run to enable HTTPS"}
                </button>
              )}
              {sslError && (
                <p className="mt-1 text-[10px] text-red-400">{sslError}</p>
              )}
              {certOnDiskButHttpOnly && (
                <p className="mt-1 text-[10px] text-amber-400">
                  Cert is active but install.sh ran before it existed. Re-run to switch to HTTPS.
                </p>
              )}
            </div>

            {/* Step 3: Claude auth */}
            <div className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-[#c9d1d9]">
                <FiTerminal size={13} className="text-orange-400" />
                <span className="font-medium">Authenticate Claude CLI</span>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                Sign in to Claude so the chat app can talk to the Agent SDK. Opens an in-browser
                terminal with <span className="font-mono text-gray-300">claude auth login</span> pre-typed.
              </p>
              <button
                type="button"
                onClick={() => setShowClaudeOverlay(true)}
                className="mt-2 flex items-center gap-1.5 rounded bg-orange-500/90 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-orange-500"
              >
                <FiTerminal size={11} />
                Authenticate Claude now
              </button>
            </div>

            {/* Install log (collapsible-ish: just a fixed-height pre) */}
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-gray-500 hover:text-gray-300">
                Show install log
              </summary>
              <pre
                ref={logRef}
                className="mt-2 max-h-64 overflow-y-auto rounded-md bg-[#0d1117] px-3 py-2 font-mono text-[11px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap break-all border border-[#21262d]"
              >
                {result?.output || "(no output)"}
              </pre>
            </details>
          </div>
        )}

        {phase === "failed" && (
          <div className="flex flex-1 flex-col min-h-0 p-2">
            <div className="mb-2 rounded-md bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
              Install failed{errorMsg ? ` — ${errorMsg}` : ""}
            </div>
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

  const popup = isMobile
    ? createPortal(
        <div className="fixed inset-0 bg-[#0d1117]" style={{ zIndex: Z_INDEX.MODAL }}>
          <div className="flex flex-col" style={{ height: viewportHeight, overflow: "hidden" }}>
            {content}
          </div>
        </div>,
        document.body,
      )
    : createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[2px] animate-backdrop-in"
          style={{ zIndex: Z_INDEX.MODAL }}
        >
          <div
            className="mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-canvas-border shadow-2xl animate-modal-in"
            style={{ maxHeight: "min(700px, 85vh)" }}
          >
            {content}
          </div>
        </div>,
        document.body,
      );

  return (
    <>
      {popup}
      {showClaudeOverlay && (
        <ClaudeCodeOverlay
          serverId={serverId}
          serverName={serverName}
          initialCommand="claude auth login"
          title="Authenticate Claude CLI"
          onClose={() => setShowClaudeOverlay(false)}
        />
      )}
    </>
  );
}
