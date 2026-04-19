"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiActivity,
  FiRefreshCw,
  FiSquare,
  FiTerminal,
  FiPlay,
  FiGlobe,
  FiShield,
} from "react-icons/fi";
import { getUser } from "@/lib/auth";
import {
  fetchActiveProcessesApi,
  killProcessApi,
  stopDeploymentJobApi,
  cancelDeploymentJobApi,
  fetchActiveSslJobsApi,
  retrySslJobApi,
  cancelSslJobApi,
  retryDomainJobApi,
  cancelDomainJobApi,
  type ProcessMonitorResponse,
  type SslJob,
} from "@/lib/api";
import { useDomainJobs } from "@/lib/use-domain-jobs";
import { useServers } from "@/lib/use-servers";
import { DOMAIN_STEP_LABELS, SSL_STEP_LABELS } from "@/lib/ssl-labels";
import { showToast, ToastContainer } from "@/components/ui/toast";

const TYPE_BADGE: Record<string, string> = {
  TERMINAL: "bg-blue-500/10 text-blue-500",
  PERSISTENT: "bg-purple-500/10 text-purple-500",
  DEPLOYMENT: "bg-orange-500/10 text-orange-500",
};

const STATUS_BADGE: Record<string, string> = {
  CONNECTED: "bg-green-500/10 text-green-600 dark:text-green-400",
  BUFFERING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  DISCONNECTED: "bg-red-500/10 text-red-500 dark:text-red-400",
};

const JOB_STATUS_BADGE: Record<string, string> = {
  RUNNING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  PENDING: "bg-canvas-surface-hover text-canvas-muted",
  COMPLETED: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-500 dark:text-red-400",
  CANCELLED: "bg-canvas-surface-hover text-canvas-muted",
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function ProcessesPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getUser>>(null);
  const [data, setData] = useState<ProcessMonitorResponse | null>(null);
  const [sslJobs, setSslJobs] = useState<SslJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { jobs: domainJobs, track, refresh: refreshDomainJobs } = useDomainJobs();
  const { servers } = useServers();

  useEffect(() => {
    const u = getUser();
    setCurrentUser(u);
    if (u && u.role !== "ADMIN") router.replace("/");
  }, [router]);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const [processes, ssl] = await Promise.all([
        fetchActiveProcessesApi().catch(() => null),
        fetchActiveSslJobsApi().catch(() => [] as SslJob[]),
      ]);
      if (processes) setData(processes);
      setSslJobs(ssl);
    } catch { /* silent */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    refreshDomainJobs();
    const id = setInterval(() => { load(); refreshDomainJobs(); }, 5000);
    return () => clearInterval(id);
  }, [load, refreshDomainJobs]);

  // Make sure any active domain jobs we discovered are being tracked in the store.
  useEffect(() => {
    for (const j of domainJobs) {
      if (j.status === "RUNNING" && j.serverId) track(j.id, j.serverId);
    }
  }, [domainJobs, track]);

  const handleKill = useCallback(async (sessionId: string) => {
    if (!window.confirm("Kill this session? The SSH connection will be terminated.")) return;
    try {
      await killProcessApi(sessionId);
      showToast("Session killed", "success");
      load();
    } catch {
      showToast("Failed to kill session", "error");
    }
  }, [load]);

  const handleStopJob = useCallback(async (jobId: string) => {
    if (!window.confirm("Stop this deployment job?")) return;
    try {
      await stopDeploymentJobApi(jobId);
      showToast("Job stopped", "success");
      load();
    } catch {
      showToast("Failed to stop job", "error");
    }
  }, [load]);

  const handleCancelJob = useCallback(async (jobId: string) => {
    try {
      await cancelDeploymentJobApi(jobId);
      showToast("Job cancelled", "success");
      load();
    } catch {
      showToast("Failed to cancel job", "error");
    }
  }, [load]);

  const handleRetryDomain = useCallback(async (jobId: string) => {
    try {
      const job = await retryDomainJobApi(jobId);
      track(job.id, job.serverId);
      showToast("Domain job retried", "success");
    } catch {
      showToast("Failed to retry domain job", "error");
    }
  }, [track]);

  const handleCancelDomain = useCallback(async (jobId: string) => {
    if (!window.confirm("Cancel this domain assignment job?")) return;
    try {
      await cancelDomainJobApi(jobId);
      showToast("Domain job cancelled", "success");
      refreshDomainJobs();
    } catch {
      showToast("Failed to cancel domain job", "error");
    }
  }, [refreshDomainJobs]);

  const handleRetrySsl = useCallback(async (jobId: string) => {
    try {
      await retrySslJobApi(jobId);
      showToast("SSL job retried", "success");
      load();
    } catch {
      showToast("Failed to retry SSL job", "error");
    }
  }, [load]);

  const handleCancelSsl = useCallback(async (jobId: string) => {
    if (!window.confirm("Cancel this SSL job?")) return;
    try {
      await cancelSslJobApi(jobId);
      showToast("SSL job cancelled", "success");
      load();
    } catch {
      showToast("Failed to cancel SSL job", "error");
    }
  }, [load]);

  const serverById = (id: string | null | undefined) => servers.find((s) => s.id === id);

  if (!currentUser || currentUser.role !== "ADMIN") return null;

  const pendingDomainJobs = domainJobs.filter(
    (j) => j.status === "RUNNING" || j.status === "FAILED",
  );
  const activeSsl = sslJobs.filter((j) => j.status !== "COMPLETED");

  return (
    <div className="min-h-screen bg-canvas-bg pt-14">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-canvas-fg">Background Processes</h1>
            <p className="mt-0.5 text-xs text-canvas-muted">Sessions, deployment jobs, domain assignments, and SSL provisioning</p>
          </div>
          <button type="button" onClick={() => { load(true); refreshDomainJobs(); }} disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg disabled:opacity-50">
            <FiRefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
            <SummaryCard value={data.totalSessions} label="Sessions" icon={<FiTerminal size={14} />} />
            <SummaryCard value={data.activeSessions.filter((s) => s.type === "TERMINAL").length} label="Terminal" color="text-blue-500" />
            <SummaryCard value={data.activeSessions.filter((s) => s.type === "PERSISTENT").length} label="Persistent" color="text-purple-500" />
            <SummaryCard value={data.totalRunningJobs} label="Running Jobs" color="text-yellow-500" icon={<FiPlay size={14} />} />
            <SummaryCard value={pendingDomainJobs.length} label="Domain Jobs" color="text-yellow-500" icon={<FiGlobe size={14} />} />
            <SummaryCard value={activeSsl.length} label="SSL Jobs" color="text-green-500" icon={<FiShield size={14} />} />
          </div>
        )}

        {/* Active Sessions Table */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-canvas-fg">Active Sessions</h2>
          <div className="overflow-hidden rounded-lg border border-canvas-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-canvas-border bg-canvas-surface-hover/30">
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Type</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Server</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Status</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Duration</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">SSH</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">WebSocket</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Last Activity</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border">
                  {loading && !data ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-canvas-muted">Loading...</td></tr>
                  ) : !data || data.activeSessions.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-canvas-muted">No active sessions</td></tr>
                  ) : (
                    data.activeSessions.map((s) => (
                      <tr key={s.sessionId} className="transition-colors hover:bg-canvas-surface-hover/30">
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGE[s.type] ?? ""}`}>{s.type}</span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-canvas-fg">{s.serverName}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[s.status] ?? ""}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-canvas-muted">{formatDuration(s.durationSeconds)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${s.sshConnected ? "bg-green-400" : "bg-red-400"}`} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${s.hasWebSocket ? "bg-green-400" : "bg-gray-400"}`} />
                        </td>
                        <td className="px-4 py-2.5 text-canvas-muted">{formatAgo(s.lastActivityAt)}</td>
                        <td className="px-4 py-2.5">
                          <button type="button" onClick={() => handleKill(s.sessionId)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/10">
                            <FiSquare size={10} /> Kill
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Domain Assignment Jobs */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-canvas-fg flex items-center gap-2">
            <FiGlobe size={13} className="text-canvas-muted" />
            Domain Assignments
          </h2>
          <div className="overflow-hidden rounded-lg border border-canvas-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-canvas-border bg-canvas-surface-hover/30">
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Hostname</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Server</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Status</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Step</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Retry</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Started</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border">
                  {pendingDomainJobs.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-canvas-muted">No pending domain jobs</td></tr>
                  ) : (
                    pendingDomainJobs.map((j) => {
                      const srv = serverById(j.serverId);
                      return (
                        <tr key={j.id} className="transition-colors hover:bg-canvas-surface-hover/30">
                          <td className="px-4 py-2.5 font-mono text-canvas-fg">{j.hostname}</td>
                          <td className="px-4 py-2.5">
                            {srv ? (
                              <Link href={`/?servers=${srv.id}`} className="text-canvas-fg underline-offset-2 hover:underline">{srv.name}</Link>
                            ) : (
                              <span className="text-canvas-muted">{j.serverId ? j.serverId.slice(0, 8) : "—"}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${JOB_STATUS_BADGE[j.status] ?? ""}`}>
                              {j.status === "RUNNING" && <span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-current" />}
                              {j.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-canvas-muted">{DOMAIN_STEP_LABELS[j.currentStep] ?? j.currentStep}</td>
                          <td className="px-4 py-2.5 text-canvas-muted">{j.retryCount}/{j.maxRetries}</td>
                          <td className="px-4 py-2.5 text-canvas-muted">{formatAgo(j.startedAt)}</td>
                          <td className="px-4 py-2.5 space-x-1">
                            {j.status === "RUNNING" && (
                              <button type="button" onClick={() => handleCancelDomain(j.id)}
                                className="rounded-md px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-500/10">Cancel</button>
                            )}
                            {j.status === "FAILED" && j.currentStep === "FAILED_RETRYABLE" && (
                              <button type="button" onClick={() => handleRetryDomain(j.id)}
                                className="rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">Retry</button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* SSL Provisioning Jobs */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-canvas-fg flex items-center gap-2">
            <FiShield size={13} className="text-canvas-muted" />
            SSL Provisioning
          </h2>
          <div className="overflow-hidden rounded-lg border border-canvas-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-canvas-border bg-canvas-surface-hover/30">
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Hostname</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Step</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Status</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Retry</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Started</th>
                    <th className="px-4 py-2.5 font-medium text-canvas-muted">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border">
                  {activeSsl.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-canvas-muted">No active SSL jobs</td></tr>
                  ) : (
                    activeSsl.map((j) => (
                      <tr key={j.id} className="transition-colors hover:bg-canvas-surface-hover/30">
                        <td className="px-4 py-2.5 font-mono text-canvas-fg">{j.hostname}</td>
                        <td className="px-4 py-2.5 text-canvas-muted">{SSL_STEP_LABELS[j.currentStep] ?? j.currentStep}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${JOB_STATUS_BADGE[j.status] ?? ""}`}>
                            {j.status === "RUNNING" && <span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-current" />}
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-canvas-muted">{j.retryCount}</td>
                        <td className="px-4 py-2.5 text-canvas-muted">{formatAgo(j.startedAt)}</td>
                        <td className="px-4 py-2.5 space-x-1">
                          {j.status === "RUNNING" && (
                            <button type="button" onClick={() => handleCancelSsl(j.id)}
                              className="rounded-md px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-500/10">Cancel</button>
                          )}
                          {j.status === "FAILED" && j.currentStep === "FAILED_RETRYABLE" && (
                            <button type="button" onClick={() => handleRetrySsl(j.id)}
                              className="rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">Retry</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Running Jobs Table (deployment) */}
        {data && data.runningJobs.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-medium text-canvas-fg">Running / Pending Deployment Jobs</h2>
            <div className="overflow-hidden rounded-lg border border-canvas-border">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-canvas-border bg-canvas-surface-hover/30">
                      <th className="px-4 py-2.5 font-medium text-canvas-muted">Script</th>
                      <th className="px-4 py-2.5 font-medium text-canvas-muted">Status</th>
                      <th className="px-4 py-2.5 font-medium text-canvas-muted">Type</th>
                      <th className="px-4 py-2.5 font-medium text-canvas-muted">Started</th>
                      <th className="px-4 py-2.5 font-medium text-canvas-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-canvas-border">
                    {data.runningJobs.map((j) => (
                      <tr key={j.id} className="transition-colors hover:bg-canvas-surface-hover/30">
                        <td className="px-4 py-2.5 font-medium text-canvas-fg">{j.scriptName ?? "Unknown"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${JOB_STATUS_BADGE[j.status] ?? ""}`}>
                            {j.status === "RUNNING" && <span className="mr-1 inline-block h-1 w-1 animate-pulse rounded-full bg-current" />}
                            {j.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-canvas-muted">{j.interactive ? "Interactive" : "Background"}</td>
                        <td className="px-4 py-2.5 text-canvas-muted">{formatAgo(j.startedAt)}</td>
                        <td className="px-4 py-2.5">
                          {j.status === "RUNNING" && (
                            <button type="button" onClick={() => handleStopJob(j.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/10">
                              <FiSquare size={10} /> Stop
                            </button>
                          )}
                          {j.status === "PENDING" && (
                            <button type="button" onClick={() => handleCancelJob(j.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover">
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Auto-refresh indicator */}
        <p className="mt-4 text-[10px] text-canvas-muted">
          <FiActivity size={10} className="mr-1 inline" />
          Auto-refreshing every 5 seconds
        </p>
      </div>
      <ToastContainer />
    </div>
  );
}

function SummaryCard({ value, label, color, icon }: { value: number; label: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3 text-center">
      <div className="flex items-center justify-center gap-1.5">
        {icon && <span className={color ?? "text-canvas-muted"}>{icon}</span>}
        <span className={`text-xl font-bold tabular-nums ${color ?? "text-canvas-fg"}`}>{value}</span>
      </div>
      <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-canvas-muted">{label}</p>
    </div>
  );
}
