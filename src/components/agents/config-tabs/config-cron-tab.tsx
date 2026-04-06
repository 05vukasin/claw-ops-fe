"use client";

import { useCallback } from "react";
import {
  Field,
  SectionHeader,
  SegmentBtn,
  Toggle,
  INPUT_BASE,
} from "../agent-config-panel";
import { FiPlus, FiTrash2 } from "react-icons/fi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; tz: string; expr: string };
  sessionTarget: string;
  payload: { kind: string; message: string };
  delivery: { mode: string; channel: string };
  deleteAfterRun?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface CronFile {
  version: number;
  jobs: CronJob[];
}

interface Props {
  cronData: CronFile | null;
  setCronData: (fn: (prev: CronFile | null) => CronFile | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ConfigCronTab({ cronData, setCronData }: Props) {
  const jobs = cronData?.jobs ?? [];

  const updateJob = useCallback(
    (idx: number, patch: Partial<CronJob>) => {
      setCronData((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.jobs[idx] = { ...next.jobs[idx], ...patch };
        return next;
      });
    },
    [setCronData],
  );

  const addJob = useCallback(() => {
    setCronData((prev) => {
      const base = prev ?? { version: 1, jobs: [] };
      const next = structuredClone(base);
      next.jobs.push({
        id: `job-${Date.now()}`,
        name: "New Job",
        enabled: true,
        schedule: { kind: "cron", tz: "Europe/Belgrade", expr: "0 9 * * *" },
        sessionTarget: "isolated",
        payload: { kind: "agentTurn", message: "" },
        delivery: { mode: "announce", channel: "slack" },
        deleteAfterRun: false,
      });
      return next;
    });
  }, [setCronData]);

  const removeJob = useCallback(
    (idx: number) => {
      if (!window.confirm(`Delete job "${jobs[idx]?.name}"?`)) return;
      setCronData((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        next.jobs.splice(idx, 1);
        return next;
      });
    },
    [jobs, setCronData],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader>Scheduled Tasks</SectionHeader>
        <button
          type="button"
          onClick={addJob}
          className="flex items-center gap-1 rounded-md border border-canvas-border px-2.5 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiPlus size={12} />
          Add Job
        </button>
      </div>

      {jobs.length === 0 && (
        <p className="text-[11px] text-canvas-muted">
          No scheduled tasks configured.
        </p>
      )}

      {jobs.map((job, idx) => (
        <div
          key={job.id}
          className="space-y-3 rounded-md border border-canvas-border p-3"
        >
          {/* Header */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={job.name}
              onChange={(e) => updateJob(idx, { name: e.target.value })}
              className={`${INPUT_BASE} flex-1 !py-1.5 text-xs font-semibold`}
            />
            <Toggle
              checked={job.enabled}
              onChange={(v) => updateJob(idx, { enabled: v })}
              label=""
            />
            <button
              type="button"
              onClick={() => removeJob(idx)}
              className="shrink-0 rounded p-1 text-canvas-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
            >
              <FiTrash2 size={13} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Schedule (cron)">
              <input
                type="text"
                value={job.schedule?.expr ?? ""}
                onChange={(e) =>
                  updateJob(idx, {
                    schedule: { ...job.schedule, expr: e.target.value },
                  })
                }
                placeholder="0 9 * * *"
                className={`${INPUT_BASE} font-mono text-[11px]`}
              />
            </Field>
            <Field label="Timezone">
              <input
                type="text"
                value={job.schedule?.tz ?? ""}
                onChange={(e) =>
                  updateJob(idx, {
                    schedule: { ...job.schedule, tz: e.target.value },
                  })
                }
                placeholder="Europe/Belgrade"
                className={INPUT_BASE}
              />
            </Field>
          </div>

          <Field label="Session Target">
            <SegmentBtn
              options={["isolated", "default"]}
              value={job.sessionTarget ?? "isolated"}
              onChange={(v) => updateJob(idx, { sessionTarget: v })}
            />
          </Field>

          <Field label="Message">
            <textarea
              rows={3}
              value={job.payload?.message ?? ""}
              onChange={(e) =>
                updateJob(idx, {
                  payload: { ...job.payload, message: e.target.value },
                })
              }
              placeholder="Message to send to agent"
              className={`${INPUT_BASE} resize-none font-mono text-[11px] leading-relaxed`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery Channel">
              <select
                value={job.delivery?.channel ?? "slack"}
                onChange={(e) =>
                  updateJob(idx, {
                    delivery: { ...job.delivery, channel: e.target.value },
                  })
                }
                className={INPUT_BASE}
              >
                <option value="slack">Slack</option>
                <option value="telegram">Telegram</option>
              </select>
            </Field>
            <Field label="Delivery Mode">
              <select
                value={job.delivery?.mode ?? "announce"}
                onChange={(e) =>
                  updateJob(idx, {
                    delivery: { ...job.delivery, mode: e.target.value },
                  })
                }
                className={INPUT_BASE}
              >
                <option value="announce">Announce</option>
                <option value="silent">Silent</option>
              </select>
            </Field>
          </div>

          <Toggle
            checked={!!job.deleteAfterRun}
            onChange={(v) => updateJob(idx, { deleteAfterRun: v })}
            label="Delete After Run"
          />
        </div>
      ))}
    </div>
  );
}
