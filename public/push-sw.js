// Universal push notification service worker for ClawOps
// Handles all payload formats: FCM, VAPID Web Push, and raw text.

self.addEventListener('push', (event) => {
    let title = 'ClawOps';
    let body = 'New notification';

    if (event.data) {
        try {
            const payload = event.data.json();
            // FCM notification message format: { notification: { title, body } }
            if (payload.notification) {
                title = payload.notification.title || title;
                body = payload.notification.body || body;
            }
            // FCM data-only format: { data: { title, body } }
            else if (payload.data && (payload.data.title || payload.data.body)) {
                title = payload.data.title || title;
                body = payload.data.body || body;
            }
            // VAPID Web Push format: { title, body }
            else if (payload.title) {
                title = payload.title;
                body = payload.body || body;
            }
        } catch {
            // Not JSON — use raw text as body
            try { body = event.data.text() || body; } catch { /* ignore */ }
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/logo/logo.png',
            badge: '/logo/logo.png',
            tag: 'clawops-notification',
            renotify: true,
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});
