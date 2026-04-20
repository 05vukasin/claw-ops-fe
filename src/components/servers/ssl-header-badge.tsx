"use client";

import { FiShield, FiAlertTriangle } from "react-icons/fi";
import type { SslCertificate, SslJob } from "@/lib/api";
import { SSL_STEP_LABELS } from "@/lib/ssl-labels";

/**
 * Compact SSL indicator rendered in the server dashboard panel header. Shows at-a-glance:
 *  - ACTIVE → green shield + "Xd" days remaining
 *  - ≤ 7 days / EXPIRED → red shield
 *  - PROVISIONING (active job OR cert in PROVISIONING state) → yellow shield with current step
 *  - FAILED → orange warning triangle
 *  - no cert & no active job → renders nothing
 *
 * Clicking invokes `onClick` (typically scrolls the panel body to the Domain & SSL section
 * and expands it).
 */
export function SslHeaderBadge({
  cert,
  activeJob,
  onClick,
}: {
  cert: SslCertificate | null;
  activeJob: SslJob | null;
  onClick: () => void;
}) {
  // Running job takes precedence — always show progress when something is in flight.
  if (activeJob && activeJob.status === "RUNNING") {
    const label = SSL_STEP_LABELS[activeJob.currentStep] ?? activeJob.currentStep;
    return (
      <button
        type="button"
        onClick={onClick}
        title={`SSL provisioning · ${label} · ${activeJob.hostname}`}
        aria-label={`SSL provisioning in progress: ${label}`}
        className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[10px] font-medium text-yellow-600 transition-colors hover:bg-yellow-500/20 dark:text-yellow-400"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
        <span className="max-w-[90px] truncate">SSL · {label}</span>
      </button>
    );
  }

  if (!cert) return null;

  const hostname = cert.hostname ?? "";
  const expiresAt = cert.expiresAt ? new Date(cert.expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
    : null;
  const expiryDateStr = expiresAt
    ? expiresAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";

  if (cert.status === "ACTIVE") {
    const crit = daysLeft != null && daysLeft <= 7;
    const warn = daysLeft != null && daysLeft > 7 && daysLeft <= 30;
    const tone = crit
      ? "border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500/20"
      : warn
        ? "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
        : "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20";
    return (
      <button
        type="button"
        onClick={onClick}
        title={`SSL · ${hostname} · expires ${expiryDateStr}${daysLeft != null ? ` (${daysLeft}d left)` : ""}`}
        aria-label={`SSL active, ${daysLeft != null ? `${daysLeft} days left` : "unknown expiry"}`}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${tone}`}
      >
        <FiShield size={10} />
        <span>SSL{daysLeft != null ? ` · ${daysLeft}d` : ""}</span>
      </button>
    );
  }

  if (cert.status === "EXPIRED") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`SSL expired · ${hostname} · expired ${expiryDateStr}`}
        aria-label="SSL certificate expired"
        className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-medium text-red-500 transition-colors hover:bg-red-500/20 dark:text-red-400"
      >
        <FiAlertTriangle size={10} />
        <span>SSL expired</span>
      </button>
    );
  }

  if (cert.status === "FAILED") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`SSL failed · ${cert.lastError ?? "see dashboard"}`}
        aria-label="SSL provisioning failed"
        className="flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-medium text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400"
      >
        <FiAlertTriangle size={10} />
        <span>SSL failed</span>
      </button>
    );
  }

  if (cert.status === "PROVISIONING" || cert.status === "PENDING" || cert.status === "REMOVING") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`SSL ${cert.status.toLowerCase()} · ${hostname}`}
        aria-label={`SSL ${cert.status.toLowerCase()}`}
        className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1 text-[10px] font-medium text-yellow-600 transition-colors hover:bg-yellow-500/20 dark:text-yellow-400"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-500" />
        <span>SSL · {cert.status.toLowerCase()}</span>
      </button>
    );
  }

  return null;
}
