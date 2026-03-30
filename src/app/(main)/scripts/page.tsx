"use client";

import { Suspense, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiFile, FiUpload, FiTrash2, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";
import { useIsMobile } from "@/lib/use-is-mobile";
import { MobileScriptsDashboard } from "@/components/scripts";
import {
  fetchScriptsApi,
  fetchScriptApi,
  createScriptApi,
  updateScriptApi,
  deleteScriptApi,
  ApiError,
  type DeploymentScript,
  type ScriptType,
  type PageResponse,
} from "@/lib/api";

const SCRIPT_TYPES: ScriptType[] = ["GENERAL", "INSTALL", "REMOVE", "UPDATE", "MAINTENANCE"];

const TYPE_STYLE: Record<string, string> = {
  GENERAL: "bg-canvas-surface-hover text-canvas-muted",
  INSTALL: "bg-green-500/10 text-green-600 dark:text-green-400",
  REMOVE: "bg-red-500/10 text-red-500 dark:text-red-400",
  UPDATE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  MAINTENANCE: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

export default function ScriptsPage() {
  return (
    <Suspense>
      <ScriptsPageContent />
    </Suspense>
  );
}

function ScriptsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const urlScriptId = searchParams.get("id");

  const [data, setData] = useState<PageResponse<DeploymentScript> | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Popup
  const [popupOpen, setPopupOpen] = useState(false);
  const [editScript, setEditScript] = useState<DeploymentScript | null>(null);

  const showAlert = useCallback((msg: string, type: "success" | "error") => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 4000);
  }, []);

  const loadScripts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchScriptsApi();
      setData(result);
    } catch {
      showAlert("Failed to load scripts", "error");
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => { loadScripts(); }, [loadScripts]);

  // Auto-open script from URL param
  useEffect(() => {
    if (!urlScriptId || !data) return;
    if (popupOpen && editScript?.id === urlScriptId) return;

    fetchScriptApi(urlScriptId)
      .then((script) => {
        setEditScript(script);
        setPopupOpen(true);
      })
      .catch(() => {
        router.replace("/scripts");
      });
  }, [urlScriptId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close modal when URL param disappears (browser back)
  useEffect(() => {
    if (!urlScriptId && popupOpen) {
      setPopupOpen(false);
      setEditScript(null);
    }
  }, [urlScriptId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = useCallback(() => {
    setEditScript(null);
    setPopupOpen(true);
  }, []);

  const handleRowClick = useCallback(async (script: DeploymentScript) => {
    router.push(`/scripts?id=${script.id}`);
    try {
      const full = await fetchScriptApi(script.id);
      setEditScript(full);
    } catch {
      setEditScript(script);
    }
    setPopupOpen(true);
  }, [router]);

  const handleDelete = useCallback(
    async (script: DeploymentScript) => {
      if (!window.confirm(`Delete script "${script.name}"?`)) return;
      try {
        await deleteScriptApi(script.id);
        showAlert("Script deleted", "success");
        loadScripts();
      } catch (err) {
        showAlert(err instanceof ApiError ? err.message : "Failed to delete script", "error");
      }
    },
    [showAlert, loadScripts],
  );

  const handlePopupClose = useCallback(() => {
    setPopupOpen(false);
    setEditScript(null);
    router.push("/scripts");
  }, [router]);

  const handleSaved = useCallback(
    (msg: string) => {
      setPopupOpen(false);
      setEditScript(null);
      router.push("/scripts");
      showAlert(msg, "success");
      loadScripts();
    },
    [router, showAlert, loadScripts],
  );

  const handleDeleteFromPopup = useCallback(() => {
    if (editScript) {
      handleDelete(editScript).then(() => {
        setPopupOpen(false);
        setEditScript(null);
        router.push("/scripts");
      });
    }
  }, [editScript, handleDelete, router]);

  const scripts = data?.content ?? [];

  // Mobile: read-only card dashboard
  if (isMobile) {
    return <MobileScriptsDashboard scripts={scripts} loading={loading} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alert */}
      {alert && (
        <div
          className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
            alert.type === "success"
              ? "border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400"
              : "border-red-500/20 bg-red-500/5 text-red-500 dark:text-red-400"
          }`}
        >
          {alert.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-canvas-fg">Script Library</h2>
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-md border border-canvas-border bg-canvas-fg px-4 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
        >
          + New Script
        </button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-canvas-border bg-canvas-bg">
        {loading && scripts.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">Loading...</div>
        ) : scripts.length === 0 ? (
          <div className="py-12 text-center text-sm text-canvas-muted">No scripts yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-canvas-border">
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th>Created</Th>
                  <Th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {scripts.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => handleRowClick(s)}
                    className="cursor-pointer border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50"
                  >
                    <td className="px-4 py-3 font-medium text-canvas-fg whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[s.scriptType] ?? TYPE_STYLE.GENERAL}`}>
                        {s.scriptType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-canvas-muted max-w-xs truncate">{s.description || "—"}</td>
                    <td className="px-4 py-3 text-xs text-canvas-muted whitespace-nowrap">{formatDate(s.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(s); }}
                        className="rounded-md p-1.5 text-canvas-muted transition-colors hover:bg-red-500/5 hover:text-red-500 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <FiTrash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Script popup */}
      <ScriptPopup
        key={editScript?.id ?? "new"}
        open={popupOpen}
        script={editScript}
        onClose={handlePopupClose}
        onSaved={handleSaved}
        onDelete={editScript ? handleDeleteFromPopup : undefined}
      />
    </div>
  );
}

/* ================================================================== */
/*  Script Detail/Edit Popup (wider, inline editing, dirty tracking)  */
/* ================================================================== */

const emptySubscribe = () => () => {};

function ScriptPopup({
  open,
  script,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  script: DeploymentScript | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
  onDelete?: () => void;
}) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEdit = !!script;

  const [name, setName] = useState(script?.name ?? "");
  const [scriptType, setScriptType] = useState<ScriptType>(script?.scriptType ?? "GENERAL");
  const [description, setDescription] = useState(script?.description ?? "");
  const [content, setContent] = useState(script?.scriptContent ?? "#!/bin/bash\nset -e\n\n");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Dirty tracking
  const isDirty = useMemo(() => {
    if (!isEdit) return true; // new script always shows Save
    return (
      name !== (script?.name ?? "") ||
      scriptType !== (script?.scriptType ?? "GENERAL") ||
      description !== (script?.description ?? "") ||
      content !== (script?.scriptContent ?? "")
    );
  }, [isEdit, name, scriptType, description, content, script]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setContent(reader.result as string); setFileName(file.name); };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!name.trim()) { setError("Name is required."); return; }
    if (!content.trim()) { setError("Script content is required."); return; }

    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        scriptType,
        description: description.trim() || null,
        scriptContent: content,
      };
      if (isEdit) {
        await updateScriptApi(script!.id, body);
        onSaved("Script updated");
      } else {
        await createScriptApi(body);
        onSaved("Script created");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }, [name, scriptType, description, content, isEdit, script, onSaved]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
  }, [onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="pointer-events-none fixed inset-0 bg-black/40 dark:bg-black/60" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-canvas-border bg-canvas-bg shadow-2xl"
        style={{ height: "85vh" }}
      >
        {/* ── Header ── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-canvas-border px-6 py-4">
          {/* Name — editable inline */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Script name..."
            maxLength={100}
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-canvas-fg placeholder:text-canvas-muted/40 outline-none"
          />

          {/* Type badge selector */}
          <div className="flex shrink-0 items-center gap-1">
            {SCRIPT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setScriptType(t)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  scriptType === t
                    ? TYPE_STYLE[t]
                    : "text-canvas-muted/40 hover:text-canvas-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={16} />
          </button>
        </div>

        {/* ── Description ── */}
        <div className="shrink-0 border-b border-canvas-border px-6 py-2.5">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="w-full bg-transparent text-sm text-canvas-muted placeholder:text-canvas-muted/30 outline-none"
          />
        </div>

        {/* ── Script content ── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-0 flex-1 resize-none border-none bg-[#0d1117] px-6 py-4 font-mono text-[13px] leading-relaxed text-[#e6edf3] placeholder:text-gray-600 outline-none"
            style={{ fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace" }}
            spellCheck={false}
            placeholder="#!/bin/bash&#10;set -e&#10;&#10;# Your script here..."
          />
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="shrink-0 border-t border-red-500/20 bg-red-500/5 px-6 py-2 text-[11px] text-red-500 dark:text-red-400">
            {error}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center gap-2 border-t border-canvas-border px-6 py-3">
          {/* Left: Delete + Upload */}
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-500/5 dark:text-red-400"
            >
              <FiTrash2 size={12} />
              Delete
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiUpload size={12} />
            Upload .sh
          </button>
          {fileName && (
            <span className="flex items-center gap-1 text-[11px] text-canvas-muted">
              <FiFile size={11} />
              {fileName}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".sh,.bash,text/x-sh,text/plain"
            onChange={handleFile}
            className="hidden"
          />

          <span className="flex-1" />

          {/* Right: Cancel + Save */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-sm text-canvas-muted transition-colors hover:text-canvas-fg"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !isDirty}
            className={`rounded-md border border-canvas-border px-5 py-1.5 text-sm font-medium transition-all ${
              isDirty
                ? "bg-canvas-fg text-canvas-bg opacity-100 hover:opacity-90"
                : "bg-canvas-fg/10 text-canvas-muted opacity-50 cursor-default"
            } disabled:cursor-not-allowed`}
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Shared sub-components ── */

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted ${className ?? ""}`}>{children}</th>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
