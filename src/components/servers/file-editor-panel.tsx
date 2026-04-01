"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiFile,
  FiX,
  FiSave,
  FiCopy,
  FiDownload,
  FiCheck,
  FiAlertTriangle,
  FiLock,
  FiEye,
  FiEdit2,
} from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import { readFileApi, writeFileApi, ApiError, type SftpFile } from "@/lib/api";
import { Z_INDEX } from "@/lib/z-index";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PANEL_W = 520;
const PANEL_H = 480;
const PANEL_MIN_W = 340;
const PANEL_MAX_W = 1400;
const PANEL_MIN_H = 250;
const PANEL_MAX_H_RATIO = 0.92; // fraction of viewport
const MAX_EDITABLE_SIZE = 1024 * 1024; // 1 MB

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
  ".gz", ".tar", ".zip", ".7z", ".rar", ".bz2", ".xz", ".zst",
  ".bin", ".exe", ".so", ".o", ".dylib", ".dll", ".a",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".mp3", ".mp4", ".wav", ".avi", ".mkv", ".mov",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

function isBinaryExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(name.substring(dot).toLowerCase());
}

function hasBinaryContent(content: string): boolean {
  const check = content.substring(0, 8192);
  // eslint-disable-next-line no-control-regex
  return /\x00/.test(check);
}

/** Per-file localStorage helpers */
function panelKey(id: string, suffix: string) {
  return `openclaw-file-panel-${id}-${suffix}`;
}
function loadNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? parseInt(v, 10) || fallback : fallback;
  } catch {
    return fallback;
  }
}
function saveNum(key: string, val: number) {
  try {
    localStorage.setItem(key, String(Math.round(val)));
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface FileEditorPanelProps {
  serverId: string;
  file: SftpFile;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FileEditorPanel({
  serverId,
  file,
  onClose,
  zIndex,
  onFocus,
}: FileEditorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileId = `${serverId}:${file.path}`;

  /* ---- position ---- */
  const [pos, setPos] = useState(() => ({
    x: loadNum(panelKey(fileId, "x"), 120 + Math.random() * 60),
    y: loadNum(panelKey(fileId, "y"), 60 + Math.random() * 40),
  }));
  const posRef = useRef(pos);
  posRef.current = pos;

  /* ---- panel width ---- */
  const [panelW, setPanelW] = useState(() => loadNum(panelKey(fileId, "w"), PANEL_W));
  const panelWRef = useRef(panelW);
  panelWRef.current = panelW;

  /* ---- panel height ---- */
  const [panelH, setPanelH] = useState(() => loadNum(panelKey(fileId, "h"), PANEL_H));
  const panelHRef = useRef(panelH);
  panelHRef.current = panelH;

  /* ---- file content state ---- */
  const [originalContent, setOriginalContent] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [preview, setPreview] = useState(false);

  const dirty = content !== originalContent;
  const isMd = file.name.endsWith(".md");

  /* ---- drag ---- */
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  /* ---- Escape to close ---- */
  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          handleCloseAttempt();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (!readOnly && dirty && !saving) {
          e.preventDefault();
          handleSave();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }); // intentionally no deps — always sees latest state

  /* ---- fetch content on mount ---- */
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    if (isBinaryExtension(file.name)) {
      setContent("(Binary file — cannot display)");
      setOriginalContent("(Binary file — cannot display)");
      setReadOnly(true);
      setLoading(false);
      return;
    }

    const forceReadOnly = file.size > MAX_EDITABLE_SIZE;

    (async () => {
      try {
        const text = await readFileApi(serverId, file.path);
        const binary = hasBinaryContent(text);
        const c = binary ? "(Binary file — cannot display)" : text;
        setContent(c);
        setOriginalContent(c);
        setReadOnly(forceReadOnly || binary);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to read file");
        setReadOnly(true);
      }
      setLoading(false);
    })();
  }, [serverId, file.path, file.name, file.size]);

  /* ---- save ---- */
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await writeFileApi(serverId, file.path, content);
      setOriginalContent(content);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save file");
    }
    setSaving(false);
  }, [serverId, file.path, content]);

  /* ---- close with unsaved guard ---- */
  const handleCloseAttempt = useCallback(() => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  /* ---- copy ---- */
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  /* ---- download ---- */
  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, file.name]);

  /* ---- drag handlers ---- */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-drag-handle]")) return;
      dragging.current = true;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - panelWRef.current));
    const ny = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - panelHRef.current));
    setPos({ x: nx, y: ny });
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      saveNum(panelKey(fileId, "x"), posRef.current.x);
      saveNum(panelKey(fileId, "y"), posRef.current.y);
    },
    [fileId],
  );

  /* ---- resize ---- */
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, dir: "left" | "right") => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = panelWRef.current;
      const startPanelX = posRef.current.x;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, startW + (dir === "right" ? dx : -dx)));
        setPanelW(newW);
        if (dir === "left") {
          const newX = Math.max(0, startPanelX + startW - newW);
          setPos((p) => ({ ...p, x: newX }));
        }
      }
      function onUp() {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        saveNum(panelKey(fileId, "w"), panelWRef.current);
      }
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
    },
    [fileId],
  );

  /* ---- bottom resize (height) ---- */
  const handleBottomResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = panelHRef.current;

    function onMove(ev: PointerEvent) {
      const dy = ev.clientY - startY;
      const maxH = window.innerHeight * PANEL_MAX_H_RATIO - posRef.current.y;
      const newH = Math.max(PANEL_MIN_H, Math.min(maxH, startH + dy));
      setPanelH(newH);
    }
    function onUp() {
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      saveNum(panelKey(fileId, "h"), panelHRef.current);
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }, [fileId]);

  /* ---- derived ---- */
  const lineCount = content.split("\n").length;

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`File editor: ${file.name}`}
      className="fixed flex flex-col overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in"
      style={{
        zIndex: zIndex ?? Z_INDEX.DROPDOWN,
        left: pos.x,
        top: pos.y,
        width: panelW,
        height: panelH,
        maxWidth: "calc(100vw - 16px)",
      }}
      onPointerDown={(e) => {
        onFocus?.();
        handlePointerDown(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Resize handles */}
      <div
        className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-ew-resize"
        onPointerDown={(e) => handleResizeStart(e, "left")}
      />
      <div
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-ew-resize"
        onPointerDown={(e) => handleResizeStart(e, "right")}
      />
      <div
        className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-ns-resize"
        onPointerDown={handleBottomResizeStart}
      />

      {/* ===== HEADER (drag handle) ===== */}
      <div
        data-drag-handle
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-canvas-border px-4 py-2.5 select-none active:cursor-grabbing"
      >
        <FiFile size={13} className="shrink-0 text-canvas-muted" data-drag-handle />
        <div className="min-w-0 flex-1" data-drag-handle>
          <p className="truncate text-sm font-semibold leading-tight text-canvas-fg" data-drag-handle>
            {file.name}
          </p>
          <p className="truncate text-[10px] text-canvas-muted" data-drag-handle>
            {file.path}
          </p>
        </div>

        {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" title="Unsaved changes" />}
        {readOnly && (
          <span className="flex items-center gap-1 rounded-full border border-canvas-border px-2 py-0.5 text-[9px] font-medium text-canvas-muted">
            <FiLock size={9} />
            Read-only
          </span>
        )}

        {isMd && !loading && (
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-canvas-border px-2 text-[10px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            {preview ? <FiEdit2 size={11} /> : <FiEye size={11} />}
            {preview ? "Edit" : "Preview"}
          </button>
        )}

        <button
          type="button"
          onClick={handleCloseAttempt}
          aria-label="Close panel"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiX size={15} />
        </button>
      </div>

      {/* ===== Unsaved confirmation ===== */}
      {confirmDiscard && (
        <div className="flex shrink-0 items-center gap-3 border-b border-yellow-500/20 bg-yellow-500/5 px-4 py-2">
          <FiAlertTriangle size={13} className="shrink-0 text-yellow-500" />
          <span className="flex-1 text-xs text-yellow-600 dark:text-yellow-400">
            Unsaved changes. Discard?
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => setConfirmDiscard(false)}
            className="rounded-md border border-canvas-border px-3 py-1 text-[11px] font-medium text-canvas-muted transition-colors hover:text-canvas-fg"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ===== Stats bar ===== */}
      <div className="flex shrink-0 items-center gap-3 border-b border-canvas-border bg-[#0d1117] px-4 py-1">
        <span className="text-[10px] text-gray-600">
          {lineCount.toLocaleString()} lines
        </span>
        {error && (
          <span className="text-[10px] text-red-400">{error}</span>
        )}
      </div>

      {/* ===== Editor ===== */}
      {/* ===== Editor / Preview ===== */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center bg-[#0d1117] py-20">
          <span className="text-xs text-gray-500">Loading...</span>
        </div>
      ) : preview && isMd ? (
        <div
          className="md-preview min-h-[250px] flex-1 overflow-y-auto bg-white px-6 py-4 text-sm leading-relaxed text-gray-900 dark:bg-[#0d1117] dark:text-[#e6edf3]"
        >
          <ReactMarkdown
            components={{
              h1: ({ children }) => <h1 className="mb-3 mt-5 border-b border-gray-200 pb-2 text-2xl font-bold dark:border-gray-700">{children}</h1>,
              h2: ({ children }) => <h2 className="mb-2 mt-4 border-b border-gray-200 pb-1.5 text-xl font-semibold dark:border-gray-700">{children}</h2>,
              h3: ({ children }) => <h3 className="mb-2 mt-3 text-lg font-semibold">{children}</h3>,
              h4: ({ children }) => <h4 className="mb-1 mt-2 text-base font-semibold">{children}</h4>,
              p: ({ children }) => <p className="my-2">{children}</p>,
              a: ({ href, children }) => <a href={href} className="text-blue-600 underline dark:text-blue-400" target="_blank" rel="noopener noreferrer">{children}</a>,
              ul: ({ children }) => <ul className="my-2 ml-6 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="my-2 ml-6 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="my-0.5">{children}</li>,
              blockquote: ({ children }) => <blockquote className="my-2 border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:border-gray-600 dark:text-gray-400">{children}</blockquote>,
              code: ({ className, children }) => {
                const isBlock = className?.includes("language-");
                return isBlock
                  ? <code className={`block rounded bg-gray-100 p-3 font-mono text-[13px] dark:bg-[#161b22] ${className ?? ""}`}>{children}</code>
                  : <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] dark:bg-[#161b22]">{children}</code>;
              },
              pre: ({ children }) => <pre className="my-3 overflow-x-auto rounded-md bg-gray-100 dark:bg-[#161b22]">{children}</pre>,
              hr: () => <hr className="my-4 border-gray-200 dark:border-gray-700" />,
              table: ({ children }) => <table className="my-3 w-full border-collapse text-sm">{children}</table>,
              th: ({ children }) => <th className="border border-gray-300 bg-gray-50 px-3 py-1.5 text-left font-semibold dark:border-gray-600 dark:bg-[#161b22]">{children}</th>,
              td: ({ children }) => <td className="border border-gray-300 px-3 py-1.5 dark:border-gray-600">{children}</td>,
              img: ({ src, alt }) => <img src={src} alt={alt ?? ""} className="my-2 max-w-full rounded" />,
              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          readOnly={readOnly}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[250px] flex-1 resize-none border-none bg-[#0d1117] px-4 py-3 font-mono text-[13px] leading-relaxed text-[#e6edf3] placeholder:text-gray-600 outline-none"
          style={{
            fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
          }}
          spellCheck={false}
        />
      )}

      {/* ===== Action bar ===== */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-canvas-border bg-canvas-bg px-4 py-2">
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          <FiDownload size={12} />
          Download
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md border border-canvas-border px-3 py-1.5 text-[11px] font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          {copied ? <FiCheck size={12} className="text-green-500" /> : <FiCopy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>

        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <FiSave size={12} />
            {saving ? "Saving..." : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
