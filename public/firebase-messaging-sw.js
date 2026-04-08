// Firebase Cloud Messaging service worker for ClawOps
//
// Handles push notifications from FCM even before Firebase SDK is initialized.
// The raw push handler fires first as a safety net. If Firebase is later
// initialized via a FIREBASE_CONFIG postMessage, it takes over background
// message handling for richer payloads.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

let firebaseInitialized = false;

// Initialize Firebase when the main page sends the config
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG' && !firebaseInitialized) {
        try {
            firebase.initializeApp(event.data.config);
            firebaseInitialized = true;
            const messaging = firebase.messaging();
            messaging.onBackgroundMessage((payload) => {
                const title = payload.notification?.title || payload.data?.title || 'ClawOps';
                const options = {
                    body: payload.notification?.body || payload.data?.body || 'New notification',
                    icon: '/logo.png',
                    badge: '/logo.png',
                    tag: 'clawops-fcm',
                    renotify: true,
                };
                self.registration.showNotification(title, options);
            });
        } catch (err) {
            // Firebase init failed — raw push handler below will still work
        }
    }
});

// Raw push handler — works regardless of Firebase SDK state.
// FCM delivers messages as standard Web Push events. If the Firebase SDK
// didn't handle it (because it's uninitialized), this catches it.
self.addEventListener('push', (event) => {
    // If Firebase is initialized, let its own handler take care of it
    if (firebaseInitialized) return;

    let title = 'ClawOps';
    let body = 'New notification';

    if (event.data) {
        try {
            const payload = event.data.json();
            // FCM notification message format
            if (payload.notification) {
                title = payload.notification.title || title;
                body = payload.notification.body || body;
            }
            // FCM data message format
            else if (payload.data) {
                title = payload.data.title || title;
                body = payload.data.body || body;
            }
            // Simple { title, body } format (Web Push)
            else if (payload.title) {
                title = payload.title;
                body = payload.body || body;
            }
        } catch {
            body = event.data.text() || body;
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/logo.png',
            badge: '/logo.png',
            tag: 'clawops-notification',
            renotify: true,
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/notifications');
        })
    );
});
