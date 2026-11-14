// Service worker: only for push notifications (no offline cache, so updates are never stale).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {}
  // iPhone requires a visible notification for every push
  e.waitUntil(
    self.registration.showNotification(d.title || 'Blood on the Clocktower', {
      body: d.body || '',
      tag: d.tag || 'botc',
      renotify: true,
      vibrate: [300, 120, 300],
      icon: 'app-icons/icon-192.png',
      badge: 'app-icons/icon-192.png',
      data: { url: d.url || './' },
    })
  );
});

// tap the notification: back to the open game, or open it
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      if (open) return open.focus();
      return self.clients.openWindow(new URL(e.notification.data?.url || './', self.registration.scope).href);
    })
  );
});
