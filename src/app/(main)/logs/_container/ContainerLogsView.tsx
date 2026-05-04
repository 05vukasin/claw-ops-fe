"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FiSettings, FiTrash2 } from "react-icons/fi";
import {
  ApiError,
  deleteOldContainerLogsApi,
  type ContainerService,
} from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import { ServiceLogsHistory } from "./ServiceLogsHistory";
import { ServiceLogsLive } from "./ServiceLogsLive";
import { RetentionSettingsModal } from "./RetentionSettingsModal";

const SERVICES: { id: ContainerService; label: string }[] = [
  { id: "BACKEND", label: "Backend" },
  { id: "FRONTEND", label: "Frontend" },
  { id: "NGINX", label: "Nginx" },
  { id: "POSTGRES", label: "Postgres" },
];

type ViewId = "history" | "live";
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "history", label: "History" },
  { id: "live", label: "Live" },
];

const DELETE_PRESETS: { id: string; label: string; days: number }[] = [
  { id: "1", label: "Older than 1 day", days: 1 },
  { id: "7", label: "Older than 7 days", days: 7 },
  { id: "30", label: "Older than 30 days", days: 30 },
  { id: "90", label: "Older than 90 days", days: 90 },
];

function isService(v: string | null | undefined): v is ContainerService {
  return v === "BACKEND" || v === "FRONTEND" || v === "NGINX" || v === "POSTGRES";
}

function isView(v: string | null | undefined): v is ViewId {
  return v === "history" || v === "live";
}

export function ContainerLogsView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialService: ContainerService = isService(searchParams?.get("service"))
    ? (searchParams!.get("service") as ContainerService)
    : "BACKEND";
  const initialView: ViewId = isView(searchParams?.get("view"))
    ? (searchParams!.get("view") as ViewId)
    : "history";

  const [service, setService] = useState<ContainerService>(initialService);
  const [view, setView] = useState<ViewId>(initialView);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const syncUrl = useCallback(
    (next: { service?: ContainerService; view?: ViewId }) => {
      const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      params.set("tab", "container");
      params.set("service", next.service ?? service);
      params.set("view", next.view ?? view);
      router.replace(`/logs?${params.toString()}`);
    },
    [router, searchParams, service, view],
  );

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (params.get("tab") !== "container") return;
    if (!params.get("service") || !params.get("view")) {
      params.set("tab", "container");
      params.set("service", service);
      params.set("view", view);
      router.replace(`/logs?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectService(next: ContainerService) {
    setService(next);
    syncUrl({ service: next });
  }

  function selectView(next: ViewId) {
    setView(next);
    syncUrl({ view: next });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap items-center gap-1 rounded-md border border-canvas-border p-1">
          {SERVICES.map((s) => {
            const active = s.id === service;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={active}
                onClick={() => selectService(s.id)}
                className={
                  "rounded px-3 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-canvas-fg text-canvas-bg"
                    : "text-canvas-muted hover:text-canvas-fg")
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div role="tablist" className="flex items-center gap-1 rounded-md border border-canvas-border p-1">
          {VIEWS.map((v) => {
            const active = v.id === view;
            return (
              <button
                key={v.id}
                role="tab"
                aria-selected={active}
                onClick={() => selectView(v.id)}
                className={
                  "rounded px-3 py-1 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-canvas-fg text-canvas-bg"
                    : "text-canvas-muted hover:text-canvas-fg")
                }
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRetentionOpen(true)}
            className="flex items-center gap-1 rounded-md border border-canvas-border px-2.5 py-1 text-xs text-canvas-muted transition-colors hover:text-canvas-fg"
          >
            <FiSettings size={12} />
            Retention settings
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10"
          >
            <FiTrash2 size={12} />
            Delete old logs
          </button>
        </div>
      </div>

      {view === "history" ? (
        <ServiceLogsHistory key={`hist-${service}`} service={service} />
      ) : (
        <ServiceLogsLive key={`live-${service}`} service={service} />
      )}

      <RetentionSettingsModal open={retentionOpen} onClose={() => setRetentionOpen(false)} />
      <DeleteOldLogsModal
        open={deleteOpen}
        service={service}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function DeleteOldLogsModal({
  open,
  service,
  onClose,
}: {
  open: boolean;
  service: ContainerService;
  onClose: () => void;
}) {
  const [presetId, setPresetId] = useState<string>("7");
  const [customDays, setCustomDays] = useState<number>(7);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [scope, setScope] = useState<"service" | "all">("service");

  useEffect(() => {
    if (open) {
      setPresetId("7");
      setCustomDays(7);
      setConfirmText("");
      setScope("service");
    }
  }, [open]);

  const days = presetId === "custom" ? customDays : Number(presetId);
  const valid = Number.isFinite(days) && days >= 1 && days <= 3650;
  const canSubmit = valid && confirmText === "DELETE" && !submitting;

  async function handleDelete() {
    if (!canSubmit) return;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    setSubmitting(true);
    try {
      const res = await deleteOldContainerLogsApi(cutoff, scope === "service" ? service : undefined);
      showToast(
        `Deleted ${res.deletedCount} log${res.deletedCount === 1 ? "" : "s"}${
          scope === "service" ? ` from ${service}` : ""
        }`,
        "success",
      );
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to delete logs", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5">
        <h3 className="mb-1 text-base font-semibold text-canvas-fg">Delete old container logs</h3>
        <p className="mb-4 text-xs text-canvas-muted">
          Permanently removes logs older than the chosen age. This cannot be undone.
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-canvas-muted">Scope</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScope("service")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors " +
                (scope === "service"
                  ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
                  : "border-canvas-border text-canvas-muted hover:text-canvas-fg")
              }
            >
              Only {service}
            </button>
            <button
              type="button"
              onClick={() => setScope("all")}
              className={
                "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors " +
                (scope === "all"
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-canvas-border text-canvas-muted hover:text-canvas-fg")
              }
            >
              All services
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-canvas-muted">Age</label>
          <div className="flex flex-wrap gap-2">
            {DELETE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPresetId(p.id)}
                className={
                  "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                  (presetId === p.id
                    ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
                    : "border-canvas-border text-canvas-muted hover:text-canvas-fg")
                }
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPresetId("custom")}
              className={
                "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                (presetId === "custom"
                  ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
                  : "border-canvas-border text-canvas-muted hover:text-canvas-fg")
              }
            >
              Custom
            </button>
          </div>
          {presetId === "custom" && (
            <div className="mt-2 flex items-center gap-2 text-xs text-canvas-muted">
              <span>Older than</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={customDays}
                onChange={(e) => {
                  const v = Number.parseInt(e.target.value || "0", 10);
                  setCustomDays(Number.isFinite(v) ? v : 0);
                }}
                className="w-20 rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
              />
              <span>days</span>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-canvas-muted">
            Type DELETE to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-sm text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleDelete}
            className="rounded-md border border-red-500 bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
