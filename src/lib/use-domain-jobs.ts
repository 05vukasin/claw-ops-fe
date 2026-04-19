"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  fetchDomainJobApi,
  fetchActiveDomainJobsApi,
  type DomainJob,
} from "./api";
import { patchServerLocal, refreshServers } from "./use-servers";

/* ------------------------------------------------------------------ */
/*  Module-level singleton store                                       */
/* ------------------------------------------------------------------ */

/**
 * Tracks all known non-terminal domain assignment jobs across the app. Both the server
 * dashboard panel and the processes page read from this store; only one polling loop
 * runs regardless of how many components subscribe.
 *
 * Terminal jobs remain in the snapshot for one render cycle so consumers can show a
 * "completed / failed" flash, then are evicted.
 */

const STORAGE_KEY = "openclaw-domain-jobs:v1";
const PER_JOB_POLL_MS = 2_000;
const SAFETY_NET_POLL_MS = 15_000;
const KEEP_TERMINAL_MS = 10_000;

interface StoredEntry {
  jobId: string;
  serverId: string | null;
}

let jobs: Record<string, DomainJob> = {}; // keyed by job.id
let jobsSnapshot: DomainJob[] = [];
const EMPTY_JOBS: DomainJob[] = [];
let tracked: Record<string, StoredEntry> = {};
const listeners = new Set<() => void>();
const perJobTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let bootstrapped = false;

function setJobs(next: Record<string, DomainJob>) {
  jobs = next;
  jobsSnapshot = Object.values(next);
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  bootstrap();
  return () => listeners.delete(listener);
}

function getSnapshot(): DomainJob[] {
  return jobsSnapshot;
}

function getServerSnapshot(): DomainJob[] {
  return EMPTY_JOBS;
}

function loadTracked(): Record<string, StoredEntry> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, StoredEntry>) : {};
  } catch {
    return {};
  }
}

function saveTracked() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  } catch {
    /* localStorage might be full / disabled */
  }
}

function isTerminal(status: DomainJob["status"]) {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

function schedulePoll(jobId: string) {
  if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
  perJobTimers[jobId] = setTimeout(() => pollOne(jobId), PER_JOB_POLL_MS);
}

async function pollOne(jobId: string) {
  try {
    const job = await fetchDomainJobApi(jobId);
    setJobs({ ...jobs, [job.id]: job });
    emit();
    if (isTerminal(job.status)) {
      // Fire a server refresh so Server.assignedDomain picks up the new value.
      if (job.status === "COMPLETED" && job.serverId) {
        refreshServers();
        // Optimistic patch (server refresh handles the authoritative state).
        patchServerLocal(job.serverId, { assignedDomain: job.hostname });
      }
      scheduleEviction(job.id);
      return;
    }
    schedulePoll(jobId);
  } catch {
    // Network blip — back off and retry a bit later.
    if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
    perJobTimers[jobId] = setTimeout(() => pollOne(jobId), PER_JOB_POLL_MS * 2);
  }
}

function scheduleEviction(jobId: string) {
  if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
  perJobTimers[jobId] = setTimeout(() => {
    const next = { ...jobs };
    delete next[jobId];
    setJobs(next);
    const nextTracked = { ...tracked };
    delete nextTracked[jobId];
    tracked = nextTracked;
    delete perJobTimers[jobId];
    saveTracked();
    emit();
  }, KEEP_TERMINAL_MS);
}

async function safetyNetPoll() {
  try {
    const active = await fetchActiveDomainJobsApi();
    // Merge any newly-discovered active jobs (e.g. started from another tab / another user).
    const next = { ...jobs };
    for (const j of active) {
      next[j.id] = j;
      if (!tracked[j.id]) {
        tracked[j.id] = { jobId: j.id, serverId: j.serverId };
        if (!perJobTimers[j.id]) schedulePoll(j.id);
      }
    }
    setJobs(next);
    saveTracked();
    emit();
  } catch {
    /* ignore */
  }
}

function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  tracked = loadTracked();
  // Resume polling for any jobs that were in flight when the tab was last closed.
  for (const id of Object.keys(tracked)) {
    schedulePoll(id);
  }
  // Kick off safety-net polling (picks up jobs started elsewhere).
  setInterval(safetyNetPoll, SAFETY_NET_POLL_MS);
  // And do one immediate fetch so the UI is fresh on first mount.
  safetyNetPoll();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Register a job id so the store starts polling it. Safe to call repeatedly. */
export function trackDomainJob(jobId: string, serverId: string | null = null) {
  if (tracked[jobId]) return;
  tracked = { ...tracked, [jobId]: { jobId, serverId } };
  saveTracked();
  if (!perJobTimers[jobId]) {
    // Poll immediately so the first render shows real state, not "unknown".
    pollOne(jobId);
  }
}

/** Stop tracking a job (e.g. after the user dismisses it). */
export function untrackDomainJob(jobId: string) {
  if (perJobTimers[jobId]) {
    clearTimeout(perJobTimers[jobId]);
    delete perJobTimers[jobId];
  }
  const nextTracked = { ...tracked };
  delete nextTracked[jobId];
  tracked = nextTracked;
  const next = { ...jobs };
  delete next[jobId];
  setJobs(next);
  saveTracked();
  emit();
}

export function useDomainJobs() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    bootstrap();
  }, []);
  const track = useCallback(
    (jobId: string, serverId: string | null = null) => trackDomainJob(jobId, serverId),
    [],
  );
  const untrack = useCallback((jobId: string) => untrackDomainJob(jobId), []);
  const refresh = useCallback(() => safetyNetPoll(), []);
  return {
    jobs: list,
    track,
    untrack,
    refresh,
  };
}

/** Non-hook helper so non-React code (e.g. toast handlers) can read the current set. */
export function getActiveDomainJobsSync(): DomainJob[] {
  return Object.values(jobs).filter((j) => !isTerminal(j.status));
}
