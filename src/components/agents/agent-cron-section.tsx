"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiCalendar, FiChevronRight, FiRefreshCw } from "react-icons/fi";
import { readFileApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CronJob {
  id?: string;
  schedule: string;
  description?: string;
  command?: string;
  message?: string;
  channel?: string;
  enabled?: boolean;
}

interface AgentCronSectionProps {
  serverId: string;
  agentName: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJobs(raw: any): CronJob[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw).map(([id, val]) => ({
      id,
      ...(typeof val === "object" && val !== null ? val : {}),
    })) as CronJob[];
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentCronSection({
  serverId,
  agentName,
}: AgentCronSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const loadedRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await readFileApi(
        serverId,
        `/root/openclaw-agents/${agentName}/config/cron/jobs.json`,
      );
      const parsed = JSON.parse(raw);
      setJobs(parseJobs(parsed));
    } catch {
      // File may not exist — not an error
      setJobs([]);
      setError(null);
    }
    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadData();
  }, [expanded, loadData]);

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiCalendar size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Scheduled Tasks
        </span>
        {jobs.length > 0 && (
          <span className="mr-1 rounded-full bg-canvas-surface-hover px-1.5 py-0.5 text-[9px] font-medium text-canvas-muted">
            {jobs.length}
          </span>
        )}
        <FiChevronRight
          size={14}
          className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`}
        />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {loading ? (
              <p className="text-[11px] text-canvas-muted">Loading...</p>
            ) : error ? (
              <p className="text-[11px] text-red-500">{error}</p>
            ) : jobs.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">
                No scheduled tasks configured.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Refresh */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      loadedRef.current = false;
                      loadData();
                    }}
                    disabled={loading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                  >
                    <FiRefreshCw size={11} className={loading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>

                {/* Job list */}
                <div className="space-y-1">
                  {jobs.map((job, i) => (
                    <div
                      key={job.id ?? i}
                      className="rounded-md border border-canvas-border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-canvas-surface-hover px-1.5 py-0.5 text-[10px] text-canvas-fg">
                          {job.schedule}
                        </code>
                        {job.enabled === false && (
                          <span className="rounded-full bg-canvas-surface-hover px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-canvas-muted">
                            disabled
                          </span>
                        )}
                        {job.channel && (
                          <span className="text-[10px] text-canvas-muted">
                            #{job.channel}
                          </span>
                        )}
                      </div>
                      {(job.description || job.message) && (
                        <p className="mt-1 text-[11px] text-canvas-muted">
                          {job.description || job.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
