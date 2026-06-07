/* Китобхона · Service Worker v3 — Smart auto-update + offline */
const VERSION = 'v3';
const SHELL   = 'kk-shell-' + VERSION;
const DATA    = 'kk-data-'  + VERSION;
const COVERS  = 'kk-covers-v1';  // permanent — covers never expire
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './README.md',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700;800&family=Inter:wght@400;600;700&display=swap'
];

/* ── INSTALL ── */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL).then(c => c.addAll(SHELL_ASSETS).catch(() => {}))
  );
});

/* ── ACTIVATE — purge old caches, take control immediately ── */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== SHELL && k !== DATA && k !== COVERS)
      .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ── FETCH STRATEGY ── */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Covers (raw.githubusercontent.com/.../covers/...) — cache forever
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/covers/')) {
    e.respondWith(cacheFirstPerm(req, COVERS));
    return;
  }

  // PDFs — network-first online (so updates appear), fallback to cache offline
  if (url.hostname === 'raw.githubusercontent.com' && /\.pdf($|\?)/i.test(url.pathname)) {
    e.respondWith(networkFirst(req, DATA));
    return;
  }

  // manifest.json (per-category) — network-first (always fresh when online)
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/manifest.json')) {
    e.respondWith(networkFirst(req, DATA));
    return;
  }

  // Main HTML / books.json / app manifest — network-first
  if (url.origin === location.origin) {
    if (/\.(html?|json)$/.test(url.pathname) || url.pathname === '/' || url.pathname.endsWith('/')) {
      e.respondWith(networkFirst(req, SHELL));
      return;
    }
  }

  // Static assets (CDN JS, fonts, icons) — cache-first
  if (url.origin === location.origin || url.hostname.includes('cdnjs') || url.hostname.includes('fonts')) {
    e.respondWith(cacheFirst(req, SHELL));
    return;
  }
});

/* ── STRATEGIES ── */
async function networkFirst(req, cacheName) {
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, r.clone()).catch(()=>{});
    }
    return r;
  } catch(e) {
    const cached = await caches.match(req);
    return cached || new Response('', { status: 503 });
  }
}
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, r.clone()).catch(()=>{});
    }
    return r;
  } catch(e) { return new Response('', { status: 503 }); }
}
async function cacheFirstPerm(req, cacheName) {
  // Same as cacheFirst but never evicts
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const r = await fetch(req);
    if (r && r.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, r.clone()).catch(()=>{});
    }
    return r;
  } catch(e) { return new Response('', { status: 503 }); }
}

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
