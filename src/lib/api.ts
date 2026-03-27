import { apiFetch, buildApiUrl } from "./apiClient";

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export type UserRole = "ADMIN" | "DEVOPS" | "USER";

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
  status: SslStatus;
  lastError: string | null;
  provisioningJobId: string | null;
}

export type SslJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type SslJobStep =
  | "PENDING_DNS" | "DNS_CREATED" | "DNS_PROPAGATED"
  | "ISSUING_CERT" | "CERT_ISSUED" | "DEPLOYING_CONFIG"
  | "VERIFYING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_PERMANENT";

export interface SslJob {
  id: string;
  hostname: string;
  status: SslJobStatus;
  currentStep: SslJobStep;
  logs: string | null;
  errorMessage: string | null;
  retryCount: number;
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
export async function provisionSslApi(serverId: string): Promise<SslJob | null> {
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
    body: JSON.stringify({ assignmentId: active.id }),
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

export async function retrySslJobApi(jobId: string): Promise<SslJob> {
  const res = await apiFetch(`/api/v1/ssl-certificates/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Retry failed" }));
    throw new ApiError(res.status, err.message || "Retry failed");
  }
  return res.json() as Promise<SslJob>;
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
  status: AssignmentStatus;
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
