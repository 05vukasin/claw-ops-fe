import type { ContainerLogLevel } from "@/lib/api";

export function levelTextClass(level: ContainerLogLevel): string {
  switch (level) {
    case "ERROR":
      return "text-red-500 dark:text-red-400";
    case "WARN":
      return "text-orange-500 dark:text-orange-400";
    case "INFO":
      return "text-canvas-fg";
    case "DEBUG":
      return "text-canvas-muted";
    default:
      return "text-canvas-muted";
  }
}

export function levelBadgeClass(level: ContainerLogLevel): string {
  const base = "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider";
  switch (level) {
    case "ERROR":
      return `${base} bg-red-500/10 text-red-500 dark:text-red-400`;
    case "WARN":
      return `${base} bg-orange-500/10 text-orange-500 dark:text-orange-400`;
    case "INFO":
      return `${base} bg-blue-500/10 text-blue-500 dark:text-blue-400`;
    case "DEBUG":
      return `${base} bg-canvas-border text-canvas-muted`;
    default:
      return `${base} bg-canvas-border text-canvas-muted`;
  }
}

export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
