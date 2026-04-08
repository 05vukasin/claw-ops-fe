"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Z_INDEX } from "@/lib/z-index";
import { Navbar } from "./navbar";
import { SettingsOverlay } from "@/components/settings/settings-overlay";

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navOpen, setNavOpen] = useState(false);

  const handleOpen = useCallback(() => setNavOpen(true), []);
  const handleClose = useCallback(() => setNavOpen(false), []);

  const settingsOpen = useMemo(() => searchParams.get("settings") === "open", [searchParams]);

  const handleSettingsClose = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("settings");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchParams]);

  return (
    <>
      <header
        className="surface-overlay fixed left-0 right-0 top-0 flex h-12 items-center justify-between px-4"
        style={{ zIndex: Z_INDEX.HEADER }}
      >
        {/* White-to-transparent gradient behind logo for dark mode visibility */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: 180,
            background: "linear-gradient(to right, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 40%, rgba(255,255,255,0) 100%)",
          }}
        />

        <div className="flex h-full items-center gap-2.5 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/logo.png"
            alt="ClawOps"
            className="relative z-10 h-7 object-contain"
            draggable={false}
          />
        </div>

        <button
          type="button"
          onClick={handleOpen}
          aria-label="Open menu"
          title="Menu"
          className="flex h-8 w-8 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
        >
          {/* Hamburger icon — 3 stripes */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      <Navbar open={navOpen} onClose={handleClose} />

      {settingsOpen && <SettingsOverlay onClose={handleSettingsClose} />}
    </>
  );
}
