// Service worker: phone notifications only (no offline caching of private data).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Jobs', {
    body: d.body || 'You have news on your jobs page. Open the app.',
    icon: '/icon.svg', badge: '/icon.svg', data: { link: d.link || '/j' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/j';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(link); return c.focus(); } }
    return self.clients.openWindow(link);
  }));
});
