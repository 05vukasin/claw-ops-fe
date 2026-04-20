"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  fetchSslJobApi,
  fetchActiveSslJobsApi,
  fetchSslForServer,
  type SslJob,
} from "./api";

/**
 * Singleton polling store for SSL provisioning jobs. Same pattern as use-domain-jobs:
 * one polling loop per tracked job, localStorage-persisted across reloads, 15 s safety-net
 * fetch of all active jobs so other tabs / other users' work is picked up automatically.
 */

const STORAGE_KEY = "openclaw-ssl-jobs:v1";
const PER_JOB_POLL_MS = 2_000;
const SAFETY_NET_POLL_MS = 15_000;
const KEEP_TERMINAL_MS = 10_000;

interface StoredEntry {
  jobId: string;
  serverId: string | null;
}

let jobs: Record<string, SslJob> = {};
let tracked: Record<string, StoredEntry> = {};
const listeners = new Set<() => void>();
const perJobTimers: Record<string, ReturnType<typeof setTimeout>> = {};
let bootstrapped = false;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  bootstrap();
  return () => listeners.delete(listener);
}

function getSnapshot(): SslJob[] {
  return Object.values(jobs);
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
    /* noop */
  }
}

function isTerminal(status: SslJob["status"]) {
  return status === "COMPLETED" || status === "FAILED";
}

function schedulePoll(jobId: string) {
  if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
  perJobTimers[jobId] = setTimeout(() => pollOne(jobId), PER_JOB_POLL_MS);
}

async function pollOne(jobId: string) {
  try {
    const job = await fetchSslJobApi(jobId);
    jobs = { ...jobs, [job.id]: job };
    emit();
    if (isTerminal(job.status)) {
      // If the cert is now ACTIVE, nudge any UI that reads from fetchSslForServer to refresh.
      if (job.status === "COMPLETED" && job.serverId) {
        // Fire and forget — consumers may also refetch independently.
        fetchSslForServer(job.serverId).catch(() => {});
      }
      scheduleEviction(job.id);
      return;
    }
    schedulePoll(jobId);
  } catch {
    if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
    perJobTimers[jobId] = setTimeout(() => pollOne(jobId), PER_JOB_POLL_MS * 2);
  }
}

function scheduleEviction(jobId: string) {
  if (perJobTimers[jobId]) clearTimeout(perJobTimers[jobId]);
  perJobTimers[jobId] = setTimeout(() => {
    const next = { ...jobs };
    delete next[jobId];
    jobs = next;
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
    const active = await fetchActiveSslJobsApi();
    const next = { ...jobs };
    for (const j of active) {
      next[j.id] = j;
      if (!tracked[j.id]) {
        tracked[j.id] = { jobId: j.id, serverId: j.serverId ?? null };
        if (!perJobTimers[j.id]) schedulePoll(j.id);
      }
    }
    jobs = next;
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
  for (const id of Object.keys(tracked)) schedulePoll(id);
  setInterval(safetyNetPoll, SAFETY_NET_POLL_MS);
  safetyNetPoll();
}

export function trackSslJob(jobId: string, serverId: string | null = null) {
  if (tracked[jobId]) return;
  tracked = { ...tracked, [jobId]: { jobId, serverId } };
  saveTracked();
  if (!perJobTimers[jobId]) pollOne(jobId);
}

export function untrackSslJob(jobId: string) {
  if (perJobTimers[jobId]) {
    clearTimeout(perJobTimers[jobId]);
    delete perJobTimers[jobId];
  }
  const nextTracked = { ...tracked };
  delete nextTracked[jobId];
  tracked = nextTracked;
  const next = { ...jobs };
  delete next[jobId];
  jobs = next;
  saveTracked();
  emit();
}

export function useSslJobs() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);
  useEffect(() => {
    bootstrap();
  }, []);
  const track = useCallback(
    (jobId: string, serverId: string | null = null) => trackSslJob(jobId, serverId),
    [],
  );
  const untrack = useCallback((jobId: string) => untrackSslJob(jobId), []);
  const refresh = useCallback(() => safetyNetPoll(), []);
  return { jobs: list, track, untrack, refresh };
}

/** Returns the active (non-terminal) SSL job for a given server, if any. */
export function findActiveSslJobForServer(jobsList: SslJob[], serverId: string): SslJob | undefined {
  return jobsList.find((j) => j.serverId === serverId && j.status === "RUNNING");
}
