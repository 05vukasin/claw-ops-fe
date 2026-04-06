"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { PersistentTerminal } from "./persistent-terminal";
import { MobilePersistentTerminal } from "./mobile-persistent-terminal";
import { useIsMobile } from "@/lib/use-is-mobile";
import { Z_INDEX } from "@/lib/z-index";

interface ClaudeCodeOverlayProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export function ClaudeCodeOverlay({ serverId, serverName, onClose }: ClaudeCodeOverlayProps) {
  const isMobile = useIsMobile();

  /* Lock body scroll while overlay is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Escape to close */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── Mobile: self-contained fullscreen persistent terminal ── */
  if (isMobile) {
    return createPortal(
      <MobilePersistentTerminal
        serverId={serverId}
        serverName={serverName}
        initialCommand="claude"
        onClose={onClose}
      />,
      document.body,
    );
  }

  /* ── Desktop: persistent terminal overlay ── */
  return createPortal(
    <div
      className="fixed inset-0 flex flex-col bg-[#0d1117] animate-fade-slide-in"
      style={{ zIndex: Z_INDEX.MODAL }}
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-[#21262d] px-4 py-3"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#e6edf3]">
            Claude Code
          </p>
          <p className="truncate text-[11px] text-gray-500">
            {serverName} — persistent session
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
        >
          <FiX size={18} />
        </button>
      </div>

      {/* Persistent terminal fills remaining space */}
      <div
        className="flex flex-1 flex-col min-h-0"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <PersistentTerminal serverId={serverId} initialCommand="claude" />
      </div>
    </div>,
    document.body,
  );
}
