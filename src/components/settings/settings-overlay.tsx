"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { FiBell, FiBellOff, FiLoader, FiMoon, FiMonitor, FiSun, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";
import {
  fetchNotificationDevicesApi,
  registerNotificationDeviceApi,
  toggleDeviceNotificationsApi,
  getVapidKeyApi,
  subscribePushApi,
  ApiError,
  type NotificationDevice,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const emptySubscribe = () => () => {};

function useNotificationPermission() {
  return useSyncExternalStore(
    emptySubscribe,
    () => (typeof Notification !== "undefined" ? Notification.permission : "default"),
    () => "default",
  );
}

function getBrowserName() {
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Browser";
}

function getPlatformName() {
  const ua = navigator.userAgent;
  if (ua.includes("Android")) return "ANDROID";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "IOS";
  if (ua.includes("Windows")) return "WINDOWS";
  if (ua.includes("Mac")) return "MACOS";
  if (ua.includes("Linux")) return "LINUX";
  return "WEB";
}

function getDeviceName() {
  return `${getBrowserName()} on ${getPlatformName()}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
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

  /* ── Device state ── */
  const [device, setDevice] = useState<NotificationDevice | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setPermState(permission); }, [permission]);

  /* ── Load this device from backend ── */
  const loadDevice = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const devices = await fetchNotificationDevicesApi();
      const name = getDeviceName();
      const match = devices.find((d) => d.deviceName === name) ?? null;
      setDevice(match);
    } catch {
      // Not critical — just means we can't check device state
    }
    setDeviceLoading(false);
  }, []);

  useEffect(() => { loadDevice(); }, [loadDevice]);

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

  /* ── Request permission + register device + subscribe push ── */
  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      // Step 1: Request browser permission if not granted
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        setPermState(result);
        if (result !== "granted") { setBusy(false); return; }
      }

      // Step 2: Register device if not already registered
      if (!device) {
        const deviceName = getDeviceName();
        const platform = getPlatformName();

        // Try Web Push subscription
        let pushEndpoint: string | undefined;
        let pushKeyAuth: string | undefined;
        let pushKeyP256dh: string | undefined;

        try {
          const vapid = await getVapidKeyApi();
          if (vapid && "serviceWorker" in navigator && "PushManager" in window) {
            const swReg = await navigator.serviceWorker.register("/push-sw.js");
            const sub = await swReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
            });
            const keys = sub.toJSON().keys;
            if (keys) {
              pushEndpoint = sub.endpoint;
              pushKeyAuth = keys.auth;
              pushKeyP256dh = keys.p256dh;
              // Also register with backend push service
              await subscribePushApi({ endpoint: sub.endpoint, keyAuth: keys.auth!, keyP256dh: keys.p256dh! });
            }
          }
        } catch {
          // Web Push not available — register device without push subscription
        }

        await registerNotificationDeviceApi({
          deviceName,
          platform,
          pushEndpoint,
          pushKeyAuth,
          pushKeyP256dh,
        });
      } else if (!device.notificationsEnabled) {
        // Device exists but disabled — re-enable
        await toggleDeviceNotificationsApi(device.id, true);
      }

      await loadDevice();
    } catch {
      // Silent fail — device list will reflect actual state
    }
    setBusy(false);
  }, [device, loadDevice]);

  /* ── Disable notifications (toggle off) ── */
  const handleDisable = useCallback(async () => {
    if (!device) return;
    setBusy(true);
    try {
      await toggleDeviceNotificationsApi(device.id, false);
      await loadDevice();
    } catch {
      // Silent fail
    }
    setBusy(false);
  }, [device, loadDevice]);

  const currentTheme = mounted ? (theme ?? "system") : "system";

  /* ── Determine notification UI state ── */
  const notifEnabled = device?.notificationsEnabled === true;
  const showEnableBtn = permState !== "denied" && (!device || !device.notificationsEnabled);
  const showDisableBtn = device?.notificationsEnabled === true;

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
              <ThemeBtn label="Light" icon={<FiSun size={14} />} active={currentTheme === "light"} onClick={() => setTheme("light")} />
              <ThemeBtn label="Dark" icon={<FiMoon size={14} />} active={currentTheme === "dark"} onClick={() => setTheme("dark")} />
              <ThemeBtn label="System" icon={<FiMonitor size={14} />} active={currentTheme === "system"} onClick={() => setTheme("system")} />
            </div>
          </div>

          {/* ═══════ NOTIFICATIONS ═══════ */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Notifications</p>

            <div className="space-y-2.5">
              {/* Status card */}
              <div className="flex items-center justify-between rounded-lg border border-canvas-border px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {notifEnabled ? (
                    <FiBell size={14} className="text-green-500" />
                  ) : (
                    <FiBellOff size={14} className="text-canvas-muted" />
                  )}
                  <div>
                    <p className="text-xs font-medium text-canvas-fg">Push Notifications</p>
                    <p className="text-[10px] text-canvas-muted">
                      {deviceLoading
                        ? "Checking..."
                        : permState === "denied"
                          ? "Blocked by browser"
                          : notifEnabled
                            ? "Enabled for this device"
                            : device && !device.notificationsEnabled
                              ? "Disabled — tap to re-enable"
                              : "Not set up yet"}
                    </p>
                  </div>
                </div>
                {!deviceLoading && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      notifEnabled
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : permState === "denied"
                          ? "bg-red-500/10 text-red-500 dark:text-red-400"
                          : "bg-canvas-surface-hover text-canvas-muted"
                    }`}
                  >
                    {notifEnabled ? "On" : permState === "denied" ? "Blocked" : "Off"}
                  </span>
                )}
              </div>

              {/* Enable button */}
              {!deviceLoading && showEnableBtn && permState !== "denied" && (
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border bg-canvas-fg px-4 py-2.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <FiLoader size={13} className="animate-spin" /> : <FiBell size={13} />}
                  {busy ? "Setting up..." : permState === "default" ? "Allow & Enable Notifications" : "Enable Notifications"}
                </button>
              )}

              {/* Disable button */}
              {!deviceLoading && showDisableBtn && (
                <button
                  type="button"
                  onClick={handleDisable}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border px-4 py-2.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50"
                >
                  {busy ? <FiLoader size={13} className="animate-spin" /> : <FiBellOff size={13} />}
                  {busy ? "Disabling..." : "Disable Notifications"}
                </button>
              )}

              {/* Denied help text */}
              {permState === "denied" && (
                <p className="rounded-lg bg-red-500/5 px-4 py-2.5 text-[11px] text-red-500 dark:text-red-400">
                  Notifications are blocked. Click the lock icon in your browser&apos;s address bar and allow notifications, then refresh.
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
