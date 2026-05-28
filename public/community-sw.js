// Aria Community — push notification service worker.
// Scope is kept tight (/community/) so it does not interfere with the rest of the app.

self.addEventListener('install', (event) => {
  // Take over immediately so the first registration starts handling pushes
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'Aria Community', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Aria Community';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    image: payload.image,
    badge: '/icon-72.png',
    tag: payload.tag || 'aria-community',
    renotify: !!payload.tag,
    data: { url: payload.url || '/community' },
    vibrate: [60, 30, 60],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/community';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((winList) => {
      // If a Community tab is already open, focus it and navigate
      for (const c of winList) {
        if ('focus' in c && c.url.includes('/community')) {
          c.navigate(url);
          return c.focus();
        }
      }
      // Otherwise open a fresh tab
      return self.clients.openWindow(url);
    })
  );
});