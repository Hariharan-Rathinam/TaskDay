// Offline cache for the web app shell. Network-first for HTML, cache-first for assets.
const CACHE = 'taskday-__BUILD_ID__';
const SHELL = ['./', './index.html', './assets/main.js', './assets/styles.css', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(
    fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { c.focus(); if (taskId) c.postMessage({ type: 'open-task', taskId }); return; }
    return self.clients.openWindow('./' + (taskId ? '#task=' + taskId : ''));
  }));
});
