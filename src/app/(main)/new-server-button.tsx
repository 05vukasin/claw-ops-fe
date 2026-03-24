"use client";

import { useCallback, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { ServerModal } from "@/components/servers";
import { Z_INDEX } from "@/lib/z-index";

interface NewServerButtonProps {
  onCreated: () => void;
}

export function NewServerButton({ onCreated }: NewServerButtonProps) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);
  const handleSaved = useCallback(() => {
    setOpen(false);
    onCreated();
  }, [onCreated]);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Add server"
        className="fixed bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-md border border-canvas-border bg-canvas-surface text-canvas-fg backdrop-blur-sm transition-colors hover:bg-canvas-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canvas-fg/20 active:scale-[0.97]"
        style={{ zIndex: Z_INDEX.FLOATING }}
      >
        <FiPlus size={16} strokeWidth={2} />
      </button>

      <ServerModal
        key={open ? "new" : "closed"}
        open={open}
        server={null}
        onClose={handleClose}
        onSaved={handleSaved}
      />
    </>
  );
}
