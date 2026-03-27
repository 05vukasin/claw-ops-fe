"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiFolder,
  FiFile,
  FiArrowUp,
  FiRefreshCw,
  FiHome,
  FiHardDrive,
} from "react-icons/fi";
import { listFilesApi, ApiError, type SftpFile } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " K";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " M";
  return (bytes / 1073741824).toFixed(1) + " G";
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FileBrowserProps {
  serverId: string;
  onFileClick?: (command: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component — renders inline (no collapsible wrapper)                */
/* ------------------------------------------------------------------ */

export function FileBrowser({ serverId, onFileClick }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("~");
  const [files, setFiles] = useState<SftpFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setCurrentPath(path);
    try {
      const result = await listFilesApi(serverId, path);
      result.sort((a, b) => {
        if (a.directory !== b.directory) return a.directory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(result.filter((f) => f.name !== "." && f.name !== ".."));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load files");
      setFiles([]);
    }
    setLoading(false);
  }, [serverId]);

  // Load on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadFiles("~");
  }, [loadFiles]);

  const navigateTo = useCallback((path: string) => {
    loadFiles(path);
    if (onFileClick) onFileClick(`cd ${path}\r`);
  }, [loadFiles, onFileClick]);

  const handleFileClick = useCallback((file: SftpFile) => {
    if (file.directory) {
      navigateTo(file.path);
    } else if (onFileClick) {
      const dir = file.path.substring(0, file.path.lastIndexOf("/")) || "/";
      const name = file.path.substring(file.path.lastIndexOf("/") + 1);
      onFileClick(`cd ${dir} && ls -la ${name}\r`);
    }
  }, [navigateTo, onFileClick]);

  const parentPath = currentPath !== "/" && currentPath !== "~"
    ? currentPath.substring(0, currentPath.lastIndexOf("/")) || "/"
    : null;

  // Breadcrumb segments
  const breadcrumbs = currentPath === "~"
    ? [{ label: "~", path: "~" }]
    : currentPath.split("/").filter(Boolean).reduce<{ label: string; path: string }[]>((acc, seg, i) => {
        const path = "/" + currentPath.split("/").filter(Boolean).slice(0, i + 1).join("/");
        acc.push({ label: seg, path });
        return acc;
      }, [{ label: "/", path: "/" }]);

  return (
    <div className="border-b border-canvas-border">
      {/* Header + actions */}
      <div className="flex items-center gap-2 border-b border-canvas-border px-4 py-1.5">
        <FiFolder size={11} className="shrink-0 text-canvas-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Files</span>
        <span className="flex-1" />
        <button type="button" onClick={() => loadFiles(currentPath)} className="flex items-center gap-1 text-[9px] text-canvas-muted transition-colors hover:text-canvas-fg">
          <FiRefreshCw size={8} />
        </button>
        <button type="button" onClick={() => navigateTo("~")} className="flex items-center gap-1 text-[9px] text-canvas-muted transition-colors hover:text-canvas-fg">
          <FiHome size={8} />
        </button>
        <button type="button" onClick={() => navigateTo("/")} className="flex items-center gap-1 text-[9px] text-canvas-muted transition-colors hover:text-canvas-fg">
          <FiHardDrive size={8} />
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-canvas-border bg-canvas-surface-hover/30 px-4 py-1 font-mono text-[10px] text-canvas-muted">
        {breadcrumbs.map((seg, i) => (
          <span key={seg.path} className="flex items-center gap-0.5">
            {i > 0 && <span className="opacity-40">/</span>}
            <button
              type="button"
              onClick={() => navigateTo(seg.path)}
              className="rounded px-1 py-0.5 text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
            >
              {seg.label}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div className="max-h-[180px] overflow-y-auto">
        {loading ? (
          <p className="px-5 py-3 text-center text-[10px] text-canvas-muted">Loading...</p>
        ) : error ? (
          <p className="px-5 py-3 text-center text-[10px] text-red-500 dark:text-red-400">{error}</p>
        ) : (
          <>
            {/* Parent directory */}
            {parentPath && (
              <button
                type="button"
                onClick={() => navigateTo(parentPath)}
                className="flex w-full items-center gap-2 px-4 py-1 text-left transition-colors hover:bg-canvas-surface-hover"
              >
                <FiArrowUp size={11} className="shrink-0 text-canvas-muted" />
                <span className="text-[11px] italic text-canvas-muted">..</span>
              </button>
            )}

            {files.length === 0 && !parentPath && (
              <p className="px-5 py-3 text-center text-[10px] text-canvas-muted">Empty directory</p>
            )}

            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => handleFileClick(f)}
                className="flex w-full items-center gap-2 px-4 py-1 text-left transition-colors hover:bg-canvas-surface-hover"
              >
                {f.directory ? (
                  <FiFolder size={11} className="shrink-0 text-blue-500 dark:text-blue-400" />
                ) : (
                  <FiFile size={11} className="shrink-0 text-canvas-muted" />
                )}
                <span className={`min-w-0 flex-1 truncate text-[11px] ${f.directory ? "font-medium text-canvas-fg" : "text-canvas-muted"}`}>
                  {f.name}
                </span>
                {!f.directory && (
                  <span className="shrink-0 font-mono text-[9px] text-canvas-muted">
                    {formatSize(f.size)}
                  </span>
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
