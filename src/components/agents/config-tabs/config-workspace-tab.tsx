"use client";

import { useState } from "react";

const FILES = ["SOUL.md", "USER.md", "TOOLS.md", "HEARTBEAT.md", "IDENTITY.md"];

interface Props {
  files: Record<string, string>;
  setFiles: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
}

export function ConfigWorkspaceTab({ files, setFiles }: Props) {
  const [selected, setSelected] = useState("SOUL.md");
  const content = files[selected] ?? "";

  return (
    <div className="flex flex-1 flex-col gap-3">
      {/* File selector */}
      <div className="flex gap-1 overflow-x-auto">
        {FILES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setSelected(f)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              f === selected
                ? "bg-canvas-fg text-canvas-bg"
                : "text-canvas-muted hover:text-canvas-fg"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Editor */}
      <textarea
        value={content}
        onChange={(e) =>
          setFiles((prev) => ({ ...prev, [selected]: e.target.value }))
        }
        spellCheck={false}
        className="min-h-0 flex-1 resize-none rounded-md border border-canvas-border bg-transparent p-3 font-mono text-[11px] leading-relaxed text-canvas-fg placeholder:text-canvas-muted/60 focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10"
        placeholder={`${selected} content...`}
      />
    </div>
  );
}
