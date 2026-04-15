"use client";

import { useCallback, useEffect, useState } from "react";
import { FiChevronRight, FiGithub, FiLink, FiRefreshCw } from "react-icons/fi";
import { executeCommandApi, ApiError } from "@/lib/api";
import { ClaudeCodeOverlay } from "./claude-code-overlay";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ConnectionStatus {
  installed: boolean;
  authenticated: boolean;
  info: string | null; // username, email, version, etc.
  loading: boolean;
}

const EMPTY: ConnectionStatus = { installed: false, authenticated: false, info: null, loading: true };

interface ConnectionsSectionProps {
  serverId: string;
  serverName: string;
}

/* ------------------------------------------------------------------ */
/*  Detection commands (same as the fleet-level hooks)                  */
/* ------------------------------------------------------------------ */

const GH_CMD = `gh auth status 2>&1; echo "---GH_SEP---"; git config --global user.name 2>/dev/null; echo "---GH_SEP---"; git config --global user.email 2>/dev/null`;

const CLAUDE_CMD = [
  'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
  'claude --version 2>/dev/null || echo "NOT_FOUND"',
  'echo "---CC_SEP---"',
  'claude auth status 2>/dev/null || echo "NOT_AUTHENTICATED"',
].join("; ");

const CODEX_CMD = [
  'export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/usr/local/bin:$PATH"',
  'codex --version 2>/dev/null || echo "NOT_FOUND"',
  'echo "---CX_SEP---"',
  'codex auth status 2>/dev/null || echo "NOT_AUTHENTICATED"',
].join("; ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConnectionsSection({ serverId, serverName }: ConnectionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [github, setGithub] = useState<ConnectionStatus>(EMPTY);
  const [claude, setClaude] = useState<ConnectionStatus>(EMPTY);
  const [codex, setCodex] = useState<ConnectionStatus>(EMPTY);

  /* ---- overlay for interactive auth ---- */
  const [overlay, setOverlay] = useState<{ command: string; title: string } | null>(null);

  /* ---- fetch all statuses ---- */
  const fetchAll = useCallback(async () => {
    setGithub((s) => ({ ...s, loading: true }));
    setClaude((s) => ({ ...s, loading: true }));
    setCodex((s) => ({ ...s, loading: true }));

    // Run all three in parallel
    const [ghResult, ccResult, cxResult] = await Promise.allSettled([
      executeCommandApi(serverId, GH_CMD, 10),
      executeCommandApi(serverId, CLAUDE_CMD, 15),
      executeCommandApi(serverId, CODEX_CMD, 15),
    ]);

    // Parse GitHub
    if (ghResult.status === "fulfilled") {
      const parts = ghResult.value.stdout.split("---GH_SEP---");
      const ghStatus = (parts[0] ?? "").trim();
      const gitName = (parts[1] ?? "").trim() || null;
      const gitEmail = (parts[2] ?? "").trim() || null;
      const ghMatch = ghStatus.match(/Logged in to github\.com as (\S+)/i);
      const hasGh = !ghStatus.includes("command not found") && !ghStatus.includes("not found");
      if (ghMatch) {
        // gh CLI authenticated
        setGithub({ installed: true, authenticated: true, info: ghMatch[1], loading: false });
      } else if (gitName || gitEmail) {
        // No gh CLI auth, but git config exists (credentials/tokens work for push)
        setGithub({ installed: hasGh, authenticated: true, info: gitName || gitEmail, loading: false });
      } else {
        setGithub({ installed: hasGh, authenticated: false, info: null, loading: false });
      }
    } else {
      setGithub({ installed: false, authenticated: false, info: null, loading: false });
    }

    // Parse Claude Code
    if (ccResult.status === "fulfilled") {
      const parts = ccResult.value.stdout.split("---CC_SEP---");
      const vRaw = (parts[0] ?? "").trim();
      const authRaw = (parts[1] ?? "").trim();
      if (vRaw === "NOT_FOUND" || !vRaw) {
        setClaude({ installed: false, authenticated: false, info: null, loading: false });
      } else {
        const version = vRaw.split("\n")[0].trim();
        // claude auth status outputs JSON: {"loggedIn": true, "email": "..."}
        const isAuth = authRaw.includes('"loggedIn": true') || authRaw.includes('"loggedIn":true') ||
          (authRaw.toLowerCase().includes("authenticated") && !authRaw.includes("NOT_AUTHENTICATED"));
        const emailMatch = authRaw.match(/"email"\s*:\s*"([^"]+)"/);
        const info = emailMatch ? `${version} — ${emailMatch[1]}` : version || null;
        setClaude({ installed: true, authenticated: isAuth, info, loading: false });
      }
    } else {
      setClaude({ installed: false, authenticated: false, info: null, loading: false });
    }

    // Parse Codex
    if (cxResult.status === "fulfilled") {
      const parts = cxResult.value.stdout.split("---CX_SEP---");
      const vRaw = (parts[0] ?? "").trim();
      const authRaw = (parts[1] ?? "").trim();
      if (vRaw === "NOT_FOUND" || !vRaw) {
        setCodex({ installed: false, authenticated: false, info: null, loading: false });
      } else {
        const version = vRaw.split("\n")[0].trim();
        const isAuth = authRaw.toLowerCase().includes("authenticated") && !authRaw.includes("NOT_AUTHENTICATED");
        const emailMatch = authRaw.match(/[\w.-]+@[\w.-]+\.\w+/);
        setCodex({ installed: true, authenticated: isAuth, info: version || emailMatch?.[0] || null, loading: false });
      }
    } else {
      setCodex({ installed: false, authenticated: false, info: null, loading: false });
    }
  }, [serverId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ---- disconnect handlers ---- */
  const handleDisconnect = useCallback(async (service: "github" | "claude" | "codex") => {
    const cmds: Record<string, string> = {
      github: "gh auth logout --hostname github.com -y 2>&1",
      claude: 'export PATH="$HOME/.local/bin:$PATH" && claude auth logout 2>&1',
      codex: 'export PATH="$HOME/.local/bin:$PATH" && codex auth logout 2>&1',
    };
    const confirmMsgs: Record<string, string> = {
      github: "Disconnect GitHub on this server?",
      claude: "Disconnect Claude Code on this server?",
      codex: "Disconnect Codex on this server?",
    };
    if (!window.confirm(confirmMsgs[service])) return;
    try {
      await executeCommandApi(serverId, cmds[service], 10);
    } catch {}
    fetchAll();
  }, [serverId, fetchAll]);

  /* ---- overlay close ---- */
  const handleOverlayClose = useCallback(() => {
    setOverlay(null);
    fetchAll();
  }, [fetchAll]);

  /* ---- status helpers ---- */
  const allLoading = github.loading && claude.loading && codex.loading;

  return (
    <>
      <div className="border-b border-canvas-border">
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
        >
          <FiLink size={13} className="text-canvas-muted" />
          <span className="flex-1 text-xs font-medium text-canvas-muted">Connections</span>
          {!allLoading && (
            <span className="text-[10px] text-canvas-muted">
              {[github, claude, codex].filter((c) => c.authenticated).length}/3
            </span>
          )}
          <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
        </button>
        <div className={`animate-collapse ${expanded ? "open" : ""}`}>
          <div className="collapse-inner">
            <div className="border-t border-canvas-border">
              {/* Refresh */}
              <div className="flex justify-end px-5 pt-3 pb-1">
                <button
                  type="button"
                  onClick={fetchAll}
                  className="flex items-center gap-1 text-[10px] text-canvas-muted transition-colors hover:text-canvas-fg"
                >
                  <FiRefreshCw size={10} className={allLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>

              {/* GitHub */}
              <ConnectionRow
                icon={<FiGithub size={15} />}
                iconBg="bg-[#0d1117] dark:bg-[#e8e8e8]"
                iconColor="text-white dark:text-[#0d1117]"
                name="GitHub"
                status={github}
                onConnect={() => setOverlay({ command: "gh auth login", title: "GitHub Auth" })}
                onDisconnect={() => handleDisconnect("github")}
              />

              {/* Claude Code */}
              <ConnectionRow
                icon={<img src="/images/claude.png" alt="Claude" width={15} height={15} className="pointer-events-none" draggable={false} />}
                iconBg="bg-[#C15F3C]"
                name="Claude Code"
                status={claude}
                onConnect={() => setOverlay({ command: 'export PATH="$HOME/.local/bin:$PATH" && claude auth login', title: "Claude Code Auth" })}
                onDisconnect={() => handleDisconnect("claude")}
                onUpdate={claude.installed ? async () => {
                  try {
                    await executeCommandApi(serverId, "npm update -g @anthropic-ai/claude-code 2>&1", 120);
                    fetchAll();
                  } catch {}
                } : undefined}
              />

              {/* Codex */}
              <ConnectionRow
                icon={<CodexIcon />}
                iconBg="bg-[#10a37f]"
                iconColor="text-white"
                name="Codex"
                status={codex}
                onConnect={() => setOverlay({ command: 'export PATH="$HOME/.local/bin:$PATH" && codex auth login', title: "Codex Auth" })}
                onDisconnect={() => handleDisconnect("codex")}
              />

              <div className="h-2" />
            </div>
          </div>
        </div>
      </div>

      {overlay && (
        <ClaudeCodeOverlay
          serverId={serverId}
          serverName={serverName}
          onClose={handleOverlayClose}
          initialCommand={overlay.command}
          title={overlay.title}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  ConnectionRow                                                      */
/* ------------------------------------------------------------------ */

function ConnectionRow({
  icon,
  iconBg,
  iconColor,
  name,
  status,
  onConnect,
  onDisconnect,
  onUpdate,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor?: string;
  name: string;
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  onUpdate?: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  const badge = status.loading
    ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
    : status.authenticated
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : status.installed
        ? "bg-gray-500/10 text-canvas-muted"
        : "bg-gray-500/10 text-canvas-muted";

  const badgeLabel = status.loading
    ? "Checking..."
    : status.authenticated
      ? "Connected"
      : status.installed
        ? "Not connected"
        : "Not installed";

  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      {/* Icon */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor ?? ""}`}>
        {icon}
      </div>

      {/* Name + info */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-canvas-fg">{name}</p>
        {status.info && (
          <p className="truncate text-[10px] text-canvas-muted">{status.info}</p>
        )}
      </div>

      {/* Badge */}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${badge}`}>
        {badgeLabel}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        {status.authenticated ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={status.loading}
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
          >
            Connect
          </button>
        )}
        {onUpdate && status.installed && (
          <button
            type="button"
            onClick={async () => {
              setUpdating(true);
              await onUpdate();
              setUpdating(false);
            }}
            disabled={updating}
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
          >
            {updating ? "..." : "Update"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Codex icon (simple OpenAI-style icon)                              */
/* ------------------------------------------------------------------ */

function CodexIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
