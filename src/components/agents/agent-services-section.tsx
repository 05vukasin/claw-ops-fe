"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiChevronRight,
  FiLink,
  FiMessageSquare,
  FiSend,
  FiTool,
  FiGlobe,
  FiSearch,
  FiGitBranch,
  FiBookOpen,
  FiRefreshCw,
} from "react-icons/fi";
import { readFileApi } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ServiceInfo {
  name: string;
  status: "connected" | "configured" | "disabled";
  details?: string;
  icon: React.ReactNode;
}

interface AgentServicesSectionProps {
  serverId: string;
  agentName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_BADGE: Record<string, string> = {
  connected: "bg-green-500/10 text-green-600 dark:text-green-400",
  configured: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  disabled: "bg-canvas-surface-hover text-canvas-muted",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractServices(config: any, toolsMd: string | null): ServiceInfo[] {
  const services: ServiceInfo[] = [];

  // Slack
  if (config?.channels?.slack) {
    const workspace = config.channels.slack.workspace ?? config.channels.slack.teamName;
    services.push({
      name: "Slack",
      status: "connected",
      details: workspace ? `Workspace: ${workspace}` : undefined,
      icon: <FiMessageSquare size={13} />,
    });
  }

  // Telegram
  const plugins = config?.plugins?.entries;
  if (plugins) {
    const entries = Object.values(plugins);
    for (const entry of entries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = entry as any;
      const isTelegram =
        e?.type === "telegram" || e?.name?.toLowerCase().includes("telegram");
      if (isTelegram) {
        services.push({
          name: "Telegram",
          status: "connected",
          details: e.botName ? `Bot: ${e.botName}` : undefined,
          icon: <FiSend size={13} />,
        });
        break;
      }
    }
  }

  // Check TOOLS.md and config for integrations
  const toolsText = (toolsMd ?? "").toLowerCase();

  const integrations: {
    name: string;
    keywords: string[];
    icon: React.ReactNode;
  }[] = [
    { name: "Jira", keywords: ["jira"], icon: <FiTool size={13} /> },
    { name: "Confluence", keywords: ["confluence"], icon: <FiBookOpen size={13} /> },
    { name: "Bitbucket", keywords: ["bitbucket"], icon: <FiGitBranch size={13} /> },
    { name: "Google Workspace", keywords: ["google", "gmail", "gog"], icon: <FiGlobe size={13} /> },
    { name: "Web Search", keywords: ["web-search", "web_search", "websearch", "tavily", "brave-search"], icon: <FiSearch size={13} /> },
  ];

  for (const integ of integrations) {
    const found =
      integ.keywords.some((kw) => toolsText.includes(kw)) ||
      integ.keywords.some(
        (kw) =>
          JSON.stringify(config?.plugins ?? {})
            .toLowerCase()
            .includes(kw) ||
          JSON.stringify(config?.skills ?? {})
            .toLowerCase()
            .includes(kw),
      );
    if (found) {
      services.push({
        name: integ.name,
        status: "configured",
        icon: integ.icon,
      });
    }
  }

  return services;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AgentServicesSection({
  serverId,
  agentName,
  config,
}: AgentServicesSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toolsMd, setToolsMd] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadToolsMd = useCallback(async () => {
    setLoading(true);
    try {
      const content = await readFileApi(
        serverId,
        `/root/openclaw-agents/${agentName}/workspace/TOOLS.md`,
      );
      setToolsMd(content);
    } catch {
      setToolsMd(null);
    }
    setLoading(false);
  }, [serverId, agentName]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadToolsMd();
  }, [expanded, loadToolsMd]);

  const services = config ? extractServices(config, toolsMd) : [];

  return (
    <div className="border-b border-canvas-border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-canvas-surface-hover"
      >
        <FiLink size={13} className="text-canvas-muted" />
        <span className="flex-1 text-xs font-medium text-canvas-muted">
          Services
        </span>
        {services.length > 0 && (
          <span className="mr-1 rounded-full bg-canvas-surface-hover px-1.5 py-0.5 text-[9px] font-medium text-canvas-muted">
            {services.length}
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
            {!config ? (
              <p className="text-[11px] text-canvas-muted">
                No config loaded.
              </p>
            ) : services.length === 0 ? (
              <p className="text-[11px] text-canvas-muted">
                {loading ? "Loading..." : "No integrations configured."}
              </p>
            ) : (
              <div className="space-y-1">
                {loading && (
                  <div className="mb-2 flex justify-end">
                    <FiRefreshCw size={11} className="animate-spin text-canvas-muted" />
                  </div>
                )}
                {services.map((svc) => (
                  <div
                    key={svc.name}
                    className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-canvas-surface-hover"
                  >
                    <span className="text-canvas-muted">{svc.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-canvas-fg">
                        {svc.name}
                      </p>
                      {svc.details && (
                        <p className="truncate text-[10px] text-canvas-muted">
                          {svc.details}
                        </p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_BADGE[svc.status]}`}
                    >
                      {svc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
