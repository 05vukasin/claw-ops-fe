// Firebase messaging service worker compatibility entry for ClawOps.
//
// Why this exists:
// - Firebase Web SDK looks for /firebase-messaging-sw.js by default.
// - Our app uses a universal push handler in /push-sw.js.
//
// Keep this file as a thin shim so both old and default Firebase registrations
// continue working.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts('/push-sw.js');
