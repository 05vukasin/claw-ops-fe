"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Z_INDEX } from "@/lib/z-index";
import { getUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";

const emptySubscribe = () => () => {};

interface NavbarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  /** If set, only these roles can see the item. Omit = visible to all. */
  roles?: string[];
}

interface NavGroup {
  label: string;
  roles?: string[];
  children: NavItem[];
}

type NavEntry = NavItem | NavGroup;
function isGroup(e: NavEntry): e is NavGroup { return "children" in e; }

const NAV_ENTRIES: NavEntry[] = [
  { label: "Servers", href: "/" },
  { label: "Domains", href: "/domains", roles: ["ADMIN", "DEVOPS"] },
  { label: "Scripts", href: "/scripts" },
  { label: "ZIP Generator", href: "/zip-generator" },
  { label: "Notifications", href: "/notifications", roles: ["ADMIN"] },
  { label: "Users", href: "/users", roles: ["ADMIN"] },
  {
    label: "Audit",
    roles: ["ADMIN"],
    children: [
      { label: "Logs", href: "/logs" },
      { label: "Processes", href: "/processes" },
    ],
  },
];

export function Navbar({ open, onClose }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => {
    if (mounted) setUser(getUser());
  }, [mounted]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid catching the open click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  const handleNav = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={{ zIndex: Z_INDEX.DROPDOWN }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed right-0 top-0 h-full w-72 border-l border-canvas-border bg-canvas-bg shadow-lg transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ zIndex: Z_INDEX.DROPDOWN + 1 }}
      >
        <div className="flex h-full flex-col">
          {/* Nav header */}
          <div className="flex h-12 items-center justify-between border-b border-canvas-border px-4">
            <span className="text-xs font-medium text-canvas-muted">
              Menu
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Nav links */}
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            <ul className="space-y-0.5">
              {NAV_ENTRIES.filter((e) => !e.roles || (user?.role && e.roles.includes(user.role))).map((entry, i) => {
                if (isGroup(entry)) {
                  return (
                    <NavGroupItem
                      key={entry.label}
                      group={entry}
                      pathname={pathname}
                      onNav={handleNav}
                      delay={i * 40}
                    />
                  );
                }
                const isActive = pathname === entry.href;
                return (
                  <li key={entry.href} className="animate-nav-item" style={{ animationDelay: `${i * 40}ms` }}>
                    <button
                      type="button"
                      onClick={() => handleNav(entry.href)}
                      className={`flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "bg-canvas-surface-hover font-medium text-canvas-fg"
                          : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
                      }`}
                    >
                      <NavIcon name={entry.label} />
                      <span className="ml-2.5">{entry.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Bottom section */}
          <div className="border-t border-canvas-border px-3 py-3 space-y-1">
            {/* Settings */}
            <button
              type="button"
              onClick={() => {
                const sp = new URLSearchParams(window.location.search);
                sp.set("settings", "open");
                router.push(`${pathname}?${sp.toString()}`);
                onClose();
              }}
              className="flex w-full items-center rounded-md px-3 py-2 text-sm text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="ml-2.5">Settings</span>
            </button>

          </div>

          {/* User info */}
          {user && (
            <div className="border-t border-canvas-border px-4 py-3">
              <p className="truncate text-xs font-medium text-canvas-fg">
                {user.username}
              </p>
              <p className="truncate text-[11px] text-canvas-muted">
                {user.email}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Collapsible nav group ── */

function NavGroupItem({ group, pathname, onNav, delay }: {
  group: NavGroup;
  pathname: string;
  onNav: (href: string) => void;
  delay: number;
}) {
  const childActive = group.children.some((c) => pathname === c.href);
  const [expanded, setExpanded] = useState(childActive);

  return (
    <li className="animate-nav-item" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className={`flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors ${
          childActive
            ? "text-canvas-fg font-medium"
            : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
        }`}
      >
        <NavIcon name={group.label} />
        <span className="ml-2.5 flex-1 text-left">{group.label}</span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-canvas-muted transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      {expanded && (
        <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-canvas-border pl-2.5">
          {group.children.map((child) => {
            const active = pathname === child.href;
            return (
              <li key={child.href}>
                <button
                  type="button"
                  onClick={() => onNav(child.href)}
                  className={`flex w-full items-center rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-canvas-surface-hover font-medium text-canvas-fg"
                      : "text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
                  }`}
                >
                  <NavIcon name={child.label} />
                  <span className="ml-2">{child.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/* ── Nav icons (inline SVGs matching the style) ── */

function NavIcon({ name }: { name: string }) {
  const props = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "Servers":
      return (
        <svg {...props}>
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      );
    case "Domains":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "Scripts":
      return (
        <svg {...props}>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "Logs":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case "Users":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "ZIP Generator":
      return (
        <svg {...props}>
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" rx="1" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "Notifications":
      return (
        <svg {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "Audit":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "Processes":
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <path d="M15 2v2" /><path d="M15 20v2" />
          <path d="M2 15h2" /><path d="M20 15h2" />
          <path d="M9 2v2" /><path d="M9 20v2" />
          <path d="M2 9h2" /><path d="M20 9h2" />
        </svg>
      );
    default:
      return <span className="inline-block h-[15px] w-[15px]" />;
  }
}
