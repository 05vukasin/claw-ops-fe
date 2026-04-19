"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronRight,
  FiGlobe,
  FiShield,
  FiRefreshCw,
  FiTrash2,
  FiCheckCircle,
} from "react-icons/fi";
import {
  ApiError,
  fetchAssignmentForServer,
  fetchSslForServer,
  fetchSslJobApi,
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
  type DomainAssignment,
  type Zone,
} from "@/lib/api";
import { useDomainJobs, trackDomainJob } from "@/lib/use-domain-jobs";
import {
  SSL_BADGE,
  SSL_STEP_LABELS,
  ASSIGN_STYLE,
  DOMAIN_STEP_LABELS,
  formatSslExpiry,
} from "@/lib/ssl-labels";
import { SslLogPanel } from "./ssl-log-panel";
import { DomainLogPanel } from "./domain-log-panel";

interface DomainSectionProps {
  server: Server;
}

function makeSslStub(serverId: string, overrides: Partial<SslCertificate>): SslCertificate {
  return {
    id: "", serverId, assignmentId: null, hostname: null, status: "PENDING",
    adminEmail: null, targetPort: null, expiresAt: null, lastRenewedAt: null,
    lastError: null, provisioningJobId: null, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

export function DomainSection({ server }: DomainSectionProps) {
  const [expanded, setExpanded] = useState(false);

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
  const [sslTargetPort, setSslTargetPort] = useState("443");

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
    <div className="border-b border-canvas-border">
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
                          <div className="flex items-center gap-1">
                            {ssl.status === "ACTIVE" && (
                              <>
                                <ActionBtn onClick={handleCheckSsl} disabled={sslLoading} icon={<FiCheckCircle size={11} />}>Check</ActionBtn>
                                <ActionBtn onClick={handleRenewSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Renew</ActionBtn>
                              </>
                            )}
                            {ssl.status === "EXPIRED" && (
                              <>
                                <ActionBtn onClick={handleRenewSsl} disabled={sslLoading} icon={<FiRefreshCw size={11} className={sslLoading ? "animate-spin" : ""} />}>Renew</ActionBtn>
                                <ActionBtn onClick={handleCheckSsl} disabled={sslLoading} icon={<FiCheckCircle size={11} />}>Check</ActionBtn>
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

                        {ssl.lastError && <p className="text-[11px] text-red-500 dark:text-red-400">{ssl.lastError}</p>}

                        {showSslLog && (
                          sslJob ? (
                            <SslLogPanel job={sslJob} onRetry={handleRetrySslJob} onCancel={handleCancelSslJob} onClose={() => { setShowSslLog(false); if (pollSslRef.current) { clearTimeout(pollSslRef.current); pollSslRef.current = null; } }} />
                          ) : (
                            <div className="mt-2 rounded-md border border-canvas-border bg-[#0d1117] px-3 py-4 text-center text-[11px] text-gray-500">Loading job logs...</div>
                          )
                        )}
                      </>
                    ) : (
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
        </div>
      </div>
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
