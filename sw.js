// Service Worker — Offline-first
const CACHE = 'kk-v3';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE).catch(()=>{}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Не кэшируем POST и не-GET запросы
  if (req.method !== 'GET') return;

  // ZIP файлы — пробуем сначала кэш, потом сеть (большие, не блокируем)
  if (url.pathname.endsWith('.zip')) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          // ZIP не кэшируем в Cache Storage — слишком большие
          return resp;
        });
      })
    );
    return;
  }

  // books.json — Network first (всегда свежий), fallback на кэш
  if (url.pathname.endsWith('books.json') || url.search.includes('books.json')) {
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return resp;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Всё остальное — Cache first, потом сеть
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Обновляем кэш в фоне
        fetch(req).then(resp => {
          if (resp.ok) {
            caches.open(CACHE).then(c => c.put(req, resp.clone())).catch(()=>{});
          }
        }).catch(()=>{});
        return cached;
      }
      return fetch(req).then(resp => {
        if (resp.ok && (url.origin === location.origin || url.hostname.includes('cdnjs') || url.hostname.includes('fonts.gstatic') || url.hostname.includes('fonts.googleapis'))) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        }
        return resp;
      });
    })
  );
});
