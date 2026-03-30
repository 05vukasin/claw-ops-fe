"use client";

import type { DeploymentScript } from "@/lib/api";
import { MobileScriptCard } from "./mobile-script-card";

interface MobileScriptsDashboardProps {
  scripts: DeploymentScript[];
  loading: boolean;
}

export function MobileScriptsDashboard({
  scripts,
  loading,
}: MobileScriptsDashboardProps) {
  if (scripts.length === 0 && !loading) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center px-4">
        <div className="surface-overlay max-w-md rounded-md px-8 py-10 text-center">
          <h1 className="text-lg font-medium tracking-tight text-canvas-fg">
            Script Library
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-canvas-muted">
            No scripts yet. Create scripts from a desktop device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] px-3 pb-8 pt-20">
      {/* Title */}
      <div className="mb-4">
        <h1 className="text-base font-semibold text-canvas-fg">
          Script Library
          <span className="ml-2 text-sm font-normal text-canvas-muted">
            ({scripts.length})
          </span>
        </h1>
      </div>

      {/* Loading skeleton */}
      {loading && scripts.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-canvas-border bg-canvas-surface-hover"
            />
          ))}
        </div>
      )}

      {/* Script cards */}
      {(!loading || scripts.length > 0) && (
        <div className="space-y-3">
          {scripts.map((s) => (
            <MobileScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  );
}
