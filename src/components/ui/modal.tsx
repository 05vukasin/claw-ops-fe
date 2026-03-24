"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";
import { Z_INDEX } from "@/lib/z-index";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

const emptySubscribe = () => () => {};

/**
 * Modal
 *
 * Centered overlay dialog rendered via portal.
 * Click-outside and Escape key close the modal.
 * Scrollable when content exceeds viewport height.
 */
export function Modal({ open, onClose, children }: ModalProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="pointer-events-none fixed inset-0 bg-black/40 dark:bg-black/60" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className="relative my-8 w-full max-w-md rounded-lg border border-canvas-border bg-canvas-bg shadow-xl sm:my-0"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
