"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiRefreshCw, FiUpload, FiX } from "react-icons/fi";
import { FileBrowser } from "@/components/servers";
import type { FileBrowserHandle } from "@/components/servers/file-browser";
import { uploadFileApi } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";

interface MobileFileSheetProps {
  serverId: string;
  open: boolean;
  onClose: () => void;
  onCopyPath?: (path: string) => void;
  onFileOpen?: (file: import("@/lib/api").SftpFile) => void;
}

export function MobileFileSheet({ serverId, open, onClose, onCopyPath, onFileOpen }: MobileFileSheetProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const [currentPath, setCurrentPath] = useState("~");
  const [uploading, setUploading] = useState(false);
  const fileBrowserRef = useRef<FileBrowserHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  // Lock page scroll and restore it in place when the sheet closes.
  useEffect(() => {
    if (!rendered) return;
    const scrollY = window.scrollY;
    const previousBody = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBody.overflow;
      document.body.style.position = previousBody.position;
      document.body.style.top = previousBody.top;
      document.body.style.width = previousBody.width;
      window.scrollTo(0, scrollY);
    };
  }, [rendered]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadFileApi(serverId, currentPath, files[i]);
      }
      fileBrowserRef.current?.refresh();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [currentPath, serverId]);

  if (!rendered) return null;

  const backdropClass = closing ? "animate-sheet-backdrop-out" : "animate-sheet-backdrop-in";
  const sheetClass = closing ? "animate-sheet-down" : "animate-sheet-up";

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] ${backdropClass}`}
        style={{ zIndex: Z_INDEX.MODAL }}
        onClick={onClose}
      />

      <div
        className={`${sheetClass} fixed inset-x-0 bottom-0 flex flex-col rounded-t-[28px] border-t border-canvas-border bg-canvas-bg shadow-xl`}
        style={{ zIndex: Z_INDEX.MODAL + 1, height: "min(86dvh, calc(100dvh - max(env(safe-area-inset-top, 0px), 18px)))" }}
      >
        <div className="sticky top-0 z-10 bg-canvas-bg/96 pt-2 backdrop-blur-md">
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 rounded-full bg-canvas-muted/30" />
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-canvas-fg">Files</span>
            <span className="block truncate font-mono text-[10px] text-canvas-muted">{currentPath}</span>
          </div>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <button
            type="button"
            onClick={() => fileBrowserRef.current?.refresh()}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-canvas-border bg-canvas-surface-hover text-canvas-muted hover:text-canvas-fg"
            title="Refresh files"
          >
            <FiRefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-9 items-center gap-2 rounded-xl bg-[#1f6feb] px-3 text-[12px] font-medium text-white transition-opacity disabled:opacity-60"
            title="Upload files"
          >
            <FiUpload size={14} />
            <span>{uploading ? "Uploading..." : "Upload"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={16} />
          </button>
        </div>
        </div>

        <div className="file-panel-fill min-h-0 flex-1">
          <FileBrowser
            ref={fileBrowserRef}
            serverId={serverId}
            fillHeight
            onFileClick={onCopyPath}
            onFileOpen={onFileOpen}
            onPathChange={setCurrentPath}
          />
        </div>
      </div>
    </>
  );
}
