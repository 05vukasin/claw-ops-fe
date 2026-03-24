"use client";

import { useCallback, useState } from "react";
import {
  testConnectionApi,
  provisionSslApi,
  renewSslApi,
  deleteServerApi,
  ApiError,
  type Server,
  type SslCertificate,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Status badge colours                                               */
/* ------------------------------------------------------------------ */

const STATUS_STYLE: Record<string, string> = {
  ONLINE: "bg-green-500/10 text-green-600 dark:text-green-400",
  OFFLINE: "bg-red-500/10 text-red-500 dark:text-red-400",
  UNKNOWN: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  ERROR: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

const SSL_STYLE: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-500 dark:text-red-400",
  PROVISIONING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  EXPIRED: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  PENDING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  REMOVING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ServerTableProps {
  servers: Server[];
  sslMap: Record<string, SslCertificate>;
  onEdit: (server: Server) => void;
  onRefresh: () => void;
  onAlert: (msg: string, type: "success" | "error") => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ServerTable({ servers, sslMap, onEdit, onRefresh, onAlert }: ServerTableProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleTest = useCallback(
    async (id: string) => {
      setBusyAction(`test-${id}`);
      try {
        const data = await testConnectionApi(id);
        if (data.success) {
          onAlert(`Connection OK${data.latencyMs ? ` (${data.latencyMs}ms)` : ""}`, "success");
        } else {
          onAlert(data.message || "Connection failed", "error");
        }
      } catch (err) {
        onAlert(err instanceof ApiError ? err.message : "Test failed", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [onAlert],
  );

  const handleDelete = useCallback(
    async (server: Server) => {
      if (!window.confirm(`Delete server "${server.name}"? This cannot be undone.`)) return;
      setBusyAction(`delete-${server.id}`);
      try {
        await deleteServerApi(server.id);
        onAlert("Server deleted", "success");
        onRefresh();
      } catch (err) {
        onAlert(err instanceof ApiError ? err.message : "Failed to delete server", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [onAlert, onRefresh],
  );

  const handleProvisionSsl = useCallback(
    async (serverId: string) => {
      setBusyAction(`ssl-${serverId}`);
      try {
        await provisionSslApi(serverId);
        onAlert("SSL certificate provisioned", "success");
        onRefresh();
      } catch (err) {
        onAlert(err instanceof ApiError ? err.message : "SSL provisioning failed", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [onAlert, onRefresh],
  );

  const handleRenewSsl = useCallback(
    async (certId: string) => {
      setBusyAction(`ssl-renew-${certId}`);
      try {
        await renewSslApi(certId);
        onAlert("SSL certificate renewed", "success");
        onRefresh();
      } catch (err) {
        onAlert(err instanceof ApiError ? err.message : "SSL renewal failed", "error");
      } finally {
        setBusyAction(null);
      }
    },
    [onAlert, onRefresh],
  );

  if (servers.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-canvas-muted">
        No servers found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-canvas-border">
            <Th>Name</Th>
            <Th>Host</Th>
            <Th>Domain</Th>
            <Th>Port</Th>
            <Th>Environment</Th>
            <Th>Auth</Th>
            <Th>Status</Th>
            <Th>SSL</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => {
            const ssl = sslMap[s.id] ?? null;
            const authLabel =
              s.authType === "PASSWORD"
                ? "Password"
                : s.passphraseCredentialId
                  ? "Key + Passphrase"
                  : "Private Key";

            return (
              <tr
                key={s.id}
                className="border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50"
              >
                {/* Name */}
                <td className="px-4 py-3 font-medium text-canvas-fg whitespace-nowrap">{s.name}</td>

                {/* Host */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono text-xs text-canvas-muted">{s.hostname || s.ipAddress}</span>
                </td>

                {/* Domain */}
                <td className="px-4 py-3 whitespace-nowrap">
                  {s.assignedDomain ? (
                    <span className="font-mono text-xs text-canvas-muted">{s.assignedDomain}</span>
                  ) : (
                    <span className="text-canvas-muted/50">&mdash;</span>
                  )}
                </td>

                {/* Port */}
                <td className="px-4 py-3 text-canvas-muted">{s.sshPort}</td>

                {/* Environment */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge className="bg-canvas-surface-hover text-canvas-muted">
                    {s.environment || "default"}
                  </Badge>
                </td>

                {/* Auth */}
                <td className="px-4 py-3 text-xs text-canvas-muted">{authLabel}</td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge className={STATUS_STYLE[s.status] ?? STATUS_STYLE.UNKNOWN}>
                    {s.status}
                  </Badge>
                </td>

                {/* SSL */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <SslCell
                    server={s}
                    ssl={ssl}
                    busy={busyAction?.startsWith("ssl")}
                    onProvision={handleProvisionSsl}
                    onRenew={handleRenewSsl}
                  />
                </td>

                {/* Actions */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <GhostBtn
                      onClick={() => handleTest(s.id)}
                      disabled={busyAction === `test-${s.id}`}
                    >
                      {busyAction === `test-${s.id}` ? "Testing..." : "Test"}
                    </GhostBtn>
                    <GhostBtn onClick={() => onEdit(s)}>Edit</GhostBtn>
                    <GhostBtn
                      onClick={() => handleDelete(s)}
                      disabled={busyAction === `delete-${s.id}`}
                      danger
                    >
                      {busyAction === `delete-${s.id}` ? "..." : "Delete"}
                    </GhostBtn>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Sub-components ── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">
      {children}
    </th>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
        danger
          ? "text-red-500 hover:bg-red-500/5 dark:text-red-400 dark:hover:bg-red-400/5"
          : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {children}
    </button>
  );
}

function SslCell({
  server,
  ssl,
  busy,
  onProvision,
  onRenew,
}: {
  server: Server;
  ssl: SslCertificate | null;
  busy?: boolean;
  onProvision: (serverId: string) => void;
  onRenew: (certId: string) => void;
}) {
  if (ssl) {
    return (
      <div className="flex items-center gap-1.5">
        <Badge className={SSL_STYLE[ssl.status] ?? SSL_STYLE.PENDING}>
          {ssl.status}
        </Badge>
        {ssl.status === "ACTIVE" && (
          <GhostBtn onClick={() => onRenew(ssl.id)} disabled={busy}>Renew</GhostBtn>
        )}
        {ssl.status === "FAILED" && (
          <GhostBtn onClick={() => onProvision(server.id)} disabled={busy}>Retry</GhostBtn>
        )}
      </div>
    );
  }

  if (server.assignedDomain) {
    return (
      <GhostBtn onClick={() => onProvision(server.id)} disabled={busy}>
        Provision
      </GhostBtn>
    );
  }

  return <span className="text-canvas-muted/50">&mdash;</span>;
}
