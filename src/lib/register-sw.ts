/**
 * Unregisters stale service workers and clears caches.
 * Preserves push notification SWs (push-sw.js, firebase-messaging-sw.js)
 * so push subscriptions stay alive across page navigations.
 */

const PUSH_SW_NAMES = ["push-sw.js", "firebase-messaging-sw.js", "firebase-mesaging-sw.js"];

export function unregisterServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      const sw = reg.active || reg.installing || reg.waiting;
      if (sw && PUSH_SW_NAMES.some((n) => sw.scriptURL.endsWith(n))) continue;
      reg.unregister();
    }
  });

  if ("caches" in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        caches.delete(key);
      }
    });
  }
}
