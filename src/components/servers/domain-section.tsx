"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronRight,
  FiGlobe,
  FiShield,
  FiRefreshCw,
  FiTrash2,
  FiCheckCircle,
  FiActivity,
  FiClock,
  FiWifi,
} from "react-icons/fi";
import {
  ApiError,
  fetchAssignmentForServer,
  fetchSslForServer,
  fetchSslJobApi,
  fetchSslAuditLogApi,
  fetchSslProbeApi,
  fetchZonesApi,
  provisionSslApi,
  renewSslApi,
  retrySslJobApi,
  checkSslStatusApi,
  deleteSslCertificateApi,
  cancelSslJobApi,
  verifyAssignmentApi,
  releaseAssignmentApi,
  assignDomainToServerApi,
  retryDomainJobApi,
  cancelDomainJobApi,
  type Server,
  type SslCertificate,
  type SslJob,
  type SslProbeResponse,
  type AuditLogEntry,
  type DomainAssignment,
  type Zone,
} from "@/lib/api";
import { useDomainJobs, trackDomainJob } from "@/lib/use-domain-jobs";
import { useSslJobs, trackSslJob } from "@/lib/use-ssl-jobs";
import {
  SSL_BADGE,
  SSL_STEP_LABELS,
  ASSIGN_STYLE,
  DOMAIN_STEP_LABELS,
  formatSslExpiry,
} from "@/lib/ssl-labels";
import { SslLogPanel } from "./ssl-log-panel";
import { SslLogViewer } from "./ssl-log-viewer";
import { DomainLogPanel } from "./domain-log-panel";

interface DomainSectionProps {
  server: Server;
  /** Incremented by parent to request focus: expand + scroll into view. */
  focusSslTick?: number;
}

function makeSslStub(serverId: string, overrides: Partial<SslCertificate>): SslCertificate {
  return {
    id: "", serverId, assignmentId: null, hostname: null, status: "PENDING",
    adminEmail: null, targetPort: null, expiresAt: null, lastRenewedAt: null,
    lastError: null, provisioningJobId: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

export function DomainSection({ server, focusSslTick }: DomainSectionProps) {
  const [expanded, setExpanded] = useState(false);
  // Lazy-mount the body on first expansion to keep initial panel render cheap; after first
  // open we leave it mounted so the collapse animation works.
  const hasEverExpandedRef = useRef(expanded);
  if (expanded) hasEverExpandedRef.current = true;
  const rootRef = useRef<HTMLDivElement>(null);

  // Parent requests focus (typically the header SSL badge was clicked) — expand + scroll.
  useEffect(() => {
    if (focusSslTick == null || focusSslTick === 0) return;
    setExpanded(true);
    // Defer scroll until after expand animation starts
    setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [focusSslTick]);

  // ── Domain assignment state ──
  const [assignment, setAssignment] = useState<DomainAssignment | null>(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [hostnameOverride, setHostnameOverride] = useState("");
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [showDomainLog, setShowDomainLog] = useState(false);

  // ── SSL state ──
  const [ssl, setSsl] = useState<SslCertificate | null>(null);
  const [sslLoading, setSslLoading] = useState(false);
  const [sslJob, setSslJob] = useState<SslJob | null>(null);
  const [showSslLog, setShowSslLog] = useState(false);
  const [showSslViewer, setShowSslViewer] = useState(false);
  const [sslTargetPort, setSslTargetPort] = useState("443");

  // Probe
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<SslProbeResponse | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Audit log drawer
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);

  // Live SSL job state from the shared store (used for the "pending SSL without cert" branch)
  const { jobs: allSslJobs } = useSslJobs();
  const liveSslJob = allSslJobs.find((j) => j.serverId === server.id && j.status === "RUNNING") ?? null;
  // The job displayed in the log panel — prefer our polled copy, fall back to the store copy.
  const currentSslJob = sslJob ?? liveSslJob;

  const pollSslRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sslLoadedRef = useRef(false);
  const assignmentLoadedRef = useRef(false);

  // ── Domain job live state from store ──
  const { jobs: domainJobs } = useDomainJobs();
  const activeDomainJob = domainJobs.find((j) =>
    (assignment && j.domainAssignmentId === assignment.id) || j.serverId === server.id,
  );

  /* ---- Load domain assignment (once per server) ---- */
  useEffect(() => {
    if (assignmentLoadedRef.current) return;
    assignmentLoadedRef.current = true;
    fetchAssignmentForServer(server.id)
      .then((a) => {
        if (a) {
          setAssignment({
            id: a.id,
            hostname: a.hostname,
            recordType: "A",
            targetValue: "",
            zoneName: null,
            zoneId: "",
            resourceId: server.id,
            status: a.status as DomainAssignment["status"],
            createdAt: "",
          });
        }
        setAssignmentLoaded(true);
      })
      .catch(() => setAssignmentLoaded(true));
  }, [server.id]);

  /* ---- Bootstrap tracking of the pending job if backend gave us one ---- */
  useEffect(() => {
    if (server.pendingDomainJobId) {
      trackDomainJob(server.pendingDomainJobId, server.id);
    }
  }, [server.pendingDomainJobId, server.id]);

  /* ---- When a domain job completes, refresh assignment ---- */
  useEffect(() => {
    if (!activeDomainJob) return;
    if (activeDomainJob.status === "COMPLETED") {
      // Re-fetch authoritative assignment state.
      fetchAssignmentForServer(server.id).then((a) => {
        if (a) {
          setAssignment((prev) => ({
            ...(prev ?? {
              id: a.id,
              hostname: a.hostname,
              recordType: "A",
              targetValue: "",
              zoneName: null,
              zoneId: "",
              resourceId: server.id,
              status: "VERIFIED" as const,
              createdAt: "",
            }),
            id: a.id,
            hostname: a.hostname,
            status: a.status as DomainAssignment["status"],
          }));
        }
      }).catch(() => {});
    }
  }, [activeDomainJob?.status, activeDomainJob?.id, server.id]);

  /* ---- Load zones lazily when user opens picker ---- */
  const loadZones = useCallback(() => {
    if (zones.length > 0) return;
    fetchZonesApi().then(setZones).catch(() => {});
  }, [zones.length]);

  /* ---- Load SSL (once) ---- */
  useEffect(() => {
    if (sslLoadedRef.current) return;
    sslLoadedRef.current = true;
    if (!server.assignedDomain) return;
    fetchSslForServer(server.id).then((cert) => {
      if (!cert) return;
      setSsl(cert);
      if (cert.provisioningJobId && (cert.status === "PROVISIONING" || cert.status === "PENDING")) {
        setShowSslLog(true);
        pollSslJob(cert.provisioningJobId);
      }
    }).catch(() => {});
  }, [server.id, server.assignedDomain]);

  /* ---- SSL polling (mirrors existing behaviour) ---- */
  useEffect(() => () => {
    if (pollSslRef.current) clearTimeout(pollSslRef.current);
  }, []);

  const pollSslJob = useCallback((jobId: string) => {
    if (pollSslRef.current) clearTimeout(pollSslRef.current);
    const poll = async () => {
      try {
        const job = await fetchSslJobApi(jobId);
        setSslJob(job);
        if (job.status === "COMPLETED") {
          try {
            const updated = await fetchSslForServer(server.id);
            if (updated) setSsl(updated);
            else setSsl(makeSslStub(server.id, { status: "ACTIVE", provisioningJobId: jobId }));
          } catch {
            setSsl(makeSslStub(server.id, { status: "ACTIVE", provisioningJobId: jobId }));
          }
          return;
        }
        if (job.status === "FAILED") {
          setSsl((prev) => prev
            ? { ...prev, status: "FAILED", lastError: job.errorMessage, provisioningJobId: jobId }
            : makeSslStub(server.id, { status: "FAILED", lastError: job.errorMessage, provisioningJobId: jobId }),
          );
          return;
        }
        pollSslRef.current = setTimeout(poll, 2000);
      } catch {
        pollSslRef.current = setTimeout(poll, 3000);
      }
    };
    poll();
  }, [server.id]);

  /* ---- Actions: Domain ---- */
  const handleAssignDomain = useCallback(async () => {
    if (!zoneId) {
      setAssignError("Select a zone.");
      return;
    }
    setAssignBusy(true);
    setAssignError("");
    try {
      const a = await assignDomainToServerApi(server.id, zoneId, hostnameOverride.trim() || undefined);
      setAssignment(a);
      if (a.latestJobId) {
        trackDomainJob(a.latestJobId, server.id);
        setShowDomainLog(true);
      }
      setZoneId("");
      setHostnameOverride("");
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Failed to assign domain.");
    }
    setAssignBusy(false);
  }, [zoneId, hostnameOverride, server.id]);

  const handleVerifyDomain = useCallback(async () => {
    if (!assignment) return;
    try {
      const r = await verifyAssignmentApi(assignment.id);
      setAssignment({ ...assignment, status: r.status as DomainAssignment["status"] });
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Verify failed.");
    }
  }, [assignment]);

  const handleReleaseDomain = useCallback(async () => {
    if (!assignment) return;
    if (!window.confirm(`Release domain "${assignment.hostname}"? The DNS record will be deleted.`)) return;
    try {
      await releaseAssignmentApi(assignment.id);
      setAssignment(null);
      setSsl(null);
      setShowDomainLog(false);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Release failed.");
    }
  }, [assignment]);

  const handleRetryDomainJob = useCallback(async () => {
    if (!activeDomainJob) return;
    try {
      const job = await retryDomainJobApi(activeDomainJob.id);
      trackDomainJob(job.id, server.id);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Retry failed.");
    }
  }, [activeDomainJob, server.id]);

  const handleCancelDomainJob = useCallback(async () => {
    if (!activeDomainJob) return;
    if (!window.confirm("Cancel the domain assignment job?")) return;
    try {
      await cancelDomainJobApi(activeDomainJob.id);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Cancel failed.");
    }
  }, [activeDomainJob]);

  /* ---- Actions: SSL ---- */
  const handleProvisionSsl = useCallback(async () => {
    setSslLoading(true);
    try {
      const port = parseInt(sslTargetPort, 10) || undefined;
      const job = await provisionSslApi(server.id, port);
      if (job) {
        setSsl(makeSslStub(server.id, { status: "PROVISIONING", provisioningJobId: job.id }));
        setSslJob(job);
        setShowSslLog(true);
        pollSslJob(job.id);
        // Share with the global store so server-node + processes page see it too.
        trackSslJob(job.id, server.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const isAlreadyRunning = err.status === 422 || err.status === 409;
        setSsl((prev) => prev
          ? { ...prev, status: isAlreadyRunning ? "PROVISIONING" : "FAILED", lastError: err.message }
          : makeSslStub(server.id, { status: isAlreadyRunning ? "PROVISIONING" : "FAILED", lastError: err.message }),
        );
      }
    }
    setSslLoading(false);
  }, [server.id, sslTargetPort, pollSslJob]);

  /* ---- TLS probe ---- */
  const handleProbe = useCallback(async () => {
    if (!ssl) return;
    setProbing(true);
    setProbeError(null);
    try {
      const r = await fetchSslProbeApi(ssl.id);
      setProbeResult(r);
    } catch (err) {
      setProbeError(err instanceof ApiError ? err.message : "Probe failed.");
    }
    setProbing(false);
  }, [ssl]);

  /* ---- Audit log ---- */
  const loadAudit = useCallback(async () => {
    if (!ssl) return;
    setAuditLoading(true);
    try {
      const page = await fetchSslAuditLogApi(ssl.id, 0, 25);
      setAuditEntries(page.content);
    } catch { /* silent */ }
    setAuditLoading(false);
  }, [ssl]);

  const toggleAudit = useCallback(() => {
    setAuditOpen((prev) => {
      if (!prev) loadAudit();
      return !prev;
    });
  }, [loadAudit]);

  const handleRenewSsl = useCallback(async () => {
    if (!ssl) return;
    setSslLoading(true);
    try {
      await renewSslApi(ssl.id);
      const updated = await fetchSslForServer(server.id);
      setSsl(updated);
    } catch (err) {
      if (err instanceof ApiError) setSsl((prev) => prev ? { ...prev, lastError: err.message } : prev);
    }
    setSslLoading(false);
  }, [ssl, server.id]);

  const handleViewSslLog = useCallback(async (jobId: string) => {
    setShowSslLog(true);
    try {
      const job = await fetchSslJobApi(jobId);
      setSslJob(job);
      if (job.status !== "COMPLETED" && job.status !== "FAILED") pollSslJob(jobId);
    } catch {
      pollSslJob(jobId);
    }
  }, [pollSslJob]);

  const handleRetrySslJob = useCallback(async () => {
    if (!sslJob) return;
    try {
      const job = await retrySslJobApi(sslJob.id);
      setSslJob(job);
      pollSslJob(job.id);
    } catch (err) {
      if (err instanceof ApiError) setSslJob((prev) => prev ? { ...prev, status: "FAILED", errorMessage: err.message } : prev);
    }
  }, [sslJob, pollSslJob]);

  const handleCheckSsl = useCallback(async () => {
    if (!ssl) return;
    setSslLoading(true);
    try {
      const updated = await checkSslStatusApi(ssl.id);
      setSsl(updated);
    } catch (err) {
      if (err instanceof ApiError) setSsl((prev) => prev ? { ...prev, lastError: err.message } : prev);
    }
    setSslLoading(false);
  }, [ssl]);

  const handleDeleteSsl = useCallback(async () => {
    if (!ssl) return;
    if (!window.confirm("Remove SSL certificate? This will delete the certificate from the server and revoke it.")) return;
    setSslLoading(true);
    try {
      await deleteSslCertificateApi(ssl.id);
      setSsl(null);
      setSslJob(null);
      setShowSslLog(false);
      if (pollSslRef.current) { clearTimeout(pollSslRef.current); pollSslRef.current = null; }
    } catch (err) {
      if (err instanceof ApiError) setSsl((prev) => prev ? { ...prev, lastError: err.message } : prev);
    }
    setSslLoading(false);
  }, [ssl]);

  const handleCancelSslJob = useCallback(async () => {
    if (!sslJob) return;
    if (!window.confirm("Cancel SSL provisioning? This will stop the current job.")) return;
    try {
      await cancelSslJobApi(sslJob.id);
      if (pollSslRef.current) { clearTimeout(pollSslRef.current); pollSslRef.current = null; }
      const cert = await fetchSslForServer(server.id);
      setSsl(cert);
      setSslJob(null);
      setShowSslLog(false);
    } catch (err) {
      if (err instanceof ApiError) setSslJob((prev) => prev ? { ...prev, errorMessage: err.message } : prev);
    }
  }, [sslJob, server.id]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  const domainPending =
    !assignment &&
    (activeDomainJob || server.pendingDomainJobId);
  const domainVerified =
    assignment && (assignment.status === "VERIFIED" || assignment.status === "ACTIVE" || assignment.status === "DNS_CREATED");

  return (
    <div ref={rootRef} className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiGlobe size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">Domain &amp; SSL</span>
        {/* Live status hint in the header while collapsed */}
        {!expanded && assignment && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ASSIGN_STYLE[assignment.status] ?? ASSIGN_STYLE.REQUESTED}`}>
            {assignment.status}
          </span>
        )}
        {!expanded && !assignment && domainPending && (
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
            PENDING
          </span>
        )}
        {!expanded && ssl && ssl.status === "ACTIVE" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
            <FiShield size={10} /> SSL
          </span>
        )}
        <FiChevronRight size={14} className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          {hasEverExpandedRef.current && (
          <div className="border-t border-canvas-border px-5 py-4 space-y-4">

            {/* ── A. Pending domain job, no assignment yet ── */}
            {!assignment && domainPending && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FiGlobe size={13} className="text-canvas-muted" />
                  <p className="text-xs font-medium text-canvas-fg">
                    Assigning subdomain…
                  </p>
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400" />
                </div>
                {activeDomainJob && (
                  <p className="text-[11px] text-canvas-muted">
                    {DOMAIN_STEP_LABELS[activeDomainJob.currentStep] ?? activeDomainJob.currentStep}
                    {activeDomainJob.hostname ? ` — ${activeDomainJob.hostname}` : ""}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <ActionBtn onClick={() => setShowDomainLog((v) => !v)}>{showDomainLog ? "Hide Log" : "View Log"}</ActionBtn>
                  {activeDomainJob && activeDomainJob.status === "RUNNING" && (
                    <ActionBtn onClick={handleCancelDomainJob}>Cancel</ActionBtn>
                  )}
                </div>
                {showDomainLog && activeDomainJob && (
                  <DomainLogPanel
                    job={activeDomainJob}
                    onRetry={handleRetryDomainJob}
                    onCancel={handleCancelDomainJob}
                    onClose={() => setShowDomainLog(false)}
                  />
                )}
              </div>
            )}

            {/* ── B. No assignment, no pending job — assign flow ── */}
            {assignmentLoaded && !assignment && !domainPending && (
              <div className="space-y-3" onFocus={loadZones} onClick={loadZones}>
                <p className="text-[11px] text-canvas-muted">No domain assigned.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className="rounded-md border border-canvas-border bg-transparent px-2 py-1.5 text-xs text-canvas-fg focus:outline-none"
                  >
                    <option value="">Select a zone...</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.zoneName}{z.defaultForAutoAssign ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Hostname override (optional)"
                    value={hostnameOverride}
                    onChange={(e) => setHostnameOverride(e.target.value)}
                    className="rounded-md border border-canvas-border bg-transparent px-2 py-1.5 font-mono text-xs text-canvas-fg placeholder:text-canvas-muted/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAssignDomain}
                    disabled={assignBusy || !zoneId}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-canvas-border bg-canvas-fg px-3 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {assignBusy ? "Assigning..." : "Assign Domain"}
                  </button>
                </div>
                {assignError && <p className="text-[11px] text-red-500 dark:text-red-400">{assignError}</p>}
                <p className="text-[10px] text-canvas-muted/70">
                  A subdomain will be auto-generated unless you override the hostname. DNS creation runs in the background.
                </p>
              </div>
            )}

            {/* ── C. Assignment exists — domain card + actions ── */}
            {assignment && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-canvas-fg">{assignment.hostname}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ASSIGN_STYLE[assignment.status] ?? ASSIGN_STYLE.REQUESTED}`}>
                        {assignment.status}
                      </span>
                      {activeDomainJob && activeDomainJob.status === "RUNNING" && (
                        <span className="text-[10px] text-canvas-muted">
                          · {DOMAIN_STEP_LABELS[activeDomainJob.currentStep] ?? activeDomainJob.currentStep}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(assignment.status === "PROVISIONING" || assignment.status === "REQUESTED" || assignment.status === "DNS_CREATED") && (
                      <ActionBtn onClick={handleVerifyDomain} icon={<FiCheckCircle size={11} />}>Verify</ActionBtn>
                    )}
                    {activeDomainJob && (
                      <ActionBtn onClick={() => setShowDomainLog((v) => !v)}>{showDomainLog ? "Hide Log" : "View Log"}</ActionBtn>
                    )}
                    <ActionBtn onClick={handleReleaseDomain} danger icon={<FiTrash2 size={11} />}>Release</ActionBtn>
                  </div>
                </div>

                {showDomainLog && activeDomainJob && (
                  <DomainLogPanel
                    job={activeDomainJob}
                    onRetry={handleRetryDomainJob}
                    onCancel={handleCancelDomainJob}
                    onClose={() => setShowDomainLog(false)}
                  />
                )}

                {assignError && <p className="text-[11px] text-red-500 dark:text-red-400">{assignError}</p>}

                {/* SSL block — only meaningful once domain reached VERIFIED/DNS_CREATED/ACTIVE */}
                {domainVerified && (
                  <div className="mt-3 border-t border-canvas-border pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <FiShield size={13} className="text-canvas-muted" />
                      <span className="text-[11px] font-medium text-canvas-muted">SSL Certificate</span>
                    </div>

                    {ssl ? (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className={`text-xs font-medium ${SSL_BADGE[ssl.status] ?? "text-canvas-muted"}`}>{ssl.status}</p>
                            {(ssl.status === "PROVISIONING" || ssl.status === "REMOVING") && <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-yellow-400" />}
                            {ssl.status === "PROVISIONING" && sslJob && <span className="text-[10px] text-canvas-muted">{SSL_STEP_LABELS[sslJob.currentStep] ?? sslJob.currentStep}</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {ssl.status === "ACTIVE" && (
                              <>
                                <ActionBtn onClick={handleCheckSsl} disabled={sslLoading} icon={<FiCheckCircle size={11} />}>Check</ActionBtn>
                                <ActionBtn onClick={handleRenewSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Renew</ActionBtn>
                                <ActionBtn onClick={handleProbe} disabled={probing} icon={<FiWifi size={11} className={probing ? "animate-pulse" : ""} />}>Probe TLS</ActionBtn>
                              </>
                            )}
                            {ssl.status === "EXPIRED" && (
                              <>
                                <ActionBtn onClick={handleRenewSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Renew</ActionBtn>
                                <ActionBtn onClick={handleCheckSsl} disabled={sslLoading} icon={<FiCheckCircle size={11} />}>Check</ActionBtn>
                                <ActionBtn onClick={handleProbe} disabled={probing} icon={<FiWifi size={11} className={probing ? "animate-pulse" : ""} />}>Probe TLS</ActionBtn>
                              </>
                            )}
                            {ssl.status === "PROVISIONING" && (
                              <>
                                {ssl.provisioningJobId && <ActionBtn onClick={() => handleViewSslLog(ssl.provisioningJobId!)}>View Log</ActionBtn>}
                                <ActionBtn onClick={handleCancelSslJob} disabled={!sslJob}>Cancel</ActionBtn>
                              </>
                            )}
                            {ssl.status === "FAILED" && (
                              <ActionBtn onClick={handleProvisionSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Retry</ActionBtn>
                            )}
                            <ActionBtn onClick={toggleAudit} icon={<FiActivity size={11} />}>
                              {auditOpen ? "Hide Activity" : "Activity"}
                            </ActionBtn>
                            {ssl.status !== "PROVISIONING" && ssl.status !== "REMOVING" && (
                              <ActionBtn onClick={handleDeleteSsl} disabled={sslLoading} icon={<FiTrash2 size={11} className="text-red-500/70" />}>Remove</ActionBtn>
                            )}
                          </div>
                        </div>

                        {ssl.hostname && (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Hostname</p>
                              <p className="mt-0.5 truncate font-mono text-xs text-canvas-fg">{ssl.hostname}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Expires</p>
                              {(() => { const exp = formatSslExpiry(ssl.expiresAt); return <p className={`mt-0.5 text-xs ${exp.className}`}>{exp.text}</p>; })()}
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Target Port</p>
                              <p className="mt-0.5 text-xs text-canvas-fg">{ssl.targetPort ?? "443"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Last Renewed</p>
                              <p className="mt-0.5 text-xs text-canvas-fg">
                                {ssl.lastRenewedAt
                                  ? new Date(ssl.lastRenewedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                                  : "Never"}
                              </p>
                            </div>
                          </div>
                        )}

                        {ssl.lastError && (
                          <div className="space-y-1">
                            <p className="text-[11px] text-red-500 dark:text-red-400">{ssl.lastError}</p>
                            {isInstallFailure(ssl.lastError) && (
                              <p className="text-[10px] text-canvas-muted/80">
                                Supported distros: Ubuntu / Debian, RHEL family (Fedora, Rocky, Alma), Alpine, Arch, openSUSE. Check the job log for the exact command + exit code.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Cert-files card — shown when host nginx isn't managed by ClawOps
                            (port 80 was already in use at provisioning time). */}
                        {ssl.hostNginxManaged === false && ssl.hostname && (
                          <CertPathsCard hostname={ssl.hostname} />
                        )}

                        {/* Probe result card */}
                        {probeResult && (
                          <ProbeResultCard result={probeResult} onDismiss={() => setProbeResult(null)} />
                        )}
                        {probeError && (
                          <p className="text-[11px] text-red-500 dark:text-red-400">Probe failed: {probeError}</p>
                        )}

                        {/* Audit log drawer */}
                        {auditOpen && (
                          <AuditLogDrawer entries={auditEntries} loading={auditLoading} onRefresh={loadAudit} />
                        )}

                        {showSslLog && (
                          sslJob ? (
                            <SslLogPanel
                              job={sslJob}
                              onRetry={handleRetrySslJob}
                              onCancel={handleCancelSslJob}
                              onExpand={() => setShowSslViewer(true)}
                              onClose={() => { setShowSslLog(false); if (pollSslRef.current) { clearTimeout(pollSslRef.current); pollSslRef.current = null; } }}
                            />
                          ) : (
                            <div className="mt-2 rounded-md border border-canvas-border bg-[#0d1117] px-3 py-4 text-center text-[11px] text-gray-500">Loading job logs...</div>
                          )
                        )}
                      </>
                    ) : liveSslJob ? (
                      /* Fall-through: live SSL provisioning job exists but cert row hasn't landed yet.
                         Surface the log immediately so the user isn't left staring at "No cert". */
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">PROVISIONING</p>
                          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-yellow-400" />
                          <span className="text-[10px] text-canvas-muted">
                            {SSL_STEP_LABELS[liveSslJob.currentStep] ?? liveSslJob.currentStep}
                          </span>
                        </div>
                        <SslLogPanel
                          job={liveSslJob}
                          onRetry={handleRetrySslJob}
                          onCancel={handleCancelSslJob}
                          onExpand={() => setShowSslViewer(true)}
                          onClose={() => { /* cannot close a server-wide live job preview */ }}
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[10px] font-medium text-canvas-muted">Port</label>
                            <input
                              type="number"
                              min={1}
                              max={65535}
                              value={sslTargetPort}
                              onChange={(e) => setSslTargetPort(e.target.value)}
                              className="w-16 rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10"
                            />
                          </div>
                          <ActionBtn onClick={handleProvisionSsl} disabled={sslLoading} icon={<FiShield size={11} />}>
                            {sslLoading ? "Provisioning..." : "Provision SSL"}
                          </ActionBtn>
                        </div>
                        <p className="text-[10px] text-canvas-muted/70">
                          If port 80/443 is already used by Docker / Traefik / Caddy, ClawOps will still
                          issue the cert (via DNS-01) and leave it on disk — nginx config is only applied
                          when we manage it.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!domainVerified && assignment && (
                  <p className="mt-2 text-[11px] text-canvas-muted">
                    SSL provisioning is available once the domain is VERIFIED. Click &quot;Verify&quot; above to check propagation.
                  </p>
                )}
              </div>
            )}

          </div>
          )}
        </div>
      </div>

      {/* Full-screen SSL log viewer */}
      <SslLogViewer
        open={showSslViewer}
        job={currentSslJob}
        onRetry={handleRetrySslJob}
        onCancel={handleCancelSslJob}
        onClose={() => setShowSslViewer(false)}
      />
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
        danger
          ? "text-red-500 hover:bg-red-500/5 dark:text-red-400"
          : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function CertPathsCard({ hostname }: { hostname: string }) {
  const fullchain = `/etc/letsencrypt/live/${hostname}/fullchain.pem`;
  const privkey = `/etc/letsencrypt/live/${hostname}/privkey.pem`;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((prev) => (prev === label ? null : prev)), 1500);
    } catch { /* ignore */ }
  }, []);
  return (
    <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] space-y-2">
      <p className="font-medium text-canvas-fg">Host nginx is not managed by ClawOps</p>
      <p className="text-canvas-muted">
        Port 80 was already in use (likely a Docker / Traefik / Caddy reverse proxy). The
        certificate was issued via DNS-01 and left on disk. Mount these files into your
        reverse proxy:
      </p>
      <div className="space-y-1">
        <PathRow label="fullchain" value={fullchain} copied={copied === "fullchain"} onCopy={() => copy("fullchain", fullchain)} />
        <PathRow label="privkey" value={privkey} copied={copied === "privkey"} onCopy={() => copy("privkey", privkey)} />
      </div>
      <p className="text-[10px] text-canvas-muted/80">
        Auto-renewal runs daily via DNS-01 — your proxy just needs to re-read these files
        (most do so automatically, or reload weekly).
      </p>
    </div>
  );
}

function PathRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] shrink-0 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </span>
      <code className="flex-1 overflow-x-auto rounded bg-canvas-surface-hover/60 px-2 py-1 font-mono text-[11px] text-canvas-fg">
        {value}
      </code>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md border border-canvas-border px-2 py-1 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function isInstallFailure(msg: string | null | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes("failed to install") || m.includes("install step failed") || m.includes("unsupported distro");
}

function ProbeResultCard({ result, onDismiss }: { result: SslProbeResponse; onDismiss: () => void }) {
  const certExp = result.certExpiry ? new Date(result.certExpiry) : null;
  const daysLeft = certExp ? Math.ceil((certExp.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <div className="rounded-md border border-canvas-border bg-canvas-surface-hover/30 p-3 text-[11px]">
      <div className="flex items-center justify-between">
        <p className="font-medium text-canvas-fg">Live probe · {result.hostname}</p>
        <button type="button" onClick={onDismiss} className="text-[10px] text-canvas-muted hover:text-canvas-fg">Dismiss</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        <ProbeRow label="HTTP" value={`${result.httpCode || "—"} ${result.httpReachable ? "✓" : "✕"}`}
                  tone={result.httpReachable ? "ok" : "warn"} />
        <ProbeRow label="HTTPS" value={`${result.httpsCode || "—"} ${result.httpsReachable ? "✓" : "✕"}`}
                  tone={result.httpsReachable ? "ok" : "err"} />
        <ProbeRow label="TLS" value={result.tlsValid ? "valid" : result.tlsPresent ? "expired" : "absent"}
                  tone={result.tlsValid ? "ok" : "err"} />
        <ProbeRow label="Cert expiry (wire)"
                  value={certExp ? `${certExp.toLocaleDateString()}${daysLeft != null ? ` (${daysLeft}d)` : ""}` : "—"}
                  tone={daysLeft != null && daysLeft < 0 ? "err" : daysLeft != null && daysLeft < 14 ? "warn" : undefined} />
      </div>
      <p className="mt-2 text-[10px] text-canvas-muted">Probed {new Date(result.probedAt).toLocaleTimeString()}</p>
    </div>
  );
}

function ProbeRow({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "err" }) {
  const toneClass = tone === "ok" ? "text-green-600 dark:text-green-400"
    : tone === "warn" ? "text-orange-600 dark:text-orange-400"
    : tone === "err" ? "text-red-500 dark:text-red-400"
    : "text-canvas-fg";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-canvas-muted">{label}</span>
      <span className={`font-mono ${toneClass}`}>{value}</span>
    </div>
  );
}

function AuditLogDrawer({
  entries, loading, onRefresh,
}: { entries: AuditLogEntry[]; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="rounded-md border border-canvas-border bg-canvas-surface-hover/20 p-3 text-[11px]">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-canvas-fg flex items-center gap-1.5">
          <FiClock size={11} className="text-canvas-muted" />
          Activity
        </p>
        <button type="button" onClick={onRefresh} disabled={loading}
                className="text-[10px] text-canvas-muted hover:text-canvas-fg disabled:opacity-50">
          {loading ? "…" : "Refresh"}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="py-3 text-center text-canvas-muted">{loading ? "Loading…" : "No activity recorded yet."}</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto divide-y divide-canvas-border">
          {entries.map((e) => (
            <li key={e.id} className="py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-canvas-fg">{e.action}</span>
                <span className="text-canvas-muted">
                  {new Date(e.createdAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "numeric", minute: "numeric",
                  })}
                </span>
              </div>
              {e.details && (
                <p className="mt-0.5 text-canvas-muted whitespace-pre-wrap break-words">{e.details}</p>
              )}
              {e.userId && (
                <p className="text-[10px] text-canvas-muted/70">user {e.userId.substring(0, 8)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
