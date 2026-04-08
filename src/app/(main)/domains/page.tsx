"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiChevronRight, FiChevronDown, FiEye, FiEyeOff, FiRefreshCw, FiCheckCircle, FiTrash2, FiStar, FiGlobe } from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  fetchProviderAccountsApi,
  createProviderAccountApi,
  deleteProviderAccountApi,
  syncDomainsApi,
  validateProviderApi,
  fetchAllZonesApi,
  setDefaultZoneApi,
  deleteZoneApi,
  fetchAssignmentsApi,
  createCustomAssignmentApi,
  verifyAssignmentApi,
  releaseAssignmentApi,
  createSecretApi,
  ApiError,
  type ProviderAccount,
  type ProviderType,
  type ZoneFull,
  type DomainAssignment,
  type PageResponse,
} from "@/lib/api";

const PAGE_SIZE = 15;

const HEALTH_STYLE: Record<string, string> = {
  HEALTHY: "bg-green-500/10 text-green-600 dark:text-green-400",
  DEGRADED: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  UNREACHABLE: "bg-red-500/10 text-red-500 dark:text-red-400",
  UNKNOWN: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

const ASSIGN_STYLE: Record<string, string> = {
  VERIFIED: "bg-green-500/10 text-green-600 dark:text-green-400",
  ACTIVE: "bg-green-500/10 text-green-600 dark:text-green-400",
  DNS_CREATED: "bg-green-500/10 text-green-600 dark:text-green-400",
  FAILED: "bg-red-500/10 text-red-500 dark:text-red-400",
  RELEASED: "bg-canvas-surface-hover text-canvas-muted",
  PROVISIONING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  REQUESTED: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  RELEASING: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

export default function DomainsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  // Block EMPLOYEE role
  useEffect(() => {
    const u = getUser();
    if (u && u.role === "EMPLOYEE") router.replace("/");
  }, [router]);

  const [alert, setAlert] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showAlert = useCallback((msg: string, type: "success" | "error") => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 5000);
  }, []);

  // ── Provider Accounts ──
  const [accData, setAccData] = useState<PageResponse<ProviderAccount> | null>(null);
  const [accPage, setAccPage] = useState(0);
  const [zones, setZones] = useState<ZoneFull[]>([]);
  const [expandedAcc, setExpandedAcc] = useState<Set<string>>(new Set());
  const [busyAcc, setBusyAcc] = useState<string | null>(null);
  const [provModalOpen, setProvModalOpen] = useState(false);

  // ── Assignments ──
  const [assignData, setAssignData] = useState<PageResponse<DomainAssignment> | null>(null);
  const [assignPage, setAssignPage] = useState(0);
  const [filterZone, setFilterZone] = useState("");
  const [busyAssign, setBusyAssign] = useState<string | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);

  // ── Load accounts + zones ──
  const loadAccounts = useCallback(async (p = 0) => {
    try {
      const [accRes, zoneRes] = await Promise.all([
        fetchProviderAccountsApi(p, PAGE_SIZE),
        fetchAllZonesApi(),
      ]);
      setAccData(accRes);
      setAccPage(p);
      setZones(zoneRes);
    } catch { showAlert("Failed to load accounts", "error"); }
  }, [showAlert]);

  const loadAssignments = useCallback(async (p = 0, zId?: string) => {
    try {
      const res = await fetchAssignmentsApi(p, PAGE_SIZE, zId || undefined);
      setAssignData(res);
      setAssignPage(p);
    } catch { showAlert("Failed to load subdomains", "error"); }
  }, [showAlert]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadAssignments(0, filterZone); }, [loadAssignments, filterZone]);

  // ── Zone helpers ──
  const zonesByAccount = useCallback((accountId: string) => zones.filter((z) => z.providerAccountId === accountId), [zones]);
  const activeZones = zones.filter((z) => z.active);

  const toggleExpand = useCallback((id: string) => {
    setExpandedAcc((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Account actions ──
  const handleSync = useCallback(async (id: string) => {
    setBusyAcc(`sync-${id}`);
    try {
      const r = await syncDomainsApi(id);
      showAlert(`Synced: ${r.total} found, ${r.imported} imported, ${r.skipped} already existed`, "success");
      loadAccounts(accPage);
    } catch (e) { showAlert(e instanceof ApiError ? e.message : "Sync failed", "error"); }
    finally { setBusyAcc(null); }
  }, [showAlert, loadAccounts, accPage]);

  const handleValidate = useCallback(async (id: string) => {
    setBusyAcc(`val-${id}`);
    try {
      const r = await validateProviderApi(id);
      showAlert(r.valid ? `Credentials valid${r.message ? ": " + r.message : ""}` : `Credentials invalid${r.message ? ": " + r.message : ""}`, r.valid ? "success" : "error");
      loadAccounts(accPage);
    } catch (e) { showAlert(e instanceof ApiError ? e.message : "Validate failed", "error"); }
    finally { setBusyAcc(null); }
  }, [showAlert, loadAccounts, accPage]);

  const handleDeleteAccount = useCallback(async (acc: ProviderAccount) => {
    if (!confirm(`Delete provider account "${acc.displayName}"? All imported domains will also be removed.`)) return;
    try { await deleteProviderAccountApi(acc.id); showAlert("Provider account deleted", "success"); loadAccounts(accPage); }
    catch (e) { showAlert(e instanceof ApiError ? e.message : "Delete failed", "error"); }
  }, [showAlert, loadAccounts, accPage]);

  const handleSetDefault = useCallback(async (zoneId: string) => {
    setBusyAcc(`def-${zoneId}`);
    try { await setDefaultZoneApi(zoneId); showAlert("Domain set as default for auto-assign", "success"); loadAccounts(accPage); }
    catch (e) { showAlert(e instanceof ApiError ? e.message : "Failed", "error"); }
    finally { setBusyAcc(null); }
  }, [showAlert, loadAccounts, accPage]);

  const handleDeleteZone = useCallback(async (zone: ZoneFull) => {
    if (!confirm(`Delete domain "${zone.zoneName}"?`)) return;
    try { await deleteZoneApi(zone.id); showAlert("Domain removed", "success"); loadAccounts(accPage); }
    catch (e) { showAlert(e instanceof ApiError ? e.message : "Delete failed", "error"); }
  }, [showAlert, loadAccounts, accPage]);

  // ── Assignment actions ──
  const handleVerify = useCallback(async (id: string) => {
    setBusyAssign(`ver-${id}`);
    try {
      const r = await verifyAssignmentApi(id);
      showAlert(r.status === "VERIFIED" ? "DNS record verified" : "DNS record not found — verification failed", r.status === "VERIFIED" ? "success" : "error");
      loadAssignments(assignPage, filterZone);
    } catch (e) { showAlert(e instanceof ApiError ? e.message : "Verify failed", "error"); }
    finally { setBusyAssign(null); }
  }, [showAlert, loadAssignments, assignPage, filterZone]);

  const handleRelease = useCallback(async (a: DomainAssignment) => {
    if (!confirm(`Release "${a.hostname}"? The DNS record will be deleted.`)) return;
    try { await releaseAssignmentApi(a.id); showAlert("Subdomain released", "success"); loadAssignments(assignPage, filterZone); }
    catch (e) { showAlert(e instanceof ApiError ? e.message : "Release failed", "error"); }
  }, [showAlert, loadAssignments, assignPage, filterZone]);

  const accounts = accData?.content ?? [];
  const assignments = assignData?.content ?? [];

  const modals = (
    <>
      <ProviderModal
        key={provModalOpen ? "prov" : "closed"}
        open={provModalOpen}
        onClose={() => setProvModalOpen(false)}
        onSaved={(msg) => { setProvModalOpen(false); showAlert(msg, "success"); loadAccounts(accPage); }}
      />
      <CustomRecordModal
        key={customModalOpen ? "custom" : "closed"}
        open={customModalOpen}
        zones={activeZones}
        onClose={() => setCustomModalOpen(false)}
        onSaved={() => { setCustomModalOpen(false); showAlert("Custom record created", "success"); loadAssignments(assignPage, filterZone); }}
      />
    </>
  );

  /* ── Mobile view ── */
  if (isMobile) {
    return (
      <>
      <MobileDomainsView
        alert={alert}
        accounts={accounts}
        accData={accData}
        zones={zones}
        assignments={assignments}
        assignData={assignData}
        activeZones={activeZones}
        filterZone={filterZone}
        busyAcc={busyAcc}
        busyAssign={busyAssign}
        zonesByAccount={zonesByAccount}
        onFilterZone={setFilterZone}
        onLoadAccounts={loadAccounts}
        onLoadAssignments={loadAssignments}
        onSync={handleSync}
        onValidate={handleValidate}
        onDeleteAccount={handleDeleteAccount}
        onSetDefault={handleSetDefault}
        onDeleteZone={handleDeleteZone}
        onVerify={handleVerify}
        onRelease={handleRelease}
        onOpenProvModal={() => setProvModalOpen(true)}
        onOpenCustomModal={() => setCustomModalOpen(true)}
      />
      {modals}
      </>
    );
  }

  /* ── Desktop view ── */
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {alert && (
        <div className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${alert.type === "success" ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400" : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"}`}>
          {alert.msg}
        </div>
      )}

      {/* ════════ SECTION 1: PROVIDER ACCOUNTS ════════ */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">Provider Accounts & Domains</h2>
          <button type="button" onClick={() => setProvModalOpen(true)} className="rounded-md border border-canvas-border bg-canvas-fg px-4 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90">
            + Add Account
          </button>
        </div>

        <div className="rounded-lg border border-canvas-border bg-canvas-bg">
          {accounts.length === 0 ? (
            <div className="py-12 text-center text-sm text-canvas-muted">No provider accounts yet. Add one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-canvas-border">
                    <Th style={{ width: 28 }}> </Th><Th>Account</Th><Th>Provider</Th><Th>Health</Th><Th>Domains</Th><Th>Created</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => {
                    const accZones = zonesByAccount(acc.id);
                    const isOpen = expandedAcc.has(acc.id);
                    return (
                      <AccountRow
                        key={acc.id}
                        acc={acc}
                        zones={accZones}
                        isOpen={isOpen}
                        busy={busyAcc}
                        onToggle={() => toggleExpand(acc.id)}
                        onSync={() => handleSync(acc.id)}
                        onValidate={() => handleValidate(acc.id)}
                        onDelete={() => handleDeleteAccount(acc)}
                        onSetDefault={handleSetDefault}
                        onDeleteZone={handleDeleteZone}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {accData && accData.totalPages > 1 && (
          <Pagination data={accData} onPage={(p) => loadAccounts(p)} />
        )}
      </div>

      {/* ════════ SECTION 2: SUBDOMAINS ════════ */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">Subdomains</h2>
          <div className="flex items-center gap-2">
            <select
              value={filterZone}
              onChange={(e) => { setFilterZone(e.target.value); }}
              className="rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg focus:outline-none"
            >
              <option value="">All domains</option>
              {activeZones.map((z) => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
            </select>
            <button type="button" onClick={() => setCustomModalOpen(true)} className="rounded-md border border-canvas-border bg-canvas-fg px-4 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90">
              + Custom Record
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-canvas-border bg-canvas-bg">
          {assignments.length === 0 ? (
            <div className="py-12 text-center text-sm text-canvas-muted">No subdomains found. Subdomains are created automatically when you add servers.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-canvas-border">
                    <Th>Hostname</Th><Th>Type</Th><Th>Target</Th><Th>Domain</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-canvas-fg whitespace-nowrap">{a.hostname}</td>
                      <td className="px-4 py-3"><Badge className="bg-canvas-surface-hover text-canvas-muted">{a.recordType}</Badge></td>
                      <td className="px-4 py-3 font-mono text-xs text-canvas-muted">{a.targetValue}</td>
                      <td className="px-4 py-3 text-xs text-canvas-muted">{a.zoneName || "—"}</td>
                      <td className="px-4 py-3"><Badge className={ASSIGN_STYLE[a.status] ?? ASSIGN_STYLE.REQUESTED}>{a.status}</Badge></td>
                      <td className="px-4 py-3 text-xs text-canvas-muted whitespace-nowrap">{fmt(a.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {a.status !== "RELEASED" && a.status !== "VERIFIED" && (
                            <GhostBtn onClick={() => handleVerify(a.id)} disabled={busyAssign === `ver-${a.id}`}>
                              {busyAssign === `ver-${a.id}` ? "..." : "Verify"}
                            </GhostBtn>
                          )}
                          {a.status !== "RELEASED" && (
                            <GhostBtn onClick={() => handleRelease(a)} danger>Release</GhostBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {assignData && assignData.totalPages > 1 && (
          <Pagination data={assignData} onPage={(p) => loadAssignments(p, filterZone)} />
        )}
      </div>

      {/* Modals */}
      {modals}
    </div>
  );
}

/* ================================================================== */
/*  Account expandable row                                             */
/* ================================================================== */

function AccountRow({
  acc, zones, isOpen, busy, onToggle, onSync, onValidate, onDelete, onSetDefault, onDeleteZone,
}: {
  acc: ProviderAccount; zones: ZoneFull[]; isOpen: boolean; busy: string | null;
  onToggle: () => void; onSync: () => void; onValidate: () => void; onDelete: () => void;
  onSetDefault: (id: string) => void; onDeleteZone: (z: ZoneFull) => void;
}) {
  return (
    <>
      <tr className="border-b border-canvas-border cursor-pointer transition-colors hover:bg-canvas-surface-hover/50" onClick={onToggle}>
        <td className="px-3 py-3 text-canvas-muted">
          <FiChevronRight size={14} className={`chevron-rotate ${isOpen ? "open" : ""}`} />
        </td>
        <td className="px-4 py-3 font-medium text-canvas-fg whitespace-nowrap">{acc.displayName}</td>
        <td className="px-4 py-3"><Badge className="bg-canvas-surface-hover text-canvas-muted">{acc.providerType}</Badge></td>
        <td className="px-4 py-3"><Badge className={HEALTH_STYLE[acc.healthStatus] ?? HEALTH_STYLE.UNKNOWN}>{acc.healthStatus}</Badge></td>
        <td className="px-4 py-3 text-xs text-canvas-muted">{zones.length} domain{zones.length !== 1 ? "s" : ""}</td>
        <td className="px-4 py-3 text-xs text-canvas-muted whitespace-nowrap">{fmt(acc.createdAt)}</td>
        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <GhostBtn onClick={onSync} disabled={busy === `sync-${acc.id}`}>{busy === `sync-${acc.id}` ? "Syncing..." : "Sync"}</GhostBtn>
            <GhostBtn onClick={onValidate} disabled={busy === `val-${acc.id}`}>{busy === `val-${acc.id}` ? "..." : "Validate"}</GhostBtn>
            <GhostBtn onClick={onDelete} danger>Delete</GhostBtn>
          </div>
        </td>
      </tr>
      <tr className="border-b border-canvas-border">
        <td colSpan={7} className="p-0">
          <div className={`animate-collapse ${isOpen ? "open" : ""}`}>
            <div className="collapse-inner">
              <div className="bg-canvas-surface-hover/30 px-8 py-3">
              {zones.length === 0 ? (
                <p className="text-xs text-canvas-muted py-2">No domains found. Click "Sync" to import domains from this provider.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-canvas-border">
                      <th className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Domain</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Status</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Default</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">TTL</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z) => (
                      <tr key={z.id} className="border-b border-canvas-border last:border-b-0">
                        <td className="px-2 py-2 font-medium text-canvas-fg">{z.zoneName}</td>
                        <td className="px-2 py-2">
                          <Badge className={z.active ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"}>
                            {z.active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          {z.defaultForAutoAssign ? <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Default</Badge> : "—"}
                        </td>
                        <td className="px-2 py-2 text-canvas-muted">{z.defaultTtl}s</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {z.active && !z.defaultForAutoAssign && (
                              <GhostBtn onClick={() => onSetDefault(z.id)} disabled={busy === `def-${z.id}`}>Set Default</GhostBtn>
                            )}
                            <GhostBtn onClick={() => onDeleteZone(z)} danger>Delete</GhostBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

/* ================================================================== */
/*  Provider Account Modal                                             */
/* ================================================================== */

const PROVIDER_HINTS: Record<string, { label: string; hint: string }> = {
  CLOUDFLARE: { label: "API Token", hint: "Cloudflare: API Token from dashboard (not Global API Key)" },
  NAMECHEAP: { label: "API Key", hint: "Namecheap: API Key from Profile > Tools > API Access" },
  GODADDY: { label: "API Key", hint: "GoDaddy: API Key (key:secret format)" },
};

function ProviderModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [provType, setProvType] = useState<ProviderType>("CLOUDFLARE");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [ncUsername, setNcUsername] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hint = PROVIDER_HINTS[provType] ?? PROVIDER_HINTS.CLOUDFLARE;

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!displayName.trim()) { setError("Account name is required."); return; }
    if (!apiKey.trim()) { setError("API key/token is required."); return; }
    if (provType === "NAMECHEAP" && !ncUsername.trim()) { setError("API Username is required for Namecheap."); return; }

    setSubmitting(true);
    try {
      const ts = Date.now();
      const credentialId = await createSecretApi(`${displayName.trim()}-${provType.toLowerCase()}-${ts}`, "DNS_TOKEN", apiKey.trim());
      const body: Parameters<typeof createProviderAccountApi>[0] = { displayName: displayName.trim(), providerType: provType, credentialId };
      if (provType === "NAMECHEAP") body.providerSettings = { apiUser: ncUsername.trim() };
      await createProviderAccountApi(body);
      onSaved("Account added — domains will be synced automatically");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Create failed"); }
    finally { setSubmitting(false); }
  }, [displayName, provType, apiKey, ncUsername, onSaved]);

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 pb-1 pt-6"><h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">Add Provider Account</h3></div>
        <div className="space-y-3 px-6 pb-2 pt-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Account Name <span className="text-red-500/70">*</span></label>
            <input type="text" required maxLength={100} placeholder="e.g. My Cloudflare Account" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputBase} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Provider Type <span className="text-red-500/70">*</span></label>
            <select value={provType} onChange={(e) => setProvType(e.target.value as ProviderType)} className={inputBase}>
              <option value="CLOUDFLARE">Cloudflare</option>
              <option value="NAMECHEAP">Namecheap</option>
              <option value="GODADDY">GoDaddy</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">{hint.label} <span className="text-red-500/70">*</span></label>
            <div className="relative">
              <input type={showKey ? "text" : "password"} required placeholder="Paste your API token here" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={`${inputBase} pr-9 font-mono text-xs`} />
              <button type="button" onClick={() => setShowKey((p) => !p)} tabIndex={-1} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg">
                {showKey ? <FiEyeOff size={14} /> : <FiEye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-canvas-muted">{hint.hint}</p>
          </div>
          {provType === "NAMECHEAP" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">API Username <span className="text-red-500/70">*</span></label>
              <input type="text" required placeholder="Your Namecheap username" maxLength={100} value={ncUsername} onChange={(e) => setNcUsername(e.target.value)} className={inputBase} />
              <p className="mt-1 text-[10px] text-canvas-muted">Whitelist your server's public IP in Namecheap: Profile &gt; Tools &gt; API Access</p>
            </div>
          )}
          {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted transition-colors hover:text-canvas-fg">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? "Adding..." : "Add Account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================== */
/*  Custom DNS Record Modal                                            */
/* ================================================================== */

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS"];

function CustomRecordModal({ open, zones, onClose, onSaved }: { open: boolean; zones: ZoneFull[]; onClose: () => void; onSaved: () => void }) {
  const [zoneId, setZoneId] = useState("");
  const [hostname, setHostname] = useState("");
  const [recordType, setRecordType] = useState("A");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!zoneId) { setError("Select a domain."); return; }
    if (!hostname.trim()) { setError("Hostname is required."); return; }
    if (!target.trim()) { setError("Target value is required."); return; }

    setSubmitting(true);
    try {
      await createCustomAssignmentApi({ zoneId, hostname: hostname.trim(), recordType, targetValue: target.trim() });
      onSaved();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Create failed"); }
    finally { setSubmitting(false); }
  }, [zoneId, hostname, recordType, target, onSaved]);

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 pb-1 pt-6"><h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">Add Custom DNS Record</h3></div>
        <div className="space-y-3 px-6 pb-2 pt-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Domain <span className="text-red-500/70">*</span></label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={inputBase}>
              <option value="">Select a domain...</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Hostname <span className="text-red-500/70">*</span></label>
            <input type="text" required placeholder="e.g. app.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} className={inputBase} />
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Record Type</label>
              <select value={recordType} onChange={(e) => setRecordType(e.target.value)} className={inputBase}>
                {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">Target Value <span className="text-red-500/70">*</span></label>
              <input type="text" required placeholder="e.g. 192.168.1.1" value={target} onChange={(e) => setTarget(e.target.value)} className={inputBase} />
            </div>
          </div>
          {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-canvas-muted transition-colors hover:text-canvas-fg">Cancel</button>
          <button type="submit" disabled={submitting} className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================== */
/*  Mobile Domains View                                                */
/* ================================================================== */

function MobileDomainsView({
  alert,
  accounts,
  accData,
  zones,
  assignments,
  assignData,
  activeZones,
  filterZone,
  busyAcc,
  busyAssign,
  zonesByAccount,
  onFilterZone,
  onLoadAccounts,
  onLoadAssignments,
  onSync,
  onValidate,
  onDeleteAccount,
  onSetDefault,
  onDeleteZone,
  onVerify,
  onRelease,
  onOpenProvModal,
  onOpenCustomModal,
}: {
  alert: { msg: string; type: "success" | "error" } | null;
  accounts: ProviderAccount[];
  accData: PageResponse<ProviderAccount> | null;
  zones: ZoneFull[];
  assignments: DomainAssignment[];
  assignData: PageResponse<DomainAssignment> | null;
  activeZones: ZoneFull[];
  filterZone: string;
  busyAcc: string | null;
  busyAssign: string | null;
  zonesByAccount: (id: string) => ZoneFull[];
  onFilterZone: (v: string) => void;
  onLoadAccounts: (p: number) => void;
  onLoadAssignments: (p: number, z?: string) => void;
  onSync: (id: string) => void;
  onValidate: (id: string) => void;
  onDeleteAccount: (acc: ProviderAccount) => void;
  onSetDefault: (id: string) => void;
  onDeleteZone: (z: ZoneFull) => void;
  onVerify: (id: string) => void;
  onRelease: (a: DomainAssignment) => void;
  onOpenProvModal: () => void;
  onOpenCustomModal: () => void;
}) {
  const [tab, setTab] = useState<"accounts" | "subdomains">("accounts");

  return (
    <div className="min-h-[calc(100vh-3rem)] px-3 pb-8 pt-20">
      {/* Alert */}
      {alert && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-xs ${alert.type === "success" ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400" : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"}`}>
          {alert.msg}
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-4 flex rounded-lg border border-canvas-border bg-canvas-bg p-0.5">
        <button
          type="button"
          onClick={() => setTab("accounts")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "accounts" ? "bg-canvas-fg text-canvas-bg" : "text-canvas-muted"
          }`}
        >
          Accounts
        </button>
        <button
          type="button"
          onClick={() => setTab("subdomains")}
          className={`flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
            tab === "subdomains" ? "bg-canvas-fg text-canvas-bg" : "text-canvas-muted"
          }`}
        >
          Subdomains
        </button>
      </div>

      {/* ── Accounts tab ── */}
      {tab === "accounts" && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-canvas-fg">Provider Accounts</h2>
            <button
              type="button"
              onClick={onOpenProvModal}
              className="rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg transition-opacity hover:opacity-90"
            >
              + Add
            </button>
          </div>

          {accounts.length === 0 ? (
            <div className="py-12 text-center text-xs text-canvas-muted">No provider accounts yet.</div>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => (
                <MobileAccountCard
                  key={acc.id}
                  acc={acc}
                  zones={zonesByAccount(acc.id)}
                  busy={busyAcc}
                  onSync={() => onSync(acc.id)}
                  onValidate={() => onValidate(acc.id)}
                  onDelete={() => onDeleteAccount(acc)}
                  onSetDefault={onSetDefault}
                  onDeleteZone={onDeleteZone}
                />
              ))}
            </div>
          )}

          {accData && accData.totalPages > 1 && (
            <MobilePagination data={accData} onPage={onLoadAccounts} />
          )}
        </>
      )}

      {/* ── Subdomains tab ── */}
      {tab === "subdomains" && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <select
              value={filterZone}
              onChange={(e) => onFilterZone(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-canvas-border bg-transparent px-2 py-1.5 text-xs text-canvas-fg focus:outline-none"
            >
              <option value="">All domains</option>
              {activeZones.map((z) => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
            </select>
            <button
              type="button"
              onClick={onOpenCustomModal}
              className="shrink-0 rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg transition-opacity hover:opacity-90"
            >
              + Record
            </button>
          </div>

          {assignments.length === 0 ? (
            <div className="py-12 text-center text-xs text-canvas-muted">No subdomains found.</div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <MobileAssignmentCard
                  key={a.id}
                  assignment={a}
                  busy={busyAssign}
                  onVerify={() => onVerify(a.id)}
                  onRelease={() => onRelease(a)}
                />
              ))}
            </div>
          )}

          {assignData && assignData.totalPages > 1 && (
            <MobilePagination data={assignData} onPage={(p) => onLoadAssignments(p, filterZone)} />
          )}
        </>
      )}

      {/* Modals rendered via portal from parent */}
    </div>
  );
}

/* ── Mobile account card ── */

function MobileAccountCard({
  acc, zones, busy, onSync, onValidate, onDelete, onSetDefault, onDeleteZone,
}: {
  acc: ProviderAccount; zones: ZoneFull[]; busy: string | null;
  onSync: () => void; onValidate: () => void; onDelete: () => void;
  onSetDefault: (id: string) => void; onDeleteZone: (z: ZoneFull) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-canvas-fg">{acc.displayName}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge className="bg-canvas-surface-hover text-canvas-muted">{acc.providerType}</Badge>
            <Badge className={HEALTH_STYLE[acc.healthStatus] ?? HEALTH_STYLE.UNKNOWN}>{acc.healthStatus}</Badge>
            <span className="text-[10px] text-canvas-muted">{zones.length} domain{zones.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <FiChevronRight size={14} className={`shrink-0 text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-4 py-3 space-y-3">
          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <MobileActionBtn icon={<FiRefreshCw size={11} />} label={busy === `sync-${acc.id}` ? "Syncing..." : "Sync"} onClick={onSync} disabled={busy === `sync-${acc.id}`} />
            <MobileActionBtn icon={<FiCheckCircle size={11} />} label={busy === `val-${acc.id}` ? "..." : "Validate"} onClick={onValidate} disabled={busy === `val-${acc.id}`} />
            <MobileActionBtn icon={<FiTrash2 size={11} />} label="Delete" onClick={onDelete} danger />
          </div>

          {/* Zones */}
          {zones.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Domains</p>
              {zones.map((z) => (
                <div key={z.id} className="flex items-center gap-2 rounded-lg border border-canvas-border px-3 py-2">
                  <FiGlobe size={11} className="shrink-0 text-canvas-muted" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-canvas-fg">{z.zoneName}</span>
                  {z.defaultForAutoAssign && (
                    <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">Default</Badge>
                  )}
                  <Badge className={z.active ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"}>
                    {z.active ? "Active" : "Inactive"}
                  </Badge>
                  <div className="flex items-center gap-1">
                    {z.active && !z.defaultForAutoAssign && (
                      <button type="button" onClick={() => onSetDefault(z.id)} disabled={busy === `def-${z.id}`} className="rounded p-1 text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-40" title="Set Default">
                        <FiStar size={11} />
                      </button>
                    )}
                    <button type="button" onClick={() => onDeleteZone(z)} className="rounded p-1 text-red-500 hover:bg-red-500/5 dark:text-red-400" title="Delete">
                      <FiTrash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {zones.length === 0 && (
            <p className="text-[11px] text-canvas-muted">No domains. Click &quot;Sync&quot; to import.</p>
          )}

          <p className="text-[10px] text-canvas-muted">Created {fmt(acc.createdAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile assignment card ── */

function MobileAssignmentCard({
  assignment: a, busy, onVerify, onRelease,
}: {
  assignment: DomainAssignment; busy: string | null;
  onVerify: () => void; onRelease: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-medium text-canvas-fg">{a.hostname}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge className="bg-canvas-surface-hover text-canvas-muted">{a.recordType}</Badge>
            <Badge className={ASSIGN_STYLE[a.status] ?? ASSIGN_STYLE.REQUESTED}>{a.status}</Badge>
          </div>
        </div>
        <FiChevronDown size={12} className={`shrink-0 text-canvas-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="space-y-2 border-t border-canvas-border px-3.5 py-2.5 text-[11px]">
          <div className="flex justify-between">
            <span className="text-canvas-muted">Target</span>
            <span className="font-mono text-canvas-fg">{a.targetValue}</span>
          </div>
          {a.zoneName && (
            <div className="flex justify-between">
              <span className="text-canvas-muted">Domain</span>
              <span className="text-canvas-fg">{a.zoneName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-canvas-muted">Created</span>
            <span className="text-canvas-fg">{fmt(a.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            {a.status !== "RELEASED" && a.status !== "VERIFIED" && (
              <MobileActionBtn
                icon={<FiCheckCircle size={11} />}
                label={busy === `ver-${a.id}` ? "..." : "Verify"}
                onClick={onVerify}
                disabled={busy === `ver-${a.id}`}
              />
            )}
            {a.status !== "RELEASED" && (
              <MobileActionBtn icon={<FiTrash2 size={11} />} label="Release" onClick={onRelease} danger />
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mobile helpers ── */

function MobileActionBtn({
  icon, label, onClick, danger, disabled,
}: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-40 ${
        danger
          ? "border-red-500/20 text-red-500 hover:bg-red-500/5 dark:text-red-400"
          : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MobilePagination({ data, onPage }: { data: PageResponse<unknown>; onPage: (p: number) => void }) {
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-canvas-muted">
      <button type="button" onClick={() => onPage(data.number - 1)} disabled={data.first} className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted disabled:opacity-30">Prev</button>
      <span>{data.number + 1} / {data.totalPages}</span>
      <button type="button" onClick={() => onPage(data.number + 1)} disabled={data.last} className="rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted disabled:opacity-30">Next</button>
    </div>
  );
}

/* ── Shared ── */

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted" style={style}>{children}</th>;
}
function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>;
}
function GhostBtn({ children, onClick, danger, disabled }: { children: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${danger ? "text-red-500 hover:bg-red-500/5 dark:text-red-400" : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"}`}>
      {children}
    </button>
  );
}
function Pagination({ data, onPage }: { data: PageResponse<unknown>; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-canvas-muted">
      <button type="button" onClick={() => onPage(data.number - 1)} disabled={data.first} className="rounded-md border border-canvas-border px-3 py-1 text-[11px] font-medium text-canvas-muted hover:bg-canvas-surface-hover disabled:opacity-30">Prev</button>
      <span>Page {data.number + 1} of {data.totalPages}</span>
      <button type="button" onClick={() => onPage(data.number + 1)} disabled={data.last} className="rounded-md border border-canvas-border px-3 py-1 text-[11px] font-medium text-canvas-muted hover:bg-canvas-surface-hover disabled:opacity-30">Next</button>
    </div>
  );
}
function fmt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
