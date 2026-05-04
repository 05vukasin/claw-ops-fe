"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import {
  ApiError,
  getRetentionSettingsApi,
  updateRetentionSettingsApi,
  type ContainerService,
  type RetentionSetting,
} from "@/lib/api";

const PRESETS = [1, 7, 30, 90];
const SERVICE_ORDER: ContainerService[] = ["BACKEND", "FRONTEND", "NGINX", "POSTGRES"];

export function RetentionSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<RetentionSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingService, setSavingService] = useState<ContainerService | null>(null);
  const [drafts, setDrafts] = useState<Record<ContainerService, number>>({
    BACKEND: 7, FRONTEND: 7, NGINX: 7, POSTGRES: 7,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getRetentionSettingsApi()
      .then((data) => {
        if (cancelled) return;
        const sorted = SERVICE_ORDER.map((s) => data.find((d) => d.service === s)).filter(Boolean) as RetentionSetting[];
        setRows(sorted);
        const next: Record<ContainerService, number> = { BACKEND: 7, FRONTEND: 7, NGINX: 7, POSTGRES: 7 };
        for (const r of sorted) next[r.service] = r.retentionDays;
        setDrafts(next);
      })
      .catch((err) => {
        if (cancelled) return;
        showToast(err instanceof ApiError ? err.message : "Failed to load retention settings", "error");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save(service: ContainerService) {
    const days = Math.max(1, Math.min(3650, Math.floor(drafts[service])));
    setSavingService(service);
    try {
      const updated = await updateRetentionSettingsApi(service, days);
      setRows((prev) => prev.map((r) => (r.service === service ? updated : r)));
      showToast(`Retention for ${service} set to ${days} day${days === 1 ? "" : "s"}`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save retention", "error");
    } finally {
      setSavingService(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-canvas-fg">Container log retention</h3>
        <span className="text-xs text-canvas-muted">Default: 7 days</span>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-canvas-muted">Loading…</div>
      ) : (
        <div className="space-y-4">
          {SERVICE_ORDER.map((service) => {
            const row = rows.find((r) => r.service === service);
            const current = drafts[service];
            const dirty = row != null && row.retentionDays !== current;
            return (
              <div key={service} className="rounded-md border border-canvas-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-canvas-fg">{service}</span>
                  <span className="text-[10px] text-canvas-muted">
                    {row ? `Last updated ${new Date(row.updatedAt).toLocaleString()}` : "—"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDrafts((d) => ({ ...d, [service]: p }))}
                      className={
                        "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                        (current === p
                          ? "border-canvas-fg bg-canvas-fg text-canvas-bg"
                          : "border-canvas-border text-canvas-muted hover:text-canvas-fg")
                      }
                    >
                      {p} day{p === 1 ? "" : "s"}
                    </button>
                  ))}
                  <label className="ml-2 flex items-center gap-1 text-xs text-canvas-muted">
                    Custom:
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={current}
                      onChange={(e) => {
                        const v = Number.parseInt(e.target.value || "0", 10);
                        setDrafts((d) => ({ ...d, [service]: Number.isFinite(v) ? v : 0 }));
                      }}
                      className="w-20 rounded-md border border-canvas-border bg-transparent px-2 py-1 text-xs text-canvas-fg focus:border-canvas-fg/25 focus:outline-none focus:ring-1 focus:ring-canvas-fg/10"
                    />
                    <span>days</span>
                  </label>
                  <button
                    type="button"
                    disabled={!dirty || savingService === service || current < 1 || current > 3650}
                    onClick={() => save(service)}
                    className="ml-auto rounded-md border border-canvas-border bg-canvas-fg px-3 py-1 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    {savingService === service ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
        >
          Close
        </button>
      </div>
      </div>
    </Modal>
  );
}
