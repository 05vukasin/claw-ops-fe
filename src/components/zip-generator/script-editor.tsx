"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCopy, FiDownload, FiSave, FiCheck, FiAlertTriangle } from "react-icons/fi";
import type { ZipAnalysis } from "@/lib/zip-analyzer";
import { formatSize } from "@/lib/zip-analyzer";
import { generateBashScript, type ScriptOptions } from "@/lib/script-generator";

interface ScriptEditorProps {
  analysis: ZipAnalysis;
  zipFileName: string;
  script: string;
  onScriptChange: (script: string) => void;
  onSaveAsScript: (script: string, name: string) => Promise<void>;
  saving: boolean;
}

export function ScriptEditor({
  analysis,
  zipFileName,
  script,
  onScriptChange,
  onSaveAsScript,
  saving,
}: ScriptEditorProps) {
  const [includeBinary, setIncludeBinary] = useState(false);
  const [skipHidden, setSkipHidden] = useState(true);
  const [overwrite, setOverwrite] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(
    zipFileName.replace(/\.zip$/i, "") || "deploy",
  );

  const options: ScriptOptions = useMemo(
    () => ({
      includeBinary,
      skipHidden,
      overwriteExisting: overwrite,
    }),
    [includeBinary, skipHidden, overwrite],
  );

  // Regenerate script when options change
  useEffect(() => {
    const generated = generateBashScript(analysis, options, zipFileName);
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
    a.download = `deploy-${zipFileName.replace(/\.zip$/i, "")}.sh`;
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
      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-canvas-border bg-canvas-bg px-4 py-3">
        <Toggle checked={includeBinary} onChange={setIncludeBinary} label="Include binary files (base64)" />
        <Toggle checked={skipHidden} onChange={setSkipHidden} label="Skip hidden files" />
        <Toggle checked={overwrite} onChange={setOverwrite} label="Overwrite existing" />
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
        {/* Line count bar */}
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
