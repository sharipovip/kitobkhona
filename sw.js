/* ============================================
   КИТОБХОНА · Service Worker v4
   - network-first для HTML/JSON
   - cache-first для картинок/PDF/обложек
   - precache hero фото + splash + 5 HTML озмунҳо
   - авто-обновление кешей при смене версии
   ============================================ */

const CACHE_NAME      = 'kk-v4';
const HTML_JSON_CACHE = 'kk-html-v4';
const ASSETS_CACHE    = 'kk-assets-v4';
const PDF_CACHE       = 'kk-pdf-v4';

// Главные ресурсы которые подгружаем при установке
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  // Splash
  './splash_logo.jpg',
  // Hero (10 фото ~500 KB всего)
  './hero/01_istiqlol.jpg',
  './hero/02_vahdat.jpg',
  './hero/03_ob.jpg',
  './hero/04_ilm.jpg',
  './hero/05_35sol.jpg',
  './hero/06_kishovarzi.jpg',
  './hero/07_tabiat.jpg',
  './hero/08_rohho.jpg',
  './hero/09_qasr.jpg',
  './hero/10_javonon.jpg',
  // HTML озмунҳо (~500 KB)
  './shohnomahoni.html',
  './shohnoma_banner.png',
  './ilm_furugi_marifat.html',
  './ilm_banner.png',
  './furugi_subhi_donoi.html',
  './furugi_banner.png',
  './vatani_azizi_man.html',
  './vatan_banner.jpg',
  './donandai_asarho.html',
  './donandai_banner.png',
];

// ───── install: precache (не блокируем если что-то не найдено)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(ASSETS_CACHE).then(async cache => {
      // По одному, ошибки игнорируем
      for (const url of PRECACHE){
        try { await cache.add(url); } catch(err){ /* skip missing */ }
      }
      return self.skipWaiting();
    })
  );
});

// ───── activate: чистим старые версии
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => !k.endsWith('-v4')).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// ───── fetch handler
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // PDF — cache-first (для офлайн чтения)
  if (url.pathname.toLowerCase().endsWith('.pdf')){
    e.respondWith(cacheFirst(req, PDF_CACHE));
    return;
  }

  // Обложки + hero + splash + баннеры — cache-first навсегда
  if (/\.(jpe?g|png|webp|gif|ico|svg)$/i.test(url.pathname)){
    e.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // HTML / JSON — network-first (всегда стараемся свежее)
  const isHTML = req.mode === 'navigate' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname.endsWith('.json');
  if (isHTML){
    e.respondWith(networkFirst(req, HTML_JSON_CACHE));
    return;
  }

  // Остальное — обычный кеш-сначала-сеть
  e.respondWith(cacheFirst(req, ASSETS_CACHE));
});

// ───── helpers
async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) {
    // В фоне обновляем
    fetch(req).then(resp => { if (resp && resp.ok) cache.put(req, resp.clone()); }).catch(()=>{});
    return cached;
  }
  try {
    const resp = await fetch(req);
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(()=>{});
    return resp;
  } catch(e){
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  try {
    const resp = await fetch(req, { cache: 'no-store' });
    if (resp && resp.ok) cache.put(req, resp.clone()).catch(()=>{});
    return resp;
  } catch(e){
    const cached = await cache.match(req);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// ───── live update notification
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
