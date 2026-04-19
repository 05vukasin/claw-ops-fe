/**
 * Shared display helpers for SSL certificates and domain assignments. Keeping labels,
 * colors, and formatters in one module ensures the server dashboard panel, domains
 * page, and processes page all speak the same language.
 */

import type { AssignmentStatus, SslStatus, DomainJobStep } from "./api";

/** Human labels for SSL provisioning-job steps. */
export const SSL_STEP_LABELS: Record<string, string> = {
  PENDING_DNS: "Creating DNS record",
  DNS_CREATED: "Waiting for DNS propagation",
  DNS_PROPAGATED: "DNS propagated",
  ISSUING_CERT: "Running certbot",
  CERT_ISSUED: "Certificate issued",
  DEPLOYING_CONFIG: "Deploying nginx config",
  VERIFYING: "Verifying HTTPS",
  COMPLETED: "Completed",
  FAILED_RETRYABLE: "Failed (retryable)",
  FAILED_PERMANENT: "Failed (permanent)",
};

/** Human labels for domain-assignment-job steps. */
export const DOMAIN_STEP_LABELS: Record<DomainJobStep, string> = {
  PENDING_DNS: "Queued",
  CREATING_RECORD: "Creating DNS record",
  DNS_CREATED: "DNS record created",
  VERIFYING: "Verifying propagation",
  VERIFIED: "DNS verified",
  COMPLETED: "Completed",
  FAILED_RETRYABLE: "Failed (retryable)",
  FAILED_PERMANENT: "Failed (permanent)",
};

/** Tailwind classes for colourising SSL certificate statuses. */
export const SSL_BADGE: Record<SslStatus, string> = {
  ACTIVE: "text-green-600 dark:text-green-400",
  FAILED: "text-red-500 dark:text-red-400",
  PROVISIONING: "text-yellow-600 dark:text-yellow-400",
  EXPIRED: "text-orange-600 dark:text-orange-400",
  PENDING: "text-yellow-600 dark:text-yellow-400",
  REMOVING: "text-orange-600 dark:text-orange-400",
};

/** Tailwind classes for colourising domain assignment statuses. */
export const ASSIGN_STYLE: Record<AssignmentStatus, string> = {
  VERIFIED: "bg-green-500/10 text-green-600 dark:text-green-400",
  ACTIVE: "bg-green-500/10 text-green-600 dark:text-green-400",
  DNS_CREATED: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-500 dark:text-red-400",
  RELEASED: "bg-canvas-surface-hover text-canvas-muted",
  PROVISIONING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  REQUESTED: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  RELEASING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

/** Format a SSL expiry date with human-readable "X days left" colour coding. */
export function formatSslExpiry(expiresAt: string | null): { text: string; className: string } {
  if (!expiresAt) return { text: "—", className: "text-canvas-muted" };
  const expiry = new Date(expiresAt);
  if (isNaN(expiry.getTime())) return { text: "—", className: "text-canvas-muted" };
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  const dateStr = expiry.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  if (days < 0) return { text: `${dateStr} (Expired ${Math.abs(days)}d ago)`, className: "text-red-500 dark:text-red-400" };
  if (days <= 7) return { text: `${dateStr} (${days}d left)`, className: "text-red-500 dark:text-red-400" };
  if (days <= 14) return { text: `${dateStr} (${days}d left)`, className: "text-orange-600 dark:text-orange-400" };
  if (days <= 30) return { text: `${dateStr} (${days}d left)`, className: "text-yellow-600 dark:text-yellow-400" };
  return { text: `${dateStr} (${days}d left)`, className: "text-green-600 dark:text-green-400" };
}
