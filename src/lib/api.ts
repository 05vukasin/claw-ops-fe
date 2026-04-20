import { apiFetch, buildApiUrl } from "./apiClient";

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export type UserRole = "ADMIN" | "DEVOPS" | "EMPLOYEE" | "USER";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ------------------------------------------------------------------ */
/*  Auth endpoints                                                     */
/* ------------------------------------------------------------------ */

export async function loginApi(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const res = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(
      res.status,
      res.status === 401 || res.status === 403
        ? "Invalid email or password."
        : "Login failed. Please try again.",
    );
  }
  return res.json() as Promise<TokenResponse>;
}

export async function meApi(): Promise<AuthUser> {
  const res = await apiFetch("/api/v1/auth/me");
  if (!res.ok) throw new ApiError(res.status, "Failed to fetch user profile.");
  return res.json() as Promise<AuthUser>;
}

export async function refreshTokenApi(
  refreshToken: string,
): Promise<TokenResponse> {
  const res = await fetch(buildApiUrl("/api/v1/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new ApiError(res.status, "Session expired. Please sign in again.");
  return res.json() as Promise<TokenResponse>;
}

export async function logoutApi(refreshToken: string): Promise<void> {
  try {
    await apiFetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Server types                                                       */
/* ------------------------------------------------------------------ */

export type ServerStatus = "ONLINE" | "OFFLINE" | "UNKNOWN" | "ERROR";
export type ServerAuthType = "PASSWORD" | "PRIVATE_KEY";
export type SslStatus = "ACTIVE" | "FAILED" | "PROVISIONING" | "EXPIRED" | "PENDING" | "REMOVING";

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string | null;
  sshPort: number;
  sshUsername: string;
  authType: ServerAuthType;
  credentialId: string | null;
  passphraseCredentialId: string | null;
  environment: string;
  status: ServerStatus;
  assignedDomain: string | null;
  /** Present immediately after server creation while the domain assignment job is still running. */
  pendingDomainAssignmentId?: string | null;
  pendingDomainJobId?: string | null;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface SslCertificate {
  id: string;
  serverId: string;
  assignmentId: string | null;
  hostname: string | null;
  status: SslStatus;
  adminEmail: string | null;
  targetPort: number | null;
  expiresAt: string | null;
  lastRenewedAt: string | null;
  lastError: string | null;
  provisioningJobId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type SslJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type SslJobStep =
  | "PENDING_DNS" | "DNS_CREATED" | "DNS_PROPAGATED"
  | "ISSUING_CERT" | "CERT_ISSUED" | "DEPLOYING_CONFIG"
  | "VERIFYING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_PERMANENT";

export interface SslJob {
  id: string;
  domainAssignmentId?: string;
  serverId?: string | null;
  hostname: string;
  status: SslJobStatus;
  currentStep: SslJobStep;
  logs: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries?: number;
  /** Set during the DNS-01 step — provider's TXT record id (useful for operator debugging). */
  acmeTxtRecordId?: string | null;
  triggeredBy?: string | null;
  createdAt?: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  message: string | null;
  latencyMs: number | null;
}

export interface Zone {
  id: string;
  zoneName: string;
  active: boolean;
  defaultForAutoAssign: boolean;
}

export interface ProvisionAllResult {
  total: number;
  provisioned: number;
  skipped: number;
  failed: number;
}

/* ------------------------------------------------------------------ */
/*  Secrets                                                            */
/* ------------------------------------------------------------------ */

export async function createSecretApi(
  name: string,
  type: string,
  value: string,
): Promise<string> {
  const res = await apiFetch("/api/v1/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create credential" }));
    throw new ApiError(res.status, err.message || "Failed to create credential");
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/* ------------------------------------------------------------------ */
/*  Servers                                                            */
/* ------------------------------------------------------------------ */

export async function fetchServersApi(
  page = 0,
  size = 15,
): Promise<PageResponse<Server>> {
  const res = await apiFetch(`/api/v1/servers?page=${page}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load servers.");
  return res.json() as Promise<PageResponse<Server>>;
}

export interface ServerCreateBody {
  name: string;
  hostname: string;
  ipAddress: string | null;
  sshPort: number;
  sshUsername: string;
  authType: ServerAuthType;
  credentialId: string | null;
  passphraseCredentialId: string | null;
  environment: string | null;
  zoneId?: string | null;
}

export async function createServerApi(body: ServerCreateBody): Promise<Server> {
  const res = await apiFetch("/api/v1/servers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create server" }));
    throw new ApiError(res.status, err.message || err.messages?.map((m: { message: string }) => m.message).join(", ") || "Failed to create server");
  }
  return res.json() as Promise<Server>;
}

export async function updateServerApi(id: string, body: Partial<ServerCreateBody>): Promise<Server> {
  const res = await apiFetch(`/api/v1/servers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to update server" }));
    throw new ApiError(res.status, err.message || "Failed to update server");
  }
  return res.json() as Promise<Server>;
}

export async function deleteServerApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "Failed to delete server.");
  }
}

export async function testConnectionApi(id: string): Promise<TestConnectionResult> {
  const res = await apiFetch(`/api/v1/servers/${encodeURIComponent(id)}/test-connection`, {
    method: "POST",
  });
  if (!res.ok) throw new ApiError(res.status, "Test connection failed.");
  return res.json() as Promise<TestConnectionResult>;
}

export async function getSessionTokenApi(serverId: string): Promise<string> {
  const res = await apiFetch(`/api/v1/servers/${encodeURIComponent(serverId)}/ssh/session-token`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to get session token" }));
    throw new ApiError(res.status, err.message || "Failed to get session token");
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

/* ------------------------------------------------------------------ */
/*  SFTP / File Browser                                                */
/* ------------------------------------------------------------------ */

export interface SftpFile {
  name: string;
  path: string;
  directory: boolean;
  size: number;
}

export async function listFilesApi(serverId: string, path: string): Promise<SftpFile[]> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/sftp/ls?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to list directory" }));
    throw new ApiError(res.status, err.message || "Failed to list directory");
  }
  return res.json() as Promise<SftpFile[]>;
}

/* ------------------------------------------------------------------ */
/*  SSL Certificates                                                   */
/* ------------------------------------------------------------------ */

export async function fetchSslForServer(serverId: string): Promise<SslCertificate | null> {
  const res = await apiFetch(`/api/v1/ssl-certificates/server/${encodeURIComponent(serverId)}`);
  if (!res.ok) return null;
  return res.json() as Promise<SslCertificate>;
}

/** Find the active domain assignment for a server (used for SSL provisioning). */
export async function fetchAssignmentForServer(serverId: string): Promise<{ id: string; status: string; hostname: string } | null> {
  const res = await apiFetch(`/api/v1/domain-assignments?resourceId=${encodeURIComponent(serverId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const list = Array.isArray(data) ? data : (data.content ?? []);
  return list.find((a: { status: string }) => a.status !== "RELEASED") ?? null;
}

/**
 * Find the active domain assignment for a server, then provision SSL.
 * The backend expects { assignmentId }, not { serverId }.
 */
export async function provisionSslApi(serverId: string, targetPort?: number): Promise<SslJob | null> {
  // Step 1: find the server's active domain assignment
  const assignRes = await apiFetch(`/api/v1/domain-assignments?resourceId=${encodeURIComponent(serverId)}`);
  if (!assignRes.ok) {
    throw new ApiError(assignRes.status, "Failed to find domain assignment for this server.");
  }
  const assignData = await assignRes.json();
  const assignments = Array.isArray(assignData) ? assignData : (assignData.content ?? []);
  const active = assignments.find((a: { status: string }) => a.status !== "RELEASED");
  if (!active) {
    throw new ApiError(400, "No active domain assignment found. Assign a domain first.");
  }

  // Step 2: provision SSL using the assignment ID
  const res = await apiFetch("/api/v1/ssl-certificates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignmentId: active.id, ...(targetPort != null ? { targetPort } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "SSL provisioning failed" }));
    throw new ApiError(res.status, err.message || "SSL provisioning failed");
  }
  try { return (await res.json()) as SslJob; } catch { return null; }
}

export async function renewSslApi(certId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/ssl-certificates/${encodeURIComponent(certId)}/renew`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "SSL renewal failed" }));
    throw new ApiError(res.status, err.message || "SSL renewal failed");
  }
}

export async function provisionAllSslApi(): Promise<ProvisionAllResult> {
  const res = await apiFetch("/api/v1/ssl-certificates/provision-all", {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Bulk SSL provisioning failed" }));
    throw new ApiError(res.status, err.message || "Bulk SSL provisioning failed");
  }
  return res.json() as Promise<ProvisionAllResult>;
}

export async function fetchSslJobApi(jobId: string): Promise<SslJob> {
  const res = await apiFetch(`/api/v1/ssl-certificates/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load SSL job.");
  return res.json() as Promise<SslJob>;
}

/** List SSL provisioning jobs currently in RUNNING status (admin processes page). */
export async function fetchActiveSslJobsApi(): Promise<SslJob[]> {
  const res = await apiFetch(`/api/v1/ssl-certificates/jobs?status=RUNNING&page=0&size=50`);
  if (!res.ok) return [];
  const data = (await res.json()) as PageResponse<SslJob>;
  return data.content ?? [];
}

/* ------------------------------------------------------------------ */
/*  SSL extras: dashboard, probe, audit log, scheduler status          */
/* ------------------------------------------------------------------ */

export interface SslDashboardResponse {
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  expiringSoonCertificates: number;
  failedCertificates: number;
  provisioningCertificates: number;
  expiringSoon: { hostname: string; expiresAt: string | null; daysUntilExpiry: number }[];
  recentFailures: { hostname: string; lastError: string }[];
}

export interface SslProbeResponse {
  hostname: string;
  httpCode: string;
  httpReachable: boolean;
  httpsCode: string;
  httpsReachable: boolean;
  certExpiry: string | null;
  tlsPresent: boolean;
  tlsValid: boolean;
  probedAt: string;
}

export interface SslSchedulerStatus {
  renewLastRunAt: string | null;
  renewNextRunAt: string | null;
  lastOutcome: {
    renewed: number;
    failed: number;
    considered: number;
    durationMs: number;
  };
  expiryLastRunAt: string | null;
  expiryNextRunAt: string | null;
  renewalWindowDays: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export async function fetchSslDashboardApi(): Promise<SslDashboardResponse | null> {
  const res = await apiFetch(`/api/v1/ssl-certificates/dashboard`);
  if (!res.ok) return null;
  return res.json() as Promise<SslDashboardResponse>;
}

export async function fetchSslProbeApi(certId: string): Promise<SslProbeResponse> {
  const res = await apiFetch(`/api/v1/ssl-certificates/${encodeURIComponent(certId)}/probe`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Probe failed" }));
    throw new ApiError(res.status, err.message || "Probe failed");
  }
  return res.json() as Promise<SslProbeResponse>;
}

export async function fetchSslAuditLogApi(
  certId: string,
  page = 0,
  size = 25,
): Promise<PageResponse<AuditLogEntry>> {
  const res = await apiFetch(
    `/api/v1/ssl-certificates/${encodeURIComponent(certId)}/audit-log?page=${page}&size=${size}&sort=createdAt,desc`,
  );
  if (!res.ok) throw new ApiError(res.status, "Failed to load SSL audit log.");
  return res.json() as Promise<PageResponse<AuditLogEntry>>;
}

export async function fetchSslSchedulerStatusApi(): Promise<SslSchedulerStatus | null> {
  const res = await apiFetch(`/api/v1/ssl-certificates/scheduler-status`);
  if (!res.ok) return null;
  return res.json() as Promise<SslSchedulerStatus>;
}

export async function fetchSslByAssignmentApi(assignmentId: string): Promise<SslCertificate | null> {
  const res = await apiFetch(`/api/v1/ssl-certificates/by-assignment/${encodeURIComponent(assignmentId)}`);
  if (!res.ok) return null;
  return res.json() as Promise<SslCertificate>;
}

export async function retrySslJobApi(jobId: string): Promise<SslJob> {
  const res = await apiFetch(`/api/v1/ssl-certificates/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Retry failed" }));
    throw new ApiError(res.status, err.message || "Retry failed");
  }
  return res.json() as Promise<SslJob>;
}

export async function checkSslStatusApi(certId: string): Promise<SslCertificate> {
  const res = await apiFetch(`/api/v1/ssl-certificates/${encodeURIComponent(certId)}/check`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "SSL status check failed" }));
    throw new ApiError(res.status, err.message || "SSL status check failed");
  }
  return res.json() as Promise<SslCertificate>;
}

export async function deleteSslCertificateApi(certId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/ssl-certificates/${encodeURIComponent(certId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to remove SSL certificate" }));
    throw new ApiError(res.status, err.message || "Failed to remove SSL certificate");
  }
}

export async function cancelSslJobApi(jobId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/ssl-certificates/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to cancel job" }));
    throw new ApiError(res.status, err.message || "Failed to cancel job");
  }
}

/* ------------------------------------------------------------------ */
/*  Domain Assignment Jobs (async DNS record creation + verification)  */
/* ------------------------------------------------------------------ */

export type DomainJobStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type DomainJobStep =
  | "PENDING_DNS" | "CREATING_RECORD" | "DNS_CREATED"
  | "VERIFYING" | "VERIFIED" | "COMPLETED"
  | "FAILED_RETRYABLE" | "FAILED_PERMANENT";

export interface DomainJob {
  id: string;
  domainAssignmentId: string;
  serverId: string | null;
  hostname: string;
  currentStep: DomainJobStep;
  status: DomainJobStatus;
  retryCount: number;
  maxRetries: number;
  logs: string | null;
  errorMessage: string | null;
  triggeredBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function fetchDomainJobApi(jobId: string): Promise<DomainJob> {
  const res = await apiFetch(`/api/v1/domain-assignments/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load domain job.");
  return res.json() as Promise<DomainJob>;
}

export async function fetchActiveDomainJobsApi(): Promise<DomainJob[]> {
  const res = await apiFetch(`/api/v1/domain-assignments/jobs/active`);
  if (!res.ok) return [];
  return res.json() as Promise<DomainJob[]>;
}

export async function retryDomainJobApi(jobId: string): Promise<DomainJob> {
  const res = await apiFetch(`/api/v1/domain-assignments/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Retry failed" }));
    throw new ApiError(res.status, err.message || "Retry failed");
  }
  return res.json() as Promise<DomainJob>;
}

export async function cancelDomainJobApi(jobId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/domain-assignments/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ message: "Failed to cancel domain job" }));
    throw new ApiError(res.status, err.message || "Failed to cancel domain job");
  }
}

/** Assign a zone's subdomain to an existing server (async). Returns the new assignment with latestJobId populated. */
export async function assignDomainToServerApi(
  serverId: string,
  zoneId: string,
  hostnameOverride?: string,
): Promise<DomainAssignment> {
  const res = await apiFetch(`/api/v1/domain-assignments/server`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverId, zoneId, hostnameOverride: hostnameOverride ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to assign domain" }));
    throw new ApiError(res.status, err.message || "Failed to assign domain");
  }
  return res.json() as Promise<DomainAssignment>;
}

/* ------------------------------------------------------------------ */
/*  Zones                                                              */
/* ------------------------------------------------------------------ */

export async function fetchZonesApi(): Promise<Zone[]> {
  const res = await apiFetch("/api/v1/zones?page=0&size=100");
  if (!res.ok) return [];
  const data = (await res.json()) as PageResponse<Zone>;
  return (data.content || []).filter((z) => z.active);
}

/* ------------------------------------------------------------------ */
/*  Users                                                              */
/* ------------------------------------------------------------------ */

export interface ManagedUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
}

export async function fetchUsersApi(
  page = 0,
  size = 15,
): Promise<PageResponse<ManagedUser>> {
  const res = await apiFetch(`/api/v1/users?page=${page}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load users.");
  return res.json() as Promise<PageResponse<ManagedUser>>;
}

export async function createUserApi(body: {
  email: string;
  username: string;
  password: string;
  role: UserRole;
}): Promise<ManagedUser> {
  const res = await apiFetch("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create user" }));
    const msg = err.messages
      ? err.messages.map((m: { field: string; message: string }) => `${m.field}: ${m.message}`).join(", ")
      : err.message;
    throw new ApiError(res.status, msg || "Failed to create user");
  }
  return res.json() as Promise<ManagedUser>;
}

export async function updateUserApi(
  id: string,
  body: { email?: string; username?: string; role?: UserRole; enabled?: boolean },
): Promise<ManagedUser> {
  const res = await apiFetch(`/api/v1/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to update user" }));
    const msg = err.messages
      ? err.messages.map((m: { field: string; message: string }) => `${m.field}: ${m.message}`).join(", ")
      : err.message;
    throw new ApiError(res.status, msg || "Failed to update user");
  }
  return res.json() as Promise<ManagedUser>;
}

export async function deleteUserApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "Failed to delete user.");
  }
}

export async function changePasswordApi(
  id: string,
  newPassword: string,
): Promise<void> {
  const res = await apiFetch(`/api/v1/users/${encodeURIComponent(id)}/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to change password" }));
    const msg = err.messages
      ? err.messages.map((m: { field: string; message: string }) => `${m.field}: ${m.message}`).join(", ")
      : err.message;
    throw new ApiError(res.status, msg || "Failed to change password");
  }
}

/* ── Server Access (EMPLOYEE role) ── */

export interface ServerAccess {
  serverId: string;
  serverName: string;
  assignedAt: string;
}

export async function fetchServerAccessApi(userId: string): Promise<ServerAccess[]> {
  const res = await apiFetch(`/api/v1/users/${encodeURIComponent(userId)}/server-access`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load server access");
  return res.json() as Promise<ServerAccess[]>;
}

export async function addServerAccessApi(userId: string, serverIds: string[]): Promise<void> {
  const res = await apiFetch(`/api/v1/users/${encodeURIComponent(userId)}/server-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serverIds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to assign server" }));
    throw new ApiError(res.status, err.message || "Failed to assign server");
  }
}

export async function revokeServerAccessApi(userId: string, serverId: string): Promise<void> {
  const res = await apiFetch(
    `/api/v1/users/${encodeURIComponent(userId)}/server-access/${encodeURIComponent(serverId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to revoke access");
}

/* ------------------------------------------------------------------ */
/*  Audit Logs                                                         */
/* ------------------------------------------------------------------ */

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export async function fetchAuditLogsApi(
  page = 0,
  size = 25,
  filters: AuditLogFilters = {},
): Promise<PageResponse<AuditLogEntry>> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("size", String(size));
  params.set("sort", "createdAt,desc");
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);

  const res = await apiFetch(`/api/v1/audit/logs?${params.toString()}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load audit logs.");
  return res.json() as Promise<PageResponse<AuditLogEntry>>;
}

/* ------------------------------------------------------------------ */
/*  Deployment Scripts                                                 */
/* ------------------------------------------------------------------ */

export type ScriptType = "GENERAL" | "INSTALL" | "REMOVE" | "UPDATE" | "MAINTENANCE";

export interface DeploymentScript {
  id: string;
  name: string;
  scriptType: ScriptType;
  description: string | null;
  scriptContent: string;
  createdAt: string;
}

export async function fetchScriptsApi(
  page = 0,
  size = 100,
): Promise<PageResponse<DeploymentScript>> {
  const res = await apiFetch(`/api/v1/deployment-scripts?page=${page}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load scripts.");
  return res.json() as Promise<PageResponse<DeploymentScript>>;
}

/* ------------------------------------------------------------------ */
/*  Deployment Jobs                                                    */
/* ------------------------------------------------------------------ */

export type DeploymentJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface DeploymentJob {
  id: string;
  scriptId: string;
  scriptName: string | null;
  serverId: string;
  status: DeploymentJobStatus;
  interactive: boolean;
  terminalSessionId: string | null;
  logs: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export async function fetchDeploymentJobsApi(
  serverId: string,
  size = 50,
): Promise<PageResponse<DeploymentJob>> {
  const res = await apiFetch(`/api/v1/deployment-jobs?serverId=${encodeURIComponent(serverId)}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load deployment jobs.");
  return res.json() as Promise<PageResponse<DeploymentJob>>;
}

export async function fetchDeploymentJobApi(id: string): Promise<DeploymentJob> {
  const res = await apiFetch(`/api/v1/deployment-jobs/${encodeURIComponent(id)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load job details.");
  return res.json() as Promise<DeploymentJob>;
}

export async function createDeploymentJobApi(body: {
  scriptId: string;
  serverId: string;
  interactive: boolean;
}): Promise<DeploymentJob> {
  const res = await apiFetch("/api/v1/deployment-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to run script" }));
    throw new ApiError(res.status, err.message || "Failed to run script");
  }
  return res.json() as Promise<DeploymentJob>;
}

export async function stopDeploymentJobApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/deployment-jobs/${encodeURIComponent(id)}/stop`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to stop job" }));
    throw new ApiError(res.status, err.message || "Failed to stop job");
  }
}

export async function cancelDeploymentJobApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/deployment-jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to cancel job" }));
    throw new ApiError(res.status, err.message || "Failed to cancel job");
  }
}

export async function getDeploymentTerminalTokenApi(jobId: string): Promise<string> {
  const res = await apiFetch(`/api/v1/deployment-jobs/${encodeURIComponent(jobId)}/terminal-token`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to get terminal token" }));
    throw new ApiError(res.status, err.message || "Failed to get terminal token");
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function fetchScriptApi(id: string): Promise<DeploymentScript> {
  const res = await apiFetch(`/api/v1/deployment-scripts/${encodeURIComponent(id)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load script.");
  return res.json() as Promise<DeploymentScript>;
}

export async function createScriptApi(body: {
  name: string;
  scriptType: ScriptType;
  description: string | null;
  scriptContent: string;
}): Promise<DeploymentScript> {
  const res = await apiFetch("/api/v1/deployment-scripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create script" }));
    throw new ApiError(res.status, err.message || "Failed to create script");
  }
  return res.json() as Promise<DeploymentScript>;
}

export async function updateScriptApi(
  id: string,
  body: { name?: string; scriptType?: ScriptType; description?: string | null; scriptContent?: string },
): Promise<DeploymentScript> {
  const res = await apiFetch(`/api/v1/deployment-scripts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to update script" }));
    throw new ApiError(res.status, err.message || "Failed to update script");
  }
  return res.json() as Promise<DeploymentScript>;
}

export async function deleteScriptApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/deployment-scripts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "Failed to delete script.");
  }
}

/* ------------------------------------------------------------------ */
/*  Provider Accounts                                                  */
/* ------------------------------------------------------------------ */

export type ProviderType = "CLOUDFLARE" | "NAMECHEAP" | "GODADDY";
export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNREACHABLE" | "UNKNOWN";

export interface ProviderAccount {
  id: string;
  displayName: string;
  providerType: ProviderType;
  healthStatus: HealthStatus;
  credentialId: string;
  providerSettings: Record<string, string> | null;
  createdAt: string;
}

export async function fetchProviderAccountsApi(
  page = 0,
  size = 15,
): Promise<PageResponse<ProviderAccount>> {
  const res = await apiFetch(`/api/v1/provider-accounts?page=${page}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load provider accounts.");
  return res.json() as Promise<PageResponse<ProviderAccount>>;
}

export async function createProviderAccountApi(body: {
  displayName: string;
  providerType: ProviderType;
  credentialId: string;
  providerSettings?: Record<string, string>;
}): Promise<ProviderAccount> {
  const res = await apiFetch("/api/v1/provider-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create account" }));
    throw new ApiError(res.status, err.message || "Failed to create account");
  }
  return res.json() as Promise<ProviderAccount>;
}

export async function deleteProviderAccountApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/provider-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ message: "Delete failed" }));
    throw new ApiError(res.status, err.message || "Delete failed");
  }
}

export interface SyncDomainsResult {
  total: number;
  imported: number;
  skipped: number;
}

export async function syncDomainsApi(accountId: string): Promise<SyncDomainsResult> {
  const res = await apiFetch(`/api/v1/provider-accounts/${encodeURIComponent(accountId)}/sync-domains`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Sync failed" }));
    throw new ApiError(res.status, err.message || "Sync failed");
  }
  return res.json() as Promise<SyncDomainsResult>;
}

export interface ValidateResult {
  valid: boolean;
  message: string | null;
}

export async function validateProviderApi(accountId: string): Promise<ValidateResult> {
  const res = await apiFetch(`/api/v1/provider-accounts/${encodeURIComponent(accountId)}/validate`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Validation failed" }));
    throw new ApiError(res.status, err.message || "Validation failed");
  }
  return res.json() as Promise<ValidateResult>;
}

/* ------------------------------------------------------------------ */
/*  Zones (extended)                                                   */
/* ------------------------------------------------------------------ */

export interface ZoneFull {
  id: string;
  zoneName: string;
  active: boolean;
  defaultForAutoAssign: boolean;
  defaultTtl: number;
  providerAccountId: string;
  createdAt: string;
}

export async function fetchAllZonesApi(): Promise<ZoneFull[]> {
  const res = await apiFetch("/api/v1/zones?page=0&size=500&sort=zoneName,asc");
  if (!res.ok) return [];
  const data = (await res.json()) as PageResponse<ZoneFull>;
  return data.content || [];
}

export async function setDefaultZoneApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/zones/${encodeURIComponent(id)}/set-default`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Set default failed" }));
    throw new ApiError(res.status, err.message || "Set default failed");
  }
}

export async function deleteZoneApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/zones/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ message: "Delete failed" }));
    throw new ApiError(res.status, err.message || "Delete failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Domain Assignments                                                 */
/* ------------------------------------------------------------------ */

export type AssignmentStatus = "REQUESTED" | "PROVISIONING" | "DNS_CREATED" | "VERIFIED" | "ACTIVE" | "FAILED" | "RELEASING" | "RELEASED";

export interface DomainAssignment {
  id: string;
  hostname: string;
  recordType: string;
  targetValue: string;
  zoneName: string | null;
  zoneId: string;
  /** Server (or other resource) this DNS record is attached to. */
  resourceId: string | null;
  status: AssignmentStatus;
  /** Latest async job for this assignment — poll to see step-by-step progress. */
  latestJobId?: string | null;
  createdAt: string;
}

export async function fetchAssignmentsApi(
  page = 0,
  size = 15,
  zoneId?: string,
): Promise<PageResponse<DomainAssignment>> {
  let url = `/api/v1/domain-assignments?page=${page}&size=${size}`;
  if (zoneId) url += `&zoneId=${zoneId}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new ApiError(res.status, "Failed to load subdomains.");
  return res.json() as Promise<PageResponse<DomainAssignment>>;
}

export async function createCustomAssignmentApi(body: {
  zoneId: string;
  hostname: string;
  recordType: string;
  targetValue: string;
}): Promise<DomainAssignment> {
  const res = await apiFetch("/api/v1/domain-assignments/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create record" }));
    throw new ApiError(res.status, err.message || "Failed to create record");
  }
  return res.json() as Promise<DomainAssignment>;
}

export async function verifyAssignmentApi(id: string): Promise<{ status: string }> {
  const res = await apiFetch(`/api/v1/domain-assignments/${encodeURIComponent(id)}/verify`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Verify failed" }));
    throw new ApiError(res.status, err.message || "Verify failed");
  }
  return res.json() as Promise<{ status: string }>;
}

export async function releaseAssignmentApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/domain-assignments/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ message: "Release failed" }));
    throw new ApiError(res.status, err.message || "Release failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Monitoring                                                         */
/* ------------------------------------------------------------------ */

export type MonitoringState = "HEALTHY" | "WARNING" | "CRITICAL" | "UNREACHABLE" | "UNKNOWN" | "MAINTENANCE";

export interface FleetHealthSummary {
  totalServers: number;
  healthy: number;
  warning: number;
  critical: number;
  unreachable: number;
  unknown: number;
  maintenance: number;
  servers: ServerHealth[];
}

export interface ServerHealth {
  serverId: string;
  serverName: string;
  hostname: string;
  environment: string | null;
  overallState: MonitoringState;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  load1m: number | null;
  uptimeSeconds: number | null;
  lastCheckAt: string | null;
}

export interface MonitoringMetric {
  metricType: string;
  value: number;
  label: string | null;
  collectedAt: string;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

export interface MetricTimeSeries {
  metricType: string;
  dataPoints: MetricDataPoint[];
}

export interface MonitoringProfile {
  enabled: boolean;
  checkIntervalSeconds: number;
  cpuWarningThreshold: number;
  cpuCriticalThreshold: number;
  memoryWarningThreshold: number;
  memoryCriticalThreshold: number;
  diskWarningThreshold: number;
  diskCriticalThreshold: number;
}

export interface MaintenanceWindow {
  id: string;
  serverId: string;
  serverName: string;
  reason: string;
  startAt: string;
  endAt: string;
}

export async function fetchFleetHealthApi(
  environment?: string,
  state?: string,
): Promise<FleetHealthSummary> {
  const params = new URLSearchParams();
  if (environment) params.set("environment", environment);
  if (state) params.set("state", state);
  const qs = params.toString();
  const res = await apiFetch(`/api/v1/monitoring/health${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load health data.");
  return res.json() as Promise<FleetHealthSummary>;
}

export async function fetchServerHealthApi(serverId: string): Promise<ServerHealth> {
  const res = await apiFetch(`/api/v1/monitoring/health/${encodeURIComponent(serverId)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load server health.");
  return res.json() as Promise<ServerHealth>;
}

export async function fetchLatestMetricsApi(serverId: string): Promise<MonitoringMetric[]> {
  const res = await apiFetch(`/api/v1/monitoring/metrics/${encodeURIComponent(serverId)}/latest`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load metrics.");
  return res.json() as Promise<MonitoringMetric[]>;
}

export async function fetchMetricTimeSeriesApi(
  serverId: string,
  metricType: string,
  from: string,
  to: string,
): Promise<MetricTimeSeries> {
  const params = new URLSearchParams({ type: metricType, from, to });
  const res = await apiFetch(`/api/v1/monitoring/metrics/${encodeURIComponent(serverId)}?${params}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load metric history.");
  return res.json() as Promise<MetricTimeSeries>;
}

export async function triggerHealthCheckApi(serverId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/monitoring/check/${encodeURIComponent(serverId)}`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to trigger health check.");
}

export async function fetchMonitoringProfileApi(serverId: string): Promise<MonitoringProfile> {
  const res = await apiFetch(`/api/v1/monitoring/profiles/${encodeURIComponent(serverId)}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load monitoring profile.");
  return res.json() as Promise<MonitoringProfile>;
}

export async function updateMonitoringProfileApi(
  serverId: string,
  body: Partial<MonitoringProfile>,
): Promise<MonitoringProfile> {
  const res = await apiFetch(`/api/v1/monitoring/profiles/${encodeURIComponent(serverId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to save monitoring profile.");
  return res.json() as Promise<MonitoringProfile>;
}

export async function resetMonitoringProfileApi(serverId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/monitoring/profiles/${encodeURIComponent(serverId)}/reset`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to reset monitoring profile.");
}

export async function fetchMaintenanceWindowsApi(): Promise<MaintenanceWindow[]> {
  const res = await apiFetch("/api/v1/monitoring/maintenance");
  if (!res.ok) throw new ApiError(res.status, "Failed to load maintenance windows.");
  return res.json() as Promise<MaintenanceWindow[]>;
}

export async function createMaintenanceWindowApi(body: {
  serverId: string;
  reason: string;
  startAt: string;
  endAt: string;
}): Promise<MaintenanceWindow> {
  const res = await apiFetch("/api/v1/monitoring/maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create maintenance window" }));
    throw new ApiError(res.status, err.message || "Failed to create maintenance window");
  }
  return res.json() as Promise<MaintenanceWindow>;
}

export async function deleteMaintenanceWindowApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/monitoring/maintenance/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "Failed to delete maintenance window.");
  }
}

/* ------------------------------------------------------------------ */
/*  Alerts                                                             */
/* ------------------------------------------------------------------ */

export type AlertRuleType = "THRESHOLD" | "CONSECUTIVE_FAILURE" | "DEADMAN";
export type ConditionOperator = "GREATER_THAN" | "LESS_THAN" | "GREATER_THAN_OR_EQUAL" | "LESS_THAN_OR_EQUAL" | "EQUAL" | "NOT_EQUAL";
export type AlertStatus = "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED" | "SILENCED";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
export type NotificationChannelType = "EMAIL" | "SLACK" | "DISCORD" | "TELEGRAM" | "WEBHOOK";

export interface AlertRuleChannel { id: string; name: string; type: NotificationChannelType }
export interface AlertRule {
  id: string; name: string; description: string | null; serverId: string | null;
  ruleType: AlertRuleType; metricType: string; conditionOperator: ConditionOperator;
  thresholdValue: number; severity: IncidentSeverity;
  consecutiveFailures: number; cooldownMinutes: number; enabled: boolean;
  channels: AlertRuleChannel[]; createdAt: string; updatedAt: string;
}
export interface AlertEvent {
  id: string; alertRuleId: string; ruleName: string; serverId: string;
  incidentId: string | null; severity: IncidentSeverity; status: AlertStatus;
  metricType: string | null; metricValue: number | null; message: string | null;
  acknowledgedBy: string | null; acknowledgedAt: string | null;
  resolvedAt: string | null; firedAt: string;
}
export interface Incident {
  id: string; title: string; description: string | null; serverId: string;
  severity: IncidentSeverity; status: IncidentStatus;
  openedAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  closedAt: string | null; resolvedBy: string | null; rootCause: string | null;
}
export interface NotificationChannel { id: string; name: string; channelType: NotificationChannelType; enabled: boolean; createdAt: string; updatedAt: string }
export interface EndpointCheck {
  id: string; name: string; url: string; checkType: string; serverId: string | null;
  expectedStatusCode: number; enabled: boolean; intervalSeconds: number;
  latestResult: EndpointCheckLatest | null; createdAt: string; updatedAt: string;
}
export interface EndpointCheckLatest { isUp: boolean; responseTimeMs: number | null; statusCode: number | null; sslExpiresAt: string | null; sslDaysRemaining: number | null; errorMessage: string | null; checkedAt: string }
export interface MetricAggregation { metricType: string; min: number | null; max: number | null; avg: number | null; sampleCount: number }

// ── Alert Rules API ──

export async function fetchAlertRulesApi(serverId?: string): Promise<AlertRule[]> {
  const qs = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  const res = await apiFetch(`/api/v1/monitoring/alerts/rules${qs}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load alert rules.");
  return res.json() as Promise<AlertRule[]>;
}

export async function createAlertRuleApi(body: {
  name: string; description?: string; serverId?: string | null;
  ruleType: AlertRuleType; metricType: string; conditionOperator: ConditionOperator;
  thresholdValue: number; severity: IncidentSeverity;
  consecutiveFailures?: number; cooldownMinutes?: number; channelIds?: string[];
}): Promise<AlertRule> {
  const res = await apiFetch("/api/v1/monitoring/alerts/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Failed" })); throw new ApiError(res.status, e.message || "Failed to create rule."); }
  return res.json() as Promise<AlertRule>;
}

export async function deleteAlertRuleApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/monitoring/alerts/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to delete rule.");
}

// ── Alert Events API ──

export async function fetchAlertEventsApi(serverId?: string, page = 0, size = 20): Promise<PageResponse<AlertEvent>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (serverId) params.set("serverId", serverId);
  const res = await apiFetch(`/api/v1/monitoring/alerts/events?${params}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load alerts.");
  return res.json() as Promise<PageResponse<AlertEvent>>;
}

export async function acknowledgeAlertApi(id: string): Promise<AlertEvent> {
  const res = await apiFetch(`/api/v1/monitoring/alerts/events/${encodeURIComponent(id)}/acknowledge`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to acknowledge alert.");
  return res.json() as Promise<AlertEvent>;
}

export async function resolveAlertApi(id: string): Promise<AlertEvent> {
  const res = await apiFetch(`/api/v1/monitoring/alerts/events/${encodeURIComponent(id)}/resolve`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to resolve alert.");
  return res.json() as Promise<AlertEvent>;
}

export async function silenceAlertApi(id: string): Promise<AlertEvent> {
  const res = await apiFetch(`/api/v1/monitoring/alerts/events/${encodeURIComponent(id)}/silence`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to silence alert.");
  return res.json() as Promise<AlertEvent>;
}

export async function fetchActiveAlertCountApi(): Promise<number> {
  const res = await apiFetch("/api/v1/monitoring/alerts/events/count");
  if (!res.ok) return 0;
  const data = await res.json();
  return data.active ?? 0;
}

// ── Endpoint Checks API ──

export async function fetchEndpointChecksApi(serverId?: string): Promise<EndpointCheck[]> {
  const qs = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  const res = await apiFetch(`/api/v1/monitoring/endpoints${qs}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load endpoint checks.");
  return res.json() as Promise<EndpointCheck[]>;
}

export async function createEndpointCheckApi(body: { name: string; url: string; checkType: string; serverId?: string | null; expectedStatusCode?: number; intervalSeconds?: number }): Promise<EndpointCheck> {
  const res = await apiFetch("/api/v1/monitoring/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: "Failed" })); throw new ApiError(res.status, e.message || "Failed to create check."); }
  return res.json() as Promise<EndpointCheck>;
}

export async function deleteEndpointCheckApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/monitoring/endpoints/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to delete check.");
}

export async function triggerEndpointCheckApi(id: string): Promise<EndpointCheckLatest> {
  const res = await apiFetch(`/api/v1/monitoring/endpoints/${encodeURIComponent(id)}/check`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to trigger check.");
  return res.json() as Promise<EndpointCheckLatest>;
}

// ── Metric Aggregation API ──

export async function fetchMetricAggregationApi(serverId: string, type: string, from: string, to: string): Promise<MetricAggregation> {
  const params = new URLSearchParams({ type, from, to });
  const res = await apiFetch(`/api/v1/monitoring/metrics/${encodeURIComponent(serverId)}/aggregate?${params}`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load aggregation.");
  return res.json() as Promise<MetricAggregation>;
}

/* ------------------------------------------------------------------ */
/*  Process Monitor                                                    */
/* ------------------------------------------------------------------ */

export interface ActiveSessionInfo {
  sessionId: string; serverId: string; serverName: string; userId: string;
  type: "TERMINAL" | "PERSISTENT" | "DEPLOYMENT"; status: "CONNECTED" | "BUFFERING" | "DISCONNECTED";
  createdAt: string; lastActivityAt: string; durationSeconds: number;
  sshConnected: boolean; hasWebSocket: boolean; deploymentJobId: string | null; bufferSize: number;
}

export interface ProcessMonitorResponse {
  activeSessions: ActiveSessionInfo[];
  runningJobs: DeploymentJob[];
  totalSessions: number;
  totalRunningJobs: number;
}

export async function fetchActiveProcessesApi(): Promise<ProcessMonitorResponse> {
  const res = await apiFetch("/api/v1/admin/processes");
  if (!res.ok) throw new ApiError(res.status, "Failed to load processes.");
  return res.json() as Promise<ProcessMonitorResponse>;
}

export async function killProcessApi(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/v1/admin/processes/${encodeURIComponent(sessionId)}/kill`, { method: "POST" });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to kill process.");
}

/* ------------------------------------------------------------------ */
/*  SSH Command Execution                                              */
/* ------------------------------------------------------------------ */

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  serverId: string;
}

export async function executeCommandApi(
  serverId: string,
  command: string,
  timeoutSeconds?: number,
): Promise<CommandResult> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/ssh/command`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, timeoutSeconds: timeoutSeconds ?? null }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Command failed" }));
    throw new ApiError(res.status, err.message || "Command execution failed");
  }
  return res.json() as Promise<CommandResult>;
}

export async function checkClaudeCodeInstalledApi(serverId: string): Promise<boolean> {
  try {
    const result = await executeCommandApi(
      serverId,
      'command -v claude 2>/dev/null || test -x /usr/local/bin/claude || test -x "$HOME/.local/bin/claude" || test -x "$HOME/.npm-global/bin/claude" || ls "$HOME/.nvm/versions/node"/*/bin/claude >/dev/null 2>&1 || (NPM_PREFIX="$(npm prefix -g 2>/dev/null || true)"; test -n "$NPM_PREFIX" && test -x "$NPM_PREFIX/bin/claude") || (npm list -g @anthropic-ai/claude-code 2>/dev/null | grep -q claude-code)',
      10,
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function checkDeployScriptApi(serverId: string): Promise<boolean> {
  try {
    const result = await executeCommandApi(serverId, "test -f /root/deploy/deploy.sh", 5);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/** Escape a file path for safe use in single-quoted shell strings */
function escapeShellPath(path: string): string {
  return path.replace(/'/g, "'\\''");
}

export async function readFileApi(serverId: string, filePath: string): Promise<string> {
  const result = await executeCommandApi(serverId, `cat '${escapeShellPath(filePath)}'`);
  if (result.exitCode !== 0) {
    throw new ApiError(500, result.stderr || `Failed to read ${filePath}`);
  }
  return result.stdout;
}

export async function writeFileApi(
  serverId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const escaped = escapeShellPath(filePath);
  const b64 = btoa(
    new TextEncoder()
      .encode(content)
      .reduce((s, b) => s + String.fromCharCode(b), ""),
  );
  const command = `echo '${b64}' | base64 -d > '${escaped}'`;
  const result = await executeCommandApi(serverId, command, 30);
  if (result.exitCode !== 0) {
    throw new ApiError(500, result.stderr || `Failed to write ${filePath}`);
  }
}

/** Download a file from the server via SFTP. Returns a Blob. */
export async function downloadFileApi(
  serverId: string,
  remotePath: string,
): Promise<Blob> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/sftp/download?path=${encodeURIComponent(remotePath)}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Download failed" }));
    throw new ApiError(res.status, err.message || "Download failed");
  }
  return res.blob();
}

/** Upload a file to the server via SFTP.
 *  Uses POST /api/v1/servers/{id}/sftp/upload?path={dir} with FormData. */
export async function uploadFileApi(
  serverId: string,
  dirPath: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/sftp/upload?path=${encodeURIComponent(dirPath)}`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Upload failed" }));
    throw new ApiError(res.status, err.message || "Upload failed");
  }
}

/* ------------------------------------------------------------------ */
/*  Persistent Terminal Sessions                                       */
/* ------------------------------------------------------------------ */

export interface PersistentSessionInfo {
  sessionId: string;
  createdAt: string;
  lastActivityAt: string;
  connected: boolean;
}

export async function createPersistentSessionApi(
  serverId: string,
  cols: number,
  rows: number,
): Promise<{ sessionId: string; token: string }> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/persistent-sessions?cols=${cols}&rows=${rows}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create persistent session" }));
    throw new ApiError(res.status, err.message || "Failed to create persistent session");
  }
  return res.json() as Promise<{ sessionId: string; token: string }>;
}

export async function listPersistentSessionsApi(serverId: string): Promise<PersistentSessionInfo[]> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/persistent-sessions`,
  );
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to list persistent sessions");
  }
  return res.json() as Promise<PersistentSessionInfo[]>;
}

export async function getPersistentSessionTokenApi(
  serverId: string,
  sessionId: string,
): Promise<string> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/persistent-sessions/${encodeURIComponent(sessionId)}/token`,
    { method: "POST" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to get reconnection token" }));
    throw new ApiError(res.status, err.message || "Failed to get reconnection token");
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function killPersistentSessionApi(
  serverId: string,
  sessionId: string,
): Promise<void> {
  const res = await apiFetch(
    `/api/v1/servers/${encodeURIComponent(serverId)}/persistent-sessions/${encodeURIComponent(sessionId)}/kill`,
    { method: "POST" },
  );
  if (!res.ok && res.status !== 204) {
    throw new ApiError(res.status, "Failed to kill persistent session");
  }
}

/* ------------------------------------------------------------------ */
/*  Chat session listing & history                                     */
/* ------------------------------------------------------------------ */

import type { ChatSession, ChatMessage, ChatProvider } from "./types";

export async function fetchChatSessionsApi(
  serverId: string,
  provider: ChatProvider,
): Promise<ChatSession[]> {
  const script = provider === "codex"
    ? `python3 -c "
import json,os,glob
sessions=[]
for s in glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'), recursive=True):
  sid=''
  first_msg=''
  timestamp=0
  try:
    with open(s) as f:
      for line in f:
        try:
          d=json.loads(line)
        except:
          continue
        if d.get('type')=='session_meta':
          payload=d.get('payload',{})
          sid=payload.get('id','') or sid
          ts=payload.get('timestamp') or d.get('timestamp') or ''
          try:
            timestamp=int(__import__('datetime').datetime.fromisoformat(ts.replace('Z','+00:00')).timestamp()*1000)
          except:
            try: timestamp=int(os.path.getmtime(s)*1000)
            except: timestamp=0
        elif d.get('type')=='event_msg':
          payload=d.get('payload',{})
          if payload.get('type')=='user_message':
            c=(payload.get('message') or '').strip()
            if c and not c.startswith('/'):
              first_msg=c[:100]
              break
    if sid and first_msg:
      sessions.append({'sessionId':sid,'display':first_msg,'timestamp':timestamp or int(os.path.getmtime(s)*1000)})
  except:
    pass
sessions.sort(key=lambda x:x['timestamp'],reverse=True)
print(json.dumps(sessions[:50]))
"`
    : `python3 -c "
import json,os,glob
sessions=[]
for s in glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')):
  if '/subagents/' in s: continue
  sid=os.path.basename(s).replace('.jsonl','')
  mtime=int(os.path.getmtime(s)*1000)
  first_msg=''
  with open(s) as f:
    for line in f:
      try:
        d=json.loads(line)
        if d.get('type')=='user' and 'message' in d:
          c=d['message'].get('content','')
          if isinstance(c,list):
            c=' '.join(b.get('text','') for b in c if b.get('type')=='text')
          c=c.strip()
          if c and not c.startswith('/'):
            first_msg=c[:100];break
      except:pass
  if first_msg:
    sessions.append({'sessionId':sid,'display':first_msg,'timestamp':mtime})
sessions.sort(key=lambda x:x['timestamp'],reverse=True)
print(json.dumps(sessions[:50]))
"`;
  const result = await executeCommandApi(serverId, script, 15);
  if (result.exitCode !== 0) return [];
  try {
    return JSON.parse(result.stdout) as ChatSession[];
  } catch {
    return [];
  }
}

export async function fetchSessionMessagesApi(
  serverId: string,
  provider: ChatProvider,
  sessionId: string,
): Promise<ChatMessage[]> {
  const safeId = sessionId.replace(/[^a-f0-9-]/g, "");
  const script = provider === "codex"
    ? `python3 -c "
import json,os,glob,sys,datetime
sid='${safeId}'
match=None
for f in glob.glob(os.path.expanduser('~/.codex/sessions/**/*.jsonl'), recursive=True):
  try:
    with open(f) as fh:
      first=fh.readline()
    d=json.loads(first) if first else {}
    if d.get('type')=='session_meta' and d.get('payload',{}).get('id')==sid:
      match=f
      break
  except:
    pass
if not match: print('[]'); sys.exit(0)
msgs=[]
with open(match) as f:
  for line in f:
    try:
      d=json.loads(line)
      if d.get('type')!='event_msg': continue
      payload=d.get('payload',{})
      t=payload.get('type')
      ts=d.get('timestamp') or payload.get('timestamp') or ''
      if t=='user_message':
        c=(payload.get('message') or '').strip()
        if c and not c.startswith('/'):
          msgs.append({'role':'user','content':c,'ts':ts})
      elif t=='agent_message':
        c=(payload.get('message') or '').strip()
        if c:
          msgs.append({'role':'assistant','content':c,'ts':ts})
    except:
      pass
print(json.dumps(msgs))
"`
    : `python3 -c "
import json,os,glob,sys
sid='${safeId}'
match=None
for f in glob.glob(os.path.expanduser('~/.claude/projects/*/*.jsonl')):
  if sid in f and '/subagents/' not in f:match=f;break
if not match:print('[]');sys.exit(0)
msgs=[]
with open(match) as f:
  for line in f:
    try:
      d=json.loads(line)
      t=d.get('type')
      if t=='user' and 'message' in d:
        c=d['message'].get('content','')
        if isinstance(c,list):
          c=' '.join(b.get('text','') for b in c if b.get('type')=='text')
        c=c.strip()
        if c and not c.startswith('/'):
          msgs.append({'role':'user','content':c,'ts':d.get('timestamp','')})
      elif t=='assistant' and 'message' in d:
        parts=d.get('message',{}).get('content',[])
        txt=' '.join(p.get('text','') for p in parts if p.get('type')=='text').strip()
        if txt:
          msgs.append({'role':'assistant','content':txt,'ts':d.get('timestamp','')})
    except:pass
print(json.dumps(msgs))
"`;
  const result = await executeCommandApi(serverId, script, 30);
  if (result.exitCode !== 0) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = JSON.parse(result.stdout) as any[];
    return raw.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as "user" | "assistant",
      type: "text" as const,
      content: m.content,
      timestamp: typeof m.ts === "number" ? m.ts : new Date(m.ts).getTime() || Date.now(),
    }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

export interface NotificationProvider {
  id: string;
  providerType: "WEB_PUSH" | "FCM";
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
  credentialId: string | null;
  providerSettings: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationDevice {
  id: string;
  deviceName: string;
  platform: string;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface NotificationSendResult {
  sent: number;
  targetUserId?: string;
}

export interface ProviderValidation {
  valid: boolean;
  message: string;
}

/* ── Providers ── */

export async function fetchNotificationProvidersApi(
  page: number,
  size: number,
): Promise<PageResponse<NotificationProvider>> {
  const res = await apiFetch(`/api/v1/notification-providers?page=${page}&size=${size}&sort=createdAt,desc`);
  if (!res.ok) throw new ApiError(res.status, "Failed to load providers");
  return res.json() as Promise<PageResponse<NotificationProvider>>;
}

export async function createNotificationProviderApi(body: {
  providerType: string;
  displayName: string;
  credentialId: string;
  providerSettings: Record<string, unknown>;
}): Promise<NotificationProvider> {
  const res = await apiFetch("/api/v1/notification-providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to create provider" }));
    throw new ApiError(res.status, err.message || "Failed to create provider");
  }
  return res.json() as Promise<NotificationProvider>;
}

export async function updateNotificationProviderApi(
  id: string,
  body: Record<string, unknown>,
): Promise<NotificationProvider> {
  const res = await apiFetch(`/api/v1/notification-providers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to update provider" }));
    throw new ApiError(res.status, err.message || "Failed to update provider");
  }
  return res.json() as Promise<NotificationProvider>;
}

export async function deleteNotificationProviderApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/notification-providers/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to delete provider");
}

export async function validateNotificationProviderApi(id: string): Promise<ProviderValidation> {
  const res = await apiFetch(`/api/v1/notification-providers/${encodeURIComponent(id)}/validate`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Validation request failed");
  return res.json() as Promise<ProviderValidation>;
}

export async function setDefaultNotificationProviderApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/notification-providers/${encodeURIComponent(id)}/set-default`, { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to set default");
}

/* ── Devices ── */

export async function fetchNotificationDevicesApi(): Promise<NotificationDevice[]> {
  const res = await apiFetch("/api/v1/notifications/devices");
  if (!res.ok) throw new ApiError(res.status, "Failed to load devices");
  return res.json() as Promise<NotificationDevice[]>;
}

export async function registerNotificationDeviceApi(body: {
  deviceName: string;
  platform: string;
  fcmToken?: string;
  pushEndpoint?: string;
  pushKeyAuth?: string;
  pushKeyP256dh?: string;
}): Promise<NotificationDevice> {
  const res = await apiFetch("/api/v1/notifications/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Failed to register device" }));
    throw new ApiError(res.status, err.message || "Failed to register device");
  }
  return res.json() as Promise<NotificationDevice>;
}

export async function toggleDeviceNotificationsApi(id: string, enabled: boolean): Promise<void> {
  const res = await apiFetch(`/api/v1/notifications/devices/${encodeURIComponent(id)}/toggle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to toggle notifications");
}

export async function removeNotificationDeviceApi(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/notifications/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new ApiError(res.status, "Failed to remove device");
}

/* ── Send ── */

export async function sendNotificationApi(
  title: string,
  body: string,
): Promise<NotificationSendResult> {
  const res = await apiFetch("/api/v1/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Send failed" }));
    throw new ApiError(res.status, err.message || "Send failed");
  }
  return res.json() as Promise<NotificationSendResult>;
}

export async function sendNotificationAllApi(
  title: string,
  body: string,
): Promise<NotificationSendResult> {
  const res = await apiFetch("/api/v1/notifications/send/all", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Send failed" }));
    throw new ApiError(res.status, err.message || "Send failed");
  }
  return res.json() as Promise<NotificationSendResult>;
}

export async function sendNotificationToUserApi(
  userId: string,
  title: string,
  body: string,
): Promise<NotificationSendResult> {
  const res = await apiFetch(`/api/v1/notifications/send/user/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Send failed" }));
    throw new ApiError(res.status, err.message || "Send failed");
  }
  return res.json() as Promise<NotificationSendResult>;
}

/* ── Push subscriptions ── */

export async function getVapidKeyApi(): Promise<{ publicKey: string } | null> {
  const res = await apiFetch("/api/v1/notifications/vapid-key");
  if (res.status === 404) return null; // No provider configured
  if (!res.ok) throw new ApiError(res.status, "Failed to fetch VAPID key");
  return res.json() as Promise<{ publicKey: string }>;
}

export async function generateVapidKeysApi(): Promise<{ publicKey: string; privateKey: string }> {
  const res = await apiFetch("/api/v1/notifications/generate-vapid-keys", { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, "Failed to generate VAPID keys");
  return res.json() as Promise<{ publicKey: string; privateKey: string }>;
}

export async function getFcmConfigApi(): Promise<Record<string, string> | null> {
  const res = await apiFetch("/api/v1/notifications/fcm-config");
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, string>>;
}

export async function subscribePushApi(body: {
  endpoint: string;
  keyAuth: string;
  keyP256dh: string;
}): Promise<void> {
  const res = await apiFetch("/api/v1/notifications/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, "Subscribe failed");
}

export async function unsubscribePushApi(endpoint: string): Promise<void> {
  const res = await apiFetch("/api/v1/notifications/push/unsubscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) throw new ApiError(res.status, "Unsubscribe failed");
}

export async function subscribeFcmApi(token: string, platform: string): Promise<void> {
  const res = await apiFetch("/api/v1/notifications/fcm/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) throw new ApiError(res.status, "FCM subscribe failed");
}

/* ------------------------------------------------------------------ */
/*  Background chat sessions                                           */
/* ------------------------------------------------------------------ */

export interface BackgroundSession {
  id: string;
  running: boolean;
  status: string;
  provider: ChatProvider | null;
  providerSessionId: string | null;
  startedAt: number;
  lastActivity: number;
}

export async function startBackgroundChatApi(
  serverId: string,
  sessionId: string,
  provider: ChatProvider,
  resumeSessionId?: string,
): Promise<void> {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9-]/g, "");
  const safeProvider = provider === "codex" ? "codex" : "claude";
  const safeResumeId = resumeSessionId ? resumeSessionId.replace(/[^a-zA-Z0-9-]/g, "") : "";
  const resumeFlag = safeResumeId ? ` --resume-session ${safeResumeId}` : "";
  const cmd = `if [ -f ~/.claw-sessions/${safeSessionId}/pid ] && kill -0 "$(cat ~/.claw-sessions/${safeSessionId}/pid)" 2>/dev/null; then echo RUNNING; else mkdir -p ~/.claw-sessions/${safeSessionId} && export PATH="$HOME/.local/bin:$PATH" && nohup node ~/.local/share/claw-ops/chat-bridge.mjs --background --id ${safeSessionId} --provider ${safeProvider}${resumeFlag} > /dev/null 2>&1 < /dev/null & echo $!; fi`;
  const result = await executeCommandApi(serverId, cmd, 10);
  if (result.exitCode !== 0) throw new ApiError(500, "Failed to start background chat");
}

export async function sendBackgroundMessageApi(
  serverId: string,
  sessionId: string,
  msg: Record<string, unknown>,
): Promise<void> {
  const escaped = JSON.stringify(msg).replace(/'/g, "'\\''");
  const cmd = `echo '${escaped}' >> ~/.claw-sessions/${sessionId}/input.jsonl`;
  await executeCommandApi(serverId, cmd, 5);
}

export async function pollBackgroundOutputApi(
  serverId: string,
  sessionId: string,
  afterLine: number,
): Promise<{ lines: string[]; nextLine: number }> {
  const cmd = `tail -n +${afterLine + 1} ~/.claw-sessions/${sessionId}/output.jsonl 2>/dev/null`;
  const result = await executeCommandApi(serverId, cmd, 10);
  if (result.exitCode !== 0) return { lines: [], nextLine: afterLine };
  const lines = result.stdout.split("\n").filter(Boolean);
  return { lines, nextLine: afterLine + lines.length };
}

export async function listBackgroundSessionsApi(
  serverId: string,
): Promise<BackgroundSession[]> {
  const script = `python3 -c "
import json,os,glob
sessions=[]
for d in glob.glob(os.path.expanduser('~/.claw-sessions/*/')):
  sid=os.path.basename(d.rstrip('/'))
  meta={}
  try:
    with open(os.path.join(d,'meta.json')) as f: meta=json.loads(f.read())
  except: pass
  running=False
  try:
    pid=int(open(os.path.join(d,'pid')).read().strip())
    os.kill(pid,0)
    running=True
  except: pass
  provider=meta.get('provider')
  provider_session_id=meta.get('providerSessionId') or meta.get('claudeSessionId')
  if not provider and meta.get('claudeSessionId'): provider='claude'
  sessions.append({'id':sid,'running':running,'status':meta.get('status','unknown'),'provider':provider,'providerSessionId':provider_session_id,'startedAt':meta.get('startedAt',0),'lastActivity':meta.get('lastActivity',0)})
sessions.sort(key=lambda x:x['lastActivity'],reverse=True)
print(json.dumps(sessions))
"`;
  const result = await executeCommandApi(serverId, script, 15);
  if (result.exitCode !== 0) return [];
  try { return JSON.parse(result.stdout) as BackgroundSession[]; } catch { return []; }
}

export async function stopBackgroundSessionApi(
  serverId: string,
  sessionId: string,
): Promise<void> {
  const cmd = `cat ~/.claw-sessions/${sessionId}/pid 2>/dev/null | xargs -r kill 2>/dev/null; echo '{"type":"stop"}' >> ~/.claw-sessions/${sessionId}/input.jsonl 2>/dev/null`;
  await executeCommandApi(serverId, cmd, 5);
}
