const CACHE_NAME = 'neighbor-terra-lugo-v1.1.5';
const APP_SHELL = [
  './', './index.html', './styles.css', './hero.css', './homes.css',
  './app.js', './auth-actions.js', './admin-actions.js', './users-module.js',
  './residents-module.js', './homes-module.js', './vehicles-module.js', './visits-module.js',
  './community-modules.js', './realtime-notifications.js', './notification-badges.js',
  './finance-module.js', './firebase-config.js', './firebase-service.js',
  './manifest.webmanifest', './neighbor-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCode = event.request.mode === 'navigate' || /\.(?:js|html)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});