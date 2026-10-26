const CACHE_NAME = 'kitobkhona-v130-fast-nav';
const RUNTIME_CACHE = 'kitobkhona-runtime-v1';   // JSON/API/суратҳои берунӣ (stale-while-revalidate, маҳдуд)
const RUNTIME_LIMIT = 400;
const LOCAL_FILES = [
  './',
  './index.html',
  './maorif-books.html',
  './maorif-authors.js',
  './maorif-reading-guides.html',
  './maorif-details-zaboni-millat-1.html',
  './maorif-details-zaboni-millat-2.html',
  './maorif-details-chehrahoi-mondagor.html',
  './maorif-details-nasihatnoma.html',
  './maorif-details-bahoriston.html',
  './maorif-details-hasani-arobakash.html',
  './maorif-details-tojikon-1.html',
  './maorif-details-tojikon-2.html',
  './maorif-details-shohnoma-1.html',
  './maorif-details-shohnoma-2.html',
  './maorif-details-shohnoma-3.html',
  './maorif-details-shohnoma-4.html',
  './maorif-details-shohnoma-5.html',
  './maorif-details-shohnoma-6.html',
  './maorif-details-shohnoma-7.html',
  './maorif-details-shohnoma-8.html',
  './maorif-details-shohnoma-9.html',
  './maorif-details-shohnoma-10.html',
  './maorif-details-quiz-data.js',
  './maorif-details-tools.js',
  './assets/documents/maorif-order-27/page-1.jpg',
  './assets/documents/maorif-order-27/page-2.jpg',
  './kitobho.html',
  './offline-books.html',
  './adabiyoti-tavsiyashuda.html',
  './data/tavsiya.json',
  './data/contests.json',
  './tavsiya/matn/skazka_o_tsare_saltane.json',
  './tavsiya/matn/kot_v_sapogah.json',
  './tavsiya/matn/kot_i_lisa.json',
  './tavsiya/matn/teremok.json',
  './tavsiya/matn/bremenskie_muzykanty.json',
  './book_reviews.html',
  './chat старй.html',
  './delete-account.html',
  './donandai_asarho.html',
  './furugi_subhi_donoi.html',
  './html_studio_full.html',
  './ilm_furugi_marifat.html',
  './shohnomahoni.html',
  './vatani_azizi_man.html',
  './ideai_man.html',
  './ideai_man_banner.jpg',
  './serkhonandatarin.html',
  './ai-chat.html',
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
  './president.js',
  './president.html',
  './quotes-data.js',
  './books.json',
  './news.json',
  './splash_logo.png',
  './assets/hero/01-president-official.jpg',
  './assets/hero/01-president-official-200.jpg',
  './assets/hero/02-istiqlol-flag.jpg',
  './assets/hero/03-vahdat-diplomacy.jpg',
  './assets/hero/04-kishovarzi.jpg',
  './assets/hero/05-president-young.jpg',
  './assets/hero/06-zaboni-millat.jpg',
  './assets/hero/07-chehrahoyi-mondagor.jpg',
  './assets/hero/08-davlatdori.jpg',
  './assets/hero/09-suhanroni.jpg',
  './assets/hero/10-nishon-tojikiston.jpg',
  './assets/libs/pdf.min.js',
  './assets/libs/pdf.worker.min.js',
  './assets/libs/epub.min.js',
  './assets/libs/jszip.min.js',
  './assets/libs/mammoth.browser.min.js',
  './assets/libs/LICENSE-pdfjs.txt',
  './manifest.json',
  './search-index.json',
  './locations.js',
  './data/tajikistan_locations_full.json',
  './offline.html',
  './privacy-policy.html',
  './terms.html',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png',
  './assets/sites/president.jpg',
  './assets/sites/kmt.jpg',
  './assets/sites/maorif.jpg',
  './assets/sites/mmk.jpg',
  './assets/sites/khovar.jpg',
  './assets/sites/mfa.jpg',
  './assets/sites/dushanbe.jpg',
  './assets/sites/ntc.jpg',
  './assets/sites/khatlon.jpg',
  './assets/symbols/parcham.png',
  './assets/symbols/nishon.jpg',
  './shohnoma_banner.jpg',
  './ilm_banner.jpg',
  './furugi_banner.jpg',
  './vatan_banner.jpg',
  './donandai_banner.jpg',
  ...Array.from({ length: 100 }, (_, index) => `./assets/hero/${index + 1}.jpeg`)
];
// МУҲИМ: surudi_milli.mp3 (1.8МБ) ва 50 сурати newsimg (2МБ) ба пешкэш НАМЕРОХАНД —
// онҳо ҳангоми аввалин дархост аз тарафи fetch-обработчик кэш мешаванд.
// Ин насби навсозии аппро барои босуръат месозад (пешина "боркунии абадӣ" буд).;

const NAV_FRESH_MS = 600;   // v129: то чанд мс шабакаро барои саҳифаи «тоза» интизор мешавем, агар нусхаи кэшшуда бошад
const API_FRESH_MS = 1800;  // v129: ҳамин барои JSON/API-и ҷамъиятӣ (пештар 2500)
const BOOKS_JSON_URL = 'books.json';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 час

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache each asset independently: one missing/offline file must not cancel the
    // entire atomic addAll() operation and leave the app with an empty offline cache.
    const results = await Promise.allSettled(LOCAL_FILES.map((url) => cache.add(url)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed) console.warn(`[SW] ${failed} precache item(s) could not be saved; the rest remain available.`);
    // Keep the local artwork used as a fallback by the cached homepage news cards.
    try {
      const news = await cache.match('./news.json', { ignoreSearch: true });
      if (news) await cacheNewsFallbackImages(cache, news.clone());
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE && key !== 'kitobkhona-pdf-cache-v1')
      .map((key) => caches.delete(key)));
    await self.clients.claim();
    scheduleBooksJsonUpdate();
  })());
});

async function updateBooksJson() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(BOOKS_JSON_URL, { cache: 'no-store' });
    if (response.ok) {
      await cache.put(BOOKS_JSON_URL, response.clone());
      console.log('[SW] books.json updated in cache');
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.postMessage({ type: 'books_json_updated' }));
    }
  } catch (e) {
    console.warn('[SW] Failed to update books.json:', e);
  }
}

function scheduleBooksJsonUpdate() {
  setTimeout(updateBooksJson, 5 * 60 * 1000);
  setInterval(updateBooksJson, SYNC_INTERVAL);
}

async function cacheNewsFallbackImages(cache, response) {
  try {
    const data = await response.json();
    const paths = Array.from(new Set((Array.isArray(data.items) ? data.items : [])
      .map(item => String(item && item.site || ''))
      .filter(path => /^assets\/newsimg\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:jpg|jpeg|png|webp)$/i.test(path) && !path.includes('..'))));
    await Promise.allSettled(paths.map(path => cache.add('./' + path.replace(/^\.\//, ''))));
  } catch (e) {}
}

function safeCachePut(request, response) {
  // response.clone() иногда падает с "Response body is already used" — судя по всему,
  // редкая гонка на уровне WebView/браузера, а не ошибка в этом коде. Раньше это была
  // необработанная ошибка (спамила консоль), теперь просто тихо пропускаем кэширование
  // именно этого ответа — страница при этом всё равно показывается нормально.
  try {
    const toCache = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, toCache)).catch(() => {});
  } catch (e) {}
}

// v126: кэши иҷроӣ барои манбаъҳои берунӣ, ки саҳифаи асосӣ ба онҳо вобаста аст (пештар SW онҳоро тамоман
// коркард намекард ва ҳангоми интернети суст/қатъ бахшҳо холӣ мемонданд):
//  - books.json / manifest / search-index аз raw.githubusercontent.com ва cdn.jsdelivr.net (JSON)
//  - GET-ҳои ҷамъиятии Edge API (popular-books, winners, announcements, book-stats) — бе Authorization
//  - суратҳои муқоваю ахбор (flickr, weserv, raw.githubusercontent)
// Стратегия: stale-while-revalidate (аввал кэш, дар замина навсозӣ); ҳаҷм то RUNTIME_LIMIT сабт.
const RUNTIME_JSON_HOSTS = ['raw.githubusercontent.com', 'cdn.jsdelivr.net'];
const RUNTIME_IMG_HOSTS = ['live.staticflickr.com', 'images.weserv.nl', 'raw.githubusercontent.com', 'cdn.jsdelivr.net'];
const RUNTIME_API_PATHS = ['/api/popular-books', '/api/winners', '/api/announcements/active', '/api/book-stats/', '/api/users/directory-public'];
function runtimeKind(request, url) {
  if (request.method !== 'GET') return '';
  if (request.headers.has('Authorization')) return '';
  const path = url.pathname;
  if (/\.(pdf|epub|fb2|docx?|zip|mp4|m4v|webm|mp3)$/i.test(path)) return ''; // китобҳоро KITOB_PDF_CACHE идора мекунад
  if (url.hostname.endsWith('.workers.dev') && RUNTIME_API_PATHS.some(p => path.startsWith(p))) return 'api';
  if (RUNTIME_JSON_HOSTS.includes(url.hostname) && /\.json$/i.test(path)) return 'json';
  if (RUNTIME_IMG_HOSTS.includes(url.hostname) && /\.(jpe?g|png|webp|gif|avif)$/i.test(path)) return 'img';
  if (url.hostname === 'images.weserv.nl') return 'img';
  return '';
}
async function trimRuntimeCache() {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    if (keys.length <= RUNTIME_LIMIT) return;
    const extra = keys.slice(0, keys.length - RUNTIME_LIMIT);
    await Promise.all(extra.map(k => cache.delete(k)));
  } catch (e) {}
}
async function runtimeStaleWhileRevalidate(request, kind) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then(async (response) => {
    // танҳо ҷавобҳои ошкор (CORS/basic) бо статуси 200 сабт мешаванд; opaque — не (ҳаҷми квотаро хӯрда метавонанд)
    if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
      try { await cache.put(request, response.clone()); } catch (e) {}
      if (Math.random() < 0.05) trimRuntimeCache();
    }
    return response;
  }).catch(() => null);
  if (cached) {
    if (kind === 'img') return cached;                 // суратҳо: кэш-аввал
    // JSON/API: агар шабака то API_FRESH_MS ҷавоб диҳад — маълумоти нав, вагарна кэш (шабака дар замина навсозӣ мекунад)
    const fast = await Promise.race([network, new Promise(r => setTimeout(() => r(null), API_FRESH_MS))]);
    return fast || cached;
  }
  const net = await network;
  return net || Response.error();
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    const kind = runtimeKind(event.request, url);
    if (kind) event.respondWith(runtimeStaleWhileRevalidate(event.request, kind));
    return;
  }
  if (event.request.mode === 'navigate') {
    // v129: гузариши фаврӣ байни саҳифаҳо. Агар шабака то NAV_FRESH_MS (600 мс) ҷавоб диҳад — саҳифаи нав аз
    // шабака (баъди нашр корбар бо интернети хуб фавран версияи навро мебинад); вагарна — нусхаи кэшшуда ФАВРАН,
    // шабака дар замина кэшро нав мекунад (дафъаи оянда — нав). Пештар ҳар гузариш то 3.5 с интизор мешуд.
    // Агар кэш набошад — шабака пурра интизор мешавад; офлайн ва бе кэш — offline.html.
    const network = fetch(event.request).then(response => {
      if (response && response.status === 200) {
        safeCachePut(event.request, response);
      }
      return response;
    }).catch(() => null);
    event.waitUntil(network.then(() => undefined)); // SW то анҷоми навсозии кэш дар замина зинда мемонад
    event.respondWith((async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      if (!cached) {
        const net = await network;
        return net || await caches.match('./offline.html');
      }
      const timer = new Promise(resolve => setTimeout(() => resolve('timeout'), NAV_FRESH_MS));
      const first = await Promise.race([network, timer]);
      if (first && first !== 'timeout' && first.status === 200) return first;
      return cached;
    })());
    return;
  }
  // Ахборот: шабака аввал, аммо кэши охирин ҳангоми офлайн ё хатои сервер.
  if (url.pathname.endsWith('/news.json') || url.pathname === '/news.json') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          safeCachePut(event.request, response);
          cacheNewsFallbackImages(cache, response.clone()).catch(() => {});
          return response;
        }
        return null;
      }).catch(() => null);
      if (!cached) return await network || Response.error();
      // v129: агар шабака то 3 с ҷавоб надиҳад — ахбори кэшшуда (шабака дар замина кэшро нав мекунад)
      const fast = await Promise.race([network, new Promise(r => setTimeout(() => r(null), 3000))]);
      return fast || cached;
    })());
    return;
  }
  // Китобхона ва ҷустуҷӯ: stale-while-revalidate, то файлҳои асосӣ офлайн фавран дастрас шаванд.
  if (url.pathname.endsWith('/books.json') || url.pathname === '/books.json' ||
      url.pathname.endsWith('/search-index.json') || url.pathname === '/search-index.json') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) safeCachePut(event.request, response);
        return response && response.status === 200 ? response : null;
      }).catch(() => null);
      if (cached) { network.catch(() => {}); return cached; }
      return await network || Response.error();
    })());
    return;
  }
  // v126: файлҳои китоб (tavsiya/pdf/*.pdf ва ғ.) дар кэши умумӣ дубора сабт намешаванд — онҳоро хонанда
  // дар 'kitobkhona-pdf-cache-v1' нигоҳ медорад (бо танзими муҳлати нигоҳдорӣ).
  if (/\.(pdf|epub|fb2|docx?|zip|mp4|m4v|webm)$/i.test(url.pathname)) {
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request, { ignoreSearch: true });
      const network = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          safeCachePut(event.request, response);
        }
        return response;
      }).catch(() => null);
      return cached || await network;
    })());
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
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

try {
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');
  const firebaseConfig = {
    apiKey: "AIzaSyDWmg_6KS_v82IK7P-QrLj8GP2dh5tk29Y",
    authDomain: "kitobkhona-push.firebaseapp.com",
    projectId: "kitobkhona-push",
    storageBucket: "kitobkhona-push.firebasestorage.app",
    messagingSenderId: "507779702083",
    appId: "1:507779702083:web:3dbd554961b290e854e3f6",
    measurementId: "G-2G9G2SXCTQ"
  };
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage(function(payload) {
    try {
      const notif = payload.notification || {};
      const title = notif.title || 'Китобхона';
      const options = {
        body: notif.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: payload.data || {},
        vibrate: [200, 100, 200]
      };
      self.registration.showNotification(title, options);
    } catch (e) {
      console.error('FCM background message error', e);
    }
  });
} catch (e) {
  console.warn('[SW] Firebase init skipped:', e.message);
}


self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const data = event.notification.data || {};
  let url = '/kitobkhona/';
  if (data.type === 'chat' || data.chat_id || data.sender_id) {
    url = '/kitobkhona/chats.html';
  } else if (data.type === 'feed' || data.post_id) {
    url = '/kitobkhona/Lenta.html';
  } else if (data.link) {
    url = data.link;
  } else if (data.url) {
    url = data.url;
  }
  // v126: барнома дар зерпапка (/kitobkhona/) ҷойгир аст — истинодҳои '/winners.html' ё 'winners.html'
  // ба доираи (scope) SW оварда мешаванд, то ки саҳифаи дуруст кушода шавад.
  let fullUrl = url;
  try {
    const scope = self.registration.scope; // https://host/kitobkhona/
    const scopePath = new URL(scope).pathname;
    if (/^https?:\/\//i.test(url)) fullUrl = url;
    else if (url.startsWith('/')) fullUrl = url.startsWith(scopePath) ? self.location.origin + url : new URL(url.replace(/^\/+/, ''), scope).href;
    else fullUrl = new URL(url, scope).href;
  } catch (e) { fullUrl = url.startsWith('/') ? self.location.origin + url : url; }
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if ((client.url === fullUrl || client.url.split('?')[0] === fullUrl.split('?')[0]) && 'focus' in client) { try { if ('navigate' in client && client.url !== fullUrl) return client.navigate(fullUrl).then(c => c && c.focus()); } catch (e) {} return client.focus(); }
    }
    if (clients.openWindow) return clients.openWindow(fullUrl);
  }));
});
