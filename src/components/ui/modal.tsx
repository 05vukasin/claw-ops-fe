"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
 * Animated entrance (scale+fade) and exit.
 */
export function Modal({ open, onClose, children }: ModalProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Show on open, animate out when closed externally
  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible && !closing) {
      // Parent set open=false directly (e.g. Cancel button) — play exit animation
      setClosing(true);
      setTimeout(() => {
        setClosing(false);
        setVisible(false);
      }, 150);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setVisible(false);
      onClose();
    }, 150);
  }, [onClose, closing]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose],
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, handleKeyDown]);

  // Lock body scroll when open
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!mounted || !visible) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      handleClose();
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
      <div className={`pointer-events-none fixed inset-0 bg-black/40 dark:bg-black/60 ${closing ? "animate-backdrop-out" : "animate-backdrop-in"}`} />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`relative my-8 w-full max-w-md rounded-lg border border-canvas-border bg-canvas-bg shadow-xl sm:my-0 ${closing ? "animate-modal-out" : "animate-modal-in"}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
