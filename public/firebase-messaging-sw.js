// Firebase Cloud Messaging service worker for ClawOps
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Listen for messages from the main page to initialize Firebase
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'FIREBASE_CONFIG') {
        firebase.initializeApp(event.data.config);
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
    }
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
