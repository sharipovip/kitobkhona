// Китобхона Service Worker – с версионированием
const CACHE_NAME = 'kitobkhona-v3';
const LOCAL_FILES = [
  './',
  './index.html',
  './kitobho.html',
  './reader.html',
  './profile.html',
  './login.html',
  './admin.html',
  './winners.html',
  './chats.html',
  './chat.html',
  './Lenta.html',
  './config.js',
  './cache.js',
  './assets/css/index.css',
  './manifest.2.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(LOCAL_FILES).catch((err) => {
        console.warn('[SW] Failed to cache some files:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Пропускаем все API-запросы (Railway) — кэшируются через localStorage в cache.js
  if (url.origin !== self.location.origin) {
    return;
  }

  // JS и CSS — сначала сеть, потом кэш (чтобы обновления приходили сразу)
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // HTML страницы — сначала кэш (быстро), потом обновляем в фоне
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
