/* Китобхона Service Worker — clean final */
const VER = 'kitobkhona-clean-final-2026-06-21-v2';
const SHELL = 'kk-shell-' + VER;
const RUNTIME = 'kk-runtime-' + VER;
const COVERS = 'kk-covers-' + VER;
const PDFS = 'kk-pdfs-' + VER;

const PRECACHE = [
  './',
  './index.html', './kitobho.html', './reader.html', './profile.html', './honandagon.html', './admin.html', './login.html',
  './chat.html', './chats.html', './book_reviews.html', './winners.html', './users.html', './profile_edit.html',
  './config.js', './books.json', './manifest.json', './sw.js',
  './assets/css/index.css', './assets/fonts/zapf-chancec.ttf',
  './icons/icon-192.png', './icons/icon-512.png', './splash_logo.jpg',
  './data/age_groups.json', './data/bad_words.json', './data/chat_rules.json', './data/tajikistan_locations.json', './data/hero_slides.json', './data/app_settings.json',
  './pages/chat.html', './pages/chats.html', './pages/book_reviews.html', './pages/winners.html', './pages/users.html', './pages/profile_edit.html',
  './shohnomahoni.html', './ilm_furugi_marifat.html', './furugi_subhi_donoi.html', './vatani_azizi_man.html', './donandai_asarho.html',
  './shohnoma_banner.jpg', './ilm_banner.jpg', './furugi_banner.jpg', './vatan_banner.jpg', './donandai_banner.jpg',
  './assets/hero/01-president-official.jpg', './assets/hero/02-istiqlol-flag.jpg', './assets/hero/03-vahdat-diplomacy.jpg', './assets/hero/04-kishovarzi.jpg', './assets/hero/05-president-young.jpg', './assets/hero/06-zaboni-millat.jpg', './assets/hero/07-chehrahoyi-mondagor.jpg', './assets/hero/08-davlatdori.jpg', './assets/hero/09-suhanroni.jpg', './assets/hero/10-nishon-tojikiston.jpg', './assets/hero/hero_manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const c = await caches.open(SHELL);
    for (const u of PRECACHE) {
      try { await c.add(u); } catch (_) {}
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
  if (/\.pdf$/i.test(url.pathname)) return event.respondWith(cacheFirst(req, PDFS));
  if (/\.(jpe?g|png|webp|gif|svg|ico)$/i.test(url.pathname) && (url.hostname.includes('githubusercontent.com') || url.hostname.includes('cdn.jsdelivr.net'))) return event.respondWith(stale(req, COVERS));
  if (url.hostname.includes('githubusercontent.com') && /(?:books|manifest)\.json$/i.test(url.pathname)) return event.respondWith(stale(req, RUNTIME));
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) return event.respondWith(networkFirst(req, SHELL));
  if (['script','style','font','image'].includes(req.destination) || /\.(js|css|ttf|woff2?|json)$/i.test(url.pathname)) return event.respondWith(stale(req, RUNTIME));
  event.respondWith(cacheFirst(req, RUNTIME));
});
async function cacheFirst(req, name) {
  const c = await caches.open(name); const hit = await c.match(req);
  if (hit) return hit;
  try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; } catch (_) { return new Response('Offline', {status:503}); }
}
async function networkFirst(req, name) {
  const c = await caches.open(name);
  try { const r = await fetch(req, {cache:'no-store'}); if (r && r.ok) c.put(req, r.clone()); return r; } catch (_) { return (await c.match(req)) || (await caches.match('./index.html')) || new Response('Offline', {status:503}); }
}
async function stale(req, name) {
  const c = await caches.open(name); const hit = await c.match(req);
  const p = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || p;
}
