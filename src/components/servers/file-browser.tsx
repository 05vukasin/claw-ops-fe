"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FiFolder,
  FiFile,
  FiArrowUp,
  FiRefreshCw,
  FiHome,
  FiHardDrive,
  FiDownload,
  FiPackage,
  FiPlay,
  FiTrash2,
  FiTerminal,
} from "react-icons/fi";
import { listFilesApi, downloadFileApi, executeCommandApi, uploadFileApi, ApiError, type SftpFile } from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Imperative handle                                                  */
/* ------------------------------------------------------------------ */

export interface FileBrowserHandle {
  navigateTo: (path: string) => void;
}

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
/*  Context menu state                                                 */
/* ------------------------------------------------------------------ */

interface CtxMenu {
  x: number;
  y: number;
  file: SftpFile;
}

function isArchive(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".zip") || n.endsWith(".tar.gz") || n.endsWith(".tgz")
    || n.endsWith(".tar.bz2") || n.endsWith(".tar.xz") || n.endsWith(".tar")
    || n.endsWith(".gz") || n.endsWith(".bz2") || n.endsWith(".xz")
    || n.endsWith(".7z") || n.endsWith(".rar");
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FileBrowserProps {
  serverId: string;
  onFileClick?: (command: string) => void;
  /** Double-click a non-directory file to open in editor panel */
  onFileOpen?: (file: SftpFile) => void;
  /** Run a command in the terminal, auto-expanding it if needed */
  onRunCommand?: (command: string) => void;
  /** When provided, component uses this fixed height and flex layout */
  height?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export const FileBrowser = forwardRef<FileBrowserHandle, FileBrowserProps>(function FileBrowser(
  { serverId, onFileClick, onFileOpen, onRunCommand, height },
  ref,
) {
  const [currentPath, setCurrentPath] = useState("~");
  const currentPathRef = useRef(currentPath);
  const [files, setFiles] = useState<SftpFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  /* ---- drag-and-drop upload ---- */
  const [dragOver, setDragOver] = useState(false);
  const [dragIsFolder, setDragIsFolder] = useState(false);
  const dragCounterRef = useRef(0);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  /* ---- context menu ---- */
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside or scroll
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  const loadFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setCurrentPath(path);
    currentPathRef.current = path;
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

  /* ── Imperative handle: let parent navigate without triggering onFileClick ── */
  useImperativeHandle(ref, () => ({
    navigateTo(path: string) {
      if (path === currentPathRef.current) return;
      loadFiles(path);
    },
  }), [loadFiles]);

  /* ── Drag-and-drop upload handlers ── */
  /** Check if any dragged item is a folder */
  const checkForFolder = useCallback((items: DataTransferItemList): boolean => {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry?.isDirectory) return true;
      // Fallback: folders have type "" and kind "file"
      if (items[i].kind === "file" && items[i].type === "") return true;
    }
    return false;
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      const isFolder = checkForFolder(e.dataTransfer.items);
      setDragIsFolder(isFolder);
      setDragOver(true);
    }
  }, [checkForFolder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
      setDragIsFolder(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const wasFolder = dragIsFolder;
    dragCounterRef.current = 0;
    setDragOver(false);
    setDragIsFolder(false);

    // Block folder uploads
    if (wasFolder) return;

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles.length) return;

    for (let i = 0; i < droppedFiles.length; i++) {
      const f = droppedFiles[i];
      setBusyMessage(`Uploading ${f.name}...`);
      try {
        await uploadFileApi(serverId, currentPathRef.current, f);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Upload failed:", err instanceof ApiError ? err.message : err);
      }
    }
    setBusyMessage(null);
    loadFiles(currentPathRef.current);
  }, [serverId, loadFiles, dragIsFolder]);

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

  /* ── Single click: directories navigate, files send ls command to terminal ── */
  const handleClick = useCallback((file: SftpFile) => {
    if (file.directory) {
      navigateTo(file.path);
    } else if (onFileClick) {
      const dir = file.path.substring(0, file.path.lastIndexOf("/")) || "/";
      const name = file.path.substring(file.path.lastIndexOf("/") + 1);
      onFileClick(`cd ${dir} && ls -la ${name}\r`);
    }
  }, [navigateTo, onFileClick]);

  /* ── Double click: open file in editor panel ── */
  const handleDoubleClick = useCallback((file: SftpFile) => {
    if (file.directory) return;
    onFileOpen?.(file);
  }, [onFileOpen]);

  /* ── Right-click context menu ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, file: SftpFile) => {
    e.preventDefault();
    e.stopPropagation();
    // Position next to the clicked row element
    const row = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCtxMenu({ x: row.right, y: row.top, file });
  }, []);

  /* ── Context menu actions ── */
  const handleCtxOpen = useCallback(() => {
    if (!ctxMenu) return;
    if (ctxMenu.file.directory) {
      navigateTo(ctxMenu.file.path);
    } else {
      onFileOpen?.(ctxMenu.file);
    }
    setCtxMenu(null);
  }, [ctxMenu, navigateTo, onFileOpen]);

  const handleCtxSave = useCallback(async () => {
    if (!ctxMenu) return;
    const file = ctxMenu.file;
    setCtxMenu(null);
    setBusyMessage(file.directory ? `Zipping ${file.name}...` : `Downloading ${file.name}...`);
    try {
      if (file.directory) {
        // Zip the folder on the server, download, then clean up
        const archivePath = `/tmp/.claw-dl-${Date.now()}.zip`;
        const escapedName = file.name.replace(/'/g, "'\\''");
        let resolvedPath = file.path;
        if (resolvedPath.startsWith("~")) resolvedPath = resolvedPath.replace("~", "$HOME");
        const parentDir = resolvedPath.substring(0, resolvedPath.lastIndexOf("/")) || "/";

        // Ensure zip is installed (try sudo), then create archive
        const zipResult = await executeCommandApi(
          serverId,
          `which zip >/dev/null 2>&1 || (sudo apt-get update -qq && sudo apt-get install -y -qq zip) >/dev/null 2>&1; cd "${parentDir}" && zip -r ${archivePath} '${escapedName}'`,
          180,
        );
        if (zipResult.exitCode !== 0) {
          throw new ApiError(500, zipResult.stderr || "Failed to create zip");
        }
        const blob = await downloadFileApi(serverId, archivePath);
        executeCommandApi(serverId, `rm -f ${archivePath}`, 5).catch(() => {});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${file.name}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = await downloadFileApi(serverId, file.path);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Download failed:", err instanceof ApiError ? err.message : err);
      setBusyMessage(`Download failed: ${err instanceof ApiError ? err.message : "Unknown error"}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
    setBusyMessage(null);
  }, [ctxMenu, serverId]);

  const handleCtxRun = useCallback(() => {
    if (!ctxMenu || ctxMenu.file.directory) return;
    const escaped = ctxMenu.file.path.replace(/'/g, "'\\''");
    const cmd = `bash '${escaped}'\r`;
    if (onRunCommand) {
      onRunCommand(cmd);
    } else {
      onFileClick?.(cmd);
    }
    setCtxMenu(null);
  }, [ctxMenu, onRunCommand, onFileClick]);

  const handleCtxExtract = useCallback(async () => {
    if (!ctxMenu || ctxMenu.file.directory) return;
    const file = ctxMenu.file;
    // Resolve ~ so $HOME expands in the shell
    let resolvedPath = file.path;
    if (resolvedPath.startsWith("~")) resolvedPath = resolvedPath.replace("~", "$HOME");
    const resolvedDir = resolvedPath.substring(0, resolvedPath.lastIndexOf("/")) || "/";
    const name = file.name.toLowerCase();
    setCtxMenu(null);

    let cmd: string;
    if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) {
      cmd = `tar -xzf "${resolvedPath}" -C "${resolvedDir}"`;
    } else if (name.endsWith(".tar.bz2")) {
      cmd = `tar -xjf "${resolvedPath}" -C "${resolvedDir}"`;
    } else if (name.endsWith(".tar.xz")) {
      cmd = `tar -xJf "${resolvedPath}" -C "${resolvedDir}"`;
    } else if (name.endsWith(".tar")) {
      cmd = `tar -xf "${resolvedPath}" -C "${resolvedDir}"`;
    } else if (name.endsWith(".zip")) {
      // Auto-install unzip if missing
      cmd = `which unzip >/dev/null 2>&1 || (sudo apt-get update -qq && sudo apt-get install -y -qq unzip) >/dev/null 2>&1; unzip -o "${resolvedPath}" -d "${resolvedDir}"`;
    } else if (name.endsWith(".gz")) {
      cmd = `gunzip -k "${resolvedPath}"`;
    } else if (name.endsWith(".bz2")) {
      cmd = `bunzip2 -k "${resolvedPath}"`;
    } else if (name.endsWith(".xz")) {
      cmd = `unxz -k "${resolvedPath}"`;
    } else if (name.endsWith(".7z")) {
      cmd = `7z x "${resolvedPath}" -o"${resolvedDir}"`;
    } else if (name.endsWith(".rar")) {
      cmd = `unrar x "${resolvedPath}" "${resolvedDir}"`;
    } else {
      return;
    }

    setBusyMessage(`Extracting ${file.name}...`);
    try {
      const result = await executeCommandApi(serverId, cmd, 180);
      if (result.exitCode !== 0) {
        // eslint-disable-next-line no-console
        console.error("Extract failed:", result.stderr);
      }
      loadFiles(currentPathRef.current);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Extract failed:", err instanceof ApiError ? err.message : err);
    }
    setBusyMessage(null);
  }, [ctxMenu, serverId, loadFiles]);

  const handleCtxDelete = useCallback(async () => {
    if (!ctxMenu) return;
    const file = ctxMenu.file;
    setCtxMenu(null);
    const label = file.directory ? "directory" : "file";
    if (!window.confirm(`Delete ${label} "${file.name}"? This cannot be undone.`)) return;
    try {
      const cmd = file.directory
        ? `rm -rf '${file.path.replace(/'/g, "'\\''")}'`
        : `rm -f '${file.path.replace(/'/g, "'\\''")}'`;
      await executeCommandApi(serverId, cmd, 15);
      // Refresh current directory
      loadFiles(currentPathRef.current);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Delete failed:", err instanceof ApiError ? err.message : err);
    }
  }, [ctxMenu, serverId, loadFiles]);

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
    <div
      className={`relative ${height != null ? "flex flex-col overflow-hidden" : "border-b border-canvas-border"}`}
      style={height != null ? { height } : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {(dragOver || busyMessage) && (
        <div className={`absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed rounded ${
          dragIsFolder
            ? "bg-red-500/10 border-red-500/40"
            : "bg-blue-500/10 border-blue-500/40"
        }`}>
          <span className={`text-[11px] font-medium ${
            dragIsFolder
              ? "text-red-500 dark:text-red-400"
              : "text-blue-500 dark:text-blue-400"
          }`}>
            {busyMessage ?? (dragIsFolder ? "Cannot upload folders — zip it first" : "Drop files to upload")}
          </span>
        </div>
      )}
      {/* Header + actions */}
      <div className="flex shrink-0 items-center gap-2 border-b border-canvas-border px-4 py-1.5">
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
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-canvas-border bg-canvas-surface-hover/30 px-4 py-1 font-mono text-[10px] text-canvas-muted">
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
      <div className={height != null ? "flex-1 min-h-0 overflow-y-auto" : "max-h-45 overflow-y-auto"}>
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
                onClick={() => handleClick(f)}
                onDoubleClick={() => handleDoubleClick(f)}
                onContextMenu={(e) => handleContextMenu(e, f)}
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

      {/* ── Right-click context menu (portaled to body to escape overflow clipping) ── */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-35 rounded-md border border-canvas-border bg-canvas-bg py-1 shadow-xl animate-modal-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleCtxOpen}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
          >
            <FiTerminal size={11} className="text-canvas-muted" />
            Open
          </button>
          <button
            type="button"
            onClick={handleCtxSave}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
          >
            <FiDownload size={11} className="text-canvas-muted" />
            {ctxMenu.file.directory ? "Download as .zip" : "Save"}
          </button>
          {!ctxMenu.file.directory && ctxMenu.file.name.endsWith(".sh") && (
            <button
              type="button"
              onClick={handleCtxRun}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
            >
              <FiPlay size={11} className="text-green-500" />
              Run
            </button>
          )}
          {!ctxMenu.file.directory && isArchive(ctxMenu.file.name) && (
            <button
              type="button"
              onClick={handleCtxExtract}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-canvas-fg transition-colors hover:bg-canvas-surface-hover"
            >
              <FiPackage size={11} className="text-canvas-muted" />
              Extract
            </button>
          )}
          <div className="mx-2 my-1 border-t border-canvas-border" />
          <button
            type="button"
            onClick={handleCtxDelete}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-red-500 transition-colors hover:bg-red-500/10"
          >
            <FiTrash2 size={11} />
            Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
});
