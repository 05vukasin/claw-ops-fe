"use client";

import { Z_INDEX } from "@/lib/z-index";

/**
 * Fixed dot-grid background used on all authenticated pages.
 */
export function CanvasBackground() {
  return (
    <div
      className="canvas-dot-grid fixed inset-0"
      style={{ zIndex: Z_INDEX.CANVAS }}
      aria-hidden="true"
    />
  );
}
