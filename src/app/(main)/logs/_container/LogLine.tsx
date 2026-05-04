"use client";

import type { ContainerLogEntry } from "@/lib/api";
import { formatLogTime, levelBadgeClass } from "./levelColor";

export function LogLine({ entry, dense = false }: { entry: ContainerLogEntry; dense?: boolean }) {
  return (
    <div
      className={
        "grid grid-cols-[auto_auto_auto_1fr] items-start gap-2 border-b border-canvas-border px-3 " +
        (dense ? "py-1" : "py-1.5")
      }
    >
      <span className="whitespace-nowrap font-mono text-[11px] text-canvas-muted">
        {formatLogTime(entry.logTs)}
      </span>
      <span className={levelBadgeClass(entry.level)}>{entry.level}</span>
      <span className="rounded bg-canvas-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-canvas-muted">
        {entry.stream}
      </span>
      <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-canvas-fg">
        {entry.message}
      </pre>
    </div>
  );
}
