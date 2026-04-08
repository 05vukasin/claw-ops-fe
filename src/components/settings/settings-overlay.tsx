"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { FiBell, FiMoon, FiMonitor, FiSun, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const emptySubscribe = () => () => {};

function useNotificationPermission() {
  const perm = useSyncExternalStore(
    emptySubscribe,
    () => (typeof Notification !== "undefined" ? Notification.permission : "default"),
    () => "default",
  );
  return perm;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SettingsOverlayProps {
  onClose: () => void;
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const permission = useNotificationPermission();
  const [permState, setPermState] = useState(permission);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setPermState(permission); }, [permission]);

  /* ── Escape to close ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ── Lock body scroll ── */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleRequestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermState(result);
  }, []);

  const isDark = resolvedTheme === "dark";
  const currentTheme = mounted ? (theme ?? "system") : "system";

  const permBadge =
    permState === "granted"
      ? "bg-green-500/10 text-green-600 dark:text-green-400"
      : permState === "denied"
        ? "bg-red-500/10 text-red-500 dark:text-red-400"
        : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 animate-backdrop-in" />

      {/* Panel */}
      <div className="relative w-full max-w-sm rounded-xl border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-canvas-border px-5 py-4">
          <h2 className="text-sm font-bold text-canvas-fg">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg"
          >
            <FiX size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* ═══════ APPEARANCE ═══════ */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Appearance</p>
            <div className="flex gap-2">
              <ThemeBtn
                label="Light"
                icon={<FiSun size={14} />}
                active={currentTheme === "light"}
                onClick={() => setTheme("light")}
              />
              <ThemeBtn
                label="Dark"
                icon={<FiMoon size={14} />}
                active={currentTheme === "dark"}
                onClick={() => setTheme("dark")}
              />
              <ThemeBtn
                label="System"
                icon={<FiMonitor size={14} />}
                active={currentTheme === "system"}
                onClick={() => setTheme("system")}
              />
            </div>
          </div>

          {/* ═══════ NOTIFICATIONS ═══════ */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Notifications</p>

            {/* Browser permission status */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-canvas-border px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FiBell size={14} className="text-canvas-muted" />
                  <div>
                    <p className="text-xs font-medium text-canvas-fg">Browser Notifications</p>
                    <p className="text-[10px] text-canvas-muted">
                      {permState === "granted"
                        ? "Allowed — you will receive push notifications"
                        : permState === "denied"
                          ? "Blocked — enable in browser settings"
                          : "Not yet requested"}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${permBadge}`}>
                  {permState}
                </span>
              </div>

              {permState === "default" && (
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border bg-canvas-fg px-4 py-2.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90"
                >
                  <FiBell size={13} />
                  Allow Notifications
                </button>
              )}

              {permState === "denied" && (
                <p className="rounded-lg bg-red-500/5 px-4 py-2.5 text-[11px] text-red-500 dark:text-red-400">
                  Notifications are blocked. To re-enable, click the lock icon in your browser&apos;s address bar and allow notifications.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Theme button ── */
function ThemeBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
        active
          ? "border-canvas-fg/20 bg-canvas-surface-hover text-canvas-fg"
          : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
