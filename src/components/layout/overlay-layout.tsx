import { Z_INDEX } from "@/lib/z-index";
import type { ReactNode } from "react";

interface OverlayLayoutProps {
  children: ReactNode;
}

/**
 * OverlayLayout
 *
 * Wraps page content above the canvas background layer.
 * Provides the correct z-index positioning and a top
 * padding offset to clear the fixed header.
 */
export function OverlayLayout({ children }: OverlayLayoutProps) {
  return (
    <div
      className="relative min-h-screen pt-12"
      style={{ zIndex: Z_INDEX.OVERLAY }}
    >
      {children}
    </div>
  );
}
