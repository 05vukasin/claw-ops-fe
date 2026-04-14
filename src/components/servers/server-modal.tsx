"use client";

import { useCallback, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiFile, FiUpload, FiX } from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import {
  createSecretApi,
  createServerApi,
  updateServerApi,
  fetchZonesApi,
  ApiError,
  type Server,
  type ServerAuthType,
  type Zone,
} from "@/lib/api";

interface ServerModalProps {
  open: boolean;
  server: Server | null; // null = create mode
  onClose: () => void;
  onSaved: (msg: string) => void;
}

export function ServerModal({ open, server, onClose, onSaved }: ServerModalProps) {
  const isEdit = !!server;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Server fields
  const [name, setName] = useState(server?.name ?? "");
  const [host, setHost] = useState(server?.hostname ?? server?.ipAddress ?? "");
  const [port, setPort] = useState(String(server?.sshPort ?? 22));
  const [username, setUsername] = useState(server?.sshUsername ?? "");
  const [environment, setEnvironment] = useState(server?.environment ?? "");
  const [zoneId, setZoneId] = useState("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);

  // Auth
  const [authType, setAuthType] = useState<ServerAuthType>(server?.authType ?? "PASSWORD");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pemContent, setPemContent] = useState("");
  const [pemFileName, setPemFileName] = useState("");
  const [keyPassphrase, setKeyPassphrase] = useState("");
  const [showKeyPassphrase, setShowKeyPassphrase] = useState(false);

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load zones when modal opens (create mode)
  const loadZonesOnce = useCallback(() => {
    if (zonesLoaded || isEdit) return;
    setZonesLoaded(true);
    fetchZonesApi().then(setZones).catch(() => {});
  }, [zonesLoaded, isEdit]);

  // Called when modal becomes visible
  if (open && !zonesLoaded && !isEdit) {
    loadZonesOnce();
  }

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      if (!text.includes("-----BEGIN") || !text.includes("PRIVATE KEY-----")) {
        setFormError("Invalid key file — must contain a private key in PEM format.");
        setPemContent("");
        setPemFileName("");
        return;
      }
      setPemContent(text);
      setPemFileName(file.name);
      setFormError("");
    };
    reader.onerror = () => setFormError("Failed to read file.");
    reader.readAsText(file);
  }, []);

  const handleClearFile = useCallback(() => {
    setPemContent("");
    setPemFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setFormError("");

      const trimmedName = name.trim();
      const trimmedHost = host.trim();
      const trimmedUser = username.trim();

      if (!trimmedName) { setFormError("Server name is required."); return; }
      if (!trimmedHost) { setFormError("Host is required."); return; }
      if (!trimmedUser) { setFormError("SSH username is required."); return; }

      const portNum = parseInt(port, 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        setFormError("Port must be between 1 and 65535.");
        return;
      }

      if (!isEdit && authType === "PASSWORD" && !password) {
        setFormError("SSH password is required.");
        return;
      }
      if (!isEdit && authType === "PRIVATE_KEY" && !pemContent.trim()) {
        setFormError("A private key is required.");
        return;
      }

      setSubmitting(true);
      try {
        const ts = Date.now();
        let credentialId: string | null = null;
        let passphraseCredentialId: string | null = null;

        // Create secrets inline
        if (authType === "PASSWORD" && password) {
          credentialId = await createSecretApi(`${trimmedName}-pw-${ts}`, "SSH_PASSWORD", password);
        } else if (authType === "PRIVATE_KEY") {
          if (pemContent.trim()) {
            credentialId = await createSecretApi(`${trimmedName}-key-${ts}`, "SSH_PRIVATE_KEY", pemContent);
          }
          if (keyPassphrase.trim()) {
            passphraseCredentialId = await createSecretApi(`${trimmedName}-pp-${ts}`, "SSH_PASSWORD", keyPassphrase.trim());
          }
        }

        const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(trimmedHost);
        const body = {
          name: trimmedName,
          hostname: trimmedHost,
          ipAddress: isIp ? trimmedHost : null,
          sshPort: portNum,
          sshUsername: trimmedUser,
          authType,
          credentialId,
          passphraseCredentialId,
          environment: environment.trim() || null,
          ...(!isEdit ? { zoneId: zoneId || null } : {}),
        };

        if (isEdit) {
          await updateServerApi(server!.id, body);
          onSaved("Server updated");
        } else {
          const created = await createServerApi(body);
          if (created.assignedDomain) {
            onSaved(`Server created with subdomain: ${created.assignedDomain}`);
          } else {
            onSaved("Server created");
          }
        }
        onClose();
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [name, host, username, port, authType, password, pemContent, keyPassphrase, environment, zoneId, isEdit, server, onClose, onSaved],
  );

  const inputBase =
    "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  const labelBase = "mb-1.5 block text-[11px] font-medium text-canvas-muted";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <div className="px-6 pb-1 pt-6">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">
            {isEdit ? "Edit Server" : "Add Server"}
          </h3>
          <p className="mt-0.5 text-[11px] text-canvas-muted">
            {isEdit ? "Update server details and connection" : "Register a server and configure SSH connection"}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[60vh] overflow-y-auto px-6 pb-2 pt-4">
          {/* Section: Server */}
          <SectionHeader>Server</SectionHeader>

          <div className="mt-3 space-y-3">
            <Field label="Name" required>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g. Production Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputBase}
                autoFocus
              />
            </Field>

            <Field label="Host" required>
              <input
                type="text"
                required
                placeholder="IP or hostname"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className={inputBase}
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Environment" optional className="flex-1">
                <input
                  type="text"
                  placeholder="production (default)"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                  className={inputBase}
                />
              </Field>
              {!isEdit ? (
                <Field label="Domain" optional className="flex-1">
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className={inputBase}
                  >
                    <option value="">No domain</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.zoneName}{z.defaultForAutoAssign ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-canvas-muted/70">
                    {zoneId
                      ? "A subdomain will be auto-assigned. SSL can be provisioned after creation."
                      : "Without a domain, SSL certificates cannot be provisioned."}
                  </p>
                </Field>
              ) : (
                <Field label="Domain" className="flex-1">
                  {server?.assignedDomain ? (
                    <div className="flex items-center gap-2 py-1.5">
                      <p className="truncate font-mono text-xs text-canvas-fg">{server.assignedDomain}</p>
                      <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">Assigned</span>
                    </div>
                  ) : (
                    <div className="py-1.5">
                      <p className="text-[11px] text-canvas-muted">No domain assigned</p>
                      <p className="mt-0.5 text-[10px] text-canvas-muted/60">Domain assignment is set during server creation</p>
                    </div>
                  )}
                </Field>
              )}
            </div>
          </div>

          {/* Section: Connection */}
          <div className="mt-5">
            <SectionHeader>Connection</SectionHeader>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex gap-3">
              <Field label="Username" required className="flex-1">
                <input
                  type="text"
                  required
                  placeholder="root"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputBase}
                />
              </Field>
              <Field label="Port" className="w-20">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className={inputBase}
                />
              </Field>
            </div>

            {/* Auth method */}
            <div>
              <p className={labelBase}>
                Authentication <span className="text-red-500/70">*</span>
              </p>
              <div className="flex rounded-md border border-canvas-border bg-canvas-surface-hover/50">
                <SegmentButton
                  active={authType === "PASSWORD"}
                  onClick={() => setAuthType("PASSWORD")}
                  position="left"
                >
                  Password
                </SegmentButton>
                <SegmentButton
                  active={authType === "PRIVATE_KEY"}
                  onClick={() => setAuthType("PRIVATE_KEY")}
                  position="right"
                >
                  Private Key
                </SegmentButton>
              </div>
            </div>

            {/* Password fields */}
            {authType === "PASSWORD" && (
              <Field label="Password" required={!isEdit}>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="off"
                    placeholder={isEdit ? "Leave blank to keep current" : "SSH password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputBase} pr-9`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg"
                  >
                    {showPassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                  </button>
                </div>
              </Field>
            )}

            {/* Key fields */}
            {authType === "PRIVATE_KEY" && (
              <>
                <Field label="Private Key" required={!isEdit}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
                    >
                      <FiUpload size={13} />
                      Upload file
                    </button>
                    {pemFileName && (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <FiFile size={13} className="shrink-0 text-canvas-muted" />
                        <span className="truncate text-xs text-canvas-fg">{pemFileName}</span>
                        <button
                          type="button"
                          onClick={handleClearFile}
                          aria-label="Remove file"
                          className="shrink-0 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg"
                        >
                          <FiX size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pem,.key,id_rsa,id_ed25519,id_ecdsa"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <textarea
                    rows={5}
                    placeholder={isEdit ? "Paste new key to replace current..." : "Or paste private key content here..."}
                    value={pemContent}
                    onChange={(e) => { setPemContent(e.target.value); setPemFileName(""); }}
                    className={`${inputBase} mt-2 resize-none font-mono text-[11px] leading-relaxed`}
                  />
                </Field>

                <Field label="Key Passphrase" optional>
                  <div className="relative">
                    <input
                      type={showKeyPassphrase ? "text" : "password"}
                      autoComplete="off"
                      placeholder="If key is passphrase-protected"
                      value={keyPassphrase}
                      onChange={(e) => setKeyPassphrase(e.target.value)}
                      className={`${inputBase} pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyPassphrase((p) => !p)}
                      tabIndex={-1}
                      aria-label={showKeyPassphrase ? "Hide passphrase" : "Show passphrase"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg"
                    >
                      {showKeyPassphrase ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                    </button>
                  </div>
                </Field>
              </>
            )}
          </div>

          {/* Error */}
          {formError && (
            <p className="mt-3 text-[11px] text-red-500 dark:text-red-400">{formError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-canvas-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-canvas-muted transition-colors hover:text-canvas-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-canvas-border bg-canvas-fg px-5 py-2 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-current" />
                {isEdit ? "Saving..." : "Adding..."}
              </span>
            ) : isEdit ? "Save changes" : "Add server"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Sub-components ── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-canvas-muted">
        {children}
      </p>
      <div className="h-px flex-1 bg-canvas-border" />
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="mb-1.5 block text-[11px] font-medium text-canvas-muted">
        {label}
        {required && <span className="text-red-500/70"> *</span>}
        {optional && <span className="ml-1 font-normal text-canvas-muted/50">optional</span>}
      </p>
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  position,
  children,
}: {
  active: boolean;
  onClick: () => void;
  position: "left" | "right";
  children: React.ReactNode;
}) {
  const rounded = position === "left" ? "rounded-l-[5px]" : "rounded-r-[5px]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-xs font-medium transition-all ${rounded} ${
        active
          ? "bg-canvas-fg text-canvas-bg shadow-sm"
          : "text-canvas-muted hover:text-canvas-fg"
      }`}
    >
      {children}
    </button>
  );
}
