// Web Push notification service worker for ClawOps

self.addEventListener('push', (event) => {
    let data = { title: 'ClawOps', body: 'Notification' };
    try {
        data = event.data ? event.data.json() : data;
    } catch {
        data.body = event.data ? event.data.text() : 'Notification';
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/logo.png',
            badge: '/logo.png',
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
            if (clients.openWindow) return clients.openWindow('/notifications');
        })
    );
});
