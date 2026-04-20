"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiExternalLink, FiRefreshCw, FiTrash2, FiLoader } from "react-icons/fi";
import { updateChatAppApi, uninstallChatAppApi, ApiError } from "@/lib/api";

type Action = "idle" | "updating" | "uninstalling";

interface ChatActionsPopoverProps {
  serverId: string;
  hostname: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onUninstalled: () => void;
}

/**
 * Small action menu anchored below the Chat button. Three items: Open (new tab),
 * Update (docker compose pull + up), Delete (compose down + rm + wipe). Update
 * and Delete hit the backend; results surface inline as a status line so the
 * user sees what happened without opening a separate popup.
 */
export function ChatActionsPopover({
  serverId,
  hostname,
  anchorRef,
  onClose,
  onUninstalled,
}: ChatActionsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [action, setAction] = useState<Action>("idle");
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  /* ── Position below the anchor ── */
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
  }, [anchorRef]);

  /* ── Close on click outside (but not on the anchor itself) ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (action !== "idle") return; // don't close mid-action
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    // Defer one tick so the click that opened us doesn't immediately close us.
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [anchorRef, onClose, action]);

  /* ── Escape to close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && action === "idle") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, action]);

  const handleOpen = useCallback(() => {
    window.open(`https://${hostname}/chat`, "_blank", "noopener,noreferrer");
    onClose();
  }, [hostname, onClose]);

  const handleUpdate = useCallback(async () => {
    setAction("updating");
    setStatusMsg(null);
    try {
      const r = await updateChatAppApi(serverId);
      if (r.exitCode === 0) {
        setStatusMsg({ kind: "ok", text: `Updated in ${Math.round(r.durationMs / 1000)}s` });
      } else {
        setStatusMsg({ kind: "err", text: `Update failed (exit ${r.exitCode})` });
      }
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof ApiError ? err.message : "Update request failed",
      });
    } finally {
      setAction("idle");
    }
  }, [serverId]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Uninstall claw-chat from ${hostname}?\n\nThis stops the containers, wipes /opt/claw-chat, and frees ports 80/443. SSL certificate and domain stay.`)) {
      return;
    }
    setAction("uninstalling");
    setStatusMsg(null);
    try {
      const r = await uninstallChatAppApi(serverId);
      if (r.exitCode === 0) {
        onUninstalled();
        onClose();
      } else {
        setStatusMsg({ kind: "err", text: `Uninstall failed (exit ${r.exitCode})` });
      }
    } catch (err) {
      setStatusMsg({
        kind: "err",
        text: err instanceof ApiError ? err.message : "Uninstall request failed",
      });
    } finally {
      setAction("idle");
    }
  }, [serverId, hostname, onUninstalled, onClose]);

  if (!pos) return null;

  const busy = action !== "idle";

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 min-w-[180px] rounded-md border border-canvas-border bg-canvas-bg shadow-xl animate-modal-in"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <MenuItem
        icon={<FiExternalLink size={12} />}
        onClick={handleOpen}
        disabled={busy}
        label="Open"
        hint="new tab"
      />
      <MenuItem
        icon={action === "updating" ? <FiLoader size={12} className="animate-spin" /> : <FiRefreshCw size={12} />}
        onClick={handleUpdate}
        disabled={busy}
        label={action === "updating" ? "Updating…" : "Update"}
        hint="pull latest image"
      />
      <MenuItem
        icon={action === "uninstalling" ? <FiLoader size={12} className="animate-spin" /> : <FiTrash2 size={12} />}
        onClick={handleDelete}
        disabled={busy}
        label={action === "uninstalling" ? "Uninstalling…" : "Delete"}
        hint="stop + remove"
        danger
      />
      {statusMsg && (
        <div
          className={`border-t border-canvas-border px-3 py-1.5 text-[10px] ${
            statusMsg.kind === "ok"
              ? "text-green-600 dark:text-green-400"
              : "text-red-500 dark:text-red-400"
          }`}
        >
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "text-red-500 hover:bg-red-500/5 dark:text-red-400 dark:hover:bg-red-400/5"
          : "text-canvas-fg hover:bg-canvas-surface-hover"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="shrink-0 text-[9px] text-canvas-muted">{hint}</span>
    </button>
  );
}
