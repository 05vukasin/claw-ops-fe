"use client";

import { useCallback, useRef, useState } from "react";
import { FiUpload, FiFile, FiX } from "react-icons/fi";
import { formatSize } from "@/lib/zip-analyzer";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

interface UploadZoneProps {
  file: File | null;
  analyzing: boolean;
  onFileAccepted: (file: File) => void;
  onClear: () => void;
  onAnalyze: () => void;
}

export function UploadZone({
  file,
  analyzing,
  onFileAccepted,
  onClear,
  onAnalyze,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    (f: File) => {
      setError(null);
      if (!f.name.toLowerCase().endsWith(".zip") && f.type !== "application/zip") {
        setError("Only .zip files are accepted.");
        return;
      }
      if (f.size > MAX_SIZE) {
        setError(`File too large (${formatSize(f.size)}). Maximum is 50 MB.`);
        return;
      }
      onFileAccepted(f);
    },
    [onFileAccepted],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) validate(f);
    },
    [validate],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) validate(f);
      if (inputRef.current) inputRef.current.value = "";
    },
    [validate],
  );

  if (file) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-canvas-border bg-canvas-bg px-5 py-4">
          <FiFile size={20} className="shrink-0 text-canvas-muted" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-canvas-fg">{file.name}</p>
            <p className="text-xs text-canvas-muted">{formatSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md p-1.5 text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={14} />
          </button>
        </div>

        <button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="w-full rounded-md bg-canvas-fg px-5 py-2.5 text-sm font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {analyzing ? "Analyzing..." : "Analyze ZIP"}
        </button>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-16 transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-500/5"
            : "border-canvas-border hover:border-canvas-fg/30 hover:bg-canvas-surface-hover/50"
        }`}
      >
        <FiUpload size={28} className="mb-3 text-canvas-muted" />
        <p className="text-sm font-medium text-canvas-fg">
          Drop a ZIP file here or click to browse
        </p>
        <p className="mt-1 text-xs text-canvas-muted">
          .zip files only, up to 50 MB
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
