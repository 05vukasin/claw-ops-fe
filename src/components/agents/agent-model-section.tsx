"use client";

import { useState } from "react";
import { FiChevronRight, FiCpu } from "react-icons/fi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentModelSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function modelDisplayName(raw: string): string {
  if (!raw) return "--";
  return raw.includes("/") ? raw.split("/").pop() ?? raw : raw;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentModelSection({ config }: AgentModelSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const defaults = config?.agents?.defaults;
  const modelConfig = defaults?.model;

  const primary = modelConfig?.primary ?? "";
  const fallback = modelConfig?.fallback;
  const thinkingLevel = defaults?.thinkingDefault ?? "--";
  const aliases = modelConfig?.aliases;
  const subagentModel = defaults?.subagent?.model ?? modelConfig?.subagent;

  const fallbackDisplay = Array.isArray(fallback)
    ? fallback.map(modelDisplayName).join(" -> ")
    : typeof fallback === "string"
      ? modelDisplayName(fallback)
      : null;

  const aliasEntries = aliases
    ? Object.entries(aliases as Record<string, string>)
    : [];

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiCpu size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Model
        </span>
        <FiChevronRight
          size={14}
          className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`}
        />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            {!config ? (
              <p className="text-[11px] text-canvas-muted">No config loaded.</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <InfoCell label="Primary" value={modelDisplayName(primary)} />
                <InfoCell label="Thinking" value={thinkingLevel} />
                {fallbackDisplay && (
                  <InfoCell label="Fallback" value={fallbackDisplay} />
                )}
                {subagentModel && (
                  <InfoCell
                    label="Subagent"
                    value={modelDisplayName(
                      typeof subagentModel === "string"
                        ? subagentModel
                        : subagentModel?.primary ?? "",
                    )}
                  />
                )}
                {aliasEntries.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
                      Aliases
                    </p>
                    <div className="mt-1 space-y-0.5">
                      {aliasEntries.map(([alias, model]) => (
                        <p
                          key={alias}
                          className="truncate text-[11px] text-canvas-fg"
                        >
                          <span className="font-mono text-canvas-muted">
                            {alias}
                          </span>{" "}
                          -&gt; {modelDisplayName(model)}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs text-canvas-fg">{value}</p>
    </div>
  );
}
