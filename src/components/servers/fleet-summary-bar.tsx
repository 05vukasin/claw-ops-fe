"use client";

import { Z_INDEX } from "@/lib/z-index";
import { useFleetHealth } from "@/lib/use-server-health";

/**
 * Fixed bar that floats above the canvas (below the header)
 * showing fleet-wide server counts and health summary.
 * Uses shared health store to avoid duplicate API calls.
 */
export function FleetSummaryBar() {
  const data = useFleetHealth();

  if (!data) return null;

  return (
    <div
      className="pointer-events-auto fixed left-1/2 top-14 -translate-x-1/2"
      style={{ zIndex: Z_INDEX.FLOATING }}
    >
      <div className="surface-overlay flex items-center gap-1 overflow-x-auto rounded-lg border border-canvas-border px-1.5 py-1.5 shadow-lg max-w-[calc(100vw-2rem)] sm:max-w-none sm:overflow-x-visible sm:px-2">
        <Card value={data.totalServers} label="Total" />
        <Sep />
        <Card value={data.healthy} label="Healthy" color="text-green-500" />
        <Card value={data.warning} label="Warning" color="text-yellow-500" />
        <Card value={data.critical} label="Critical" color="text-red-500" />
        <Sep />
        <Card value={data.unreachable} label="Unreach" color="text-canvas-muted" />
        <Card value={data.unknown} label="Unknown" color="text-canvas-muted" />
        <Card value={data.maintenance} label="Maint" color="text-blue-400" />
      </div>
    </div>
  );
}

function Card({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center px-1.5 py-0.5 sm:px-2.5">
      <span className={`text-sm font-bold leading-tight tabular-nums sm:text-base ${color ?? "text-canvas-fg"}`}>
        {value}
      </span>
      <span className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </span>
    </div>
  );
}

function Sep() {
  return <div className="mx-0.5 h-6 w-px bg-canvas-border" />;
}
