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

const GOOGLE_CMD = [
  // Check if workspace-mcp is installed
  'pip show workspace-mcp 2>/dev/null | grep -q Name && echo "INSTALLED" || echo "NOT_FOUND"',
  'echo "---GOOG_SEP---"',
  // Check for OAuth tokens
  'ls ~/.workspace-mcp/cli-tokens/ 2>/dev/null | head -1 || echo "NO_TOKENS"',
  'echo "---GOOG_SEP---"',
  // Check if configured in Claude Code MCP
  `python3 -c "import json,os; d=json.load(open(os.path.expanduser('~/.claude.json'))); print('CONFIGURED' if any('workspace' in k.lower() or 'google' in k.lower() for k in d.get('mcpServers',{})) else 'NOT_CONFIGURED')" 2>/dev/null || echo "NOT_CONFIGURED"`,
].join("; ");

/**
 * Google Workspace setup script for interactive terminal.
 * Reads GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET from
 * /etc/clawops/google-oauth.env on the managed server.
 * Set these during server provisioning.
 */
const GOOGLE_SETUP_SCRIPT = [
  'export PATH="$HOME/.local/bin:$PATH"',
  // Load org OAuth credentials from server config
  'if [ -f /etc/clawops/google-oauth.env ]; then . /etc/clawops/google-oauth.env; fi',
  // Verify credentials are set
  'if [ -z "$GOOGLE_OAUTH_CLIENT_ID" ] || [ -z "$GOOGLE_OAUTH_CLIENT_SECRET" ]; then echo "ERROR: Google OAuth credentials not configured on this server."; echo "Create /etc/clawops/google-oauth.env with:"; echo "  export GOOGLE_OAUTH_CLIENT_ID=your-client-id"; echo "  export GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret"; exit 1; fi',
  // Install if needed
  'if ! pip show workspace-mcp >/dev/null 2>&1; then echo "Installing Google Workspace MCP..."; pip install workspace-mcp; fi',
  // Add MCP config to ~/.claude.json if not present
  `python3 -c "
import json, os
p = os.path.expanduser('~/.claude.json')
d = json.load(open(p)) if os.path.exists(p) else {}
if 'mcpServers' not in d:
    d['mcpServers'] = {}
if 'google_workspace' not in d['mcpServers']:
    cid = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
    csec = os.environ.get('GOOGLE_OAUTH_CLIENT_SECRET', '')
    d['mcpServers']['google_workspace'] = {
        'command': 'uvx',
        'args': ['workspace-mcp', '--tool-tier', 'core'],
        'env': {
            'GOOGLE_OAUTH_CLIENT_ID': cid,
            'GOOGLE_OAUTH_CLIENT_SECRET': csec
        }
    }
    json.dump(d, open(p, 'w'), indent=2)
    print('MCP config added to ~/.claude.json')
else:
    print('MCP config already exists')
"`,
  // Run interactive OAuth
  'echo ""',
  'echo "Starting Google OAuth..."',
  'echo "A URL will appear — open it in your browser and paste the code back here."',
  'echo ""',
  'workspace-cli auth',
].join(" && ");

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConnectionsSection({ serverId, serverName }: ConnectionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [github, setGithub] = useState<ConnectionStatus>(EMPTY);
  const [claude, setClaude] = useState<ConnectionStatus>(EMPTY);
  const [codex, setCodex] = useState<ConnectionStatus>(EMPTY);
  const [google, setGoogle] = useState<ConnectionStatus>(EMPTY);

  /* ---- overlay for interactive auth ---- */
  const [overlay, setOverlay] = useState<{ command: string; title: string } | null>(null);

  /* ---- fetch all statuses ---- */
  const fetchAll = useCallback(async () => {
    setGithub((s) => ({ ...s, loading: true }));
    setClaude((s) => ({ ...s, loading: true }));
    setCodex((s) => ({ ...s, loading: true }));
    setGoogle((s) => ({ ...s, loading: true }));

    // Run all four in parallel
    const [ghResult, ccResult, cxResult, googResult] = await Promise.allSettled([
      executeCommandApi(serverId, GH_CMD, 10),
      executeCommandApi(serverId, CLAUDE_CMD, 15),
      executeCommandApi(serverId, CODEX_CMD, 15),
      executeCommandApi(serverId, GOOGLE_CMD, 15),
    ]);

    // Parse GitHub
    if (ghResult.status === "fulfilled") {
      const parts = ghResult.value.stdout.split("---GH_SEP---");
      const ghStatus = (parts[0] ?? "").trim();
      const gitName = (parts[1] ?? "").trim() || null;
      const gitEmail = (parts[2] ?? "").trim() || null;
      const ghMatch = ghStatus.match(/Logged in to github\.com (?:as |account )(\S+)/i);
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

    // Parse Google Workspace
    if (googResult.status === "fulfilled") {
      const parts = googResult.value.stdout.split("---GOOG_SEP---");
      const installRaw = (parts[0] ?? "").trim();
      const tokensRaw = (parts[1] ?? "").trim();
      const configRaw = (parts[2] ?? "").trim();
      const installed = installRaw === "INSTALLED";
      const hasTokens = tokensRaw !== "NO_TOKENS" && tokensRaw.length > 0;
      const configured = configRaw === "CONFIGURED";
      if (installed && hasTokens) {
        setGoogle({ installed: true, authenticated: true, info: configured ? "MCP configured" : "Tokens present", loading: false });
      } else if (installed) {
        setGoogle({ installed: true, authenticated: false, info: configured ? "MCP configured, no tokens" : null, loading: false });
      } else {
        setGoogle({ installed: false, authenticated: false, info: null, loading: false });
      }
    } else {
      setGoogle({ installed: false, authenticated: false, info: null, loading: false });
    }
  }, [serverId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /* ---- disconnect handlers ---- */
  const handleDisconnect = useCallback(async (service: "github" | "claude" | "codex" | "google") => {
    if (service === "github") {
      // gh auth logout is interactive (prompts for account selection)
      setOverlay({ command: "gh auth logout", title: "GitHub Logout" });
      return;
    }
    const cmds: Record<string, string> = {
      claude: 'export PATH="$HOME/.local/bin:$PATH" && claude auth logout 2>&1',
      codex: 'export PATH="$HOME/.local/bin:$PATH" && codex auth logout 2>&1',
      google: 'rm -rf ~/.workspace-mcp/cli-tokens/ 2>/dev/null && echo "Google tokens removed"',
    };
    const confirmMsgs: Record<string, string> = {
      claude: "Disconnect Claude Code on this server?",
      codex: "Disconnect Codex on this server?",
      google: "Disconnect Google Workspace on this server? This removes stored OAuth tokens.",
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
  const allLoading = github.loading && claude.loading && codex.loading && google.loading;
  const allConnections = [github, claude, codex, google];

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
              {allConnections.filter((c) => c.authenticated).length}/{allConnections.length}
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
                onUpdate={claude.installed ? () => {
                  setOverlay({ command: 'export PATH="$HOME/.local/bin:$PATH" && claude update', title: "Claude Code Update" });
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

              {/* Google Workspace */}
              <ConnectionRow
                icon={<GoogleIcon />}
                iconBg="bg-white dark:bg-white"
                name="Google Workspace"
                status={google}
                onConnect={() => setOverlay({ command: GOOGLE_SETUP_SCRIPT, title: "Google Workspace Setup" })}
                onDisconnect={() => handleDisconnect("google")}
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
          forceNew
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

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
