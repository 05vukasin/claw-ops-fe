"use client";

import { useCallback, useState } from "react";
import {
  FiChevronRight,
  FiExternalLink,
  FiEye,
  FiRefreshCw,
  FiZap,
} from "react-icons/fi";
import { readFileApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentActionsSectionProps {
  serverId: string;
  agentName: string;
  serverDomain?: string | null;
  restarting: boolean;
  onRestart: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentActionsSection({
  serverId,
  agentName,
  serverDomain,
  restarting,
  onRestart,
}: AgentActionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [configView, setConfigView] = useState(false);
  const [configContent, setConfigContent] = useState<string>("");
  const [configLoading, setConfigLoading] = useState(false);

  const handleViewConfig = useCallback(async () => {
    if (configView) {
      setConfigView(false);
      return;
    }
    setConfigLoading(true);
    try {
      const raw = await readFileApi(
        serverId,
        `/root/openclaw-agents/${agentName}/config/openclaw.json`,
      );
      // Pretty-print JSON
      try {
        setConfigContent(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setConfigContent(raw);
      }
    } catch (err) {
      setConfigContent(
        err instanceof Error ? err.message : "Failed to read config",
      );
    }
    setConfigLoading(false);
    setConfigView(true);
  }, [serverId, agentName, configView]);

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiZap size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Actions
        </span>
        <FiChevronRight
          size={14}
          className={`text-canvas-muted chevron-rotate ${expanded ? "open" : ""}`}
        />
      </button>

      <div className={`animate-collapse ${expanded ? "open" : ""}`}>
        <div className="collapse-inner">
          <div className="border-t border-canvas-border px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {/* Restart */}
              <ActionBtn onClick={onRestart} disabled={restarting}>
                <FiRefreshCw
                  size={12}
                  className={restarting ? "animate-spin" : ""}
                />
                {restarting ? "Restarting..." : "Restart"}
              </ActionBtn>

              {/* Web UI */}
              {serverDomain && (
                <a
                  href={`https://${serverDomain}/${agentName}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
                >
                  <FiExternalLink size={12} />
                  Web UI
                </a>
              )}

              {/* View Config */}
              <ActionBtn
                onClick={handleViewConfig}
                disabled={configLoading}
              >
                <FiEye size={12} />
                {configLoading ? "Loading..." : configView ? "Hide Config" : "View Config"}
              </ActionBtn>
            </div>

            {/* Config viewer */}
            {configView && (
              <div className="mt-3 rounded-md border border-canvas-border">
                <div className="border-b border-canvas-border px-3 py-1.5">
                  <span className="text-[10px] font-medium text-canvas-muted">
                    openclaw.json
                  </span>
                </div>
                <pre className="max-h-[400px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-canvas-fg">
                  {configContent}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}
