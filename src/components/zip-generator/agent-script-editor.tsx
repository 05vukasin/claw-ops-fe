"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCopy, FiDownload, FiSave, FiCheck, FiAlertTriangle, FiSettings } from "react-icons/fi";
import type { ZipAnalysis } from "@/lib/zip-analyzer";
import { formatSize } from "@/lib/zip-analyzer";
import {
  generateAgentScript,
  DEFAULT_AGENT_SCRIPT_OPTIONS,
  type AgentScriptOptions,
} from "@/lib/agent-script-generator";

interface AgentScriptEditorProps {
  analysis: ZipAnalysis;
  zipFileName: string;
  script: string;
  onScriptChange: (script: string) => void;
  onSaveAsScript: (script: string, name: string) => Promise<void>;
  saving: boolean;
}

export function AgentScriptEditor({
  analysis,
  zipFileName,
  script,
  onScriptChange,
  onSaveAsScript,
  saving,
}: AgentScriptEditorProps) {
  const [domain, setDomain] = useState(DEFAULT_AGENT_SCRIPT_OPTIONS.defaultDomain);
  const [agentsDir, setAgentsDir] = useState(DEFAULT_AGENT_SCRIPT_OPTIONS.defaultAgentsDir);
  const [dockerImage, setDockerImage] = useState(DEFAULT_AGENT_SCRIPT_OPTIONS.dockerImage);
  const [includeOAuth, setIncludeOAuth] = useState(true);
  const [includePairing, setIncludePairing] = useState(true);
  const [includeCaddy, setIncludeCaddy] = useState(true);
  const [includeHealthCheck, setIncludeHealthCheck] = useState(true);
  const [includeAtlassian, setIncludeAtlassian] = useState(true);
  const [includeBitbucket, setIncludeBitbucket] = useState(true);
  const [includeGitHub, setIncludeGitHub] = useState(true);

  const [copied, setCopied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(
    `agent-${zipFileName.replace(/\.zip$/i, "") || "template"}`,
  );

  const options: AgentScriptOptions = useMemo(
    () => ({
      defaultDomain: domain,
      defaultAgentsDir: agentsDir,
      dockerImage,
      includeGoogleOAuth: includeOAuth,
      includePairing,
      includeCaddy,
      includeHealthCheck,
      includeAtlassian,
      includeBitbucket,
      includeGitHub,
    }),
    [domain, agentsDir, dockerImage, includeOAuth, includePairing, includeCaddy, includeHealthCheck, includeAtlassian, includeBitbucket, includeGitHub],
  );

  useEffect(() => {
    const generated = generateAgentScript(analysis, options, zipFileName);
    onScriptChange(generated);
  }, [analysis, options, zipFileName]); // eslint-disable-line react-hooks/exhaustive-deps

  const scriptSize = new Blob([script]).size;
  const lineCount = script.split("\n").length;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [script]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([script], { type: "text/x-sh" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${zipFileName.replace(/\.zip$/i, "")}.sh`;
    a.click();
    URL.revokeObjectURL(url);
  }, [script, zipFileName]);

  const handleSave = useCallback(async () => {
    await onSaveAsScript(script, saveName);
    setSaveOpen(false);
  }, [script, saveName, onSaveAsScript]);

  return (
    <div className="flex flex-col gap-4">
      {/* Options */}
      <div className="rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-canvas-muted">
          <FiSettings size={12} />
          Script Options
        </div>

        {/* Text inputs */}
        <div className="mb-3 grid grid-cols-3 gap-3">
          <OptionInput label="Domain" value={domain} onChange={setDomain} placeholder="viksi.ai" />
          <OptionInput label="Agents directory" value={agentsDir} onChange={setAgentsDir} placeholder="/root/openclaw-agents" />
          <OptionInput label="Docker image" value={dockerImage} onChange={setDockerImage} placeholder="openclaw:local" />
        </div>

        {/* Integrations */}
        <div className="mb-2 mt-1 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Integrations</div>
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
          <Toggle checked={includeAtlassian} onChange={setIncludeAtlassian} label="Atlassian (Jira + Confluence)" />
          <Toggle checked={includeBitbucket} onChange={setIncludeBitbucket} label="Bitbucket" />
          <Toggle checked={includeGitHub} onChange={setIncludeGitHub} label="GitHub" />
          <Toggle checked={includeOAuth} onChange={setIncludeOAuth} label="Google OAuth" />
        </div>

        {/* Provisioning */}
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Provisioning</div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Toggle checked={includePairing} onChange={setIncludePairing} label="Pairing step" />
          <Toggle checked={includeCaddy} onChange={setIncludeCaddy} label="Caddy reverse proxy" />
          <Toggle checked={includeHealthCheck} onChange={setIncludeHealthCheck} label="Health check" />
        </div>
      </div>

      {/* Size warning */}
      {scriptSize > 512 * 1024 && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          <FiAlertTriangle size={13} />
          Large script ({formatSize(scriptSize)}, {lineCount.toLocaleString()} lines).
          Execution may be slow.
        </div>
      )}

      {/* Script textarea */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-canvas-border">
        <div className="flex items-center justify-between border-b border-canvas-border bg-[#0d1117] px-4 py-1.5">
          <span className="text-[10px] text-gray-500">
            {lineCount.toLocaleString()} lines &middot; {formatSize(scriptSize)}
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          className="min-h-[300px] flex-1 resize-none border-none bg-[#0d1117] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#e6edf3] placeholder:text-gray-600 outline-none"
          style={{
            fontFamily:
              "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
          }}
          spellCheck={false}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          {copied ? <FiCheck size={12} className="text-green-500" /> : <FiCopy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiDownload size={12} />
          Download .sh
        </button>
        <button
          type="button"
          onClick={() => setSaveOpen((p) => !p)}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiSave size={12} />
          Save as Script
        </button>
      </div>

      {/* Save inline form */}
      {saveOpen && (
        <div className="flex items-center gap-2 rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Script name..."
            maxLength={100}
            className="min-w-0 flex-1 rounded-md border border-canvas-border bg-transparent px-3 py-1.5 text-sm text-canvas-fg placeholder:text-canvas-muted/40 outline-none focus:border-canvas-fg/25"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !saveName.trim()}
            className="shrink-0 rounded-md bg-canvas-fg px-4 py-1.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toggle                                                             */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-canvas-muted">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-canvas-fg" : "bg-canvas-surface-hover"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-canvas-bg transition-transform ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </button>
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  OptionInput                                                        */
/* ------------------------------------------------------------------ */

function OptionInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-canvas-border bg-transparent px-2.5 py-1.5 text-xs text-canvas-fg placeholder:text-canvas-muted/40 outline-none focus:border-canvas-fg/25"
      />
    </label>
  );
}
