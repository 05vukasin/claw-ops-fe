"use client";

import { useState } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import type { DeploymentScript } from "@/lib/api";

const TYPE_STYLE: Record<string, string> = {
  GENERAL: "bg-canvas-surface-hover text-canvas-muted",
  INSTALL: "bg-green-500/10 text-green-600 dark:text-green-400",
  REMOVE: "bg-red-500/10 text-red-500 dark:text-red-400",
  UPDATE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  MAINTENANCE: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface MobileScriptCardProps {
  script: DeploymentScript;
}

export function MobileScriptCard({ script }: MobileScriptCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-canvas-border bg-canvas-bg shadow-sm transition-shadow hover:shadow-md">
      {/* Header — tappable */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Type badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLE[script.scriptType] ?? TYPE_STYLE.GENERAL}`}
        >
          {script.scriptType}
        </span>

        {/* Name */}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-canvas-fg">
          {script.name}
        </p>

        {/* Date */}
        <span className="shrink-0 text-[11px] text-canvas-muted">
          {formatDate(script.createdAt)}
        </span>

        {/* Chevron */}
        {expanded ? (
          <FiChevronDown size={14} className="shrink-0 text-canvas-muted" />
        ) : (
          <FiChevronRight size={14} className="shrink-0 text-canvas-muted" />
        )}
      </button>

      {/* Description — always visible if present */}
      {script.description && (
        <div className="border-t border-canvas-border px-4 py-2">
          <p className="text-xs leading-relaxed text-canvas-muted">
            {script.description}
          </p>
        </div>
      )}

      {/* Expanded: script content (read-only) */}
      {expanded && (
        <div className="border-t border-canvas-border">
          <pre className="max-h-[300px] overflow-auto rounded-b-xl bg-[#0d1117] px-4 py-3">
            <code
              className="text-[12px] leading-relaxed text-[#e6edf3]"
              style={{
                fontFamily:
                  "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              }}
            >
              {script.scriptContent}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
