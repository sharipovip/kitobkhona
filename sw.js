/* Китобхона Service Worker — phase1 */
const VER = 'kitobkhona-2026-06-16-phase1';
const SHELL = 'kk-shell-' + VER;
const RUNTIME = 'kk-runtime-' + VER;
const PDFS = 'kk-pdfs-' + VER;

const PRECACHE = [
  './', './index.html', './kitobho.html', './reader.html', './profile.html', './honandagon.html', './admin.html',
  './manifest.json', './books.json', './README.md',
  './shohnomahoni.html', './ilm_furugi_marifat.html', './furugi_subhi_donoi.html', './vatani_azizi_man.html', './donandai_asarho.html',
  './shohnoma_banner.jpg', './ilm_banner.jpg', './furugi_banner.jpg', './vatan_banner.jpg', './donandai_banner.jpg', './splash_logo.jpg',
  './icons/icon-192.png', './icons/icon-512.png',
  './data/age_groups.json', './data/chat_rules.json', './data/bad_words.json', './data/tajikistan_locations.json',
  './pages/winners.html', './pages/profile.html', './pages/users.html', './pages/chat.html', './pages/book_reviews.html',
  './assets/hero/01-president-official.jpg', './assets/hero/02-istiqlol-flag.jpg', './assets/hero/03-vahdat-diplomacy.jpg', './assets/hero/04-kishovarzi.jpg', './assets/hero/05-president-young.jpg', './assets/hero/06-zaboni-millat.jpg', './assets/hero/07-chehrahoyi-mondagor.jpg', './assets/hero/08-davlatdori.jpg', './assets/hero/09-suhanroni.jpg', './assets/hero/10-nishon-tojikiston.jpg', './assets/hero/hero_manifest.json',
  './hero/01_istiqlol.jpg', './hero/02_vahdat.jpg', './hero/03_ob.jpg', './hero/04_ilm.jpg', './hero/05_35sol.jpg', './hero/06_kishovarzi.jpg', './hero/07_tabiat.jpg', './hero/08_rohho.jpg', './hero/09_qasr.jpg', './hero/10_javonon.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    for (const url of PRECACHE) {
      try { await cache.add(url); } catch (_) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith(VER)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.toLowerCase().endsWith('.pdf')) return event.respondWith(cacheFirst(req, PDFS));
  if (url.hostname.includes('githubusercontent.com') || url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) return event.respondWith(stale(req, RUNTIME));
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) return event.respondWith(networkFirst(req, SHELL));
  if (url.pathname.endsWith('.json')) return event.respondWith(networkFirst(req, RUNTIME));
  if (/\.(jpe?g|png|webp|svg|gif|ico)$/i.test(url.pathname)) return event.respondWith(cacheFirst(req, RUNTIME));
  event.respondWith(cacheFirst(req, RUNTIME));
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) {
    fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
    return hit;
  }
  try {
    const r = await fetch(req);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}
async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const r = await fetch(req, { cache: 'no-store' });
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch (_) {
    const hit = await cache.match(req);
    return hit || new Response('Offline', { status: 503 });
  }
}
async function stale(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const p = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || p;
}
