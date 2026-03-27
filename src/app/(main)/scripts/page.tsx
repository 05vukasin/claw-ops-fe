"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiFile, FiUpload } from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
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
  const [data, setData] = useState<PageResponse<DeploymentScript> | null>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
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

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const handleCreate = useCallback(() => {
    setEditScript(null);
    setModalOpen(true);
  }, []);

  const handleEdit = useCallback(async (id: string) => {
    try {
      const script = await fetchScriptApi(id);
      setEditScript(script);
      setModalOpen(true);
    } catch {
      showAlert("Failed to load script", "error");
    }
  }, [showAlert]);

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

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setEditScript(null);
  }, []);

  const handleSaved = useCallback(
    (msg: string) => {
      setModalOpen(false);
      setEditScript(null);
      showAlert(msg, "success");
      loadScripts();
    },
    [showAlert, loadScripts],
  );

  const scripts = data?.content ?? [];

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
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-canvas-border last:border-b-0 transition-colors hover:bg-canvas-surface-hover/50"
                  >
                    <td className="px-4 py-3 font-medium text-canvas-fg whitespace-nowrap">{s.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[s.scriptType] ?? TYPE_STYLE.GENERAL}`}>
                        {s.scriptType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-canvas-muted max-w-62.5 truncate">{s.description || "—"}</td>
                    <td className="px-4 py-3 text-xs text-canvas-muted whitespace-nowrap">{formatDate(s.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <GhostBtn onClick={() => handleEdit(s.id)}>Edit</GhostBtn>
                        <GhostBtn onClick={() => handleDelete(s)} danger>Delete</GhostBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Script modal */}
      <ScriptModal
        key={editScript?.id ?? "new"}
        open={modalOpen}
        script={editScript}
        onClose={handleModalClose}
        onSaved={handleSaved}
      />
    </div>
  );
}

/* ================================================================== */
/*  Script Create/Edit Modal                                           */
/* ================================================================== */

function ScriptModal({
  open,
  script,
  onClose,
  onSaved,
}: {
  open: boolean;
  script: DeploymentScript | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = !!script;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(script?.name ?? "");
  const [scriptType, setScriptType] = useState<ScriptType>(script?.scriptType ?? "GENERAL");
  const [description, setDescription] = useState(script?.description ?? "");
  const [content, setContent] = useState(script?.scriptContent ?? "#!/bin/bash\nset -e\n\n");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(reader.result as string);
      setFileName(file.name);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
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
    },
    [name, scriptType, description, content, isEdit, script, onSaved],
  );

  const inputBase =
    "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 transition-colors focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        {/* Header */}
        <div className="px-6 pb-1 pt-6">
          <h3 className="text-[15px] font-semibold tracking-tight text-canvas-fg">
            {isEdit ? "Edit Script" : "New Script"}
          </h3>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto px-6 pb-2 pt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">
              Name <span className="text-red-500/70">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputBase}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">
                Type <span className="text-red-500/70">*</span>
              </label>
              <select
                value={scriptType}
                onChange={(e) => setScriptType(e.target.value as ScriptType)}
                className={inputBase}
              >
                {SCRIPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">
              Description <span className="ml-1 font-normal text-canvas-muted/50">optional</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputBase}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-canvas-muted">
              Script Content <span className="text-red-500/70">*</span>
            </label>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
              >
                <FiUpload size={13} />
                Upload .sh file
              </button>
              {fileName && (
                <span className="flex items-center gap-1 text-xs text-canvas-muted">
                  <FiFile size={12} />
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
            </div>
            <textarea
              rows={15}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`${inputBase} resize-none font-mono text-[12px] leading-relaxed`}
              spellCheck={false}
            />
          </div>

          {error && <p className="text-[11px] text-red-500 dark:text-red-400">{error}</p>}
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
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Shared sub-components ── */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-canvas-muted">{children}</th>
  );
}

function GhostBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
        danger
          ? "text-red-500 hover:bg-red-500/5 dark:text-red-400"
          : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
