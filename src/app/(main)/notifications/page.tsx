"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiBell,
  FiCheck,
  FiChevronDown,
  FiChevronRight,
  FiMonitor,
  FiPlus,
  FiSend,
  FiShield,
  FiSmartphone,
  FiStar,
  FiTrash2,
  FiX,
  FiZap,
} from "react-icons/fi";
import { Modal } from "@/components/ui/modal";
import { getUser } from "@/lib/auth";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  fetchNotificationProvidersApi,
  createNotificationProviderApi,
  deleteNotificationProviderApi,
  validateNotificationProviderApi,
  setDefaultNotificationProviderApi,
  updateNotificationProviderApi,
  fetchNotificationDevicesApi,
  registerNotificationDeviceApi,
  toggleDeviceNotificationsApi,
  removeNotificationDeviceApi,
  sendNotificationApi,
  sendNotificationAllApi,
  sendNotificationToUserApi,
  getVapidKeyApi,
  getFcmConfigApi,
  subscribePushApi,
  unsubscribePushApi,
  subscribeFcmApi,
  createSecretApi,
  generateVapidKeysApi,
  ApiError,
  type NotificationProvider,
  type NotificationDevice,
  type PageResponse,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function NotificationsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getUser>>(null);

  /* ── Alert ── */
  const [alert, setAlert] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showAlert = useCallback((msg: string, type: "success" | "error") => {
    setAlert({ msg, type });
    setTimeout(() => setAlert(null), 5000);
  }, []);

  /* ── Admin check ── */
  useEffect(() => {
    const u = getUser();
    setCurrentUser(u);
    if (u && u.role !== "ADMIN") router.replace("/");
  }, [router]);

  /* ── Providers ── */
  const [providers, setProviders] = useState<NotificationProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);

  const loadProviders = useCallback(async () => {
    try {
      const data = await fetchNotificationProvidersApi(0, 50);
      setProviders(data.content);
    } catch {
      showAlert("Failed to load providers", "error");
    }
    setProvidersLoading(false);
  }, [showAlert]);

  /* ── Devices ── */
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);

  const loadDevices = useCallback(async () => {
    try {
      const data = await fetchNotificationDevicesApi();
      setDevices(data);
    } catch {
      showAlert("Failed to load devices", "error");
    }
    setDevicesLoading(false);
  }, [showAlert]);

  /* ── Init ── */
  useEffect(() => {
    loadProviders();
    loadDevices();
  }, [loadProviders, loadDevices]);

  /* ── Section expand state ── */
  const [devicesExpanded, setDevicesExpanded] = useState(true);
  const [sendExpanded, setSendExpanded] = useState(true);
  const [providersExpanded, setProvidersExpanded] = useState(true);

  /* ── Send form ── */
  const [sendTitle, setSendTitle] = useState("Test Notification");
  const [sendBody, setSendBody] = useState("Hello from ClawOps!");
  const [sendTarget, setSendTarget] = useState<"default" | "all" | "user">("default");
  const [sendUserId, setSendUserId] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!sendTitle.trim() || !sendBody.trim()) { showAlert("Title and body are required", "error"); return; }
    setSending(true);
    try {
      let result;
      if (sendTarget === "all") {
        result = await sendNotificationAllApi(sendTitle, sendBody);
      } else if (sendTarget === "user") {
        if (!sendUserId.trim()) { showAlert("User ID is required", "error"); setSending(false); return; }
        result = await sendNotificationToUserApi(sendUserId, sendTitle, sendBody);
      } else {
        result = await sendNotificationApi(sendTitle, sendBody);
      }
      showAlert(`Notification sent to ${result.sent} subscriber(s)`, "success");
    } catch (err) {
      showAlert(err instanceof ApiError ? err.message : "Send failed", "error");
    }
    setSending(false);
  }, [sendTitle, sendBody, sendTarget, sendUserId, showAlert]);

  /* ── Provider modal ── */
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [provType, setProvType] = useState<"WEB_PUSH" | "FCM">("WEB_PUSH");
  const [provName, setProvName] = useState("");
  const [vapidPublic, setVapidPublic] = useState("");
  const [vapidPrivate, setVapidPrivate] = useState("");
  const [vapidMailto, setVapidMailto] = useState("mailto:admin@localhost");
  const [fcmServiceAccount, setFcmServiceAccount] = useState("");
  const [fcmWebConfig, setFcmWebConfig] = useState("");
  const [provSubmitting, setProvSubmitting] = useState(false);

  const handleCreateProvider = useCallback(async () => {
    if (!provName.trim()) { showAlert("Display name is required", "error"); return; }
    setProvSubmitting(true);
    try {
      let secretId: string;
      let providerSettings: Record<string, unknown>;

      if (provType === "WEB_PUSH") {
        if (!vapidPublic.trim() || !vapidPrivate.trim()) { showAlert("VAPID keys are required", "error"); setProvSubmitting(false); return; }
        secretId = await createSecretApi(
          `vapid-${provName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
          "NOTIFICATION_PUSH_VAPID",
          vapidPrivate,
        );
        providerSettings = { vapidPublicKey: vapidPublic, mailto: vapidMailto };
      } else {
        if (!fcmServiceAccount.trim()) { showAlert("Service account JSON is required", "error"); setProvSubmitting(false); return; }
        if (!fcmWebConfig.trim()) { showAlert("Firebase web config is required", "error"); setProvSubmitting(false); return; }
        let parsed: Record<string, unknown>;
        let webConfig: Record<string, unknown>;
        try { parsed = JSON.parse(fcmServiceAccount); } catch { showAlert("Invalid service account JSON", "error"); setProvSubmitting(false); return; }
        try { webConfig = JSON.parse(fcmWebConfig); } catch { showAlert("Invalid web config JSON", "error"); setProvSubmitting(false); return; }
        secretId = await createSecretApi(
          `fcm-${provName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
          "FIREBASE_SERVICE_ACCOUNT",
          fcmServiceAccount,
        );
        providerSettings = { projectId: (parsed as { project_id?: string }).project_id ?? "", firebaseConfig: webConfig };
      }

      await createNotificationProviderApi({ providerType: provType, displayName: provName, credentialId: secretId, providerSettings });
      showAlert("Provider created", "success");
      setShowProviderModal(false);
      loadProviders();
    } catch (err) {
      showAlert(err instanceof ApiError ? err.message : "Failed to create provider", "error");
    }
    setProvSubmitting(false);
  }, [provType, provName, vapidPublic, vapidPrivate, vapidMailto, fcmServiceAccount, fcmWebConfig, showAlert, loadProviders]);

  /* ── Web Config modal (FCM) ── */
  const [webConfigModal, setWebConfigModal] = useState<{ providerId: string; existing: Record<string, unknown> } | null>(null);
  const [webConfigJson, setWebConfigJson] = useState("");

  const handleSubmitWebConfig = useCallback(async () => {
    if (!webConfigModal) return;
    let config: Record<string, unknown>;
    try { config = JSON.parse(webConfigJson); } catch { showAlert("Invalid JSON", "error"); return; }
    try {
      await updateNotificationProviderApi(webConfigModal.providerId, {
        providerSettings: { ...webConfigModal.existing, firebaseConfig: config },
      });
      showAlert("Web config saved", "success");
      setWebConfigModal(null);
      loadProviders();
    } catch (err) {
      showAlert(err instanceof ApiError ? err.message : "Failed to save", "error");
    }
  }, [webConfigModal, webConfigJson, showAlert, loadProviders]);

  /* ── Provider actions ── */
  const handleValidate = useCallback(async (id: string) => {
    try {
      const result = await validateNotificationProviderApi(id);
      showAlert(result.valid ? `Valid: ${result.message}` : `Invalid: ${result.message}`, result.valid ? "success" : "error");
    } catch (err) {
      showAlert(err instanceof ApiError ? err.message : "Validation failed", "error");
    }
  }, [showAlert]);

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await setDefaultNotificationProviderApi(id);
      showAlert("Default provider updated", "success");
      loadProviders();
    } catch { showAlert("Failed to set default", "error"); }
  }, [showAlert, loadProviders]);

  const handleDeleteProvider = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete provider "${name}" and all its subscriptions?`)) return;
    try {
      await deleteNotificationProviderApi(id);
      showAlert("Provider deleted", "success");
      loadProviders();
    } catch { showAlert("Failed to delete", "error"); }
  }, [showAlert, loadProviders]);

  /* ── Device actions ── */
  const handleRegisterDevice = useCallback(async () => {
    const deviceName = `${getBrowserName()} on ${getPlatformName()}`;
    const platform = getPlatformName();
    try {
      // Request notification permission
      if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { showAlert("Notification permission denied by browser", "error"); return; }
      }

      let pushEndpoint: string | undefined;
      let pushKeyAuth: string | undefined;
      let pushKeyP256dh: string | undefined;
      let fcmToken: string | undefined;

      // Try VAPID Web Push first
      if ("serviceWorker" in navigator && "PushManager" in window) {
        try {
          const vapid = await getVapidKeyApi();
          if (vapid) {
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
              await subscribePushApi({ endpoint: sub.endpoint, keyAuth: keys.auth!, keyP256dh: keys.p256dh! });
            }
          }
        } catch (err) {
          console.warn("[notifications] VAPID not available, trying FCM:", err);
        }

        // Fallback to FCM
        if (!pushEndpoint) {
          try {
            const fcmConfig = await getFcmConfigApi();
            if (fcmConfig) {
              const swReg = await navigator.serviceWorker.register("/push-sw.js");
              const { initializeApp } = await import("firebase/app");
              const { getMessaging, getToken } = await import("firebase/messaging");
              const app = initializeApp(fcmConfig);
              const messaging = getMessaging(app);
              fcmToken = await getToken(messaging, { serviceWorkerRegistration: swReg });
              if (fcmToken) await subscribeFcmApi(fcmToken, platform);
            }
          } catch (err) {
            console.warn("[notifications] FCM setup failed:", err);
          }
        }
      }

      await registerNotificationDeviceApi({ deviceName, platform, pushEndpoint, pushKeyAuth, pushKeyP256dh, fcmToken });
      showAlert(`Device registered: ${deviceName}`, "success");
      loadDevices();
    } catch (err) {
      showAlert(err instanceof ApiError ? err.message : "Failed to register device", "error");
    }
  }, [showAlert, loadDevices]);

  const handleToggleDevice = useCallback(async (id: string, enabled: boolean) => {
    try {
      await toggleDeviceNotificationsApi(id, enabled);
      loadDevices();
    } catch { showAlert("Failed to toggle", "error"); }
  }, [showAlert, loadDevices]);

  const handleRemoveDevice = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Remove device "${name}"?`)) return;
    try {
      await removeNotificationDeviceApi(id);
      showAlert("Device removed", "success");
      loadDevices();
    } catch { showAlert("Failed to remove", "error"); }
  }, [showAlert, loadDevices]);

  if (!currentUser) return null;

  /* ── Shared styles ── */
  const inputBase = "w-full rounded-md border border-canvas-border bg-transparent px-3 py-2 text-sm text-canvas-fg placeholder:text-canvas-muted/60 outline-none focus:border-canvas-fg/25 focus:ring-1 focus:ring-canvas-fg/10";
  const sectionBtn = "flex items-center gap-2 text-left w-full py-3 text-sm font-semibold text-canvas-fg";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Alert */}
      {alert && (
        <div className={`mb-4 rounded-md px-4 py-2.5 text-sm ${alert.type === "success" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-500 dark:text-red-400"}`}>
          {alert.msg}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <FiBell size={20} className="text-canvas-muted" />
        <h1 className="text-lg font-bold text-canvas-fg">Notifications</h1>
      </div>

      {/* ═══════ ACTIVE PROVIDER BANNER ═══════ */}
      {(() => {
        const def = providers.find((p) => p.isDefault);
        if (!def) return (
          <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-5 py-3">
            <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400">No default provider configured. Add a provider below and set it as default.</p>
          </div>
        );
        return (
          <div className="mb-4 rounded-lg border border-canvas-border bg-canvas-bg px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Active Provider</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${def.providerType === "WEB_PUSH" ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500"}`}>
                {def.providerType === "WEB_PUSH" ? "Push API (VAPID)" : "Firebase Cloud Messaging"}
              </span>
              <span className="text-xs text-canvas-fg">{def.displayName}</span>
              {providers.length > 1 && (
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="text-[10px] text-canvas-muted">Switch to:</span>
                  {providers.filter((p) => !p.isDefault && p.enabled).map((p) => (
                    <button key={p.id} type="button" onClick={() => handleSetDefault(p.id)}
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                        p.providerType === "WEB_PUSH"
                          ? "border border-blue-500/30 text-blue-500 hover:bg-blue-500/10"
                          : "border border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                      }`}>
                      {p.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══════ DEVICES ═══════ */}
      <div className="mb-4 rounded-lg border border-canvas-border bg-canvas-bg">
        <button type="button" onClick={() => setDevicesExpanded((p) => !p)} className={`${sectionBtn} px-5 border-b border-canvas-border`}>
          {devicesExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          <FiSmartphone size={14} className="text-canvas-muted" />
          My Devices
          <span className="ml-auto text-xs font-normal text-canvas-muted">{devices.length}</span>
        </button>
        {devicesExpanded && (
          <div>
            <div className="flex items-center justify-end border-b border-canvas-border px-5 py-2">
              <button type="button" onClick={handleRegisterDevice} className="flex items-center gap-1.5 rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg hover:opacity-90">
                <FiPlus size={11} /> Register This Device
              </button>
            </div>
            {devicesLoading ? (
              <p className="px-5 py-8 text-center text-xs text-canvas-muted">Loading...</p>
            ) : devices.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-canvas-muted">No devices registered.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-canvas-border text-left text-[10px] uppercase tracking-wider text-canvas-muted">
                      <th className="px-5 py-2">Device</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Notifications</th>
                      <th className="px-3 py-2">Registered</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id} className="border-b border-canvas-border last:border-0">
                        <td className="px-5 py-2.5 font-medium text-canvas-fg">{d.deviceName}</td>
                        <td className="px-3 py-2.5"><span className="rounded-full bg-canvas-surface-hover px-2 py-0.5 text-[10px] font-medium">{d.platform}</span></td>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => handleToggleDevice(d.id, !d.notificationsEnabled)}
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${d.notificationsEnabled ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-canvas-surface-hover text-canvas-muted"}`}>
                            {d.notificationsEnabled ? "Enabled" : "Disabled"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 text-canvas-muted">{formatDate(d.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <button type="button" onClick={() => handleRemoveDevice(d.id, d.deviceName)} className="text-red-500 hover:text-red-400"><FiTrash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ SEND ═══════ */}
      <div className="mb-4 rounded-lg border border-canvas-border bg-canvas-bg">
        <button type="button" onClick={() => setSendExpanded((p) => !p)} className={`${sectionBtn} px-5 border-b border-canvas-border`}>
          {sendExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          <FiSend size={14} className="text-canvas-muted" />
          Send Notification
        </button>
        {sendExpanded && (
          <div className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Title</label>
                <input type="text" value={sendTitle} onChange={(e) => setSendTitle(e.target.value)} className={inputBase} placeholder="Alert" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Body</label>
                <input type="text" value={sendBody} onChange={(e) => setSendBody(e.target.value)} className={inputBase} placeholder="Something happened" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Target</label>
                <select value={sendTarget} onChange={(e) => setSendTarget(e.target.value as "default" | "all" | "user")} className={inputBase}>
                  <option value="default">Default Provider</option>
                  <option value="all">All Providers (broadcast)</option>
                  <option value="user">Specific User</option>
                </select>
              </div>
              {sendTarget === "user" && (
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">User ID</label>
                  <input type="text" value={sendUserId} onChange={(e) => setSendUserId(e.target.value)} className={`${inputBase} font-mono text-xs`} placeholder="UUID" />
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={handleSend} disabled={sending}
                className="flex items-center gap-1.5 rounded-md bg-canvas-fg px-4 py-2 text-[11px] font-medium text-canvas-bg hover:opacity-90 disabled:opacity-50">
                <FiSend size={11} /> {sending ? "Sending..." : "Send"}
              </button>
              <button type="button" onClick={() => { setSendTitle("Test Notification"); setSendBody("This is a test push from ClawOps"); handleSend(); }}
                className="flex items-center gap-1.5 rounded-md border border-canvas-border px-4 py-2 text-[11px] font-medium text-canvas-muted hover:bg-canvas-surface-hover hover:text-canvas-fg">
                <FiZap size={11} /> Quick Test
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════ PROVIDERS ═══════ */}
      <div className="mb-4 rounded-lg border border-canvas-border bg-canvas-bg">
        <button type="button" onClick={() => setProvidersExpanded((p) => !p)} className={`${sectionBtn} px-5 border-b border-canvas-border`}>
          {providersExpanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
          <FiShield size={14} className="text-canvas-muted" />
          Providers
          <span className="ml-auto text-xs font-normal text-canvas-muted">{providers.length}</span>
        </button>
        {providersExpanded && (
          <div>
            <div className="flex items-center justify-end border-b border-canvas-border px-5 py-2">
              <button type="button" onClick={() => { setProvType("WEB_PUSH"); setProvName(""); setVapidPublic(""); setVapidPrivate(""); setFcmServiceAccount(""); setFcmWebConfig(""); setShowProviderModal(true); }}
                className="flex items-center gap-1.5 rounded-md bg-canvas-fg px-3 py-1.5 text-[11px] font-medium text-canvas-bg hover:opacity-90">
                <FiPlus size={11} /> Add Provider
              </button>
            </div>
            {providersLoading ? (
              <p className="px-5 py-8 text-center text-xs text-canvas-muted">Loading...</p>
            ) : providers.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-canvas-muted">No providers configured yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-canvas-border text-left text-[10px] uppercase tracking-wider text-canvas-muted">
                      <th className="px-5 py-2">Name</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Info</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((p) => (
                      <tr key={p.id} className="border-b border-canvas-border last:border-0">
                        <td className="px-5 py-2.5">
                          <span className="font-medium text-canvas-fg">{p.displayName}</span>
                          {p.isDefault && <span className="ml-2 rounded-full bg-green-500/10 px-2 py-0.5 text-[9px] font-semibold text-green-600 dark:text-green-400">DEFAULT</span>}
                        </td>
                        <td className="px-3 py-2.5"><span className="rounded-full bg-canvas-surface-hover px-2 py-0.5 text-[10px] font-medium">{p.providerType}</span></td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.enabled ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-canvas-surface-hover text-canvas-muted"}`}>
                            {p.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2.5 font-mono text-[10px] text-canvas-muted">
                          {p.providerType === "WEB_PUSH" && (p.providerSettings as { vapidPublicKey?: string })?.vapidPublicKey
                            ? `VAPID: ${((p.providerSettings as { vapidPublicKey: string }).vapidPublicKey).substring(0, 20)}...`
                            : p.providerType === "FCM" && (p.providerSettings as { projectId?: string })?.projectId
                              ? `Project: ${(p.providerSettings as { projectId: string }).projectId}`
                              : "\u2014"}
                          {p.providerType === "FCM" && !(p.providerSettings as { firebaseConfig?: unknown })?.firebaseConfig && (
                            <span className="ml-2 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[9px] font-semibold text-yellow-600 dark:text-yellow-400">Missing Web Config</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-canvas-muted">{formatDate(p.createdAt)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <SmBtn onClick={() => handleValidate(p.id)}>Validate</SmBtn>
                            {p.providerType === "FCM" && !(p.providerSettings as { firebaseConfig?: unknown })?.firebaseConfig && (
                              <SmBtn onClick={() => { setWebConfigJson(""); setWebConfigModal({ providerId: p.id, existing: (p.providerSettings as Record<string, unknown>) ?? {} }); }}>Add Config</SmBtn>
                            )}
                            {!p.isDefault && <SmBtn onClick={() => handleSetDefault(p.id)}><FiStar size={10} /></SmBtn>}
                            <SmBtn onClick={() => handleDeleteProvider(p.id, p.displayName)} danger><FiTrash2 size={10} /></SmBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ ADD PROVIDER MODAL ═══════ */}
      <Modal open={showProviderModal} onClose={() => setShowProviderModal(false)}>
        <div className="px-6 py-5">
          <h3 className="mb-4 text-sm font-bold text-canvas-fg">Add Notification Provider</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Provider Type</label>
              <select value={provType} onChange={(e) => setProvType(e.target.value as "WEB_PUSH" | "FCM")} className={inputBase}>
                <option value="WEB_PUSH">Web Push (VAPID)</option>
                <option value="FCM">Firebase Cloud Messaging</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Display Name</label>
              <input type="text" value={provName} onChange={(e) => setProvName(e.target.value)} className={inputBase} placeholder="My Push Service" />
            </div>

            {provType === "WEB_PUSH" && (
              <>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-canvas-muted">VAPID Public Key</label>
                    <button type="button"
                      onClick={async () => {
                        try {
                          const keys = await generateVapidKeysApi();
                          setVapidPublic(keys.publicKey);
                          setVapidPrivate(keys.privateKey);
                          showAlert("VAPID keys generated", "success");
                        } catch (err) {
                          showAlert(err instanceof ApiError ? err.message : "Failed to generate keys", "error");
                        }
                      }}
                      className="text-[10px] font-medium text-blue-500 hover:text-blue-400">
                      Generate Key Pair
                    </button>
                  </div>
                  <input type="text" value={vapidPublic} onChange={(e) => setVapidPublic(e.target.value)} className={`${inputBase} font-mono text-xs`} placeholder="BLcex5XS4d..." />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">VAPID Private Key</label>
                  <input type="password" value={vapidPrivate} onChange={(e) => setVapidPrivate(e.target.value)} className={`${inputBase} font-mono text-xs`} placeholder="Stored encrypted" autoComplete="off" />
                  <p className="mt-1 text-[10px] text-canvas-muted">Encrypted at rest using AES-GCM</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Contact Email</label>
                  <input type="text" value={vapidMailto} onChange={(e) => setVapidMailto(e.target.value)} className={inputBase} placeholder="mailto:admin@example.com" />
                </div>
              </>
            )}

            {provType === "FCM" && (
              <>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Service Account JSON</label>
                  <textarea value={fcmServiceAccount} onChange={(e) => setFcmServiceAccount(e.target.value)} rows={5} className={`${inputBase} resize-none font-mono text-xs`} placeholder="Paste Firebase service account JSON..." />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-canvas-muted">Firebase Web Config JSON</label>
                  <textarea value={fcmWebConfig} onChange={(e) => setFcmWebConfig(e.target.value)} rows={4} className={`${inputBase} resize-none font-mono text-xs`} placeholder='{"apiKey":"...","messagingSenderId":"...","appId":"..."}' />
                </div>
              </>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowProviderModal(false)}
              className="rounded-md border border-canvas-border px-4 py-2 text-xs font-medium text-canvas-muted hover:bg-canvas-surface-hover">Cancel</button>
            <button type="button" onClick={handleCreateProvider} disabled={provSubmitting}
              className="rounded-md bg-canvas-fg px-4 py-2 text-xs font-medium text-canvas-bg hover:opacity-90 disabled:opacity-50">
              {provSubmitting ? "Adding..." : "Add Provider"}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══════ WEB CONFIG MODAL (FCM) ═══════ */}
      <Modal open={!!webConfigModal} onClose={() => setWebConfigModal(null)}>
        <div className="px-6 py-5">
          <h3 className="mb-2 text-sm font-bold text-canvas-fg">Add Firebase Web Config</h3>
          <p className="mb-3 text-[11px] text-canvas-muted">From Firebase Console &gt; Project Settings &gt; General &gt; Your apps &gt; Web app.</p>
          <textarea value={webConfigJson} onChange={(e) => setWebConfigJson(e.target.value)} rows={6} className={`${inputBase} resize-none font-mono text-xs`}
            placeholder='{"apiKey":"AIza...","authDomain":"...","projectId":"...","messagingSenderId":"...","appId":"..."}' />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setWebConfigModal(null)}
              className="rounded-md border border-canvas-border px-4 py-2 text-xs font-medium text-canvas-muted hover:bg-canvas-surface-hover">Cancel</button>
            <button type="button" onClick={handleSubmitWebConfig}
              className="rounded-md bg-canvas-fg px-4 py-2 text-xs font-medium text-canvas-bg hover:opacity-90">Save Web Config</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Small action button ── */
function SmBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-md border border-canvas-border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-canvas-surface-hover ${danger ? "text-red-500 hover:text-red-400" : "text-canvas-muted hover:text-canvas-fg"}`}>
      {children}
    </button>
  );
}
