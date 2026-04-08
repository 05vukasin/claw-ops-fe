"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { FiBell, FiBellOff, FiEye, FiEyeOff, FiKey, FiLoader, FiLogOut, FiMoon, FiMonitor, FiSun, FiX } from "react-icons/fi";
import { Z_INDEX } from "@/lib/z-index";
import { clearAuth, getStoredAuth, getUser } from "@/lib/auth";
import { clearAccessToken } from "@/lib/apiClient";
import {
  logoutApi,
  changePasswordApi,
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
  const router = useRouter();
  const { resolvedTheme, theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const permission = useNotificationPermission();
  const [permState, setPermState] = useState(permission);
  const user = getUser();

  /* ── Device state ── */
  const [device, setDevice] = useState<NotificationDevice | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);

  /* ── Change password state ── */
  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setPermState(permission); }, [permission]);

  /* ── Load this device from backend ── */
  const loadDevice = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const devices = await fetchNotificationDevicesApi();
      const name = getDeviceName();
      setDevice(devices.find((d) => d.deviceName === name) ?? null);
    } catch { /* not critical */ }
    setDeviceLoading(false);
  }, []);

  useEffect(() => { loadDevice(); }, [loadDevice]);

  /* ── Self-heal: re-register push SW if device exists but SW was lost ── */
  useEffect(() => {
    if (!device?.notificationsEnabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      const hasPushSw = registrations.some((r) => {
        const sw = r.active || r.installing || r.waiting;
        return sw?.scriptURL.endsWith("push-sw.js");
      });
      if (hasPushSw) return;

      try {
        const vapid = await getVapidKeyApi();
        if (vapid && "PushManager" in window) {
          const swReg = await navigator.serviceWorker.register("/push-sw.js");
          const sub = await swReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
          });
          const keys = sub.toJSON().keys;
          if (keys) {
            await subscribePushApi({ endpoint: sub.endpoint, keyAuth: keys.auth!, keyP256dh: keys.p256dh! });
          }
        }
      } catch (err) {
        console.warn("[notifications] Could not re-register push SW:", err);
      }
    });
  }, [device]);

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

  /* ── Enable notifications ── */
  const handleEnable = useCallback(async () => {
    setBusy(true);
    setNotifError(null);
    try {
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        setPermState(result);
        if (result !== "granted") { setBusy(false); return; }
      }
      if (!device) {
        let pushEndpoint: string | undefined;
        let pushKeyAuth: string | undefined;
        let pushKeyP256dh: string | undefined;
        try {
          const vapid = await getVapidKeyApi();
          if (vapid && "serviceWorker" in navigator && "PushManager" in window) {
            const swReg = await navigator.serviceWorker.register("/push-sw.js");
            const sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) });
            const keys = sub.toJSON().keys;
            if (keys) {
              pushEndpoint = sub.endpoint;
              pushKeyAuth = keys.auth;
              pushKeyP256dh = keys.p256dh;
              await subscribePushApi({ endpoint: sub.endpoint, keyAuth: keys.auth!, keyP256dh: keys.p256dh! });
            }
          }
        } catch (err) {
          console.error("[notifications] Push setup failed:", err);
          setNotifError("Push notifications could not be set up. You may still receive in-app notifications.");
        }
        await registerNotificationDeviceApi({ deviceName: getDeviceName(), platform: getPlatformName(), pushEndpoint, pushKeyAuth, pushKeyP256dh });
      } else if (!device.notificationsEnabled) {
        await toggleDeviceNotificationsApi(device.id, true);
      }
      await loadDevice();
    } catch (err) {
      console.error("[notifications] Enable failed:", err);
      setNotifError(err instanceof ApiError ? err.message : "Failed to enable notifications. Please try again.");
    }
    setBusy(false);
  }, [device, loadDevice]);

  /* ── Disable notifications ── */
  const handleDisable = useCallback(async () => {
    if (!device) return;
    setBusy(true);
    try {
      await toggleDeviceNotificationsApi(device.id, false);
      await loadDevice();
    } catch { /* silent */ }
    setBusy(false);
  }, [device, loadDevice]);

  /* ── Change password ── */
  const handleChangePassword = useCallback(async () => {
    if (!user || !newPw) return;
    if (newPw.length < 8) { setPwMsg({ text: "Password must be at least 8 characters", type: "error" }); return; }
    setPwBusy(true);
    setPwMsg(null);
    try {
      await changePasswordApi(user.id, newPw);
      setPwMsg({ text: "Password changed successfully", type: "success" });
      setNewPw("");
      setShowPwForm(false);
    } catch (err) {
      setPwMsg({ text: err instanceof ApiError ? err.message : "Failed to change password", type: "error" });
    }
    setPwBusy(false);
  }, [user, newPw]);

  /* ── Logout ── */
  const handleLogout = useCallback(async () => {
    const stored = getStoredAuth();
    if (stored?.refreshToken) {
      await logoutApi(stored.refreshToken).catch(() => {});
    }
    clearAccessToken();
    clearAuth();
    onClose();
    router.replace("/login");
  }, [router, onClose]);

  const currentTheme = mounted ? (theme ?? "system") : "system";
  const notifEnabled = device?.notificationsEnabled === true;
  const showEnableBtn = permState !== "denied" && (!device || !device.notificationsEnabled);
  const showDisableBtn = device?.notificationsEnabled === true;

  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 focus:outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.MODAL }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 animate-backdrop-in" />

      <div className="relative w-full max-w-sm rounded-xl border border-canvas-border bg-canvas-bg shadow-2xl animate-modal-in max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-canvas-border bg-canvas-bg px-5 py-4 rounded-t-xl">
          <h2 className="text-sm font-bold text-canvas-fg">Settings</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg">
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
              <div className="flex items-center justify-between rounded-lg border border-canvas-border px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {notifEnabled ? <FiBell size={14} className="text-green-500" /> : <FiBellOff size={14} className="text-canvas-muted" />}
                  <div>
                    <p className="text-xs font-medium text-canvas-fg">Push Notifications</p>
                    <p className="text-[10px] text-canvas-muted">
                      {deviceLoading ? "Checking..." : permState === "denied" ? "Blocked by browser" : notifEnabled ? "Enabled for this device" : device && !device.notificationsEnabled ? "Disabled" : "Not set up yet"}
                    </p>
                  </div>
                </div>
                {!deviceLoading && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${notifEnabled ? "bg-green-500/10 text-green-600 dark:text-green-400" : permState === "denied" ? "bg-red-500/10 text-red-500 dark:text-red-400" : "bg-canvas-surface-hover text-canvas-muted"}`}>
                    {notifEnabled ? "On" : permState === "denied" ? "Blocked" : "Off"}
                  </span>
                )}
              </div>

              {!deviceLoading && showEnableBtn && permState !== "denied" && (
                <button type="button" onClick={handleEnable} disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border bg-canvas-fg px-4 py-2.5 text-xs font-medium text-canvas-bg transition-opacity hover:opacity-90 disabled:opacity-50">
                  {busy ? <FiLoader size={13} className="animate-spin" /> : <FiBell size={13} />}
                  {busy ? "Setting up..." : permState === "default" ? "Allow & Enable Notifications" : "Enable Notifications"}
                </button>
              )}

              {!deviceLoading && showDisableBtn && (
                <button type="button" onClick={handleDisable} disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-canvas-border px-4 py-2.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg disabled:opacity-50">
                  {busy ? <FiLoader size={13} className="animate-spin" /> : <FiBellOff size={13} />}
                  {busy ? "Disabling..." : "Disable Notifications"}
                </button>
              )}

              {permState === "denied" && (
                <p className="rounded-lg bg-red-500/5 px-4 py-2.5 text-[11px] text-red-500 dark:text-red-400">
                  Notifications are blocked. Click the lock icon in your browser&apos;s address bar and allow notifications, then refresh.
                </p>
              )}

              {notifError && (
                <p className="rounded-lg bg-orange-500/5 px-4 py-2.5 text-[11px] text-orange-600 dark:text-orange-400">
                  {notifError}
                </p>
              )}
            </div>
          </div>

          {/* ═══════ ACCOUNT ═══════ */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">Account</p>
            <div className="space-y-2">
              {/* User info */}
              {user && (
                <div className="rounded-lg border border-canvas-border px-4 py-3">
                  <p className="text-xs font-medium text-canvas-fg">{user.username}</p>
                  <p className="text-[10px] text-canvas-muted">{user.email}</p>
                </div>
              )}

              {/* Change password */}
              {!showPwForm ? (
                <button type="button" onClick={() => { setShowPwForm(true); setPwMsg(null); }}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-canvas-border px-4 py-2.5 text-xs font-medium text-canvas-muted transition-colors hover:bg-canvas-surface-hover hover:text-canvas-fg">
                  <FiKey size={13} />
                  Change Password
                </button>
              ) : (
                <div className="rounded-lg border border-canvas-border px-4 py-3 space-y-2.5">
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="New password (min 8 chars)"
                      className={`${inputBase} pr-9`}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
                    />
                    <button type="button" onClick={() => setShowPw((p) => !p)} tabIndex={-1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-canvas-muted transition-colors hover:text-canvas-fg">
                      {showPw ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setShowPwForm(false); setNewPw(""); setPwMsg(null); }}
                      className="rounded-md px-3 py-1.5 text-[11px] font-medium text-canvas-muted hover:text-canvas-fg">
                      Cancel
                    </button>
                    <button type="button" onClick={handleChangePassword} disabled={pwBusy || !newPw}
                      className="rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg hover:opacity-90 disabled:opacity-40">
                      {pwBusy ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {pwMsg && (
                <p className={`text-[11px] px-1 ${pwMsg.type === "success" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                  {pwMsg.text}
                </p>
              )}

              {/* Logout */}
              <button type="button" onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg border border-red-500/20 px-4 py-2.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-500/5 dark:text-red-400">
                <FiLogOut size={13} />
                Log Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Theme button ── */
function ThemeBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
        active ? "border-canvas-fg/20 bg-canvas-surface-hover text-canvas-fg" : "border-canvas-border text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg"
      }`}>
      {icon}
      {label}
    </button>
  );
}
