const CACHE_NAME = 'neighbor-terra-lugo-v1.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './hero.css',
  './homes.css',
  './app.js',
  './auth-actions.js',
  './admin-actions.js',
  './users-module.js',
  './residents-module.js',
  './homes-module.js',
  './vehicles-module.js',
  './visits-module.js',
  './community-modules.js',
  './realtime-notifications.js',
  './notification-badges.js',
  './firebase-config.js',
  './firebase-service.js',
  './manifest.webmanifest',
  './neighbor-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
